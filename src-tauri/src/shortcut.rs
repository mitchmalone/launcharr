use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::config::Config;

/// Parsed custom shortcut → the item name it launches.
pub struct CustomShortcut {
    pub shortcut: Shortcut,
    pub target: String,
}

/// (Re-)register the summon hotkey and every custom shortcut from config. Invalid entries
/// are skipped with a log line; an invalid summon hotkey falls back to Alt+Space so a bad
/// hand-edit can never leave launcharr unreachable.
pub fn sync(app: &AppHandle, config: &Config) {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();

    let summon: Shortcut = match config.hotkey.parse() {
        Ok(s) => s,
        Err(_) => {
            eprintln!(
                "[launcharr] bad hotkey {:?}, falling back to Alt+Space",
                config.hotkey
            );
            "Alt+Space".parse().expect("default hotkey parses")
        }
    };
    if let Err(e) = shortcuts.register(summon) {
        eprintln!("[launcharr] hotkey registration failed: {e}");
    }

    let mut customs = Vec::new();
    for (keys, target) in &config.shortcuts {
        match keys.parse::<Shortcut>() {
            Ok(shortcut) => {
                if let Err(e) = shortcuts.register(shortcut) {
                    eprintln!("[launcharr] custom shortcut {keys:?} failed: {e}");
                    continue;
                }
                customs.push(CustomShortcut {
                    shortcut,
                    target: target.clone(),
                });
            }
            Err(e) => eprintln!("[launcharr] bad custom shortcut {keys:?}: {e}"),
        }
    }

    let state = app.state::<crate::AppState>();
    *state.summon.write().unwrap() = summon;
    *state.custom_shortcuts.write().unwrap() = customs;
}

/// Global-shortcut handler: the summon hotkey toggles the panel; custom shortcuts launch
/// their target item directly (name match, case-insensitive, prefix as fallback).
pub fn handle(app: &AppHandle, pressed: &Shortcut) {
    let state = app.state::<crate::AppState>();
    if *state.summon.read().unwrap() == *pressed {
        crate::panel::toggle(app);
        return;
    }
    let target = state
        .custom_shortcuts
        .read()
        .unwrap()
        .iter()
        .find(|c| c.shortcut == *pressed)
        .map(|c| c.target.clone());
    if let Some(target) = target {
        if let Err(e) = crate::commands::launch_by_name(app, &target) {
            eprintln!("[launcharr] shortcut target {target:?} failed: {e}");
        }
    }
}
