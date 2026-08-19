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

/// How long a session with *nothing to check* — no tmux pane, no pid — may sit
/// silent before we call it gone. `pruneHours` is a bulk sweep, not a liveness
/// test, and a session offering no evidence of life shouldn't get the same
/// benefit of the doubt as one we merely failed to reach (field report
/// 2026-08-18: a quit agent still on the bar half an hour later). Every current
/// adapter reports a pid, so this only catches legacy records and adapters that
/// don't; both come back on their next event if we called it early.
const UNVERIFIABLE_STALE_SECS: u64 = 15 * 60;

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

/// Multiplexer kinds. Free-form on the wire, but these two are the ones the
/// app knows how to group and jump into.
pub const MUX_TMUX: &str = "tmux";
pub const MUX_HERDR: &str = "herdr";

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
    /// Which multiplexer the agent lives in: `tmux`, `herdr`, or empty for
    /// neither. The wire's `tmux` field still means tmux — adapters don't have
    /// to know this field exists.
    #[serde(default)]
    pub mux: String,
    /// Pane id within that multiplexer: `%12` for tmux, `w1:p1` for herdr.
    /// Empty when the agent isn't in one.
    #[serde(alias = "tmux")]
    pub mux_target: String,
    /// Unix seconds of the last event.
    pub updated_at: u64,
    /// Where the pane sits, refreshed at read time from the multiplexer itself
    /// and never trusted from disk: tmux session/window or herdr
    /// workspace/tab. All None when the pane is gone, or there's no pane.
    #[serde(default, alias = "tmux_session")]
    pub mux_group: Option<String>,
    #[serde(default, alias = "tmux_window")]
    pub mux_index: Option<u32>,
    #[serde(default, alias = "tmux_window_name")]
    pub mux_label: Option<String>,
    /// The agent process, when its adapter can name one. Liveness is checked
    /// against `pid` *and* `pid_comm` — a recycled pid running something else
    /// is not our agent.
    #[serde(default)]
    pub pid: Option<u32>,
    /// The pid's command as observed the first time we saw it. Recorded, never
    /// matched against a known agent name: a new adapter needs no reaper change.
    #[serde(default)]
    pub pid_comm: Option<String>,
    /// Subagents the session has forked and not yet finished (Claude's
    /// `SubagentStart`/`SubagentStop`). They belong to the parent — shown in
    /// its hover card, never as cells of their own.
    #[serde(default)]
    pub subagents: Vec<Subagent>,
}

/// One running subagent of a session. Mirrored as `Subagent` in the frontend.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subagent {
    pub id: String,
    /// The agent type: `Explore`, `general-purpose`, a custom name.
    pub kind: String,
    pub description: String,
    pub started_at: u64,
}

/// A subagent lifecycle event riding on a session event.
#[derive(Debug, Clone, Default, Deserialize)]
struct SubagentEvent {
    #[serde(default)]
    op: String,
    #[serde(default)]
    id: String,
    #[serde(default, rename = "type")]
    kind: String,
    #[serde(default)]
    description: String,
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
    /// Optional: the agent process's pid, for liveness checks off tmux.
    #[serde(default)]
    pid: Option<u32>,
    /// The emitter is infrastructure (Claude's background daemon: spare and
    /// pty-hosted sessions). Such an event updates a session we already show
    /// but never creates one — unless it carries a prompt, i.e. someone is
    /// actually driving that session (diagnosis 2026-08-19).
    #[serde(default)]
    background: bool,
    #[serde(default)]
    subagent: Option<SubagentEvent>,
}

static SESSIONS: Mutex<Vec<AgentSession>> = Mutex::new(Vec::new());

/// Snapshot for the bar and panel: fresh sessions only, newest first, each
/// stamped with its current tmux location so the UI can group by session and
/// order by tab.
pub fn list() -> Vec<AgentSession> {
    let mut all = own_list();
    all.extend(crate::herdr::list());
    all.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then(a.session.cmp(&b.session))
    });
    all
}

