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
    /// Open in a specific browser (app name for `open -a`); None = default browser.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser: Option<String>,
}

/// v0.5 bar: off by default so the launcher-only install is untouched.
/// `enabled` hot-applies via the config watcher (no restart).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BarConfig {
    pub enabled: bool,
    /// Explicit alignment zones (2026-08-16, replacing the clock-anchored flat
    /// list): every module lives in left, center, or right, ordered within its
    /// zone. The clock is an ordinary module.
    pub layout: BarZones,
    /// Optional separate arrangement for notched displays — left and right
    /// only (the camera housing owns the center). None → derived from
    /// `layout` with center modules folded into the head of the right zone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notched_layout: Option<BarZones>,
    /// Legacy flat lists (pre-zones), read once for migration, never written.
    #[serde(skip_serializing)]
    modules: Option<Vec<BarModule>>,
    #[serde(skip_serializing)]
    notched_modules: Option<Vec<BarModule>>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BarZones {
    pub left: Vec<BarModule>,
    pub center: Vec<BarModule>,
    pub right: Vec<BarModule>,
}

impl BarConfig {
    /// Fold pre-zone configs (`modules` split at the clock anchor,
    /// `notchedModules`) into zones. Runs at load; the next write persists the
    /// migrated shape and drops the legacy keys.
    pub fn migrate_legacy(&mut self) {
        if let Some(flat) = self.modules.take() {
            // A missing `layout` key deserializes to the default zones
            // (struct-level serde default) — that's the "not customized yet"
            // sentinel the legacy list may overwrite.
            if self.layout == BarConfig::default().layout {
                self.layout = zones_from_flat(&flat);
            }
        }
        if let Some(flat) = self.notched_modules.take() {
            if self.notched_layout.is_none() {
                let z = zones_from_flat(&flat);
                self.notched_layout = Some(BarZones {
                    left: z.left,
                    center: Vec::new(),
                    right: [z.center, z.right].concat(),
                });
            }
        }
    }
}

/// Legacy order → zones: modules before `clock` sit left, `clock` centers,
/// the rest sit right (exactly the old renderer's split).
fn zones_from_flat(flat: &[BarModule]) -> BarZones {
    let clock_at = flat.iter().position(|m| m.id == "clock");
    match clock_at {
        Some(i) => BarZones {
            left: flat[..i].to_vec(),
            center: vec![flat[i].clone()],
            right: flat[i + 1..].to_vec(),
        },
        None => BarZones {
            left: flat.to_vec(),
            ..Default::default()
        },
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarModule {
    pub id: String,
    pub enabled: bool,
}

// The full widget-id list lives TS-side (lib/config.ts BAR_MODULE_IDS) —
// only the renderer and settings normalize against it; Rust just stores zones.

impl Default for BarConfig {
    fn default() -> Self {
        let module = |id: &str| BarModule {
            id: id.into(),
            enabled: true,
        };
        Self {
            enabled: false,
            layout: BarZones {
                left: ["workspaces", "agents", "frontApp"].map(module).to_vec(),
                center: vec![module("clock")],
                right: ["wifi", "trmnl", "battery"].map(module).to_vec(),
            },
            notched_layout: None,
            modules: None,
            notched_modules: None,
        }
    }
}

/// Agent integrations: local session monitoring and the usage monitor. All
/// off by default — a fresh install watches nothing and fetches nothing.
///
/// Credential access is a consent *capability*, not a source picker
/// (DECISIONS 2026-08-16): the user grants "may read the CLI's stored
/// credentials" per provider and the code owns source selection and fallback
/// order (usage.rs). An "own sign-in" capability can join later as another
/// boolean without reshaping config.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AgentsConfig {
    /// Local agent session monitoring: socket listener, bar cells, `agents ⏎`.
    pub monitor: bool,
    /// Show idle (green) sessions in the bar; active states always show.
    pub show_idle: bool,
    /// Sessions silent this long are pruned from monitoring.
    pub prune_hours: u32,
    /// The `usage ⏎` token monitor (local journal aggregation).
    pub usage: bool,
    /// Agent mode: `?` converses with the user's own agent CLI (ask.rs).
    pub ask_mode: bool,
    /// Which CLI answers `?`: "claude" or "codex".
    pub ask_provider: String,
    /// May read Claude Code's stored credentials (keychain, then the
    /// credentials file) to fetch account limits. The keychain read goes via
    /// /usr/bin/security, so macOS shows its own consent prompt on first use.
    pub claude_creds: bool,
    /// May read the Codex CLI's `~/.codex/auth.json` to fetch account limits.
    pub codex_creds: bool,
}

impl Default for AgentsConfig {
    fn default() -> Self {
        Self {
            monitor: false,
            show_idle: true,
            prune_hours: 12,
            usage: false,
            ask_mode: false,
            ask_provider: "claude".into(),
            claude_creds: false,
            codex_creds: false,
        }
    }
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
    /// Opt-in: index browser bookmarks (Chrome-family + Safari) as results. Default off.
    pub index_bookmarks: bool,
    /// Active theme: a built-in name (launcharr, dracula, terminal) or a key of `themes`.
    /// Resolution and the token model live frontend-side (src/lib/themes.ts).
    pub theme: String,
    /// User-defined themes: name → token overrides. Opaque to Rust; just persisted.
    pub themes: std::collections::HashMap<String, serde_json::Value>,
    /// The menubar-replacement bar (v0.5).
    pub bar: BarConfig,
    /// Agent monitoring + usage monitor (all off by default).
    pub agents: AgentsConfig,
    /// The desktop layer (v0.4): tiling via AeroSpace, JankyBorders, corner radius.
    /// Opaque to Rust — the shape and defaults live in `@launcharr/core/desktop`;
    /// desktop.rs only receives rendered bytes and argv.
    pub desktop: serde_json::Value,
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
            index_bookmarks: false,
            theme: "launcharr".into(),
            themes: std::collections::HashMap::new(),
            bar: BarConfig::default(),
            agents: AgentsConfig::default(),
            desktop: serde_json::Value::Object(Default::default()),
        }
    }
}

