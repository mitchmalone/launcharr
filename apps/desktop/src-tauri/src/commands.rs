use std::collections::HashMap;
use std::process::Command;

use tauri::{AppHandle, State};

use crate::{
    config::Config,
    error::{CmdError, CmdResult},
    frecency,
    indexer::{IndexItem, ItemKind},
    panel, terminal, AppState,
};

#[tauri::command]
pub fn get_index(state: State<'_, AppState>) -> Vec<IndexItem> {
    state.index.read().unwrap().clone()
}

#[tauri::command]
pub fn get_frecency(state: State<'_, AppState>) -> CmdResult<HashMap<String, f64>> {
    let db = state.db.lock().unwrap();
    frecency::scores(&db, frecency::now_secs())
}

#[tauri::command]
pub fn read_config(state: State<'_, AppState>) -> Config {
    state.config.read().unwrap().clone()
}

#[tauri::command]
pub fn hide_panel(app: AppHandle) {
    panel::hide(&app);
}

/// One poll of everything the bar renders (v0.5 spike; DECISIONS 2026-08-15).
/// async: spawns subprocesses — MUST stay off the main thread or every spawn
/// janks the whole app (found 2026-08-16: sync polling made clicks take
/// seconds and backed up the aerospace server).
#[tauri::command]
pub async fn bar_snapshot() -> crate::bar::BarSnapshot {
    crate::bar::snapshot()
}

/// Agents panel: the monitored sessions (DECISIONS 2026-08-16). Sync — reads
/// an in-memory store, no subprocess.
#[tauri::command]
pub fn agents_status() -> Vec<crate::agents::AgentSession> {
    crate::agents::list()
}

/// Jump to an agent session's tmux pane and bring the terminal frontmost;
/// visiting marks a `done` session read. async: spawns tmux and `open`.
#[tauri::command]
pub async fn agent_jump(
    session: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CmdResult<()> {
    let terminal = state.config.read().unwrap().terminal;
    crate::agents::jump_session(&app, &session, terminal)
}

/// Wifi panel (P0). All async — they spawn subprocesses.
#[tauri::command]
pub async fn wifi_status() -> crate::wifi::WifiStatus {
    crate::wifi::status()
}

#[tauri::command]
pub async fn wifi_known_networks() -> Vec<String> {
    crate::wifi::known_networks()
}

#[tauri::command]
pub async fn wifi_connect(ssid: String) -> CmdResult<()> {
    crate::wifi::connect(&ssid)
}

#[tauri::command]
pub async fn wifi_set_power(on: bool) -> CmdResult<()> {
    crate::wifi::set_power(on)
}

/// Bar workspace cell click → focus that aerospace workspace. async: see above.
#[tauri::command]
pub async fn bar_switch_workspace(ws: String) -> CmdResult<()> {
    crate::bar::switch_workspace(&ws)
}

#[tauri::command]
pub fn resize_panel(app: AppHandle, height: f64) -> CmdResult<()> {
    panel::resize(&app, height)
}

#[tauri::command]
pub fn reindex(app: AppHandle) {
    crate::indexer::refresh(&app);
}

/// Enter on a result: dismiss immediately, record the launch, open the thing.
#[tauri::command]
pub fn execute(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    query: String,
) -> CmdResult<()> {
    let item = {
        let index = state.index.read().unwrap();
        index
            .iter()
            .find(|i| i.id == id)
            .cloned()
            .ok_or(CmdError::NotFound(id.clone()))?
    };

    // Dismiss first: the <50ms Enter budget is about perceived latency.
    panel::hide(&app);

    if item.id != "launcharr:quit" {
        let db = state.db.lock().unwrap();
        frecency::record(&db, &item.id, &query, frecency::now_secs())?;
    }

    match item.kind {
        ItemKind::Link if item.browser.is_some() => {
            // infallible: guarded by the match arm
            let browser = item.browser.as_deref().unwrap();
            Command::new("open")
                .arg("-a")
                .arg(browser)
                .arg(&item.path)
                .spawn()?;
        }
        ItemKind::App | ItemKind::Settings | ItemKind::Link => {
            // `open` handles both bundle paths and x-apple.systempreferences: deep links,
            // with standard NSWorkspace activation (already-running apps come to front).
            Command::new("open").arg(&item.path).spawn()?;
        }
        ItemKind::Command => {
            crate::system_commands::run(item.id.trim_start_matches("cmd:"))?;
        }
        ItemKind::Launcharr => match item.id.as_str() {
            "launcharr:quit" => app.exit(0),
            "launcharr:settings" => crate::settings_window::open(&app)?,
            "launcharr:reindex" => crate::indexer::refresh(&app),
            "launcharr:config" => {
                Command::new("open")
                    .arg(crate::config::config_path())
                    .spawn()?;
            }
            other => return Err(CmdError::NotFound(other.to_string())),
        },
    }
    Ok(())
}

/// Bang mode Enter: dismiss, hand the command to the terminal verbatim.
#[tauri::command]
pub fn run_bang(app: AppHandle, state: State<'_, AppState>, command: String) -> CmdResult<()> {
    let config = state.config.read().unwrap().clone();
    panel::hide(&app);
    terminal::run(config.terminal, &command, config.bang_new_window)
}

/// Launch an indexed item by display name — the custom-shortcut path. Exact
/// case-insensitive match first, then prefix.
pub fn launch_by_name(app: &AppHandle, name: &str) -> CmdResult<()> {
    use tauri::Manager;
    let state = app.state::<AppState>();
    let needle = name.to_lowercase();
    let item = {
        let index = state.index.read().unwrap();
        index
            .iter()
            .find(|i| i.name.to_lowercase() == needle)
            .or_else(|| {
                index
                    .iter()
                    .find(|i| i.name.to_lowercase().starts_with(&needle))
            })
            .cloned()
            .ok_or_else(|| CmdError::NotFound(name.to_string()))?
    };
    Command::new("open").arg(&item.path).spawn()?;
    Ok(())
}

#[tauri::command]
pub fn get_scripts(state: State<'_, AppState>) -> Vec<crate::scripts::ScriptInfo> {
    state.scripts.read().unwrap().clone()
}

#[tauri::command]
pub fn run_script(
    app: AppHandle,
    trigger: String,
    args: String,
) -> CmdResult<Vec<crate::scripts::ScriptItem>> {
    crate::scripts::query(&app, &trigger, &args)
}

/// Enter on a script result row: dismiss, perform the item's declared action.
#[tauri::command]
pub fn script_action(app: AppHandle, action: crate::scripts::ScriptAction) -> CmdResult<()> {
    use crate::scripts::ScriptAction;
    panel::hide(&app);
    match action {
        ScriptAction::Copy(text) => crate::clipboard::set_string(&text),
        ScriptAction::Open(target) => {
            Command::new("open").arg(&target).spawn()?;
        }
        ScriptAction::None => {}
    }
    Ok(())
}

#[tauri::command]
pub fn get_clips(state: State<'_, AppState>) -> CmdResult<Vec<crate::clipboard::Clip>> {
    let db = state.db.lock().unwrap();
    crate::clipboard::history(&db)
}

/// Enter on a clip: dismiss and put it back on the pasteboard (you ⌘V yourself — the
/// no-Accessibility deal).
#[tauri::command]
pub fn copy_clip(app: AppHandle, state: State<'_, AppState>, content: String) -> CmdResult<()> {
    panel::hide(&app);
    crate::clipboard::set_string(&content);
    // Bump it to the top of history immediately rather than waiting for the poller.
    let db = state.db.lock().unwrap();
    crate::clipboard::record(&db, &content, crate::frecency::now_secs())
}

#[tauri::command]
pub fn clear_clips(state: State<'_, AppState>) -> CmdResult<()> {
    let db = state.db.lock().unwrap();
    crate::clipboard::clear(&db)
}

/// Inline-math Enter: dismiss and copy the result.
#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> CmdResult<()> {
    panel::hide(&app);
    crate::clipboard::set_string(&text);
    Ok(())
}

