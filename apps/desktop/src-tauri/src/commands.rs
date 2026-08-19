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

/// Open/close a bar hover dropdown (window resize, main thread). `height` is
/// the extra logical height the open card needs; the bar clamps it.
#[tauri::command]
pub fn bar_set_dropdown(open: bool, height: Option<f64>, window: tauri::Window, app: AppHandle) {
    crate::bar::set_dropdown(&app, window.label(), open, height);
}

/// The battery hover card's detail (DECISIONS 2026-08-16). async: spawns
/// `ioreg` and `pmset`, and only ever on hover — the 1 Hz snapshot must not
/// carry data nobody is looking at.
#[tauri::command]
pub async fn bar_battery_detail() -> crate::battery::BatteryDetail {
    crate::battery::detail()
}

/// Agents panel: the monitored sessions (DECISIONS 2026-08-16). Sync — reads
/// an in-memory store, no subprocess.
#[tauri::command]
pub fn agents_status() -> Vec<crate::agents::AgentSession> {
    crate::agents::list()
}

/// awake: arm a keep-awake session (DECISIONS 2026-08-16). Sync — in-process
/// IOKit calls, no subprocess. `spec` is the TS session descriptor, stored
/// verbatim; `untilEpochMs`/`batteryFloor` are the mechanical rails Rust
/// enforces itself.
#[tauri::command]
pub fn awake_arm(
    display: bool,
    disks: bool,
    until_epoch_ms: Option<i64>,
    battery_floor: Option<u8>,
    spec: Option<String>,
) -> crate::error::CmdResult<()> {
    crate::power::arm(display, disks, until_epoch_ms, battery_floor, spec)
}

/// awake: release everything held.
#[tauri::command]
pub fn awake_release() {
    crate::power::release()
}

/// awake: session state plus the "also keeping this Mac awake" list. async:
/// spawns `pmset` — panel/card open only, never the bar tick.
#[tauri::command]
pub async fn awake_status() -> crate::power::AwakeStatus {
    crate::power::status()
}

/// awake: one sample for trigger evaluation (DECISIONS 2026-08-16). The
/// caller says which expensive readings its armed condition needs — Rust
/// never interprets the session spec. async: may hop to the main thread for
/// the app list and pay a cached `netstat`.
#[tauri::command]
pub async fn awake_readings(
    app: tauri::AppHandle,
    apps: bool,
    display: bool,
    net: bool,
) -> AwakeReadings {
    let (battery_pct, on_ac, _) = crate::battery::cached();
    AwakeReadings {
        state: crate::power::state(),
        reading: AwakeReading {
            now_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0),
            on_ac,
            battery_pct,
            ssid: crate::bar_modules::wifi().ssid,
            agent_states: crate::agents::list().into_iter().map(|a| a.state).collect(),
            running_apps: apps.then(|| crate::sysread::running_apps(&app)).flatten(),
            external_display: display.then(crate::sysread::external_display),
            load1: crate::sysread::load1(),
            cores: crate::sysread::cores(),
            net_bytes: if net {
                crate::sysread::net_bytes()
            } else {
                None
            },
        },
    }
}

/// Mirrors `AwakeReading` in @launcharr/core.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwakeReading {
    now_ms: i64,
    on_ac: bool,
    battery_pct: Option<u8>,
    ssid: Option<String>,
    agent_states: Vec<String>,
    running_apps: Option<Vec<String>>,
    external_display: Option<bool>,
    load1: Option<f64>,
    cores: u32,
    net_bytes: Option<u64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwakeReadings {
    state: crate::power::AwakeState,
    reading: AwakeReading,
}