/// The sessions *we* keep — hook-fed, reaped, and the only ones that belong in
/// our state file. herdr's are read fresh every time and never persisted: herdr
/// is the durable one, and a stale copy of its agents in our file would outlive
/// the server that owned them (field bug 2026-08-18, caught within a minute of
/// the first live merge).
fn own_list() -> Vec<AgentSession> {
    if !monitoring() {
        return Vec::new();
    }
    let (layout, layout_fresh) = tmux_layout();
    let mut sessions = SESSIONS.lock().unwrap();
    let now = now_secs();
    let stale = stale_secs();
    let dropped = reap(&mut sessions, &layout, layout_fresh, now, stale, comm_of);
    let mut fresh: Vec<AgentSession> = sessions
        .iter()
        .cloned()
        .map(|mut s| {
            let loc = layout.get(&s.mux_target);
            s.mux_group = loc.map(|l| l.session.clone());
            s.mux_index = loc.map(|l| l.window);
            s.mux_label = loc.map(|l| l.window_name.clone());
            s
        })
        .collect();
    fresh.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then(a.session.cmp(&b.session))
    });
    drop(sessions);
    // Reaping is the one mutation that happens on a read; persist it so a
    // restart doesn't resurrect what we just buried. Only our own sessions are
    // persisted — herdr's are appended after, because herdr is the durable one
    // and a stale copy in our file would outlive the server that owned it.
    if dropped {
        if let Err(e) = save(&state_file(), &fresh) {
            eprintln!("[launcharr agents] state save failed: {e}");
        }
    }
    fresh
}

/// Drop sessions whose agent is provably gone, and stamp `pid_comm` the first
/// time a pid is seen. Returns whether anything changed.
///
/// The rules, cheapest first — and every one of them errs towards keeping a
/// session, because a ghost cell is an annoyance while a vanished live agent is
/// a lie:
/// - too old to matter (the existing `pruneHours` sweep) → gone;
/// - has a tmux pane that a *successful* `list-panes` read didn't list → gone.
///   A failed read (tmux missing, cold start) reaps nothing at all;
/// - otherwise, if a pid is known and `comm` says it's gone, or now belongs to
///   a different command → gone;
/// - a session with neither a pane nor a pid can only be judged on silence, and
///   is held to `UNVERIFIABLE_STALE_SECS` rather than the full prune window.
fn reap(
    sessions: &mut Vec<AgentSession>,
    layout: &std::collections::HashMap<String, PaneLocation>,
    layout_fresh: bool,
    now: u64,
    stale: u64,
    comm: impl Fn(u32) -> Option<String>,
) -> bool {
    let before = sessions.len();
    let mut stamped = false;
    sessions.retain_mut(|s| {
        if now.saturating_sub(s.updated_at) > stale {
            return false;
        }
        if !s.mux_target.is_empty() {
            // A live pane is proof of life; a dead one, proof of death — but
            // only when we actually managed to ask tmux.
            if layout.contains_key(&s.mux_target) {
                return true;
            }
            if layout_fresh {
                return false;
            }
        }
        let Some(pid) = s.pid else {
            // No process to interrogate. If it still claims a pane we simply
            // couldn't reach tmux — that's ignorance, and ignorance keeps the
            // session. With no pane either, silence is the only signal left,
            // and it's held to a much shorter one.
            return !s.mux_target.is_empty()
                || now.saturating_sub(s.updated_at) <= UNVERIFIABLE_STALE_SECS;
        };
        match (comm(pid), s.pid_comm.as_deref()) {
            (None, _) => false,
            (Some(now_comm), Some(seen)) => now_comm == seen,
            (Some(now_comm), None) => {
                s.pid_comm = Some(now_comm);
                stamped = true;
                true
            }
        }
    });
    stamped || sessions.len() != before
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PaneLocation {
    session: String,
    window: u32,
    window_name: String,
}

/// pane id → location from `tmux list-panes -a`, plus whether that layout is a
/// *trusted* one — i.e. a successful read, cached or not. Cached briefly:
/// list() runs on the 1 Hz bar push and must not pay a process spawn per tick.
///
/// The flag is what lets the reaper treat a missing pane as a dead agent: a
/// layout we failed to fetch says nothing about who is alive.
fn tmux_layout() -> (std::collections::HashMap<String, PaneLocation>, bool) {
    use std::time::{Duration, Instant};
    type Layout = std::collections::HashMap<String, PaneLocation>;
    static CACHE: Mutex<Option<(Instant, Layout)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, layout)) = cache.as_ref() {
        if at.elapsed() < Duration::from_secs(2) {
            return (layout.clone(), true);
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
        // serve the previous layout (if any), marked untrusted, and retry next
        // call — stale panes are better than reaping a live fleet.
        Some(layout) => {
            *cache = Some((Instant::now(), layout.clone()));
            (layout, true)
        }
        None => (
            cache
                .as_ref()
                .map(|(_, layout)| layout.clone())
                .unwrap_or_default(),
            false,
        ),
    }
}

