//! Agent session monitoring (plans/agent-monitoring.md): launcharr absorbs the
//! sketchybar-agent-status daemon. A unix-socket listener speaks that project's
//! newline-JSON event protocol unchanged — Claude Code hooks (and any future
//! adapter) emit `{session, agent, state, title, detail, tmux}` lines; the
//! store folds them into per-session state for the bar and the `agents` panel.
//! Local IPC only — the socket is a filesystem object, not a network listener
//! (invariant 2 holds).

use std::io::BufRead;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config::Terminal;
use crate::error::{CmdError, CmdResult};

/// Sessions untouched for this long are pruned — the old daemon kept every
/// idle session forever and the bar filled with week-old ghosts. Default;
/// configurable via `agents.pruneHours`.
const DEFAULT_STALE_SECS: u64 = 12 * 3600;

/// Monitoring is off by default (Settings → Agents). The socket stays bound
/// either way — cheaper and simpler than tearing down a blocked accept loop —
/// but events are discarded and list() is empty while disabled.
static MONITOR: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static PRUNE_SECS: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(DEFAULT_STALE_SECS);

/// Apply settings; called at setup and from the config watcher.
pub fn configure(cfg: &crate::config::AgentsConfig) {
    use std::sync::atomic::Ordering;
    MONITOR.store(cfg.monitor, Ordering::Relaxed);
    PRUNE_SECS.store(u64::from(cfg.prune_hours.max(1)) * 3600, Ordering::Relaxed);
}

fn monitoring() -> bool {
    MONITOR.load(std::sync::atomic::Ordering::Relaxed)
}

fn stale_secs() -> u64 {
    PRUNE_SECS.load(std::sync::atomic::Ordering::Relaxed)
}

/// One live agent session. Mirrored as `AgentSession` in the frontend.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub session: String,
    pub agent: String,
    /// Free-form state string from the adapter: working | idle | attention | …
    /// Unknown states render with a fallback glyph, never break.
    pub state: String,
    pub title: String,
    pub detail: String,
    /// tmux pane id (`%12`) or target; empty when the agent isn't in tmux.
    pub tmux: String,
    /// Unix seconds of the last event.
    pub updated_at: u64,
    /// tmux location, refreshed at read time from `list-panes` (never trusted
    /// from disk): session name, window (tab) index, window name. All None
    /// when the pane no longer exists or the agent isn't in tmux.
    #[serde(default)]
    pub tmux_session: Option<String>,
    #[serde(default)]
    pub tmux_window: Option<u32>,
    #[serde(default)]
    pub tmux_window_name: Option<String>,
}

/// Incoming wire event: an `AgentSession` minus the timestamp, all fields
/// optional-by-default so partial emitters degrade instead of erroring.
#[derive(Debug, Clone, Default, Deserialize)]
struct AgentEvent {
    #[serde(default)]
    session: String,
    #[serde(default)]
    agent: String,
    #[serde(default)]
    state: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    detail: String,
    #[serde(default)]
    tmux: String,
}

static SESSIONS: Mutex<Vec<AgentSession>> = Mutex::new(Vec::new());

/// Snapshot for the bar and panel: fresh sessions only, newest first, each
/// stamped with its current tmux location so the UI can group by session and
/// order by tab.
pub fn list() -> Vec<AgentSession> {
    if !monitoring() {
        return Vec::new();
    }
    let layout = tmux_layout();
    let sessions = SESSIONS.lock().unwrap();
    let now = now_secs();
    let stale = stale_secs();
    let mut fresh: Vec<AgentSession> = sessions
        .iter()
        .filter(|s| now.saturating_sub(s.updated_at) <= stale)
        .cloned()
        .map(|mut s| {
            let loc = layout.get(&s.tmux);
            s.tmux_session = loc.map(|l| l.session.clone());
            s.tmux_window = loc.map(|l| l.window);
            s.tmux_window_name = loc.map(|l| l.window_name.clone());
            s
        })
        .collect();
    fresh.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then(a.session.cmp(&b.session))
    });
    fresh
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PaneLocation {
    session: String,
    window: u32,
    window_name: String,
}