pub fn config_dir() -> PathBuf {
    // ~/.config/launcharr — XDG-style, deliberate: a terminal-nerd path, not ~/Library.
    // Briefly ~/.launcharr on 2026-08-10, reversed same day (see DECISIONS); migrate_home
    // brings any dir at the old spot back.
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config")
        .join("launcharr")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

fn legacy_config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".launcharr")
}

/// One-shot home migration: rename `old` to `new` when `new` doesn't exist yet. Atomic on
/// the same volume; a no-op on fresh installs and already-migrated homes. Returns whether
/// a move happened.
pub fn migrate_home(old: &std::path::Path, new: &std::path::Path) -> std::io::Result<bool> {
    if new.exists() || !old.exists() {
        return Ok(false);
    }
    fs::rename(old, new)?;
    Ok(true)
}

/// Load the config, writing the default file on first run so it's discoverable/editable.
/// The bool is true when this call created the file — i.e. this is a first run.
pub fn load_or_create() -> CmdResult<(Config, bool)> {
    if let Err(e) = migrate_home(&legacy_config_dir(), &config_dir()) {
        // Don't brick startup over a failed move; the old path simply stays put and a
        // fresh default is created at the new one.
        eprintln!("launcharr: home migration failed: {e}");
    }
    let path = config_path();
    if !path.exists() {
        fs::create_dir_all(config_dir())?;
        let default = Config::default();
        fs::write(&path, serde_json::to_string_pretty(&default).unwrap())?;
        return Ok((default, true));
    }
    let raw = fs::read_to_string(&path)?;
    // A broken hand-edit must not brick the launcher: fall back to defaults —
    // but say so, or a typo silently reverts every setting (found 2026-08-15).
    let mut parsed: Config = serde_json::from_str(&raw).unwrap_or_else(|e| {
        eprintln!("[launcharr] config.json unreadable, using defaults: {e}");
        Config::default()
    });
    parsed.bar.migrate_legacy();
    Ok((parsed, false))
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
                    if old.links != new_config.links
                        || old.index_bookmarks != new_config.index_bookmarks
                    {
                        crate::indexer::refresh(&app);
                    }
                    crate::agents::configure(&new_config.agents);
                    crate::usage::configure(&new_config.agents);
                    if old.bar.enabled != new_config.bar.enabled {
                        crate::bar::set_enabled(&app, new_config.bar.enabled);
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
    fn theme_fields_default_and_parse() {
        let cfg: Config = serde_json::from_str("{}").unwrap();
        assert_eq!(cfg.theme, "launcharr");
        assert!(cfg.themes.is_empty());
        let cfg: Config =
            serde_json::from_str(r##"{"theme":"dracula","themes":{"mine":{"accent":"#f00"}}}"##)
                .unwrap();
        assert_eq!(cfg.theme, "dracula");
        assert!(cfg.themes.contains_key("mine"));
    }

    #[test]
    fn legacy_bar_modules_migrate_to_zones_split_at_clock() {
        let mut cfg: Config = serde_json::from_str(
            r#"{"bar":{"enabled":true,
                "modules":[
                    {"id":"agents","enabled":true},
                    {"id":"clock","enabled":true},
                    {"id":"battery","enabled":false}],
                "notchedModules":[
                    {"id":"clock","enabled":true},
                    {"id":"battery","enabled":true}]}}"#,
        )
        .unwrap();
        cfg.bar.migrate_legacy();
        assert_eq!(cfg.bar.layout.left[0].id, "agents");
        assert_eq!(cfg.bar.layout.center[0].id, "clock");
        assert_eq!(cfg.bar.layout.right[0].id, "battery");
        assert!(!cfg.bar.layout.right[0].enabled);
        // Migrated config no longer serializes legacy keys.
        let out = serde_json::to_string(&cfg).unwrap();
        assert!(!out.contains("\"modules\""));
        // Notched folds center into the head of right — no center zone.
        let notched = cfg.bar.notched_layout.unwrap();
        assert!(notched.left.is_empty() && notched.center.is_empty());
        assert_eq!(notched.right[0].id, "clock");
        assert_eq!(notched.right[1].id, "battery");
    }

    #[test]
    fn migrate_home_moves_once_and_only_when_target_absent() {
        let base = std::env::temp_dir().join(format!("launcharr-mig-{}", std::process::id()));
        let old = base.join("old");
        let new = base.join("new");
        fs::create_dir_all(old.join("scripts")).unwrap();
        fs::write(old.join("config.json"), "{}").unwrap();

        assert!(migrate_home(&old, &new).unwrap());
        assert!(new.join("config.json").exists());
        assert!(new.join("scripts").is_dir());
        assert!(!old.exists());

        // Idempotent: nothing left to move, and an existing target is never clobbered.
        assert!(!migrate_home(&old, &new).unwrap());
        fs::create_dir_all(&old).unwrap();
        assert!(!migrate_home(&old, &new).unwrap());
        assert!(old.exists());

        fs::remove_dir_all(&base).unwrap();
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