/// A pid's command, or None when no such process exists. Backed by one cached
/// `ps` sweep — built lazily, so the all-tmux case (every session reaped by
/// pane) never spawns anything.
fn comm_of(pid: u32) -> Option<String> {
    use std::time::{Duration, Instant};
    type Procs = std::collections::HashMap<u32, String>;
    static CACHE: Mutex<Option<(Instant, Procs)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    let usable = cache
        .as_ref()
        .is_some_and(|(at, _)| at.elapsed() < Duration::from_secs(2));
    if !usable {
        // A failed sweep must not read as "every process died": keep the last
        // good table rather than reporting an empty world.
        if let Some(procs) = ps_procs() {
            *cache = Some((Instant::now(), procs));
        }
    }
    cache
        .as_ref()
        .and_then(|(_, procs)| procs.get(&pid).cloned())
}

fn ps_procs() -> Option<std::collections::HashMap<u32, String>> {
    let out = std::process::Command::new("/bin/ps")
        .args(["-Ao", "pid=,comm="])
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| parse_procs(&String::from_utf8_lossy(&out.stdout)))
}

fn parse_procs(out: &str) -> std::collections::HashMap<u32, String> {
    out.lines()
        .filter_map(|line| {
            let (pid, comm) = line.trim_start().split_once(char::is_whitespace)?;
            let comm = comm.trim();
            if comm.is_empty() {
                return None;
            }
            Some((pid.parse().ok()?, comm.to_owned()))
        })
        .collect()
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
            if let Err(e) = save(&state_file(), &own_list()) {
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
    if previous.is_none() && event.background && event.title.is_empty() {
        return false;
    }
    let session_id = event.session.clone();
    let mut next = AgentSession {
        session: event.session,
        agent: event.agent,
        state: event.state,
        title: event.title,
        detail: event.detail,
        mux: if event.tmux.is_empty() {
            String::new()
        } else {
            MUX_TMUX.to_owned()
        },
        mux_target: event.tmux,
        updated_at: now,
        pid: event.pid,
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
        if next.mux_target.is_empty() {
            next.mux_target = old.mux_target.clone();
            next.mux = old.mux.clone();
        }
        if next.pid.is_none() {
            next.pid = old.pid;
        }
        // The comm belongs to the pid that was observed with it.
        if next.pid == old.pid {
            next.pid_comm = old.pid_comm.clone();
        }
        // A finished turn has no subagents left; anything else carries them on.
        if next.state != "done" {
            next.subagents = old.subagents.clone();
        }
        sessions[i] = next;
    } else {
        sessions.push(next);
    }
    if let Some(sub) = event.subagent {
        if let Some(s) = sessions.iter_mut().find(|s| s.session == session_id) {
            match sub.op.as_str() {
                "start" if !sub.id.is_empty() => {
                    s.subagents.retain(|x| x.id != sub.id);
                    s.subagents.push(Subagent {
                        id: sub.id,
                        kind: sub.kind,
                        description: sub.description,
                        started_at: now,
                    });
                }
                "stop" => s.subagents.retain(|x| x.id != sub.id),
                _ => {}
            }
        }
    }
    true
}

/// Jump to a session's pane by session id, marking a `done` session read
/// (done → idle) on the way — "done (unread)" is a blue cell until visited.
///
/// herdr sessions aren't in our store at all: herdr owns their state, so the
/// jump is dispatched straight from the session key it minted.
pub fn jump_session(app: &AppHandle, session_id: &str, terminal: Terminal) -> CmdResult<()> {
    if let Some((herdr_session, pane)) = parse_herdr_key(session_id) {
        if !crate::herdr::focus(herdr_session, pane) {
            return Err(CmdError::Internal("herdr would not focus that pane".into()));
        }
        return crate::terminal::raise_tty(terminal, crate::herdr::client_tty().as_deref());
    }
    let target = {
        let sessions = SESSIONS.lock().unwrap();
        sessions
            .iter()
            .find(|s| s.session == session_id)
            .map(|s| s.mux_target.clone())
            .ok_or_else(|| CmdError::Internal("unknown agent session".into()))?
    };
    if target.is_empty() {
        return Err(CmdError::Internal("session has no pane".into()));
    }
    // Read *after* landing, never before: a jump that goes nowhere used to
    // still consume the blue "done, unread" marker, so a run of failed clicks
    // quietly turned the whole bar green (field report 2026-08-18).
    jump(&target, terminal)?;
    mark_read(&mut SESSIONS.lock().unwrap(), session_id);
    if let Err(e) = save(&state_file(), &own_list()) {
        eprintln!("[launcharr agents] state save failed: {e}");
    }
    crate::bar::push(app);
    Ok(())
}

/// Split a herdr session key (`herdr:<session>:<pane>`) back into its parts.
/// Pane ids contain colons themselves (`w1:p1`), so only the first two
/// segments are fixed.
fn parse_herdr_key(session_id: &str) -> Option<(&str, &str)> {
    let rest = session_id.strip_prefix("herdr:")?;
    let (session, pane) = rest.split_once(':')?;
    (!session.is_empty() && !pane.is_empty()).then_some((session, pane))
}

/// Drop a session by hand. Every liveness heuristic has a blind spot — an
/// adapter that never reports a pid, an agent that died with tmux unreachable —
/// and the answer to a stuck cell must not be "edit agents.json".
pub fn forget_session(app: &AppHandle, session_id: &str) -> CmdResult<()> {
    {
        let mut sessions = SESSIONS.lock().unwrap();
        let before = sessions.len();
        sessions.retain(|s| s.session != session_id);
        if sessions.len() == before {
            return Err(CmdError::Internal("unknown agent session".into()));
        }
    }
    if let Err(e) = save(&state_file(), &own_list()) {
        eprintln!("[launcharr agents] state save failed: {e}");
    }
    crate::bar::push(app);
    Ok(())
}

/// Visiting a session reads it: done → idle. Returns its pane target.
fn mark_read(sessions: &mut [AgentSession], session_id: &str) -> Option<String> {
    let session = sessions.iter_mut().find(|s| s.session == session_id)?;
    if session.state == "done" {
        session.state = "idle".into();
    }
    Some(session.mux_target.clone())
}

/// Jump to a session's tmux pane and bring the terminal frontmost.
///
/// The pane's own session decides everything: select the window and pane inside
/// it, hand *that session's* client the switch (never an unnamed "current"
/// client — with two clients attached, tmux picks the most recently active one,
/// which is how a click used to shuffle a terminal Mitch wasn't looking at),
/// and raise the terminal window hosting that client rather than whatever was
/// frontmost. Selection is best-effort because pane ids go stale when panes
/// close; the raise is what the user actually sees.
fn jump(target: &str, terminal: Terminal) -> CmdResult<()> {
    validate_target(target)?;
    let session = pane_session(target);
    let _ = tmux(&["select-window", "-t", target]);
    let _ = tmux(&["select-pane", "-t", target]);
    let tty = session.as_deref().and_then(session_client_tty);
    match (&session, &tty) {
        // A client is already looking at that session: nothing to switch.
        (_, Some(_)) => {}
        // Attached nowhere — point some client at it, then raise that client.
        (Some(name), None) => {
            let _ = tmux(&["switch-client", "-t", name]);
        }
        (None, None) => {
            let _ = tmux(&["switch-client", "-t", target]);
        }
    }
    let tty = tty.or_else(|| session.as_deref().and_then(session_client_tty));
    crate::terminal::raise_tty(terminal, tty.as_deref())
}

/// The tmux session a pane belongs to.
fn pane_session(target: &str) -> Option<String> {
    let out = tmux_out(&["display-message", "-p", "-t", target, "#{session_name}"])?;
    let name = out.trim().to_owned();
    (!name.is_empty()).then_some(name)
}

/// The tty of a client already attached to `session`, if any. This is the
/// bridge between the multiplexer and the terminal window we have to raise.
fn session_client_tty(session: &str) -> Option<String> {
    let out = tmux_out(&["list-clients", "-t", session, "-F", "#{client_tty}"])?;
    out.lines()
        .map(str::trim)
        .find(|t| !t.is_empty())
        .map(str::to_owned)
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
        Ok(bytes) => Ok(adopt_stored(
            serde_json::from_slice(&bytes).unwrap_or_default(),
        )),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(e),
    }
}

