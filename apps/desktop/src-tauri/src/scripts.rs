use std::{
    fs,
    io::Read,
    os::unix::fs::PermissionsExt,
    path::PathBuf,
    process::{Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{CmdError, CmdResult};

/// The script protocol (v2 pulled forward — see docs/SCRIPTS.md):
/// - executables in `~/.config/launcharr/scripts/`
/// - `<script> manifest` → `{"trigger": "...", "name": "...", "description": "..."}`
/// - `<script> query <args>` → `{"items": [{"title", "subtitle"?, "action"?}]}`
/// - actions: `{"type": "copy", "value": ...}` | `{"type": "open", "value": ...}` |
///   `{"type": "none"}`

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptInfo {
    pub trigger: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(skip_deserializing)]
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "value")]
pub enum ScriptAction {
    Copy(String),
    Open(String),
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptItem {
    pub title: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default = "default_action")]
    pub action: ScriptAction,
    /// Optional ⌥⏎ action.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alt_action: Option<ScriptAction>,
}

fn default_action() -> ScriptAction {
    ScriptAction::None
}

#[derive(Deserialize)]
struct QueryResponse {
    items: Vec<ScriptItem>,
}

pub fn scripts_dir() -> PathBuf {
    crate::config::config_dir().join("scripts")
}

const MANIFEST_TIMEOUT: Duration = Duration::from_millis(1500);
const QUERY_TIMEOUT: Duration = Duration::from_secs(3);

/// Run a child with a hard timeout, returning stdout. Scripts are user-owned local code;
/// the timeout guards against a hung script freezing the panel, nothing more.
fn run_with_timeout(cmd: &mut Command, timeout: Duration) -> Option<String> {
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .spawn()
        .ok()?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let mut out = String::new();
                child.stdout.take()?.read_to_string(&mut out).ok()?;
                return Some(out);
            }
            Ok(None) if started.elapsed() > timeout => {
                let _ = child.kill();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(15)),
            Err(_) => return None,
        }
    }
}

/// Scan the scripts dir for executables and collect their manifests.
pub fn discover() -> Vec<ScriptInfo> {
    let mut scripts = Vec::new();
    let Ok(entries) = fs::read_dir(scripts_dir()) else {
        return scripts;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_executable_file = path.is_file()
            && fs::metadata(&path)
                .map(|m| m.permissions().mode() & 0o111 != 0)
                .unwrap_or(false);
        if !is_executable_file {
            continue;
        }
        let Some(out) = run_with_timeout(Command::new(&path).arg("manifest"), MANIFEST_TIMEOUT)
        else {
            continue;
        };
        if let Ok(mut info) = serde_json::from_str::<ScriptInfo>(&out) {
            if info.trigger.is_empty() || info.trigger.contains(char::is_whitespace) {
                continue;
            }
            info.path = path.to_string_lossy().into_owned();
            scripts.push(info);
        }
    }
    scripts.sort_by(|a, b| a.trigger.cmp(&b.trigger));
    scripts.dedup_by(|a, b| a.trigger == b.trigger);
    scripts
}

/// Query a script by trigger. Called per (debounced) keystroke in script mode.
pub fn query(app: &AppHandle, trigger: &str, args: &str) -> CmdResult<Vec<ScriptItem>> {
    let path = {
        let state = app.state::<crate::AppState>();
        let scripts = state.scripts.read().unwrap();
        scripts
            .iter()
            .find(|s| s.trigger == trigger)
            .map(|s| s.path.clone())
            .ok_or_else(|| CmdError::NotFound(format!("script {trigger}")))?
    };
    let out = run_with_timeout(Command::new(&path).arg("query").arg(args), QUERY_TIMEOUT)
        .ok_or_else(|| CmdError::Internal(format!("script {trigger} failed or timed out")))?;
    let parsed: QueryResponse = serde_json::from_str(&out)
        .map_err(|e| CmdError::Internal(format!("script {trigger} bad output: {e}")))?;
    Ok(parsed.items)
}

