//! Bar widgets: user plugins in `~/.config/launcharr/widgets/` — `.ts` files
//! run under Bun (runtime.rs), or any executable — that own a cell (and hover
//! card) in the bar. The scripts protocol, pointed at the bar (docs/WIDGETS.md):
//!
//! - `<widget> manifest` → `{"id", "name", "interval"?, "zone"?, "icon"?, "timeout"?,
//!   "settings"?, "auth"?}`
//! - `<widget> tick`     → `{"icon"?, "label"?, "tone"?, "click"?, "card"?}`
//! - `<widget> auth`     → (opt-in) one JSON object per stdout line: `{"url","code"}`,
//!   `{"message"}`, `{"settings": {KEY: value}}`; exit 0 = signed in.
//!
//! Settings a manifest declares reach the widget as env on every run: plain
//! values from `config.widgets[id]`, secrets from the Keychain
//! (widget_secrets.rs). A widget with an unset `required` setting isn't run —
//! it shows as "needs setup" instead of failing (plan:
//! docs/plans/active/widget-settings.md).
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
use tauri::{AppHandle, Emitter, Manager};

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
    /// What the widget needs from the user (tokens, ids). Collected in Settings →
    /// Menubar → Custom widgets, delivered as env.
    #[serde(default)]
    pub settings: Vec<WidgetSetting>,
    /// Present = the widget answers `auth` (an OAuth/device flow it owns).
    #[serde(default)]
    pub auth: Option<WidgetAuth>,
}

/// One declared setting — mirrored by `WidgetSetting` in @launcharr/tui.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSetting {
    /// Env-var name: `[A-Z][A-Z0-9_]*`, ≤ 40 chars.
    pub key: String,
    #[serde(default)]
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// Keychain-stored, masked in the UI, never sent to a webview.
    #[serde(default)]
    pub secret: bool,
    /// Unset → the widget isn't run; the cell reads "needs setup".
    #[serde(default)]
    pub required: bool,
}

/// The widget's opt-in `auth` command — mirrored by `WidgetAuth` in @launcharr/tui.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetAuth {
    /// Button text, e.g. "Sign in with GitHub".
    #[serde(default = "default_auth_label")]
    pub label: String,
}