/// Fix up what a state file may contain: records written before `mux` existed
/// carry a pane id and no kind (back then there was only one multiplexer it
/// could have been), and any herdr record is a leftover from a build that
/// persisted them — herdr's agents are read live or not at all, so a copy on
/// disk can only ever be a ghost of a server that has moved on.
fn adopt_stored(sessions: Vec<AgentSession>) -> Vec<AgentSession> {
    sessions
        .into_iter()
        .filter(|s| parse_herdr_key(&s.session).is_none())
        .map(|mut s| {
            if s.mux.is_empty() && !s.mux_target.is_empty() {
                s.mux = MUX_TMUX.to_owned();
            }
            s
        })
        .collect()
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
        assert_eq!(s[0].mux_target, "%3");
        let mut retitled = event("a", "working");
        retitled.title = "New task".into();
        apply(&mut s, retitled, 300, DEFAULT_STALE_SECS);
        assert_eq!(s[0].title, "New task");
        assert_eq!(s[0].mux_target, "%3");
    }

    #[test]
    fn background_events_never_create_a_session_without_a_prompt() {
        // Claude's daemon spare / idle pty sessions: SessionStart, then tool
        // chatter, never a prompt — no cell.
        let mut s = Vec::new();
        let mut bg = event("spare", "idle");
        bg.background = true;
        assert!(!apply(&mut s, bg.clone(), 100, DEFAULT_STALE_SECS));
        bg.state = "working".into();
        assert!(!apply(&mut s, bg, 101, DEFAULT_STALE_SECS));
        assert!(s.is_empty());
        // Someone drives it: the prompt surfaces it, and later events stick.
        let mut driven = event("pty", "working");
        driven.background = true;
        driven.title = "fix the build".into();
        assert!(apply(&mut s, driven, 200, DEFAULT_STALE_SECS));
        let mut follow = event("pty", "done");
        follow.background = true;
        assert!(apply(&mut s, follow, 201, DEFAULT_STALE_SECS));
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].state, "done");
        assert_eq!(s[0].title, "fix the build");
    }

    #[test]
    fn subagents_ride_the_session_and_clear_on_done() {
        let mut s = Vec::new();
        apply(&mut s, event("a", "working"), 100, DEFAULT_STALE_SECS);
        let sub = |op: &str, id: &str| SubagentEvent {
            op: op.into(),
            id: id.into(),
            kind: "Explore".into(),
            description: "find the bar code".into(),
        };
        let mut start = event("a", "working");
        start.subagent = Some(sub("start", "s1"));
        apply(&mut s, start, 110, DEFAULT_STALE_SECS);
        let mut start2 = event("a", "working");
        start2.subagent = Some(sub("start", "s2"));
        apply(&mut s, start2, 111, DEFAULT_STALE_SECS);
        assert_eq!(s[0].subagents.len(), 2);
        assert_eq!(s[0].subagents[0].kind, "Explore");
        assert_eq!(s[0].subagents[0].started_at, 110);
        // Ordinary events in between keep them.
        apply(&mut s, event("a", "working"), 120, DEFAULT_STALE_SECS);
        assert_eq!(s[0].subagents.len(), 2);
        let mut stop = event("a", "working");
        stop.subagent = Some(sub("stop", "s1"));
        apply(&mut s, stop, 130, DEFAULT_STALE_SECS);
        assert_eq!(s[0].subagents.len(), 1);
        assert_eq!(s[0].subagents[0].id, "s2");
        // The turn finishing clears whatever is left.
        apply(&mut s, event("a", "done"), 140, DEFAULT_STALE_SECS);
        assert!(s[0].subagents.is_empty());
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

    fn layout(panes: &[&str]) -> std::collections::HashMap<String, PaneLocation> {
        panes
            .iter()
            .map(|p| {
                (
                    (*p).to_owned(),
                    PaneLocation {
                        session: "s".into(),
                        window: 1,
                        window_name: "w".into(),
                    },
                )
            })
            .collect()
    }

    fn paned(session: &str, pane: &str) -> AgentSession {
        AgentSession {
            session: session.into(),
            agent: "claude".into(),
            mux: MUX_TMUX.into(),
            mux_target: pane.into(),
            updated_at: 100,
            ..Default::default()
        }
    }

    fn pidded(session: &str, pid: u32, comm: Option<&str>) -> AgentSession {
        AgentSession {
            session: session.into(),
            agent: "claude".into(),
            pid: Some(pid),
            pid_comm: comm.map(str::to_owned),
            updated_at: 100,
            ..Default::default()
        }
    }

    fn no_procs(_: u32) -> Option<String> {
        None
    }

    #[test]
    fn reaps_sessions_whose_pane_is_gone() {
        let mut s = vec![paned("live", "%1"), paned("dead", "%2")];
        assert!(reap(
            &mut s,
            &layout(&["%1"]),
            true,
            100,
            DEFAULT_STALE_SECS,
            no_procs
        ));
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].session, "live");
    }

    #[test]
    fn an_untrusted_layout_reaps_nothing() {
        // tmux missing or the spawn failed: we know nothing, so we keep
        // everything. Reaping a live fleet is the one unacceptable outcome.
        let mut s = vec![paned("a", "%1"), paned("b", "%2")];
        assert!(!reap(
            &mut s,
            &layout(&[]),
            false,
            100,
            DEFAULT_STALE_SECS,
            no_procs
        ));
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn a_live_pane_outranks_a_missing_process() {
        // The pane is proof of life; the pid check never even runs.
        let mut s = vec![AgentSession {
            pid: Some(42),
            pid_comm: Some("claude".into()),
            ..paned("a", "%1")
        }];
        assert!(!reap(
            &mut s,
            &layout(&["%1"]),
            true,
            100,
            DEFAULT_STALE_SECS,
            no_procs
        ));
        assert_eq!(s.len(), 1);
    }

    #[test]
    fn reaps_pane_less_sessions_by_process() {
        let mut s = vec![
            pidded("live", 1, Some("claude")),
            pidded("gone", 2, Some("claude")),
            pidded("recycled", 3, Some("claude")),
        ];
        let comm = |pid: u32| match pid {
            1 => Some("claude".to_owned()),
            3 => Some("Safari".to_owned()),
            _ => None,
        };
        assert!(reap(
            &mut s,
            &layout(&[]),
            true,
            100,
            DEFAULT_STALE_SECS,
            comm
        ));
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].session, "live");
    }

    #[test]
    fn first_sight_of_a_pid_records_its_command() {
        // Adapter-agnostic: whatever the pid is running becomes the fingerprint,
        // so a new adapter (herdr, …) needs no change here.
        let mut s = vec![pidded("a", 7, None)];
        let comm = |_: u32| Some("herdr".to_owned());
        assert!(reap(
            &mut s,
            &layout(&[]),
            true,
            100,
            DEFAULT_STALE_SECS,
            comm
        ));
        assert_eq!(s[0].pid_comm.as_deref(), Some("herdr"));
        // Second pass is a no-op — nothing changed, nothing to persist.
        assert!(!reap(
            &mut s,
            &layout(&[]),
            true,
            100,
            DEFAULT_STALE_SECS,
            comm
        ));
    }

    #[test]
    fn a_session_with_nothing_to_check_is_judged_on_silence() {
        // No pane, no pid — the 2026-08-18 field orphan's shape. Nothing here
        // is evidence of life, so it gets the short window, not the 12h sweep.
        let bare = || {
            vec![AgentSession {
                session: "a".into(),
                agent: "claude".into(),
                updated_at: 100,
                ..Default::default()
            }]
        };
        let mut s = bare();
        assert!(!reap(
            &mut s,
            &layout(&[]),
            true,
            100 + UNVERIFIABLE_STALE_SECS,
            DEFAULT_STALE_SECS,
            no_procs
        ));
        assert_eq!(s.len(), 1);
        let mut s = bare();
        assert!(reap(
            &mut s,
            &layout(&[]),
            true,
            100 + UNVERIFIABLE_STALE_SECS + 1,
            DEFAULT_STALE_SECS,
            no_procs
        ));
        assert!(s.is_empty(), "silent far past the window, nothing to ask");
    }

    #[test]
    fn a_pid_less_pane_holder_keeps_the_full_prune_window() {
        // A pane we couldn't look up is ignorance, not death: this one must
        // outlive the short window that catches the pane-less case above.
        let mut s = vec![paned("a", "%1")];
        assert!(!reap(
            &mut s,
            &layout(&[]),
            false,
            100 + UNVERIFIABLE_STALE_SECS + 1,
            DEFAULT_STALE_SECS,
            no_procs
        ));
        assert_eq!(s.len(), 1);
    }

    #[test]
    fn pid_survives_events_that_omit_it_and_resets_the_comm_when_it_moves() {
        let mut s = Vec::new();
        let mut first = event("a", "working");
        first.pid = Some(11);
        apply(&mut s, first, 100, DEFAULT_STALE_SECS);
        s[0].pid_comm = Some("claude".into());
        apply(&mut s, event("a", "idle"), 200, DEFAULT_STALE_SECS);
        assert_eq!(s[0].pid, Some(11));
        assert_eq!(s[0].pid_comm.as_deref(), Some("claude"));
        let mut moved = event("a", "working");
        moved.pid = Some(22);
        apply(&mut s, moved, 300, DEFAULT_STALE_SECS);
        assert_eq!(s[0].pid, Some(22));
        assert_eq!(s[0].pid_comm, None, "a new pid re-earns its fingerprint");
    }

    #[test]
    fn parses_ps_output() {
        let procs = parse_procs(
            "  501 claude
 1234 /usr/bin/some app
bad

",
        );
        assert_eq!(procs.get(&501).map(String::as_str), Some("claude"));
        assert_eq!(
            procs.get(&1234).map(String::as_str),
            Some("/usr/bin/some app")
        );
        assert_eq!(procs.len(), 2);
        assert!(parse_procs("").is_empty());
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
    fn splits_herdr_session_keys() {
        // Pane ids carry their own colons, so only the first two segments are
        // structure: herdr:<session>:<pane>.
        assert_eq!(
            parse_herdr_key("herdr:default:w1:p1"),
            Some(("default", "w1:p1"))
        );
        assert_eq!(
            parse_herdr_key("herdr:work:w12:p3"),
            Some(("work", "w12:p3"))
        );
        assert_eq!(parse_herdr_key("herdr:default:"), None);
        assert_eq!(parse_herdr_key("herdr:default"), None);
        // A hook-fed session id must never be mistaken for one.
        assert_eq!(
            parse_herdr_key("74926675-ce0a-42eb-b1cb-1fcd79b461d3"),
            None
        );
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
    fn old_records_are_read_as_tmux() {
        // agents.json from before the mux rename: `tmux` aliases the pane id,
        // and the kind has to be inferred rather than left blank.
        let old: Vec<AgentSession> = serde_json::from_str(
            r#"[{"session":"a","agent":"claude","state":"idle","title":"",
              "detail":"","tmux":"%3","updatedAt":42},
              {"session":"b","agent":"claude","state":"idle","title":"","detail":"",
              "tmux":"","updatedAt":42}]"#,
        )
        .expect("legacy state parses");
        let filled = adopt_stored(old);
        assert_eq!(filled[0].mux_target, "%3");
        assert_eq!(filled[0].mux, MUX_TMUX);
        assert_eq!(filled[1].mux, "", "no pane, no multiplexer to infer");
    }

    #[test]
    fn stored_herdr_records_are_dropped_on_load() {
        let stored: Vec<AgentSession> = serde_json::from_str(
            r#"[{"session":"herdr:default:w1:p1","agent":"claude","state":"idle","title":"",
                 "detail":"","mux":"herdr","muxTarget":"w1:p1","updatedAt":42},
                {"session":"a","agent":"claude","state":"idle","title":"","detail":"",
                 "tmux":"%3","updatedAt":42}]"#,
        )
        .expect("state parses");
        let kept = adopt_stored(stored);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].session, "a", "herdr owns its own agents, not us");
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
            mux: MUX_TMUX.into(),
            mux_target: "%3".into(),
            updated_at: 42,
            ..Default::default()
        }];
        save(&path, &sessions).expect("save");
        assert_eq!(load(&path).expect("load"), sessions);
        assert_eq!(load(&dir.join("missing.json")).expect("missing ok"), vec![]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