/// pane id → location from `tmux list-panes -a`. Cached briefly: list() runs
/// on the 1 Hz bar push and must not pay a process spawn per tick.
fn tmux_layout() -> std::collections::HashMap<String, PaneLocation> {
    use std::time::{Duration, Instant};
    type Layout = std::collections::HashMap<String, PaneLocation>;
    static CACHE: Mutex<Option<(Instant, Layout)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, layout)) = cache.as_ref() {
        if at.elapsed() < Duration::from_secs(2) {
            return layout.clone();
        }
    }
    let fresh = tmux_out(&[
        "list-panes",
        "-a",
        "-F",
        "#{pane_id}\t#{session_name}\t#{window_index}\t#{window_name}",
    ])
    .as_deref()
    .map(parse_panes);
    match fresh {
        // Only successes are cached: a failed spawn during app cold start used
        // to pin an empty layout for 2s and the bar painted agents without
        // their tmux group borders (field report 2026-08-16). On failure,
        // serve the previous layout (if any) and retry next call.
        Some(layout) => {
            *cache = Some((Instant::now(), layout.clone()));
            layout
        }
        None => cache
            .as_ref()
            .map(|(_, layout)| layout.clone())
            .unwrap_or_default(),
    }
}

fn parse_panes(out: &str) -> std::collections::HashMap<String, PaneLocation> {
    out.lines()
        .filter_map(|line| {
            let mut parts = line.split('\t');
            let pane = parts.next()?.trim();
            let session = parts.next()?.trim();
            let window = parts.next()?.trim().parse().ok()?;
            let window_name = parts.next().unwrap_or_default().trim();
            (!pane.is_empty() && !session.is_empty()).then(|| {
                (
                    pane.to_owned(),
                    PaneLocation {
                        session: session.to_owned(),
                        window,
                        window_name: strip_status_suffix(window_name).to_owned(),
                    },
                )
            })
        })
        .collect()
}

/// Old tmux integrations rename windows with a trailing status tag
/// (`Launcharr [🧑‍🍳]`) — drop it, the cell already shows state.
fn strip_status_suffix(name: &str) -> &str {
    match name.rsplit_once(" [") {
        Some((base, rest)) if rest.ends_with(']') => base.trim_end(),
        _ => name,
    }
}

/// Start the listener. Called once at setup regardless of `bar.enabled` — the
/// `agents` panel wants the data even on a bar-less install.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        if let Ok(saved) = load(&state_file()) {
            *SESSIONS.lock().unwrap() = saved;
        }
        let path = socket_path();
        if let Some(dir) = path.parent() {
            if let Err(e) = std::fs::create_dir_all(dir) {
                eprintln!("[launcharr agents] state dir failed: {e}");
                return;
            }
        }
        // A previous instance's socket file blocks bind; it's ours to replace.
        let _ = std::fs::remove_file(&path);
        let listener = match UnixListener::bind(&path) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[launcharr agents] socket bind failed: {e}");
                return;
            }
        };
        if let Err(e) = restrict_permissions(&path) {
            eprintln!("[launcharr agents] socket chmod failed: {e}");
        }
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let app = app.clone();
            std::thread::spawn(move || handle(stream, &app));
        }
    });
}

fn handle(stream: UnixStream, app: &AppHandle) {
    let reader = std::io::BufReader::new(stream);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        if !monitoring() {
            continue;
        }
        let Ok(event) = serde_json::from_str::<AgentEvent>(&line) else {
            continue;
        };
        let applied = {
            let mut sessions = SESSIONS.lock().unwrap();
            apply(&mut sessions, event, now_secs(), stale_secs())
        };
        if applied {
            if let Err(e) = save(&state_file(), &list()) {
                eprintln!("[launcharr agents] state save failed: {e}");
            }
            // The bar re-snapshots immediately — state flips beat the 1 Hz tick.
            crate::bar::push(app);
        }
    }
}

