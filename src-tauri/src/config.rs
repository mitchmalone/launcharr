use std::{fs, path::PathBuf, sync::mpsc, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::CmdResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Terminal {
    #[serde(rename = "iTerm2")]
    ITerm2,
    #[serde(rename = "Terminal")]
    TerminalApp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    /// Global summon hotkey, e.g. "Alt+Space".
    pub hotkey: String,
    /// Bang-mode target terminal.
    pub terminal: Terminal,
    /// Bang mode: open a new terminal window (true) or reuse the current session (false).
    pub bang_new_window: bool,
    /// Prompt sigil in launch mode.
    pub sigil: String,
    /// Prompt sigil in bang mode.
    pub bang_sigil: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            hotkey: "Alt+Space".into(),
            terminal: Terminal::ITerm2,
            bang_new_window: true,
            sigil: "❯".into(),
            bang_sigil: "$".into(),
        }
    }
}

pub fn config_dir() -> PathBuf {
    // ~/.config/launcharr — deliberate: a terminal-nerd path, not ~/Library.
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config")
        .join("launcharr")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// Load the config, writing the default file on first run so it's discoverable/editable.
pub fn load_or_create() -> CmdResult<Config> {
    let path = config_path();
    if !path.exists() {
        fs::create_dir_all(config_dir())?;
        let default = Config::default();
        fs::write(&path, serde_json::to_string_pretty(&default).unwrap())?;
        return Ok(default);
    }
    let raw = fs::read_to_string(&path)?;
    // A broken hand-edit must not brick the launcher: fall back to defaults.
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

/// Watch ~/.config/launcharr for edits; reload, re-register the hotkey, notify the frontend.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        use notify::{RecursiveMode, Watcher};
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[launcharr] config watcher failed: {e}");
                return;
            }
        };
        if let Err(e) = watcher.watch(&config_dir(), RecursiveMode::NonRecursive) {
            eprintln!("[launcharr] config watch failed: {e}");
            return;
        }
        loop {
            if rx.recv().is_err() {
                return;
            }
            // Debounce editor save bursts.
            while rx.recv_timeout(Duration::from_millis(300)).is_ok() {}
            match load_or_create() {
                Ok(new_config) => {
                    let old_hotkey = {
                        let state = app.state::<crate::AppState>();
                        let mut cfg = state.config.write().unwrap();
                        let old = cfg.hotkey.clone();
                        *cfg = new_config.clone();
                        old
                    };
                    if old_hotkey != new_config.hotkey {
                        crate::shortcut::reregister(&app, &new_config.hotkey);
                    }
                    let _ = app.emit("config-changed", &new_config);
                }
                Err(e) => eprintln!("[launcharr] config reload failed: {e}"),
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_round_trips() {
        let json = serde_json::to_string(&Config::default()).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(back.hotkey, "Alt+Space");
        assert_eq!(back.terminal, Terminal::ITerm2);
        assert!(back.bang_new_window);
    }

    #[test]
    fn partial_config_fills_defaults() {
        let cfg: Config = serde_json::from_str(r#"{"hotkey":"Cmd+Space"}"#).unwrap();
        assert_eq!(cfg.hotkey, "Cmd+Space");
        assert_eq!(cfg.sigil, "❯");
        assert_eq!(cfg.terminal, Terminal::ITerm2);
    }

    #[test]
    fn terminal_serializes_as_product_names() {
        assert_eq!(
            serde_json::to_string(&Terminal::ITerm2).unwrap(),
            r#""iTerm2""#
        );
        assert_eq!(
            serde_json::to_string(&Terminal::TerminalApp).unwrap(),
            r#""Terminal""#
        );
    }
}
