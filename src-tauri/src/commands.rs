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
        ItemKind::App | ItemKind::Settings | ItemKind::Link => {
            // `open` handles both bundle paths and x-apple.systempreferences: deep links,
            // with standard NSWorkspace activation (already-running apps come to front).
            Command::new("open").arg(&item.path).spawn()?;
        }
        ItemKind::Launcharr => match item.id.as_str() {
            "launcharr:quit" => app.exit(0),
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