/// Fold one event into the session list. Semantics ported from the retired Go
/// store: `ended` deletes; blank title/detail/tmux inherit the previous value;
/// everything else upserts. Stale sessions are dropped on the way through.
fn apply(sessions: &mut Vec<AgentSession>, event: AgentEvent, now: u64, stale: u64) -> bool {
    if event.session.is_empty() || event.agent.is_empty() {
        return false;
    }
    sessions.retain(|s| now.saturating_sub(s.updated_at) <= stale);
    if event.state == "ended" {
        sessions.retain(|s| s.session != event.session);
        return true;
    }
    let previous = sessions.iter().position(|s| s.session == event.session);
    let mut next = AgentSession {
        session: event.session,
        agent: event.agent,
        state: event.state,
        title: event.title,
        detail: event.detail,
        tmux: event.tmux,
        updated_at: now,
        ..Default::default()
    };
    if let Some(i) = previous {
        let old = &sessions[i];
        if next.title.is_empty() {
            next.title = old.title.clone();
        }
        if next.detail.is_empty() {
            next.detail = old.detail.clone();
        }
        if next.tmux.is_empty() {
            next.tmux = old.tmux.clone();
        }
        sessions[i] = next;
    } else {
        sessions.push(next);
    }
    true
}

/// Jump to a session's pane by session id, marking a `done` session read
/// (done → idle) on the way — "done (unread)" is a blue cell until visited.
pub fn jump_session(app: &AppHandle, session_id: &str, terminal: Terminal) -> CmdResult<()> {
    let target = mark_read(&mut SESSIONS.lock().unwrap(), session_id)
        .ok_or_else(|| CmdError::Internal("unknown agent session".into()))?;
    if let Err(e) = save(&state_file(), &list()) {
        eprintln!("[launcharr agents] state save failed: {e}");
    }
    crate::bar::push(app);
    if target.is_empty() {
        return Err(CmdError::Internal("session has no tmux pane".into()));
    }
    jump(&target, terminal)
}

/// Visiting a session reads it: done → idle. Returns its pane target.
fn mark_read(sessions: &mut [AgentSession], session_id: &str) -> Option<String> {
    let session = sessions.iter_mut().find(|s| s.session == session_id)?;
    if session.state == "done" {
        session.state = "idle".into();
    }
    Some(session.tmux.clone())
}

/// Jump to a session's tmux pane and bring the terminal frontmost. Ported from
/// the retired jump.sh: switch the client to the target's session, select its
/// window; both are best-effort because pane ids go stale when panes close.
fn jump(target: &str, terminal: Terminal) -> CmdResult<()> {
    validate_target(target)?;
    let client_target = target.split(':').next().unwrap_or(target);
    let _ = tmux(&["switch-client", "-t", client_target]);
    let _ = tmux(&["select-window", "-t", target]);
    let app = match crate::terminal::effective_terminal(terminal) {
        Terminal::ITerm2 => "iTerm",
        Terminal::TerminalApp => "Terminal",
    };
    let ok = std::process::Command::new("/usr/bin/open")
        .args(["-a", app])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    ok.then_some(())
        .ok_or_else(|| CmdError::Internal(format!("could not activate {app}")))
}

/// Targets come from our own store, but they end up as process arguments —
/// allow only tmux's id/name alphabet.
fn validate_target(target: &str) -> CmdResult<()> {
    let ok = !target.is_empty()
        && target
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '%' | ':' | '.' | '_' | '-' | '@'));
    ok.then_some(())
        .ok_or_else(|| CmdError::Internal(format!("bad tmux target: {target:?}")))
}

fn tmux(args: &[&str]) -> Option<()> {
    for bin in ["tmux", "/opt/homebrew/bin/tmux", "/usr/local/bin/tmux"] {
        if let Ok(status) = std::process::Command::new(bin).args(args).status() {
            return status.success().then_some(());
        }
    }
    None
}

