//! Bar widgets: user executables in `~/.config/launcharr/widgets/` that own a
//! cell (and hover card) in the bar. The scripts protocol, pointed at the bar
//! (docs/WIDGETS.md):
//!
//! - `<widget> manifest` → `{"id", "name", "interval"?, "zone"?, "icon"?, "timeout"?}`
//! - `<widget> tick`     → `{"icon"?, "label"?, "tone"?, "click"?, "card"?}`
//!
//! Widgets are data, never code: Rust runs them on their own cadence (never on
//! the 1 Hz push path), keeps the last view per id, and ships the lot in
//! `BarSnapshot.widgets`; `@launcharr/tui` renders every widget with one
//! generic cell + card. A failing tick keeps the last view and marks the widget
//! `error` with the reason — fail-visible, never a silent blank.
//!
//! Refresh comes three ways: the interval, `touch
//! ~/.config/launcharr/triggers/widget.<id>` (bar.rs forwards those to
//! `poke`), and any change in the widgets dir (re-discovery, immediate tick).

use std::{
    collections::HashMap,
    fs,
    io::Read,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::scripts::ScriptAction;

// ---- the contract ------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetManifest {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Seconds between ticks. Clamped to [MIN_INTERVAL, ∞).
    #[serde(default = "default_interval")]
    pub interval: u64,
    /// Default zone for a widget the layout hasn't placed yet.
    #[serde(default = "default_zone")]
    pub zone: String,
    /// lucide icon name used until the first tick (and when a tick sends none).
    #[serde(default)]
    pub icon: Option<String>,
    /// Seconds a tick may run before it is killed. Clamped to [1, MAX_TIMEOUT].
    #[serde(default = "default_timeout")]
    pub timeout: u64,
}

fn default_interval() -> u64 {
    60
}
fn default_zone() -> String {
    "right".into()
}
fn default_timeout() -> u64 {
    10
}

const MIN_INTERVAL: u64 = 5;
const MAX_TIMEOUT: u64 = 60;
const MANIFEST_TIMEOUT: Duration = Duration::from_millis(1500);
/// How much of a failing tick's stderr the card shows.
const STDERR_TAIL: usize = 400;

/// One row of a widget's hover card.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetRow {
    /// Status dot tone: ok | warn | error | muted | accent; none = no dot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dot: Option<String>,
    pub text: String,
    /// Dim trailing text (a time, a count).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// Click on the row — the scripts action vocabulary.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<ScriptAction>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetCard {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub rows: Vec<WidgetRow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

/// What one successful tick paints: the cell, and the card behind it.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetView {
    /// True = no cell this tick (e.g. a credentialed widget with no
    /// credential — inert, not alarmed: DECISIONS 2026-08-16).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Cell tone: ok | warn | error | muted | accent; none = plain foreground.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub click: Option<ScriptAction>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card: Option<WidgetCard>,
}

/// A widget as the bar sees it — mirrored by `BarWidget` in @launcharr/tui.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetState {
    pub id: String,
    pub name: String,
    pub zone: String,
    /// Manifest icon — the glyph before the first tick lands.
    pub icon: Option<String>,
    /// Last successful tick, kept through failures so the cell never blanks.
    pub view: Option<WidgetView>,
    /// Why the last tick failed; None while healthy.
    pub error: Option<String>,
    /// Epoch seconds of the last successful tick.
    pub last_ok: Option<u64>,
    /// Epoch seconds of the last attempt, success or not.
    pub updated_at: Option<u64>,
}

// ---- registry ----------------------------------------------------------

struct Entry {
    manifest: WidgetManifest,
    path: PathBuf,
    state: WidgetState,
    next_due: Instant,
    running: bool,
}

static WIDGETS: Mutex<Vec<Entry>> = Mutex::new(Vec::new());

pub fn widgets_dir() -> PathBuf {
    crate::config::config_dir().join("widgets")
}