/// Refresh the manifest cache and tell the frontend.
pub fn refresh(app: &AppHandle) {
    let scripts = discover();
    let state = app.state::<crate::AppState>();
    *state.scripts.write().unwrap() = scripts;
    let _ = app.emit("scripts-updated", ());
}

/// Bundled reference scripts: installed on startup if absent, never overwritten — they're
/// the user's to edit (that's the point).
// `lorem.py` left the bundle 2026-08-17: `lorem` is a built-in now (five volumes,
// semi-random) and built-ins win the trigger, so the script would only shadow itself.
const BUNDLED: &[(&str, &str)] = &[
    // NB: not "json.py" — a script named after a python stdlib module shadows it for every
    // script in the dir (the test suite caught exactly that).
    ("json-format.py", include_str!("../scripts/json-format.py")),
    ("ip.py", include_str!("../scripts/ip.py")),
];

pub fn install_bundled() {
    let dir = scripts_dir();
    let _ = fs::create_dir_all(&dir);
    for (name, body) in BUNDLED {
        let dest = dir.join(name);
        if dest.exists() {
            continue;
        }
        if fs::write(&dest, body).is_ok() {
            let _ = fs::set_permissions(&dest, fs::Permissions::from_mode(0o755));
        }
    }
}

/// Initial discovery plus an FSEvents watch so dropping in a script needs no restart.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        install_bundled();
        refresh(&app);

        use notify::{RecursiveMode, Watcher};
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[launcharr] scripts watcher failed: {e}");
                return;
            }
        };
        if watcher
            .watch(&scripts_dir(), RecursiveMode::NonRecursive)
            .is_err()
        {
            return;
        }
        loop {
            if rx.recv().is_err() {
                return;
            }
            while rx.recv_timeout(Duration::from_millis(400)).is_ok() {}
            refresh(&app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_item_parses_with_defaults() {
        let item: ScriptItem = serde_json::from_str(r#"{"title": "hi"}"#).unwrap();
        assert_eq!(item.title, "hi");
        assert_eq!(item.subtitle, "");
        assert!(matches!(item.action, ScriptAction::None));
    }

    #[test]
    fn script_action_tagging_matches_the_documented_contract() {
        let copy: ScriptAction =
            serde_json::from_str(r#"{"type": "copy", "value": "text"}"#).unwrap();
        assert!(matches!(copy, ScriptAction::Copy(ref v) if v == "text"));
        let open: ScriptAction =
            serde_json::from_str(r#"{"type": "open", "value": "https://x.dev"}"#).unwrap();
        assert!(matches!(open, ScriptAction::Open(_)));
    }

    #[test]
    fn bundled_scripts_have_valid_python_and_manifests() {
        // The bundled sources must at least be syntactically valid python3.
        for (name, body) in BUNDLED {
            let dir = std::env::temp_dir().join("launcharr-script-test");
            let _ = fs::create_dir_all(&dir);
            let p = dir.join(name);
            fs::write(&p, body).unwrap();
            let ok = Command::new("python3")
                .arg("-m")
                .arg("py_compile")
                .arg(&p)
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            assert!(ok, "{name} failed py_compile");
            // And their manifests must parse per the contract.
            let _ = fs::set_permissions(&p, fs::Permissions::from_mode(0o755));
            let out = run_with_timeout(Command::new(&p).arg("manifest"), MANIFEST_TIMEOUT)
                .unwrap_or_else(|| panic!("{name} manifest failed"));
            let info: ScriptInfo = serde_json::from_str(&out).unwrap();
            assert!(!info.trigger.is_empty());
        }
    }

    #[test]
    fn run_with_timeout_kills_hung_children() {
        let started = Instant::now();
        let out = run_with_timeout(Command::new("sleep").arg("10"), Duration::from_millis(200));
        assert!(out.is_none());
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
