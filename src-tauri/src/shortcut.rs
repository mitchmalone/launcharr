use tauri::AppHandle;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// Register the summon hotkey. Invalid hotkey strings fall back to the default so a bad
/// hand-edit of config.json can never leave launcharr unreachable.
pub fn register(app: &AppHandle, hotkey: &str) {
    let shortcuts = app.global_shortcut();
    if shortcuts.register(hotkey).is_err() {
        eprintln!("[launcharr] could not register hotkey {hotkey:?}, falling back to Alt+Space");
        if let Err(e) = shortcuts.register("Alt+Space") {
            eprintln!("[launcharr] fallback hotkey failed too: {e}");
        }
    }
}

pub fn reregister(app: &AppHandle, hotkey: &str) {
    let _ = app.global_shortcut().unregister_all();
    register(app, hotkey);
}
