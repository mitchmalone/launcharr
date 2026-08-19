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

mod agents;
mod ask;
mod audio;
mod bar;
mod bar_constrain;
mod bar_modules;
mod battery;
mod bookmarks;
mod clipboard;
mod colorpicker;
mod commands;
mod config;
mod coreaudio;
mod corewlan;
mod deps;
mod desktop;
mod error;
mod favicon;
mod frecency;
mod herdr;
mod icons;
mod indexer;
mod logbook;
mod loupe;
mod panel;
mod power;
mod screens;
mod screenshots;
mod scripts;
mod settings_panes;
mod settings_window;
mod shortcut;
mod sysread;
mod system_commands;
mod terminal;
mod tray;
mod usage;
mod widgets;
mod wifi;

/// `--extract-icons <dir>` child-process entry (see icons.rs for why this exists).
pub fn extract_icons_cli(icon_dir: &std::path::Path) {
    icons::extract_cli(icon_dir);
}

/// Sync the login-item registration with config. Failure is logged, never fatal — a broken
/// LaunchAgent must not stop the launcher from launching things.
pub(crate) fn apply_launch_at_login(app: &tauri::AppHandle, enabled: bool) {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch = app.autolaunch();
    let result = if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    if let Err(e) = result {
        eprintln!("[launcharr] launch-at-login ({enabled}) failed: {e}");
    }
}

pub struct AppState {
    pub config: RwLock<config::Config>,
    pub index: RwLock<Vec<indexer::IndexItem>>,
    pub db: Mutex<Connection>,
    pub icon_dir: PathBuf,
    pub thumb_dir: PathBuf,
    pub scripts: RwLock<Vec<scripts::ScriptInfo>>,
    pub summon: RwLock<tauri_plugin_global_shortcut::Shortcut>,
    pub custom_shortcuts: RwLock<Vec<shortcut::CustomShortcut>>,
}

pub fn run() {
    let boot = std::time::Instant::now();
    tauri::Builder::default()
        .plugin(tauri_nspanel::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, pressed, event| {
                    if event.state() == ShortcutState::Pressed {
                        shortcut::handle(app, pressed);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_index,
            commands::get_frecency,
            commands::read_config,
            commands::open_path,
            commands::hide_panel,
            commands::bar_snapshot,
            commands::bar_switch_workspace,
            commands::bar_set_dropdown,
            commands::bar_battery_detail,
            commands::agents_status,
            commands::awake_arm,
            commands::awake_release,
            commands::awake_status,
            commands::awake_readings,
            commands::usage_status,
            ask::ask,
            commands::agent_jump,
            commands::agent_forget,
            commands::desktop_status,
            commands::desktop_apply,
            commands::desktop_adopt,
            commands::desktop_toml,
            commands::desktop_install,
            commands::desktop_corner_radius,
            commands::aerospace_workspaces,
            commands::aerospace_action,
            commands::wifi_status,
            commands::wifi_known_networks,
            commands::wifi_connect,
            commands::wifi_set_power,
            commands::wifi_scan,
            commands::audio_status,
            commands::audio_set_volume,
            commands::audio_set_muted,
            commands::audio_set_default,
            commands::resize_panel,
            commands::reindex,
            commands::execute,
            commands::run_bang,
            commands::get_scripts,
            commands::run_script,
            commands::script_action,
            commands::get_clips,
            commands::copy_clip,
            commands::clear_clips,
            commands::copy_text,
            commands::loupe_capture,
            commands::loupe_done,
            commands::open_url,
            commands::add_quicklink,
            commands::reveal_item,
            commands::delete_clip,
            commands::write_config,
            commands::open_settings,
            commands::list_screenshots,
            commands::screenshot_thumb,
            commands::screenshot_action,
        ])
        .setup(move |app| {
            // No Dock icon, no menu bar: launcharr is an accessory (PRD §6.2).
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let (cfg, first_run) = config::load_or_create()?;

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = frecency::open(&data_dir.join("launcharr.db"))?;
            clipboard::init_table(&db)?;

            app.manage(AppState {
                config: RwLock::new(cfg.clone()),
                index: RwLock::new(Vec::new()),
                db: Mutex::new(db),
                icon_dir: data_dir.join("icons"),
                thumb_dir: data_dir.join("thumbs"),
                scripts: RwLock::new(Vec::new()),
                summon: RwLock::new("Alt+Space".parse().expect("default hotkey parses")),
                custom_shortcuts: RwLock::new(Vec::new()),
            });

            panel::init(app.handle())?;
            if cfg.bar.enabled {
                // Deferred like the first-run hint: monitor enumeration and
                // panel ordering want a live event loop, not mid-setup state.
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let inner = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if let Err(e) = bar::init(&inner) {
                            eprintln!("[launcharr bar] init failed: {e:?}");
                        }
                    });
                });
            }
            agents::configure(&cfg.agents);
            usage::configure(&cfg.agents);
            agents::start(app.handle().clone());
            tray::init(app.handle())?;
            shortcut::sync(app.handle(), &cfg);
            indexer::start(app.handle().clone());
            scripts::start(app.handle().clone());
            clipboard::watch(app.handle().clone());
            config::watch(app.handle().clone());
            apply_launch_at_login(app.handle(), cfg.launch_at_login);

            // §7 budget: cold start → hotkey registered < 1s.
            eprintln!(
                "[launcharr perf] cold start {}ms",
                boot.elapsed().as_millis()
            );

            // A keep-awake hold the previous run left behind (awake.json) is
            // re-armed now — assertions first, then a toast once the webview
            // can render it, so a resumed hold never goes unannounced.
            if let Some(resumed) = power::resume() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    let text = power::resume_toast(&resumed);
                    let inner = handle.clone();
                    let _ = handle.run_on_main_thread(move || panel::flash(&inner, &text));
                });
            }

            // First run: show the panel once with the hint line (PRD §4.5). Delayed so the
            // webview has rendered by the time the panel appears.
            if first_run {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    let inner = handle.clone();
                    // AppKit calls belong on the main thread.
                    let _ = handle.run_on_main_thread(move || panel::show(&inner));
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building launcharr")
        .run(|_app, event| {
            // Orderly quit takes the supervised `borders` child with us (desktop.rs).
            if let tauri::RunEvent::Exit = event {
                desktop::shutdown();
            }
        });
}