/// Save a new quicklink to config.json (the watcher picks it up and reindexes), then fetch
/// its favicon — the single user-initiated network touchpoint (DECISIONS 2026-08-09).
#[tauri::command]
pub fn add_quicklink(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    url: String,
    browser: Option<String>,
) -> CmdResult<()> {
    if name.trim().is_empty() {
        return Err(CmdError::Internal("quicklink needs a name".into()));
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(CmdError::Internal(format!("refusing non-http url: {url}")));
    }
    panel::hide(&app);

    let path = crate::config::config_path();
    let raw = std::fs::read_to_string(&path)?;
    let mut cfg: crate::config::Config = serde_json::from_str(&raw).unwrap_or_default();
    cfg.links.push(crate::config::Link {
        name: name.trim().to_string(),
        url: url.clone(),
        trigger: None,
        browser: browser.filter(|b| !b.trim().is_empty()),
    });
    std::fs::write(&path, serde_json::to_string_pretty(&cfg).unwrap())?;

    // Favicon in the background; when it lands, re-annotate so the row gets its icon.
    let icon_dir = state.icon_dir.clone();
    let handle = app.clone();
    std::thread::spawn(move || {
        if crate::favicon::fetch(&url, &icon_dir).is_some() {
            crate::indexer::refresh(&handle);
        }
    });
    Ok(())
}

/// Settings window save: validate by type, write pretty JSON; the watcher hot-applies.
#[tauri::command]
pub fn write_config(config: Config) -> CmdResult<()> {
    let path = crate::config::config_path();
    std::fs::create_dir_all(crate::config::config_dir())?;
    std::fs::write(&path, serde_json::to_string_pretty(&config).unwrap())?;
    Ok(())
}

/// Open launcharr's editable surfaces from settings: the config file (default editor) or
/// the scripts folder (Finder). Validated enum — never an arbitrary path across IPC.
#[tauri::command]
pub fn open_path(target: String) -> CmdResult<()> {
    let path = match target.as_str() {
        "config" => crate::config::config_path(),
        "scripts" => {
            let dir = crate::scripts::scripts_dir();
            std::fs::create_dir_all(&dir)?;
            dir
        }
        other => return Err(CmdError::Internal(format!("unknown open target: {other}"))),
    };
    std::process::Command::new("open").arg(path).spawn()?;
    Ok(())
}

/// Open (or focus) the settings window.
#[tauri::command]
pub fn open_settings(app: AppHandle) -> CmdResult<()> {
    crate::settings_window::open(&app)
}

/// ⌥⏎ on an app: dismiss and reveal the bundle in Finder.
#[tauri::command]
pub fn reveal_item(app: AppHandle, path: String) -> CmdResult<()> {
    panel::hide(&app);
    Command::new("open").arg("-R").arg(&path).spawn()?;
    Ok(())
}

/// ⌥⏎ on a clip: delete it from history. Deliberately does NOT dismiss — list grooming.
#[tauri::command]
pub fn delete_clip(state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    let db = state.db.lock().unwrap();
    crate::clipboard::delete(&db, id)
}

/// URL/quicklink/search Enter: dismiss and hand the URL to the default browser. Only real
/// URLs — this is not a general `open` proxy.
#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> CmdResult<()> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(CmdError::Internal(format!("refusing non-http url: {url}")));
    }
    panel::hide(&app);
    Command::new("open").arg(&url).spawn()?;
    Ok(())
}
