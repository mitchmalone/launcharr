//! herdr as a second agent source (plans/active/herdr-multiplexer.md).
//!
//! herdr (<https://herdr.dev>) is a terminal workspace server that owns panes
//! and — unlike tmux — classifies the agents inside them itself: every pane is
//! `working | blocked | done | idle | unknown`, which is launcharr's own
//! vocabulary. So herdr isn't a second hook source to fold into our store, it
//! *is* a store, already authoritative about its own agents. We read it and
//! translate; we never write agent state back.
//!
//! Transport is newline-delimited JSON over a unix socket, the same shape as
//! our own adapter protocol. Local IPC only — invariant 2 holds.
//!
//! Why polling rather than `events.subscribe`: herdr's
//! `pane.agent_status_changed` subscription requires a `pane_id`, so there is
//! no session-wide status push — a subscriber would have to re-subscribe for
//! every pane as panes come and go. `session.snapshot` returns workspaces,
//! tabs and agents in one read, so a 1 s cache (the same shape as
//! `agents::tmux_layout`) buys the same freshness for far less machinery.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::agents::{AgentSession, MUX_HERDR};

/// How long a snapshot is served before we ask herdr again. Matches the tmux
/// layout cache: the bar pushes at 1 Hz and must not pay a round trip per tick.
const CACHE: Duration = Duration::from_millis(1000);