fn default_auth_label() -> String {
    "Sign in".into()
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
/// A device flow can wait on the user for a while.
const AUTH_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_SETTINGS: usize = 16;
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
    /// Declared settings (manifest) — what the settings UI renders.
    pub settings: Vec<WidgetSetting>,
    pub auth: Option<WidgetAuth>,
    /// Required settings currently unset; non-empty = not ticked, "needs setup".
    pub needs: Vec<String>,
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

/// Whether `id`'s manifest declares `key` as a secret setting (the only keys
/// the secret-set command will write).
pub fn declares_secret(id: &str, key: &str) -> bool {
    WIDGETS
        .lock()
        .unwrap()
        .iter()
        .find(|e| e.state.id == id)
        .is_some_and(|e| e.manifest.settings.iter().any(|s| s.secret && s.key == key))
}

/// The widget's secret keys that currently have a Keychain value.
pub fn secret_keys_present(id: &str) -> Vec<String> {
    let keys: Vec<String> = WIDGETS
        .lock()
        .unwrap()
        .iter()
        .find(|e| e.state.id == id)
        .map(|e| {
            e.manifest
                .settings
                .iter()
                .filter(|s| s.secret)
                .map(|s| s.key.clone())
                .collect()
        })
        .unwrap_or_default();
    crate::widget_secrets::present(id, &keys)
}

/// Ask for a tick now (trigger file, dir change). Unknown ids are ignored.
pub fn poke(id: &str) {
    if let Some(e) = WIDGETS
        .lock()
        .unwrap()
        .iter_mut()
        .find(|e| e.state.id == id)
    {
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
    if m.settings.len() > MAX_SETTINGS {
        return Err(format!("too many settings (max {MAX_SETTINGS})"));
    }
    let mut seen = std::collections::HashSet::new();
    for st in &mut m.settings {
        if !valid_setting_key(&st.key) {
            return Err(format!(
                "bad setting key {:?} (want [A-Z][A-Z0-9_]*)",
                st.key
            ));
        }
        if !seen.insert(st.key.clone()) {
            return Err(format!("duplicate setting key {:?}", st.key));
        }
        if st.label.is_empty() {
            st.label = st.key.clone();
        }
    }
    Ok(m)
}

/// Setting keys are env-var names: uppercase, digits, underscore; ≤ 40.
pub fn valid_setting_key(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_uppercase())
        && key.len() <= 40
        && chars.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

/// Resolve a widget's declared settings: (env to set, required keys still
/// unset). Plain values from `config.widgets[id]`, secrets from the Keychain.
/// Pure given the two lookups, so the gate is testable without a Keychain.
pub fn resolve_settings(
    id: &str,
    settings: &[WidgetSetting],
    plain: &HashMap<String, String>,
    secret: &dyn Fn(&str, &str) -> Option<String>,
) -> (Vec<(String, String)>, Vec<String>) {
    let mut env = Vec::new();
    let mut needs = Vec::new();
    for st in settings {
        let value = if st.secret {
            secret(id, &st.key)
        } else {
            plain.get(&st.key).cloned()
        }
        .filter(|v| !v.is_empty());
        match value {
            Some(v) => env.push((st.key.clone(), v)),
            None if st.required => needs.push(st.key.clone()),
            None => {}
        }
    }
    (env, needs)
}

/// The live resolution: config from AppState, secrets from the Keychain.
fn settings_for(
    app: &AppHandle,
    id: &str,
    settings: &[WidgetSetting],
) -> (Vec<(String, String)>, Vec<String>) {
    let plain = app
        .try_state::<crate::AppState>()
        .and_then(|s| {
            s.config
                .read()
                .ok()
                .and_then(|c| c.widgets.get(id).cloned())
        })
        .unwrap_or_default();
    resolve_settings(id, settings, &plain, &|id, key| {
        crate::widget_secrets::get(id, key)
    })
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

/// `<widget> <arg>` through the plugin runtime (runtime.rs): `.ts` under
/// Bun/Node, executables directly. A missing runtime is an Err like any other
/// failure — it lands on the cell as the install hint.
fn run_widget(path: &Path, arg: &str, timeout: Duration) -> Result<String, String> {
    run_widget_env(path, arg, timeout, &[])
}

/// `run_widget` with the widget's resolved settings in its environment.
fn run_widget_env(
    path: &Path,
    arg: &str,
    timeout: Duration,
    env: &[(String, String)],
) -> Result<String, String> {
    let mut cmd = crate::runtime::command_for(path)?;
    cmd.arg(arg);
    for (k, v) in env {
        cmd.env(k, v);
    }
    run(&mut cmd, timeout)
}

/// Scan the dir (`.ts`/`.js` sources and executables), run manifests, return
/// (manifest, path) sorted by id, first registration winning a duplicate id.
fn discover(dir: &Path) -> Vec<(WidgetManifest, PathBuf)> {
    let mut found = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return found;
    };
    let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    paths.sort();
    for path in paths {
        if !crate::runtime::is_plugin_file(&path) {
            continue;
        }
        match run_widget(&path, "manifest", MANIFEST_TIMEOUT).and_then(|out| parse_manifest(&out)) {
            Ok(m) => found.push((m, path)),
            Err(e) => eprintln!("[launcharr widgets] {} manifest: {e}", path.display()),
        }
    }
    found.sort_by(|a, b| a.0.id.cmp(&b.0.id));
    found.dedup_by(|a, b| a.0.id == b.0.id);
    found
}

/// Rebuild the registry from disk. Widgets whose id and path survive keep
/// their view (no blank flash on a re-scan); everything ticks again at once.
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
                    settings: manifest.settings.clone(),
                    auth: manifest.auth.clone(),
                    needs: Vec::new(),
                },
                manifest: manifest.clone(),
                path,
                next_due: Instant::now(),
                running: false,
            },
        };
        // Manifest fields may have been edited in place — and an edited widget
        // should show its new output now, not at the end of its interval.
        entry.state.name = manifest.name.clone();
        entry.state.zone = manifest.zone.clone();
        entry.state.icon = manifest.icon.clone();
        entry.state.settings = manifest.settings.clone();
        entry.state.auth = manifest.auth.clone();
        entry.manifest = manifest;
        if !entry.running {
            entry.next_due = Instant::now();
        }
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
fn tick(
    app: AppHandle,
    id: String,
    path: PathBuf,
    timeout: Duration,
    settings: Vec<WidgetSetting>,
) {
    let (env, needs) = settings_for(&app, &id, &settings);
    // Required settings unset: don't run — say what's missing instead.
    let result = if needs.is_empty() {
        Some(run_widget_env(&path, "tick", timeout, &env).and_then(|out| parse_view(&out)))
    } else {
        None
    };
    let now = now_epoch();
    {
        let mut reg = WIDGETS.lock().unwrap();
        if let Some(e) = reg.iter_mut().find(|e| e.state.id == id) {
            e.state.needs = needs;
            match result {
                Some(Ok(view)) => {
                    e.state.view = Some(view);
                    e.state.error = None;
                    e.state.last_ok = Some(now);
                }
                Some(Err(err)) => {
                    eprintln!("[launcharr widgets] {id}: {err}");
                    e.state.error = Some(err);
                }
                None => {
                    e.state.view = None;
                    e.state.error = None;
                }
            }
            e.state.updated_at = Some(now);
            e.running = false;
            e.next_due = Instant::now() + Duration::from_secs(e.manifest.interval);
        }
    }
    crate::bar::push(&app);
}

