// tauri-nspanel's event macro grammar requires an explicit `-> ()`; the lint can't be
// scoped to the macro invocation, so it's allowed crate-wide.
#![allow(clippy::unused_unit)]

use std::{
    path::PathBuf,
    sync::{Mutex, RwLock},
};

use rusqlite::Connection;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

mod commands;
mod config;
mod error;
mod frecency;
mod icons;
mod indexer;
mod panel;
mod settings_panes;
mod shortcut;
mod terminal;

/// `--extract-icons <dir>` child-process entry (see icons.rs for why this exists).
pub fn extract_icons_cli(icon_dir: &std::path::Path) {
    icons::extract_cli(icon_dir);
}

pub struct AppState {
    pub config: RwLock<config::Config>,
    pub index: RwLock<Vec<indexer::IndexItem>>,
    pub db: Mutex<Connection>,
    pub icon_dir: PathBuf,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_nspanel::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // Only one shortcut is ever registered: the summon hotkey.
                    if event.state() == ShortcutState::Pressed {
                        panel::toggle(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_index,
            commands::get_frecency,
            commands::read_config,
            commands::hide_panel,
            commands::resize_panel,
            commands::reindex,
            commands::execute,
            commands::run_bang,
        ])
        .setup(|app| {
            // No Dock icon, no menu bar: launcharr is an accessory (PRD §6.2).
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let cfg = config::load_or_create()?;

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = frecency::open(&data_dir.join("launcharr.db"))?;

            app.manage(AppState {
                config: RwLock::new(cfg.clone()),
                index: RwLock::new(Vec::new()),
                db: Mutex::new(db),
                icon_dir: data_dir.join("icons"),
            });

            panel::init(app.handle())?;
            shortcut::register(app.handle(), &cfg.hotkey);
            indexer::start(app.handle().clone());
            config::watch(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running launcharr");
}