/// herdr's own agent record (`AgentInfo`). Only the fields launcharr shows —
/// herdr's schema is young and will grow; unknown fields are ignored by design.
#[derive(Debug, Clone, Deserialize)]
struct AgentInfo {
    pane_id: String,
    workspace_id: String,
    #[serde(default)]
    tab_id: String,
    #[serde(default)]
    agent: Option<String>,
    #[serde(default)]
    agent_status: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    display_agent: Option<String>,
    #[serde(default)]
    terminal_title_stripped: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    /// Bumps whenever herdr decides the agent changed state — our only clock,
    /// since the snapshot carries no timestamps.
    #[serde(default)]
    state_change_seq: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct WorkspaceInfo {
    workspace_id: String,
    /// The user-facing workspace name — the bar's group box label.
    #[serde(default)]
    label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct TabInfo {
    tab_id: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    number: Option<u32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct Snapshot {
    #[serde(default)]
    agents: Vec<AgentInfo>,
    #[serde(default)]
    workspaces: Vec<WorkspaceInfo>,
    #[serde(default)]
    tabs: Vec<TabInfo>,
}

/// The live agents herdr knows about, as launcharr sessions. Empty — and
/// silent — when herdr isn't running: a machine without herdr must not pay for
/// this, and must never see an error.
pub fn list() -> Vec<AgentSession> {
    let mut out = Vec::new();
    for (session_name, path) in socket_paths() {
        let Some(snapshot) = snapshot(&path) else {
            continue;
        };
        out.extend(to_sessions(&session_name, &snapshot, now_secs()));
    }
    out
}

/// herdr's sockets: the default session, plus any named ones. Named sessions
/// are separate namespaces with their own pane ids, which is why the session
/// name is part of our session key.
fn socket_paths() -> Vec<(String, PathBuf)> {
    let root = config_dir();
    let mut found = Vec::new();
    let default = root.join("herdr.sock");
    if default.exists() {
        found.push((String::from("default"), default));
    }
    if let Ok(entries) = std::fs::read_dir(root.join("sessions")) {
        for entry in entries.flatten() {
            let sock = entry.path().join("herdr.sock");
            if sock.exists() {
                found.push((entry.file_name().to_string_lossy().into_owned(), sock));
            }
        }
    }
    found
}

fn config_dir() -> PathBuf {
    std::env::var_os("HERDR_CONFIG_DIR")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_default()
                .join(".config")
                .join("herdr")
        })
}

/// One `session.snapshot` round trip, cached per socket.
fn snapshot(path: &std::path::Path) -> Option<Snapshot> {
    type Cache = std::collections::HashMap<PathBuf, (Instant, Option<Snapshot>)>;
    static CACHED: Mutex<Option<Cache>> = Mutex::new(None);
    let mut cache = CACHED.lock().unwrap();
    let cache = cache.get_or_insert_with(Default::default);
    if let Some((at, snapshot)) = cache.get(path) {
        if at.elapsed() < CACHE {
            return snapshot.clone();
        }
    }
    let fresh = request_snapshot(path);
    cache.insert(path.to_owned(), (Instant::now(), fresh.clone()));
    fresh
}

/// A herdr socket speaks one JSON request per line and answers in kind. The
/// connection is per-request: a snapshot is a few KB once a second, and a
/// pooled connection would need its own reconnect/health machinery to buy
/// nothing measurable.
fn request_snapshot(path: &std::path::Path) -> Option<Snapshot> {
    let response = request(
        path,
        r#"{"id":"launcharr","method":"session.snapshot","params":{}}"#,
    )?;
    #[derive(Deserialize)]
    struct Envelope {
        result: Option<ResultBody>,
    }
    #[derive(Deserialize)]
    struct ResultBody {
        snapshot: Option<Snapshot>,
    }
    serde_json::from_str::<Envelope>(&response)
        .ok()?
        .result?
        .snapshot
}

/// Send one line, read one line. Timeouts on every side: herdr is somebody
/// else's process, and a wedged server must never wedge the bar.
fn request(path: &std::path::Path, line: &str) -> Option<String> {
    let stream = UnixStream::connect(path).ok()?;
    stream
        .set_read_timeout(Some(Duration::from_millis(500)))
        .ok()?;
    stream
        .set_write_timeout(Some(Duration::from_millis(500)))
        .ok()?;
    let mut writer = &stream;
    writer.write_all(line.as_bytes()).ok()?;
    writer.write_all(b"\n").ok()?;
    writer.flush().ok()?;
    let mut response = String::new();
    BufReader::new(&stream).read_line(&mut response).ok()?;
    (!response.trim().is_empty()).then_some(response)
}

/// Focus a herdr pane. herdr owns the window; all launcharr does is ask, then
/// its caller brings the terminal forward.
pub fn focus(session_name: &str, pane_id: &str) -> bool {
    let Some((_, path)) = socket_paths()
        .into_iter()
        .find(|(name, _)| name == session_name)
    else {
        return false;
    };
    let params = serde_json::json!({
        "id": "launcharr-focus",
        "method": "agent.focus",
        "params": { "pane_id": pane_id },
    });
    request(&path, &params.to_string()).is_some_and(|r| !r.contains(r#""error""#))
}

/// The tty of herdr's attached client — the terminal window to raise after
/// focusing one of its panes. herdr's API describes panes inside its own world
/// and says nothing about the terminal hosting it, so we ask the OS: the client
/// process is the `herdr` that owns a tty (the server, its parent, has none).
pub fn client_tty() -> Option<String> {
    let out = std::process::Command::new("/bin/ps")
        .args(["-Ao", "tty=,comm="])
        .output()
        .ok()?;
    parse_client_tty(&String::from_utf8_lossy(&out.stdout))
}

fn parse_client_tty(ps_out: &str) -> Option<String> {
    ps_out
        .lines()
        .filter_map(|line| {
            let (tty, comm) = line.trim_start().split_once(char::is_whitespace)?;
            let tty = tty.trim();
            let comm = comm.trim();
            // `??` is ps for "no controlling terminal" — that's the server.
            (tty != "??" && !tty.is_empty() && comm.rsplit('/').next() == Some("herdr"))
                .then(|| format!("/dev/{tty}"))
        })
        .next()
}

/// herdr's states are launcharr's, with one rename: herdr says `blocked` where
/// the bar says `attention` (the breathing red cell).
fn map_state(status: &str) -> &str {
    match status {
        "blocked" => "attention",
        other => other,
    }
}

/// Translate one snapshot into launcharr sessions.
///
/// Ages: herdr's snapshot carries no timestamps, only a `state_change_seq` that
/// bumps when it reclassifies an agent. We remember when each seq was first
/// seen, so "3m ago" means what it does for hook-fed agents instead of
/// resetting to 0s on every poll.
fn to_sessions(session_name: &str, snapshot: &Snapshot, now: u64) -> Vec<AgentSession> {
    let workspaces: std::collections::HashMap<&str, &WorkspaceInfo> = snapshot
        .workspaces
        .iter()
        .map(|w| (w.workspace_id.as_str(), w))
        .collect();
    let tabs: std::collections::HashMap<&str, &TabInfo> = snapshot
        .tabs
        .iter()
        .map(|t| (t.tab_id.as_str(), t))
        .collect();

    snapshot
        .agents
        .iter()
        .map(|a| {
            let workspace = workspaces.get(a.workspace_id.as_str());
            let tab = tabs.get(a.tab_id.as_str());
            let key = format!("herdr:{session_name}:{}", a.pane_id);
            let agent = a
                .agent
                .clone()
                .or_else(|| a.display_agent.clone())
                .unwrap_or_else(|| String::from("agent"));
            AgentSession {
                updated_at: state_since(&key, a.state_change_seq, now),
                state: map_state(&a.agent_status).to_owned(),
                title: a
                    .title
                    .clone()
                    .or_else(|| a.terminal_title_stripped.clone())
                    .unwrap_or_default(),
                detail: a
                    .cwd
                    .as_deref()
                    .and_then(|c| c.rsplit('/').next())
                    .unwrap_or_default()
                    .to_owned(),
                session: key,
                agent,
                mux: MUX_HERDR.to_owned(),
                mux_target: a.pane_id.clone(),
                mux_group: workspace
                    .and_then(|w| w.label.clone())
                    .or_else(|| Some(a.workspace_id.clone())),
                mux_index: tab.and_then(|t| t.number),
                mux_label: tab.and_then(|t| t.label.clone()),
                ..Default::default()
            }
        })
        .collect()
}

/// When this agent last changed state, in unix seconds. First sighting counts
/// as "now" — we can't know how long herdr has felt this way, and claiming
/// otherwise would put a fake age on the card.
fn state_since(key: &str, seq: u64, now: u64) -> u64 {
    type Seen = std::collections::HashMap<String, (u64, u64)>;
    static SEEN: Mutex<Option<Seen>> = Mutex::new(None);
    let mut seen = SEEN.lock().unwrap();
    let seen = seen.get_or_insert_with(Default::default);
    match seen.get(key) {
        Some((known_seq, at)) if *known_seq == seq => *at,
        _ => {
            seen.insert(key.to_owned(), (seq, now));
            now
        }
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Captured from a live herdr 0.8.0 (`herdr api snapshot`), trimmed to the
    /// fields we read. Fixtures come from the real server, never hand-invented:
    /// the protocol is days old and will move under us.
    const SNAPSHOT: &str = r#"{
      "agents": [{
        "agent": "claude", "agent_status": "idle", "cwd": "/Users/mitch/Developer/mitch/launcharr",
        "focused": true, "pane_id": "w1:p1", "revision": 12, "state_change_seq": 5,
        "tab_id": "w1:t1", "terminal_id": "term_659489cfd23cc1",
        "terminal_title": "✳ L2", "terminal_title_stripped": "L2", "workspace_id": "w1"
      }],
      "workspaces": [{"workspace_id":"w1","label":"launcharr","number":1,"agent_status":"idle"}],
      "tabs": [{"tab_id":"w1:t1","workspace_id":"w1","label":"1","number":1}]
    }"#;

    fn parsed() -> Snapshot {
        serde_json::from_str(SNAPSHOT).expect("real herdr snapshot parses")
    }

    #[test]
    fn maps_a_live_snapshot_to_sessions() {
        let sessions = to_sessions("default", &parsed(), 1000);
        assert_eq!(sessions.len(), 1);
        let s = &sessions[0];
        assert_eq!(s.session, "herdr:default:w1:p1");
        assert_eq!(s.agent, "claude");
        assert_eq!(s.state, "idle");
        assert_eq!(s.title, "L2", "falls back to the stripped terminal title");
        assert_eq!(s.mux, MUX_HERDR);
        assert_eq!(s.mux_target, "w1:p1");
        assert_eq!(s.mux_group.as_deref(), Some("launcharr"));
        assert_eq!(s.mux_index, Some(1));
        assert_eq!(s.mux_label.as_deref(), Some("1"));
        assert_eq!(s.detail, "launcharr", "cwd basename");
    }

    #[test]
    fn blocked_becomes_the_bars_attention() {
        let mut snapshot = parsed();
        snapshot.agents[0].agent_status = "blocked".into();
        assert_eq!(
            to_sessions("default", &snapshot, 1000)[0].state,
            "attention"
        );
        // Everything else passes through untouched, including states we've
        // never heard of — herdr may add one before we do.
        assert_eq!(map_state("working"), "working");
        assert_eq!(map_state("unknown"), "unknown");
        assert_eq!(map_state("newfangled"), "newfangled");
    }

    #[test]
    fn a_snapshot_without_labels_still_groups() {
        // Workspaces/tabs herdr didn't describe: fall back to the raw id rather
        // than dropping the agent into the loose box.
        let mut snapshot = parsed();
        snapshot.workspaces.clear();
        snapshot.tabs.clear();
        let s = &to_sessions("default", &snapshot, 1000)[0];
        assert_eq!(s.mux_group.as_deref(), Some("w1"));
        assert_eq!(s.mux_index, None);
    }

    #[test]
    fn ages_track_state_changes_not_polls() {
        let snapshot = parsed();
        let first = to_sessions("ages-test", &snapshot, 1000)[0].updated_at;
        assert_eq!(first, 1000);
        // Polled again 30s later with the same seq: the age keeps running.
        assert_eq!(
            to_sessions("ages-test", &snapshot, 1030)[0].updated_at,
            1000
        );
        // New seq — herdr reclassified it, so the clock restarts.
        let mut changed = snapshot.clone();
        changed.agents[0].state_change_seq = 6;
        assert_eq!(to_sessions("ages-test", &changed, 1030)[0].updated_at, 1030);
    }

    #[test]
    fn finds_the_herdr_client_by_its_tty() {
        // Real `ps -Ao tty=,comm=` shape: the server has no controlling
        // terminal, the client does — and only the client can be raised.
        let out = "\
??       /Users/mitch/.local/bin/herdr
ttys004  herdr
ttys000  /bin/zsh
";
        assert_eq!(parse_client_tty(out).as_deref(), Some("/dev/ttys004"));
        assert_eq!(parse_client_tty("??       herdr\n"), None);
        assert_eq!(parse_client_tty(""), None);
        // A process merely *containing* herdr in its path isn't the client.
        assert_eq!(parse_client_tty("ttys009  /usr/bin/herdr-remote\n"), None);
    }

    #[test]
    fn missing_herdr_is_silent() {
        assert!(request_snapshot(std::path::Path::new("/nonexistent/herdr.sock")).is_none());
    }
}