// ---- auth (the widget's own OAuth flow) ----------------------------------

/// One line of progress from `<widget> auth` — mirrored by `WidgetAuthEvent`
/// in the settings UI. Sent as the `widget-auth` event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "phase")]
pub enum AuthEvent {
    /// Show the user where to go and what to type.
    Code {
        id: String,
        url: String,
        code: String,
    },
    Message {
        id: String,
        message: String,
    },
    Done {
        id: String,
    },
    Error {
        id: String,
        error: String,
    },
}

/// What a widget may print on an `auth` line.
#[derive(Debug, Deserialize)]
struct AuthLine {
    url: Option<String>,
    code: Option<String>,
    message: Option<String>,
    settings: Option<HashMap<String, String>>,
}

/// Running auth children by widget id, so a second click (or cancel) kills
/// the first instead of racing it.
static AUTH_RUNNING: Mutex<Vec<(String, u32)>> = Mutex::new(Vec::new());

fn auth_emit(app: &AppHandle, ev: AuthEvent) {
    let _ = app.emit("widget-auth", ev);
}

/// Store what an `auth` run handed back: only keys the manifest declares as
/// secrets — an auth result is a credential by definition, and anything else
/// would need a config write the widget shouldn't get to trigger.
pub fn store_auth_settings(
    id: &str,
    declared: &[WidgetSetting],
    values: &HashMap<String, String>,
    store: &dyn Fn(&str, &str, &str) -> Result<(), String>,
) -> Result<(), String> {
    for (k, v) in values {
        match declared.iter().find(|s| &s.key == k) {
            Some(s) if s.secret => store(id, k, v)?,
            Some(_) => return Err(format!("auth may only set secret settings ({k} isn't)")),
            None => return Err(format!("auth set undeclared setting {k}")),
        }
    }
    Ok(())
}

/// Run `<widget> auth` off-thread, streaming its lines to the settings window
/// as `widget-auth` events; on exit 0 the widget is ticked. Kills any auth
/// already running for the same id.
pub fn auth(app: AppHandle, id: String) -> Result<(), String> {
    let (path, settings) = WIDGETS
        .lock()
        .unwrap()
        .iter()
        .find(|e| e.state.id == id)
        .map(|e| (e.path.clone(), e.manifest.settings.clone()))
        .ok_or_else(|| format!("no widget {id}"))?;
    auth_cancel(&id);
    std::thread::spawn(move || {
        let outcome = run_auth(&app, &id, &path, &settings);
        AUTH_RUNNING.lock().unwrap().retain(|(i, _)| i != &id);
        match outcome {
            Ok(()) => {
                auth_emit(&app, AuthEvent::Done { id: id.clone() });
                poke(&id);
            }
            Err(error) => {
                eprintln!("[launcharr widgets] {id} auth: {error}");
                auth_emit(
                    &app,
                    AuthEvent::Error {
                        id: id.clone(),
                        error,
                    },
                );
            }
        }
    });
    Ok(())
}

