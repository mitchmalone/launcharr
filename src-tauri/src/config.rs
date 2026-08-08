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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub name: String,
    pub url: String,
    /// Optional trigger word; with a `{query}` placeholder in `url` this becomes a
    /// Raycast-style quicklink (`yt cute otters ⏎`). Resolved frontend-side.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger: Option<String>,
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
    /// Register launcharr as a login item (a launcher that isn't running is furniture).
    pub launch_at_login: bool,
    /// Custom links: indexed like apps, Enter opens the URL in the default browser.
    pub links: Vec<Link>,
    /// Extra global hotkeys → item name to launch (e.g. "Cmd+Shift+S": "Safari").
    pub shortcuts: std::collections::HashMap<String, String>,
    /// Alfred-style dead-end fallback: opened when a query matches nothing. `{query}`
    /// placeholder, URL-encoded by the frontend.
    pub search_fallback: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            hotkey: "Alt+Space".into(),
            terminal: Terminal::ITerm2,
            bang_new_window: true,
            sigil: "❯".into(),
            bang_sigil: "$".into(),
            launch_at_login: true,
            links: Vec::new(),
            shortcuts: std::collections::HashMap::new(),
            search_fallback: "https://www.google.com/search?q={query}".into(),
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
/// The bool is true when this call created the file — i.e. this is a first run.
pub fn load_or_create() -> CmdResult<(Config, bool)> {
    let path = config_path();
    if !path.exists() {
        fs::create_dir_all(config_dir())?;
        let default = Config::default();
        fs::write(&path, serde_json::to_string_pretty(&default).unwrap())?;
        return Ok((default, true));
    }
    let raw = fs::read_to_string(&path)?;
    // A broken hand-edit must not brick the launcher: fall back to defaults.
    Ok((serde_json::from_str(&raw).unwrap_or_default(), false))
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
                Ok((new_config, _)) => {
                    let old = {
                        let state = app.state::<crate::AppState>();
                        let mut cfg = state.config.write().unwrap();
                        let old = cfg.clone();
                        *cfg = new_config.clone();
                        old
                    };
                    if old.hotkey != new_config.hotkey || old.shortcuts != new_config.shortcuts {
                        crate::shortcut::sync(&app, &new_config);
                    }
                    if old.launch_at_login != new_config.launch_at_login {
                        crate::apply_launch_at_login(&app, new_config.launch_at_login);
                    }
                    if old.links != new_config.links {
                        crate::indexer::refresh(&app);
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