fn tmux_out(args: &[&str]) -> Option<String> {
    for bin in ["tmux", "/opt/homebrew/bin/tmux", "/usr/local/bin/tmux"] {
        if let Ok(out) = std::process::Command::new(bin).args(args).output() {
            if out.status.success() {
                return Some(String::from_utf8_lossy(&out.stdout).into_owned());
            }
        }
    }
    None
}

// ---- Persistence ------------------------------------------------------------

fn state_dir() -> PathBuf {
    std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".local/state"))
        .join("launcharr")
}

/// The socket adapters emit to. Documented in the hook script and plan.
pub fn socket_path() -> PathBuf {
    state_dir().join("agents.sock")
}

fn state_file() -> PathBuf {
    state_dir().join("agents.json")
}

/// Serialized + atomic: every connection gets its own handler thread, and hook
/// events arrive in bursts — naive concurrent `fs::write`s tore the file in
/// the first live test (JOURNAL 2026-08-16). Write-to-temp + rename under a
/// lock; readers only ever see a complete document.
fn save(path: &std::path::Path, sessions: &[AgentSession]) -> std::io::Result<()> {
    static SAVING: Mutex<()> = Mutex::new(());
    let _guard = SAVING.lock().unwrap();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_vec(sessions).map_err(std::io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)
}

fn load(path: &std::path::Path) -> std::io::Result<Vec<AgentSession>> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(e),
    }
}