/// Stop a running auth for `id`, if any (the child gets SIGTERM via `kill`;
/// a stale pid is harmless).
pub fn auth_cancel(id: &str) {
    let mut running = AUTH_RUNNING.lock().unwrap();
    if let Some(pos) = running.iter().position(|(i, _)| i == id) {
        let (_, pid) = running.remove(pos);
        let _ = Command::new("kill").arg(pid.to_string()).status();
    }
}

fn run_auth(
    app: &AppHandle,
    id: &str,
    path: &Path,
    settings: &[WidgetSetting],
) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    let (env, _) = settings_for(app, id, settings);
    let mut cmd = crate::runtime::command_for(path)?;
    cmd.arg("auth");
    for (k, v) in &env {
        cmd.env(k, v);
    }
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))?;
    AUTH_RUNNING
        .lock()
        .unwrap()
        .push((id.to_string(), child.id()));
    let err_h = drain(child.stderr.take());
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let started = Instant::now();
    let mut stored = false;
    // Lines arrive on a channel so the timeout poll can't be wedged by a
    // silent child.
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if tx.send(line).is_err() {
                break;
            }
        }
    });
    loop {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(line) => {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let parsed: AuthLine = match serde_json::from_str(line) {
                    Ok(p) => p,
                    Err(_) => {
                        auth_emit(
                            app,
                            AuthEvent::Message {
                                id: id.to_string(),
                                message: line.to_string(),
                            },
                        );
                        continue;
                    }
                };
                if let (Some(url), Some(code)) = (parsed.url, parsed.code) {
                    auth_emit(
                        app,
                        AuthEvent::Code {
                            id: id.to_string(),
                            url,
                            code,
                        },
                    );
                }
                if let Some(message) = parsed.message {
                    auth_emit(
                        app,
                        AuthEvent::Message {
                            id: id.to_string(),
                            message,
                        },
                    );
                }
                if let Some(values) = parsed.settings {
                    store_auth_settings(id, settings, &values, &|i, k, v| {
                        crate::widget_secrets::set(i, k, v)
                    })?;
                    stored = true;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
        if started.elapsed() > AUTH_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("timed out waiting for sign-in".into());
        }
    }
    let status = child.wait().map_err(|e| format!("wait failed: {e}"))?;
    let stderr = err_h.join().unwrap_or_default();
    if !status.success() {
        let tail = stderr.trim();
        let tail = if tail.len() > STDERR_TAIL {
            &tail[tail.len() - STDERR_TAIL..]
        } else {
            tail
        };
        return Err(if tail.is_empty() {
            "sign-in failed".into()
        } else {
            tail.to_string()
        });
    }
    if !stored {
        return Err("sign-in finished without returning settings".into());
    }
    Ok(())
}

// ---- install / remove (Settings → Menubar → Custom widgets) --------------

/// Where a new widget comes from. `File` carries the bytes the settings
/// webview read from a picked file (no dialog plugin, no path access); `Url`
/// is a user-initiated download — the same carve-out as the favicon fetch
/// (DECISIONS 2026-08-09): one request, on click, never in the background.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum WidgetSource {
    File { name: String, content: String },
    Url { url: String },
}

/// 1 MiB is plenty for a script; anything bigger isn't a widget.
const INSTALL_LIMIT: u64 = 1024 * 1024;

/// A file name for the widgets dir: the basename only, no separators or
/// hidden files, so a URL or picked file can't write outside the dir.
fn safe_file_name(name: &str) -> Result<String, String> {
    let name = name
        .trim()
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .to_string();
    if name.is_empty() || name.starts_with('.') || name.contains("..") {
        return Err(format!("bad widget file name {name:?}"));
    }
    Ok(name)
}

/// Fetch a widget's source over HTTPS. Only http(s) URLs; size-capped.
fn download(url: &str) -> Result<(String, Vec<u8>), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("only http(s) URLs".into());
    }
    let name = safe_file_name(url.split(['?', '#']).next().unwrap_or(url))?;
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .user_agent("launcharr-widgets/0.1")
        .build();
    let response = agent
        .get(url)
        .call()
        .map_err(|e| format!("download failed: {e}"))?;
    let mut buf = Vec::new();
    response
        .into_reader()
        .take(INSTALL_LIMIT)
        .read_to_end(&mut buf)
        .map_err(|e| format!("download failed: {e}"))?;
    if buf.is_empty() {
        return Err("download was empty".into());
    }
    Ok((name, buf))
}