/// Everything the bar renders, in discovery (alphabetical) order.
pub fn snapshot() -> Vec<WidgetState> {
    WIDGETS
        .lock()
        .unwrap()
        .iter()
        .map(|e| e.state.clone())
        .collect()
}

/// Ask for a tick now (trigger file, dir change). Unknown ids are ignored.
pub fn poke(id: &str) {
    if let Some(e) = WIDGETS.lock().unwrap().iter_mut().find(|e| e.state.id == id) {
        e.next_due = Instant::now();
    }
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Widget ids are file-safe words: they name trigger files and layout slots.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Parse and sanitize a manifest: id rules, interval/timeout clamps, zone names.
pub fn parse_manifest(json: &str) -> Result<WidgetManifest, String> {
    let mut m: WidgetManifest = serde_json::from_str(json).map_err(|e| e.to_string())?;
    if !valid_id(&m.id) {
        return Err(format!("bad widget id {:?}", m.id));
    }
    if m.name.is_empty() {
        m.name = m.id.clone();
    }
    m.interval = m.interval.max(MIN_INTERVAL);
    m.timeout = m.timeout.clamp(1, MAX_TIMEOUT);
    if !matches!(m.zone.as_str(), "left" | "center" | "right") {
        m.zone = default_zone();
    }
    Ok(m)
}

/// A tick's stdout must be one `WidgetView` object.
pub fn parse_view(json: &str) -> Result<WidgetView, String> {
    serde_json::from_str(json).map_err(|e| format!("bad tick output: {e}"))
}

// ---- running children ---------------------------------------------------

/// Run a child with a hard timeout. Ok(stdout) on exit 0; Err(reason) on
/// non-zero exit (with a stderr tail), timeout, or spawn failure. Both pipes
/// are drained on their own threads so a chatty child can't wedge on a full
/// pipe while we poll for exit.
fn run(cmd: &mut Command, timeout: Duration) -> Result<String, String> {
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))?;
    let out_h = drain(child.stdout.take());
    let err_h = drain(child.stderr.take());
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if started.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(e) => return Err(format!("wait failed: {e}")),
        }
    };
    let stdout = out_h.join().unwrap_or_default();
    let stderr = err_h.join().unwrap_or_default();
    match status {
        None => Err(format!("timed out after {}s", timeout.as_secs())),
        Some(s) if s.success() => Ok(stdout),
        Some(s) => {
            let tail = stderr.trim();
            let tail = if tail.len() > STDERR_TAIL {
                &tail[tail.len() - STDERR_TAIL..]
            } else {
                tail
            };
            let code = s.code().map_or("signal".to_string(), |c| c.to_string());
            if tail.is_empty() {
                Err(format!("exit {code}"))
            } else {
                Err(format!("exit {code}: {tail}"))
            }
        }
    }
}

/// Read a child pipe to the end on its own thread.
fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut out = String::new();
        if let Some(mut p) = pipe {
            let _ = p.read_to_string(&mut out);
        }
        out
    })
}

fn is_executable(path: &Path) -> bool {
    path.is_file()
        && fs::metadata(path)
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
}

/// Scan the dir, run manifests, return (manifest, path) sorted by id, first
/// registration winning a duplicate id.
fn discover(dir: &Path) -> Vec<(WidgetManifest, PathBuf)> {
    let mut found = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return found;
    };
    let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    paths.sort();
    for path in paths {
        if !is_executable(&path) {
            continue;
        }
        match run(Command::new(&path).arg("manifest"), MANIFEST_TIMEOUT)
            .and_then(|out| parse_manifest(&out))
        {
            Ok(m) => found.push((m, path)),
            Err(e) => eprintln!("[launcharr widgets] {} manifest: {e}", path.display()),
        }
    }
    found.sort_by(|a, b| a.0.id.cmp(&b.0.id));
    found.dedup_by(|a, b| a.0.id == b.0.id);
    found
}

