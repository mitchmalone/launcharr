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
        ItemKind::App | ItemKind::Settings => {
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