/// Usage panel: cached local token aggregates; kicks a background rescan when
/// stale, never blocks (DECISIONS 2026-08-16).
#[tauri::command]
pub fn usage_status() -> crate::usage::UsageReport {
    crate::usage::report()
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

/// Forget an agent session by hand — the escape hatch for a cell the liveness
/// checks can't prove dead (DECISIONS 2026-08-18). async: `list()` may spawn.
#[tauri::command]
pub async fn agent_forget(session: String, app: AppHandle) -> CmdResult<()> {
    crate::agents::forget_session(&app, &session)
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
pub async fn wifi_connect(ssid: String, password: Option<String>) -> CmdResult<()> {
    crate::wifi::connect(&ssid, password.as_deref())
}

#[tauri::command]
pub async fn wifi_set_power(on: bool) -> CmdResult<()> {
    crate::wifi::set_power(on)
}

/// Slow (system_profiler takes seconds) — async keeps it off the main thread.
#[tauri::command]
pub async fn wifi_scan() -> CmdResult<Vec<crate::wifi::ScanNetwork>> {
    crate::wifi::scan()
}

/// Audio panel. async — osascript subprocesses and HAL calls stay off main.
#[tauri::command]
pub async fn audio_status() -> crate::audio::AudioStatus {
    crate::audio::status()
}

#[tauri::command]
pub async fn audio_set_volume(input: bool, pct: u8) -> CmdResult<()> {
    crate::audio::set_volume(input, pct)
}

#[tauri::command]
pub async fn audio_set_muted(muted: bool) -> CmdResult<()> {
    crate::audio::set_muted(muted)
}

#[tauri::command]
pub async fn audio_set_default(id: u32, input: bool) -> CmdResult<()> {
    crate::audio::set_default_device(id, input)
}

/// Desktop layer (v0.4, DECISIONS 2026-08-17). async: `defaults`/`aerospace`/`brew`
/// subprocesses and `--version` probes stay off main. TypeScript decides, Rust does.
#[tauri::command]
pub async fn desktop_status() -> crate::desktop::DesktopStatus {
    crate::desktop::status()
}

#[tauri::command]
pub async fn desktop_apply(
    req: crate::desktop::DesktopApply,
) -> CmdResult<crate::desktop::ApplyResult> {
    crate::desktop::apply(req)
}

#[tauri::command]
pub async fn desktop_adopt() -> CmdResult<String> {
    crate::desktop::adopt()
}

/// Unmanaged toml helpers: pick a file to symlink to, or save ours somewhere.
#[tauri::command]
pub async fn desktop_toml(action: crate::desktop::TomlAction) -> CmdResult<Option<String>> {
    crate::desktop::toml_action(action)
}

#[tauri::command]
pub async fn desktop_install(app: AppHandle, dep: crate::deps::Dep) -> CmdResult<()> {
    crate::deps::install(app, dep)
}

#[tauri::command]
pub async fn desktop_corner_radius(radius: Option<f64>) -> CmdResult<()> {
    crate::desktop::set_corner_radius(radius)
}

/// `aerospace ⏎` panel: the tray menu as rows.
#[tauri::command]
pub async fn aerospace_workspaces() -> Vec<crate::desktop::AerospaceWorkspace> {
    crate::desktop::workspaces()
}

#[tauri::command]
pub async fn aerospace_action(action: crate::desktop::AerospaceAction) -> CmdResult<()> {
    crate::desktop::aerospace_action(action)
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
            "launcharr:colorpicker" => crate::colorpicker::pick(&app),
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

/// Loupe: pixels around (`x`, `y`) on the loupe window, `size` points square, as raw
/// `[w][h][RGBA…]` bytes (binary IPC — no JSON for 80 KB of pixels per frame).
#[tauri::command]
pub fn loupe_capture(x: f64, y: f64, size: f64) -> CmdResult<tauri::ipc::Response> {
    crate::loupe::capture(x, y, size).map(tauri::ipc::Response::new)
}

/// Loupe: the pick (`hex` = `#RRGGBB`) or a cancel (`None`); hides the loupe either way.
#[tauri::command]
pub fn loupe_done(app: AppHandle, hex: Option<String>) -> CmdResult<()> {
    crate::loupe::hide(&app);
    if let Some(hex) = hex {
        let ok = hex.len() == 7
            && hex.starts_with('#')
            && hex[1..].chars().all(|c| c.is_ascii_hexdigit());
        if !ok {
            return Err(CmdError::Internal(format!("bad color: {hex}")));
        }
        crate::colorpicker::finish(&app, &hex.to_ascii_uppercase());
    }
    Ok(())
}

/// Copy-row Enter (inline math, emoji, `lorem`…): copy, and dismiss unless the
/// frontend wants to flash a confirmation first (`keep_open` — it hides itself).
#[tauri::command]
pub fn copy_text(app: AppHandle, text: String, keep_open: Option<bool>) -> CmdResult<()> {
    if !keep_open.unwrap_or(false) {
        panel::hide(&app);
    }
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

/// Open launcharr's editable surfaces from settings: the config file (default editor),
/// the scripts folder (Finder), or System Settings → Battery (the battery hover card's
/// click target — macOS owns power mode, we only report it). Validated enum — never an
/// arbitrary path across IPC.
#[tauri::command]
pub fn open_path(target: String) -> CmdResult<()> {
    let path = match target.as_str() {
        "config" => crate::config::config_path(),
        // The unmanaged aerospace.toml (Settings → Desktop "edit"): in a text editor.
        "aerospace-toml" => {
            let path = crate::desktop::aerospace_toml_path();
            std::process::Command::new("open")
                .arg("-t")
                .arg(path)
                .spawn()?;
            return Ok(());
        }
        "scripts" => {
            let dir = crate::scripts::scripts_dir();
            std::fs::create_dir_all(&dir)?;
            dir
        }
        "widgets" => {
            let dir = crate::widgets::widgets_dir();
            std::fs::create_dir_all(&dir)?;
            dir
        }
        // The same curated pane table the launcher indexes — one source of truth
        // for deep links, even for a one-off caller like the bar.
        "battery-settings" | "wifi-settings" => {
            let pane = if target == "battery-settings" {
                "Battery"
            } else {
                "Wi-Fi"
            };
            crate::settings_panes::SETTINGS_PANES
                .iter()
                .find(|(name, _)| *name == pane)
                .map(|(_, id)| std::path::PathBuf::from(crate::settings_panes::deep_link(id)))
                .ok_or_else(|| CmdError::Internal(format!("no {pane} settings pane")))?
        }
        other => return Err(CmdError::Internal(format!("unknown open target: {other}"))),
    };
    std::process::Command::new("open").arg(path).spawn()?;
    Ok(())
}

/// Open (or focus) the settings window.
#[tauri::command]
pub fn open_settings(app: AppHandle, tab: Option<String>) -> CmdResult<()> {
    crate::settings_window::open_tab(&app, tab.as_deref())
}

// ---- Widgets (docs/WIDGETS.md, DECISIONS 2026-08-19) -----------------------

/// Settings → Menubar → Custom widgets → add: a picked file's bytes or a URL.
/// Async: a URL install is a network round-trip. Returns the widget id.
#[tauri::command]
pub async fn widget_install(source: crate::widgets::WidgetSource) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || crate::widgets::install(source))
        .await
        .map_err(|e| CmdError::Internal(e.to_string()))?
        .map_err(CmdError::Internal)
}

/// Settings → Menubar → Custom widgets → remove: deletes the widget's file.
#[tauri::command]
pub fn widget_remove(id: String) -> CmdResult<()> {
    crate::widgets::remove(&id).map_err(CmdError::Internal)
}

/// Settings → Menubar → Custom widgets → tick: run a widget now (the same
/// as touching `triggers/widget.<id>`).
#[tauri::command]
pub fn widget_tick(id: String) {
    crate::widgets::poke(&id)
}

/// Settings → Menubar → Custom widgets → a secret setting: store (or clear
/// with null/empty) one Keychain value. The key must be one the widget's
/// manifest declares `secret` — plain settings go through `config.widgets`.
#[tauri::command]
pub fn widget_secret_set(id: String, key: String, value: Option<String>) -> CmdResult<()> {
    if !crate::widgets::valid_id(&id) || !crate::widgets::valid_setting_key(&key) {
        return Err(CmdError::Internal(format!("bad widget secret {id}/{key}")));
    }
    if !crate::widgets::declares_secret(&id, &key) {
        return Err(CmdError::Internal(format!("{id} declares no secret {key}")));
    }
    crate::widget_secrets::set(&id, &key, value.as_deref().unwrap_or(""))
        .map_err(CmdError::Internal)?;
    crate::widgets::poke(&id);
    Ok(())
}

/// Which of a widget's secret settings are set — never the values.
#[tauri::command]
pub fn widget_secret_keys(id: String) -> Vec<String> {
    crate::widgets::secret_keys_present(&id)
}

/// Start the widget's own sign-in (`<widget> auth`); progress arrives as
/// `widget-auth` events.
#[tauri::command]
pub fn widget_auth(app: AppHandle, id: String) -> CmdResult<()> {
    crate::widgets::auth(app, id).map_err(CmdError::Internal)
}

#[tauri::command]
pub fn widget_auth_cancel(id: String) {
    crate::widgets::auth_cancel(&id)
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

// ---- Screenshots panel (plans/done/screenshots-panel.md) ------------------

/// Every image in the screenshot folder, newest first. TS pages and filters.
#[tauri::command]
pub fn list_screenshots() -> CmdResult<Vec<crate::screenshots::Screenshot>> {
    Ok(crate::screenshots::list(&crate::screenshots::dir())?)
}

/// Thumbnail path for one screenshot (generated on first ask, cached by
/// path+mtime). Async so a slow decode never blocks the IPC thread; the
/// generator serialises itself.
#[tauri::command]
pub async fn screenshot_thumb(state: State<'_, AppState>, path: String) -> CmdResult<String> {
    let dir = state.thumb_dir.clone();
    let out = tauri::async_runtime::spawn_blocking(move || crate::screenshots::thumb(&dir, &path))
        .await
        .map_err(|e| CmdError::Internal(e.to_string()))??;
    Ok(out.to_string_lossy().into_owned())
}

/// Enter (copy: hide + file on the pasteboard, ⌘V is yours) or ⌘⇧Enter (open).
/// Reveal reuses `reveal_item`.
#[tauri::command]
pub fn screenshot_action(
    app: AppHandle,
    path: String,
    action: crate::screenshots::ScreenshotAction,
) -> CmdResult<()> {
    panel::hide(&app);
    match action {
        crate::screenshots::ScreenshotAction::Copy => crate::screenshots::copy_to_pasteboard(&path),
        crate::screenshots::ScreenshotAction::Open => crate::screenshots::open(&path),
    }
}