/// Write a candidate into the widgets dir, make it executable, and prove it
/// answers `manifest` before keeping it — a file that isn't a widget is
/// removed again with the reason. Returns the widget id. The dir watcher
/// picks the new file up and ticks it; nothing else to do.
pub fn install(source: WidgetSource) -> Result<String, String> {
    let (name, bytes) = match source {
        WidgetSource::File { name, content } => (safe_file_name(&name)?, content.into_bytes()),
        WidgetSource::Url { url } => download(&url)?,
    };
    let dir = widgets_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(&name);
    if dest.exists() {
        return Err(format!("{name} already exists — remove it first"));
    }
    fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    let _ = fs::set_permissions(&dest, fs::Permissions::from_mode(0o755));
    match run_widget(&dest, "manifest", MANIFEST_TIMEOUT).and_then(|o| parse_manifest(&o)) {
        Ok(m) => Ok(m.id),
        Err(e) => {
            let _ = fs::remove_file(&dest);
            Err(format!("not a widget ({e})"))
        }
    }
}

/// Delete a widget's file by id. Only files inside the widgets dir that the
/// registry knows about — never an arbitrary path. The watcher drops the cell.
pub fn remove(id: &str) -> Result<(), String> {
    let path = WIDGETS
        .lock()
        .unwrap()
        .iter()
        .find(|e| e.state.id == id)
        .map(|e| e.path.clone())
        .ok_or_else(|| format!("no widget {id}"))?;
    if path.parent() != Some(widgets_dir().as_path()) {
        return Err(format!("{} is outside the widgets dir", path.display()));
    }
    fs::remove_file(&path).map_err(|e| e.to_string())
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
        let due: Vec<(String, PathBuf, Duration, Vec<WidgetSetting>)> = {
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
                        e.manifest.settings.clone(),
                    )
                })
                .collect()
        };
        for (id, path, timeout, settings) in due {
            let app = app.clone();
            std::thread::spawn(move || tick(app, id, path, timeout, settings));
        }
        std::thread::sleep(Duration::from_secs(1));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_settings_parse_and_validate() {
        let m = parse_manifest(
            r#"{"id":"x","settings":[{"key":"TOKEN","secret":true,"required":true},{"key":"REPOS","label":"Repos"}],"auth":{"label":"Sign in"}}"#,
        )
        .unwrap();
        assert_eq!(m.settings.len(), 2);
        assert_eq!(m.settings[0].label, "TOKEN"); // label defaults to key
        assert!(m.settings[0].secret && m.settings[0].required);
        assert_eq!(m.auth.as_ref().unwrap().label, "Sign in");
        assert!(parse_manifest(r#"{"id":"x","settings":[{"key":"lower"}]}"#).is_err());
        assert!(parse_manifest(r#"{"id":"x","settings":[{"key":"A"},{"key":"A"}]}"#).is_err());
        assert!(parse_manifest(r#"{"id":"x","auth":{}}"#)
            .unwrap()
            .auth
            .is_some());
    }

    #[test]
    fn setting_keys_are_env_names() {
        assert!(valid_setting_key("GITHUB_TOKEN"));
        assert!(valid_setting_key("A1"));
        assert!(!valid_setting_key(""));
        assert!(!valid_setting_key("1A"));
        assert!(!valid_setting_key("a"));
        assert!(!valid_setting_key("A-B"));
        assert!(!valid_setting_key(&"A".repeat(41)));
    }

    fn st(key: &str, secret: bool, required: bool) -> WidgetSetting {
        WidgetSetting {
            key: key.into(),
            label: key.into(),
            hint: None,
            secret,
            required,
        }
    }

    #[test]
    fn resolve_settings_gates_on_required() {
        let settings = vec![
            st("TOKEN", true, true),
            st("TEAM", false, false),
            st("ORG", false, true),
        ];
        let plain: HashMap<String, String> = [("TEAM".to_string(), "t1".to_string())].into();
        let none = |_: &str, _: &str| None;
        let (env, needs) = resolve_settings("w", &settings, &plain, &none);
        assert_eq!(env, vec![("TEAM".to_string(), "t1".to_string())]);
        assert_eq!(needs, vec!["TOKEN".to_string(), "ORG".to_string()]);
        let some =
            |id: &str, key: &str| (id == "w" && key == "TOKEN").then(|| "s3cret".to_string());
        let plain: HashMap<String, String> =
            [("TEAM".into(), "".into()), ("ORG".into(), "acme".into())].into();
        let (env, needs) = resolve_settings("w", &settings, &plain, &some);
        assert_eq!(
            env,
            vec![
                ("TOKEN".to_string(), "s3cret".to_string()),
                ("ORG".to_string(), "acme".to_string())
            ]
        );
        assert!(needs.is_empty());
    }

    #[test]
    fn auth_results_only_land_on_declared_secrets() {
        let settings = vec![st("TOKEN", true, true), st("CLIENT_ID", false, true)];
        let stored = std::sync::Mutex::new(Vec::new());
        let store = |i: &str, k: &str, v: &str| {
            stored.lock().unwrap().push(format!("{i}/{k}={v}"));
            Ok(())
        };
        let ok: HashMap<String, String> = [("TOKEN".into(), "abc".into())].into();
        store_auth_settings("gh", &settings, &ok, &store).unwrap();
        assert_eq!(stored.lock().unwrap().as_slice(), ["gh/TOKEN=abc"]);
        let plain: HashMap<String, String> = [("CLIENT_ID".into(), "x".into())].into();
        assert!(store_auth_settings("gh", &settings, &plain, &store).is_err());
        let undeclared: HashMap<String, String> = [("OTHER".into(), "x".into())].into();
        assert!(store_auth_settings("gh", &settings, &undeclared, &store).is_err());
        assert_eq!(stored.lock().unwrap().len(), 1);
    }

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
        let ok = run(
            Command::new("sh").arg("-c").arg("echo hi"),
            Duration::from_secs(2),
        )
        .unwrap();
        assert_eq!(ok.trim(), "hi");
    }

    #[test]
    fn install_names_are_basenames_only() {
        assert_eq!(
            safe_file_name("https://x.dev/w/uptime.py").unwrap(),
            "uptime.py"
        );
        assert_eq!(safe_file_name("  vercel.py ").unwrap(), "vercel.py");
        // Any path collapses to its basename — nothing escapes the dir.
        assert_eq!(safe_file_name("../evil").unwrap(), "evil");
        assert!(safe_file_name("..").is_err());
        assert!(safe_file_name(".hidden").is_err());
        assert!(safe_file_name("dir/").is_err());
        assert!(download("ftp://x/y").is_err());
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
        fs::write(
            &dup,
            "#!/bin/sh\necho '{\"id\":\"good\",\"interval\":99}'\n",
        )
        .unwrap();
        fs::set_permissions(&dup, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(dir.join("a-notes.txt"), "not a widget").unwrap();
        let bad = dir.join("d-bad");
        fs::write(&bad, "#!/bin/sh\necho 'nope'\n").unwrap();
        fs::set_permissions(&bad, fs::Permissions::from_mode(0o755)).unwrap();

        // A TypeScript widget needs no chmod — the runtime runs it (when
        // a runtime is present; without one it is skipped with a log line).
        let ts = dir.join("e-ts.ts");
        fs::write(
            &ts,
            "if (process.argv[2] === 'manifest') console.log(JSON.stringify({ id: 'tsw' }))\n",
        )
        .unwrap();

        let found = discover(&dir);
        let ids: Vec<&str> = found.iter().map(|(m, _)| m.id.as_str()).collect();
        assert!(ids.contains(&"good"), "{ids:?}");
        let good_entry = found.iter().find(|(m, _)| m.id == "good").unwrap();
        assert_eq!(good_entry.0.interval, 30);
        assert_eq!(good_entry.1, good);
        if crate::runtime::js_runtime().is_some() {
            assert!(ids.contains(&"tsw"), "{ids:?}");
        }
        assert!(!ids.contains(&"nope"));
        let _ = fs::remove_dir_all(&dir);
    }
}