/// Rebuild the registry from disk. Widgets whose id and path survive keep
/// their view (no blank flash on a re-scan); new or moved ones tick at once.
fn refresh() {
    let found = discover(&widgets_dir());
    let mut reg = WIDGETS.lock().unwrap();
    let mut old: HashMap<String, Entry> = reg.drain(..).map(|e| (e.state.id.clone(), e)).collect();
    for (manifest, path) in found {
        let mut entry = match old.remove(&manifest.id) {
            Some(prev) if prev.path == path => prev,
            _ => Entry {
                state: WidgetState {
                    id: manifest.id.clone(),
                    name: manifest.name.clone(),
                    zone: manifest.zone.clone(),
                    icon: manifest.icon.clone(),
                    view: None,
                    error: None,
                    last_ok: None,
                    updated_at: None,
                },
                manifest: manifest.clone(),
                path,
                next_due: Instant::now(),
                running: false,
            },
        };
        // Manifest fields may have been edited in place.
        entry.state.name = manifest.name.clone();
        entry.state.zone = manifest.zone.clone();
        entry.state.icon = manifest.icon.clone();
        entry.manifest = manifest;
        reg.push(entry);
    }
    eprintln!(
        "[launcharr widgets] {} widget(s): {}",
        reg.len(),
        reg.iter()
            .map(|e| e.state.id.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );
}

/// One tick of one widget, off-thread; records the outcome and pushes the bar.
fn tick(app: AppHandle, id: String, path: PathBuf, timeout: Duration) {
    let result = run(Command::new(&path).arg("tick"), timeout).and_then(|out| parse_view(&out));
    let now = now_epoch();
    {
        let mut reg = WIDGETS.lock().unwrap();
        if let Some(e) = reg.iter_mut().find(|e| e.state.id == id) {
            match result {
                Ok(view) => {
                    e.state.view = Some(view);
                    e.state.error = None;
                    e.state.last_ok = Some(now);
                }
                Err(err) => {
                    eprintln!("[launcharr widgets] {id}: {err}");
                    e.state.error = Some(err);
                }
            }
            e.state.updated_at = Some(now);
            e.running = false;
            e.next_due = Instant::now() + Duration::from_secs(e.manifest.interval);
        }
    }
    crate::bar::push(&app);
}

/// Discovery, the dir watcher, and the scheduler. Idempotent per process.
pub fn start(app: AppHandle) {
    static STARTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if STARTED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    let dir = widgets_dir();
    let _ = fs::create_dir_all(&dir);

    // Watcher: any change in the dir re-discovers (coalesced) — drop a widget
    // in, it's live; edit it, it re-ticks.
    let watch_app = app.clone();
    std::thread::spawn(move || {
        refresh();
        crate::bar::push(&watch_app);
        use notify::{RecursiveMode, Watcher};
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[launcharr widgets] watcher failed: {e}");
                return;
            }
        };
        if watcher.watch(&dir, RecursiveMode::NonRecursive).is_err() {
            return;
        }
        loop {
            if rx.recv().is_err() {
                return;
            }
            while rx.recv_timeout(Duration::from_millis(400)).is_ok() {}
            refresh();
            crate::bar::push(&watch_app);
        }
    });

    // Scheduler: 1 Hz look for due widgets; each tick runs on its own thread,
    // one in flight per widget.
    std::thread::spawn(move || loop {
        let due: Vec<(String, PathBuf, Duration)> = {
            let mut reg = WIDGETS.lock().unwrap();
            let now = Instant::now();
            reg.iter_mut()
                .filter(|e| !e.running && e.next_due <= now)
                .map(|e| {
                    e.running = true;
                    (
                        e.state.id.clone(),
                        e.path.clone(),
                        Duration::from_secs(e.manifest.timeout),
                    )
                })
                .collect()
        };
        for (id, path, timeout) in due {
            let app = app.clone();
            std::thread::spawn(move || tick(app, id, path, timeout));
        }
        std::thread::sleep(Duration::from_secs(1));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_defaults_and_clamps() {
        let m = parse_manifest(r#"{"id":"uptime"}"#).unwrap();
        assert_eq!(m.name, "uptime");
        assert_eq!(m.interval, 60);
        assert_eq!(m.zone, "right");
        assert_eq!(m.timeout, 10);
        let m = parse_manifest(r#"{"id":"x","interval":1,"timeout":999,"zone":"middle"}"#).unwrap();
        assert_eq!(m.interval, MIN_INTERVAL);
        assert_eq!(m.timeout, MAX_TIMEOUT);
        assert_eq!(m.zone, "right");
    }

    #[test]
    fn manifest_rejects_bad_ids() {
        assert!(parse_manifest(r#"{"id":"Has Space"}"#).is_err());
        assert!(parse_manifest(r#"{"id":""}"#).is_err());
        assert!(parse_manifest(r#"{"id":"widget:x"}"#).is_err());
        assert!(valid_id("github-actions"));
        assert!(!valid_id("Uptime"));
    }

    #[test]
    fn view_parses_the_documented_shape() {
        let v = parse_view(
            r#"{"icon":"arrow-big-down","tone":"error","label":"2",
                "click":{"type":"open","value":"https://status.example"},
                "card":{"title":"Uptime","rows":[
                  {"dot":"ok","text":"beebee.bot","action":{"type":"open","value":"https://beebee.bot"}},
                  {"dot":"error","text":"psyke.co","hint":"down 4m"}]}}"#,
        )
        .unwrap();
        assert_eq!(v.tone.as_deref(), Some("error"));
        assert!(matches!(v.click, Some(ScriptAction::Open(_))));
        let card = v.card.unwrap();
        assert_eq!(card.rows.len(), 2);
        assert_eq!(card.rows[1].hint.as_deref(), Some("down 4m"));
        assert!(card.rows[1].action.is_none());
        assert!(!v.hidden);
        assert!(parse_view(r#"{"hidden":true}"#).unwrap().hidden);
        // The empty object is a valid (blank) view.
        assert_eq!(parse_view("{}").unwrap(), WidgetView::default());
        assert!(parse_view("not json").is_err());
    }

    #[test]
    fn run_reports_stderr_and_timeouts() {
        let err = run(
            Command::new("sh").arg("-c").arg("echo boom >&2; exit 3"),
            Duration::from_secs(2),
        )
        .unwrap_err();
        assert_eq!(err, "exit 3: boom");
        let started = Instant::now();
        let err = run(Command::new("sleep").arg("10"), Duration::from_millis(200)).unwrap_err();
        assert!(err.starts_with("timed out"), "{err}");
        assert!(started.elapsed() < Duration::from_secs(2));
        let ok = run(Command::new("sh").arg("-c").arg("echo hi"), Duration::from_secs(2)).unwrap();
        assert_eq!(ok.trim(), "hi");
    }

    #[test]
    fn discover_runs_manifests_and_skips_non_executables() {
        let dir = std::env::temp_dir().join(format!("launcharr-widgets-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let good = dir.join("b-good");
        fs::write(
            &good,
            "#!/bin/sh\n[ \"$1\" = manifest ] && echo '{\"id\":\"good\",\"interval\":30}'\n",
        )
        .unwrap();
        fs::set_permissions(&good, fs::Permissions::from_mode(0o755)).unwrap();
        // Same id, later path: first registration wins.
        let dup = dir.join("c-dup");
        fs::write(&dup, "#!/bin/sh\necho '{\"id\":\"good\",\"interval\":99}'\n").unwrap();
        fs::set_permissions(&dup, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(dir.join("a-notes.txt"), "not a widget").unwrap();
        let bad = dir.join("d-bad");
        fs::write(&bad, "#!/bin/sh\necho 'nope'\n").unwrap();
        fs::set_permissions(&bad, fs::Permissions::from_mode(0o755)).unwrap();

        let found = discover(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0.id, "good");
        assert_eq!(found[0].0.interval, 30);
        assert_eq!(found[0].1, good);
        let _ = fs::remove_dir_all(&dir);
    }
}