fn restrict_permissions(path: &std::path::Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(session: &str, state: &str) -> AgentEvent {
        AgentEvent {
            session: session.into(),
            agent: "claude".into(),
            state: state.into(),
            ..Default::default()
        }
    }

    #[test]
    fn upserts_and_times_stamps() {
        let mut s = Vec::new();
        assert!(apply(
            &mut s,
            event("a", "working"),
            100,
            DEFAULT_STALE_SECS
        ));
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].state, "working");
        assert_eq!(s[0].updated_at, 100);
        assert!(apply(&mut s, event("a", "idle"), 200, DEFAULT_STALE_SECS));
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].state, "idle");
        assert_eq!(s[0].updated_at, 200);
    }

    #[test]
    fn rejects_anonymous_events() {
        let mut s = Vec::new();
        assert!(!apply(
            &mut s,
            AgentEvent::default(),
            100,
            DEFAULT_STALE_SECS
        ));
        let mut no_agent = event("a", "working");
        no_agent.agent = String::new();
        assert!(!apply(&mut s, no_agent, 100, DEFAULT_STALE_SECS));
        assert!(s.is_empty());
    }

    #[test]
    fn blank_fields_inherit_previous_values() {
        let mut s = Vec::new();
        let mut first = event("a", "working");
        first.title = "Fix auth".into();
        first.tmux = "%3".into();
        apply(&mut s, first, 100, DEFAULT_STALE_SECS);
        apply(&mut s, event("a", "idle"), 200, DEFAULT_STALE_SECS);
        assert_eq!(s[0].title, "Fix auth");
        assert_eq!(s[0].tmux, "%3");
        let mut retitled = event("a", "working");
        retitled.title = "New task".into();
        apply(&mut s, retitled, 300, DEFAULT_STALE_SECS);
        assert_eq!(s[0].title, "New task");
        assert_eq!(s[0].tmux, "%3");
    }

    #[test]
    fn ended_deletes_the_session() {
        let mut s = Vec::new();
        apply(&mut s, event("a", "working"), 100, DEFAULT_STALE_SECS);
        apply(&mut s, event("b", "working"), 100, DEFAULT_STALE_SECS);
        assert!(apply(&mut s, event("a", "ended"), 200, DEFAULT_STALE_SECS));
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].session, "b");
    }

    #[test]
    fn stale_sessions_are_pruned_on_apply() {
        let mut s = Vec::new();
        apply(&mut s, event("old", "idle"), 100, DEFAULT_STALE_SECS);
        apply(
            &mut s,
            event("new", "working"),
            100 + DEFAULT_STALE_SECS + 1,
            DEFAULT_STALE_SECS,
        );
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].session, "new");
    }

    #[test]
    fn parses_tmux_pane_layout() {
        let out = "%7\tgogogo\t1\tInfisical [😴]\n%23\tgogogo\t2\tLauncharr\nbad line\n";
        let layout = parse_panes(out);
        assert_eq!(
            layout.get("%7"),
            Some(&PaneLocation {
                session: "gogogo".into(),
                window: 1,
                window_name: "Infisical".into(),
            })
        );
        assert_eq!(layout.get("%23").map(|l| l.window), Some(2));
        assert_eq!(layout.len(), 2);
        assert!(parse_panes("").is_empty());
    }

    #[test]
    fn strips_window_status_suffix() {
        assert_eq!(strip_status_suffix("Launcharr [🧑‍🍳]"), "Launcharr");
        assert_eq!(strip_status_suffix("plain"), "plain");
        assert_eq!(
            strip_status_suffix("keeps [brackets] inside"),
            "keeps [brackets] inside"
        );
    }

    #[test]
    fn jump_reads_done_sessions() {
        let mut s = Vec::new();
        let mut done = event("a", "done");
        done.tmux = "%3".into();
        apply(&mut s, done, 100, DEFAULT_STALE_SECS);
        assert_eq!(mark_read(&mut s, "a"), Some("%3".into()));
        assert_eq!(s[0].state, "idle");
        // Non-done states are untouched by a visit.
        apply(&mut s, event("a", "working"), 200, DEFAULT_STALE_SECS);
        mark_read(&mut s, "a");
        assert_eq!(s[0].state, "working");
        assert_eq!(mark_read(&mut s, "missing"), None);
    }

    #[test]
    fn validates_tmux_targets() {
        assert!(validate_target("%23").is_ok());
        assert!(validate_target("work:1.0").is_ok());
        assert!(validate_target("").is_err());
        assert!(validate_target("x; rm -rf /").is_err());
    }

    #[test]
    fn wire_events_tolerate_missing_fields() {
        let e: AgentEvent = serde_json::from_str(r#"{"session":"a","agent":"claude"}"#)
            .expect("partial event parses");
        assert_eq!(e.session, "a");
        assert_eq!(e.state, "");
        assert!(serde_json::from_str::<AgentEvent>("not json").is_err());
    }

    #[test]
    fn concurrent_saves_never_tear_the_file() {
        let dir =
            std::env::temp_dir().join(format!("launcharr-agents-race-{}", std::process::id()));
        let path = dir.join("agents.json");
        let make = |n: usize| {
            (0..n)
                .map(|i| AgentSession {
                    session: format!("s{i}"),
                    agent: "claude".into(),
                    title: "x".repeat(50 * (n + 1)),
                    ..Default::default()
                })
                .collect::<Vec<_>>()
        };
        save(&path, &make(1)).expect("seed save");
        let writers: Vec<_> = (0..4)
            .map(|t| {
                let path = path.clone();
                let sessions = make(t + 1);
                std::thread::spawn(move || {
                    for _ in 0..50 {
                        save(&path, &sessions).expect("save");
                    }
                })
            })
            .collect();
        for _ in 0..200 {
            let bytes = std::fs::read(&path).expect("read");
            serde_json::from_slice::<Vec<AgentSession>>(&bytes).expect("file is never torn");
        }
        for w in writers {
            w.join().expect("writer thread");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn state_roundtrips_through_disk() {
        let dir =
            std::env::temp_dir().join(format!("launcharr-agents-test-{}", std::process::id()));
        let path = dir.join("agents.json");
        let sessions = vec![AgentSession {
            session: "a".into(),
            agent: "claude".into(),
            state: "working".into(),
            title: "Fix auth".into(),
            detail: "PreToolUse · Bash".into(),
            tmux: "%3".into(),
            updated_at: 42,
            ..Default::default()
        }];
        save(&path, &sessions).expect("save");
        assert_eq!(load(&path).expect("load"), sessions);
        assert_eq!(load(&dir.join("missing.json")).expect("missing ok"), vec![]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
