//! The menubar-replacement bar (v0.5 spike): one status-level, non-activating
//! panel per display, pinned to the top edge, visible on every space. Gated by
//! `bar.enabled` in config (default off) so the launcher is unaffected.
//!
//! Data gathering stays here as plain testable functions; the `bar_snapshot`
//! command is the only IPC surface (DECISIONS 2026-08-15).

use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelLevel, StyleMask, WebviewWindowExt};

use crate::error::{CmdError, CmdResult};

/// Logical bar height, matching the Sketchybar setup it replaces.
pub const BAR_HEIGHT: f64 = 30.0;

/// Extra logical height while the agent hover card is open — the strip can't
/// host a popover inside 30px, so the whole window grows downward briefly.
const DROPDOWN_EXTRA: f64 = 130.0;

/// Whether the hover dropdown is open; the reframe heartbeat must agree with
/// the hover state or it snaps the window back mid-hover.
static DROPDOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn wanted_height() -> f64 {
    if DROPDOWN.load(std::sync::atomic::Ordering::Relaxed) {
        BAR_HEIGHT + DROPDOWN_EXTRA
    } else {
        BAR_HEIGHT
    }
}

/// Open/close the hover dropdown by resizing the primary bar window.
pub fn set_dropdown(app: &AppHandle, open: bool) {
    DROPDOWN.store(open, std::sync::atomic::Ordering::Relaxed);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || reframe(&handle));
}

tauri_panel! {
    panel!(BarPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

/// Create one bar per display. Called at setup only when `bar.enabled`.
pub fn init(app: &AppHandle) -> CmdResult<()> {
    // available_monitors() comes back empty for an accessory app even after
    // setup (observed 2026-08-15); primary_monitor() answers. Fall back so a
    // single-display Mac always gets its bar; multi-display revisits in B2.
    let mut monitors = app
        .available_monitors()
        .map_err(|e| CmdError::Internal(format!("monitors: {e}")))?;
    if monitors.is_empty() {
        monitors.extend(
            app.primary_monitor()
                .map_err(|e| CmdError::Internal(format!("primary monitor: {e}")))?,
        );
    }
    eprintln!("[launcharr bar] {} bar(s) up", monitors.len());
    for (i, monitor) in monitors.iter().enumerate() {
        let label = format!("bar-{i}");
        let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("bar.html".into()))
            .decorations(false)
            .transparent(true)
            .resizable(false)
            .shadow(false)
            .skip_taskbar(true)
            .accept_first_mouse(true)
            .visible(false)
            // Never-focused webview in a background accessory app: WebKit
            // throttles its JS timers to a crawl (bar went stale/blank,
            // 2026-08-16). Updates are Rust-pushed below, but keep WebKit
            // honest for anything timer-driven that remains.
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
            .build()
            .map_err(|e| CmdError::Internal(format!("bar window: {e}")))?;

        let panel = window
            .to_panel::<BarPanel>()
            .map_err(|e| CmdError::Internal(format!("bar to_panel: {e}")))?;
        // Floating (4): above tiled windows, below MainMenu (24) so the native
        // auto-hidden menu bar slides OVER the bar, Sketchybar-style. At this
        // level AppKit constrains frames out of the menu-bar reserve — the
        // bar_constrain override (installed below, once the class exists)
        // makes y=0 legal again.
        panel.set_level(PanelLevel::Floating.value());
        if !crate::bar_constrain::install(c"BarPanel") {
            eprintln!("[launcharr bar] constrain override failed; bar may sit low");
        }
        panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
        panel.set_collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .full_screen_auxiliary()
                .stationary()
                .into(),
        );
        panel.set_hides_on_deactivate(false);

        // Frame AFTER the panel conversion — the NSPanel swap re-derives the
        // frame from the builder config, dropping anything set before it. Use a
        // fresh handle: the pre-conversion one can point at the old NSWindow.
        let scale = monitor.scale_factor();
        let pos = monitor.position();
        let size = monitor.size();
        let window = app
            .get_webview_window(&label)
            .ok_or_else(|| CmdError::Internal(format!("{label} missing post-conversion")))?;
        window
            .set_size(PhysicalSize::new(size.width, (BAR_HEIGHT * scale) as u32))
            .and_then(|()| window.set_position(PhysicalPosition::new(pos.x, pos.y)))
            .map_err(|e| CmdError::Internal(format!("bar frame: {e}")))?;

        panel.order_front_regardless();

        let _ = window.with_webview(|platform| {
            if !crate::bar_constrain::disable_occlusion_detection(platform.inner().cast()) {
                eprintln!("[launcharr bar] occlusion-detection override unavailable");
            }
        });
    }
    crate::bar_constrain::prevent_app_nap();
    crate::bar_modules::start();
    watch(app.clone());
    watch_triggers(app.clone());
    push_loop(app.clone());
    Ok(())
}

/// The bar's heartbeat lives in Rust, not the webview: WKWebView throttles JS
/// timers in never-focused windows, so the webview only *listens*. Push via
/// direct eval — the lowest-level path into the page, with no event-system or
/// capability plumbing that can fail silently (which it did, 2026-08-16).
fn push_loop(app: AppHandle) {
    std::thread::spawn(move || loop {
        push(&app);
        std::thread::sleep(std::time::Duration::from_secs(1));
    });
}

/// Also poked by agents.rs so state flips beat the 1 Hz tick.
pub(crate) fn push(app: &AppHandle) {
    let snap = snapshot();
    if snap.focused.is_none() && !snap.workspaces.is_empty() {
        eprintln!("[launcharr bar] push without focus: {snap:?}");
    }
    let Ok(json) = serde_json::to_string(&snap) else {
        return;
    };
    let script = format!("window.__barPush && window.__barPush({json})");
    for i in 0.. {
        let Some(window) = app.get_webview_window(&format!("bar-{i}")) else {
            break;
        };
        if let Err(e) = window.eval(&script) {
            eprintln!("[launcharr bar] eval push failed on bar-{i}: {e}");
        }
    }
}

/// Event-driven refresh: anything touching a file in
/// `~/.config/launcharr/triggers/` makes the bar re-snapshot immediately.
/// Aerospace's `exec-on-workspace-change` points here — polling is only the
/// fallback, so workspace switches show up in tens of ms, not up to a second.
/// It's also a hackable surface: any script can poke the bar.
fn watch_triggers(app: AppHandle) {
    let dir = crate::config::config_dir().join("triggers");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("[launcharr bar] triggers dir failed: {e}");
        return;
    }
    std::thread::spawn(move || {
        use notify::{RecursiveMode, Watcher};
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[launcharr bar] trigger watcher failed: {e}");
                return;
            }
        };
        if let Err(e) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
            eprintln!("[launcharr bar] trigger watch failed: {e}");
            return;
        }
        while rx.recv().is_ok() {
            // Coalesce bursts, then push a fresh snapshot immediately.
            while rx
                .recv_timeout(std::time::Duration::from_millis(30))
                .is_ok()
            {}
            push(&app);
        }
    });
}

/// Display modes change (dock/undock, scaling) and strand the bar at stale
/// coordinates — observed 2026-08-16 at y=-111, invisibly off-screen. There is
/// no clean cross-platform "screens changed" event in Tauri, so re-assert the
/// frame on a slow heartbeat; it's a no-op when nothing moved.
fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(15));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || reframe(&handle));
    });
}

fn reframe(app: &AppHandle) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let Some(window) = app.get_webview_window("bar-0") else {
        return;
    };
    let scale = monitor.scale_factor();
    let want_pos = *monitor.position();
    let want_size = PhysicalSize::new(monitor.size().width, (wanted_height() * scale) as u32);
    let moved = window
        .outer_position()
        .map(|p| p != want_pos)
        .unwrap_or(true);
    let resized = window.outer_size().map(|s| s != want_size).unwrap_or(true);
    if moved || resized {
        let _ = window.set_size(want_size);
        let _ = window.set_position(want_pos);
        eprintln!("[launcharr bar] re-framed after display change");
    }
}

/// Everything the bar renders in one poll. All sources are optional-by-design:
/// no aerospace → no workspaces, no battery (desktop Mac) → no battery cell.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BarSnapshot {
    pub workspaces: Vec<String>,
    pub focused: Option<String>,
    pub front_app: Option<String>,
    pub battery_pct: Option<u8>,
    pub on_ac: bool,
    pub charging: bool,
    pub wifi: crate::bar_modules::WifiState,
    pub trmnl: Option<crate::bar_modules::TrmnlState>,
    pub agents: Vec<crate::agents::AgentSession>,
}

pub fn snapshot() -> BarSnapshot {
    let raw = aerospace(&[
        "list-workspaces",
        "--all",
        "--format",
        "%{workspace}%{tab}%{workspace-is-focused}",
    ]);
    let (workspaces, mut focused) = raw
        .as_deref()
        .map(parse_workspace_table)
        .unwrap_or_default();
    if focused.is_none() && !workspaces.is_empty() {
        // Belt and braces: the table said nothing is focused (mid-switch race,
        // or a version without %{workspace-is-focused}) — ask directly.
        focused = aerospace(&["list-workspaces", "--focused"])
            .map(|out| parse_lines(&out).into_iter().next())
            .unwrap_or_default();
        eprintln!("[launcharr bar] focus fallback used; table={raw:?} → focused={focused:?}");
    }
    let (battery_pct, on_ac, charging) = battery_cached();
    BarSnapshot {
        workspaces,
        focused,
        front_app: front_app(),
        battery_pct,
        on_ac,
        charging,
        wifi: crate::bar_modules::wifi(),
        trmnl: crate::bar_modules::trmnl(),
        agents: crate::agents::list(),
    }
}

/// One aerospace round-trip for names + focus: lines of `name\ttrue|false`.
fn parse_workspace_table(out: &str) -> (Vec<String>, Option<String>) {
    let mut names = Vec::new();
    let mut focused = None;
    for line in parse_lines(out) {
        let (name, is_focused) = match line.split_once('\t') {
            Some((n, f)) => (n.trim().to_owned(), f.trim() == "true"),
            None => (line, false),
        };
        if is_focused {
            focused = Some(name.clone());
        }
        names.push(name);
    }
    (names, focused)
}

/// Battery changes on the scale of minutes; don't pay a pmset spawn per tick.
fn battery_cached() -> (Option<u8>, bool, bool) {
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    type Reading = (Option<u8>, bool, bool);
    static CACHE: Mutex<Option<(Instant, Reading)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, value)) = *cache {
        if at.elapsed() < Duration::from_secs(30) {
            return value;
        }
    }
    let value = Command::new("/usr/bin/pmset")
        .args(["-g", "batt"])
        .output()
        .ok()
        .map(|out| parse_battery(&String::from_utf8_lossy(&out.stdout)))
        .unwrap_or((None, false, false));
    *cache = Some((Instant::now(), value));
    value
}

/// Focus a workspace (bar click). The name comes from our own snapshot, but
/// validate anyway — it ends up as a process argument.
pub fn switch_workspace(ws: &str) -> CmdResult<()> {
    if ws.is_empty()
        || !ws
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(CmdError::Internal(format!("bad workspace name: {ws:?}")));
    }
    aerospace(&["workspace", ws])
        .map(|_| ())
        .ok_or_else(|| CmdError::Internal("aerospace workspace switch failed".into()))
}

/// Frontmost app name via lsappinfo (no Accessibility, no AppKit thread hop).
fn front_app() -> Option<String> {
    let asn = Command::new("/usr/bin/lsappinfo")
        .arg("front")
        .output()
        .ok()?;
    let asn = String::from_utf8_lossy(&asn.stdout).trim().to_owned();
    if asn.is_empty() {
        return None;
    }
    let info = Command::new("/usr/bin/lsappinfo")
        .args(["info", "-only", "name", &asn])
        .output()
        .ok()?;
    parse_lsappinfo_name(&String::from_utf8_lossy(&info.stdout))
}

/// The app name is the first double-quoted token of lsappinfo output.
fn parse_lsappinfo_name(out: &str) -> Option<String> {
    let start = out.find('"')? + 1;
    let end = start + out[start..].find('"')?;
    let name = &out[start..end];
    // `-only name` normally yields `"LSDisplayName"="iTerm2"` — take the value
    // side when both halves are quoted.
    if name == "LSDisplayName" || name == "name" {
        let rest = &out[end + 1..];
        return parse_lsappinfo_name(rest);
    }
    (!name.is_empty()).then(|| name.to_owned())
}

/// The aerospace CLI, wherever Homebrew put it. PATH first for dev shells.
fn aerospace(args: &[&str]) -> Option<String> {
    for bin in [
        "aerospace",
        "/opt/homebrew/bin/aerospace",
        "/usr/local/bin/aerospace",
    ] {
        if let Ok(out) = Command::new(bin).args(args).output() {
            if out.status.success() {
                return Some(String::from_utf8_lossy(&out.stdout).into_owned());
            }
        }
    }
    None
}

fn parse_lines(out: &str) -> Vec<String> {
    out.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Parse `pmset -g batt`: percentage from the first `NN%` token, AC from the
/// "Now drawing from 'AC Power'" header, charging from the state field
/// ("discharging" must not count).
fn parse_battery(out: &str) -> (Option<u8>, bool, bool) {
    let pct = out.split('%').next().and_then(|before| {
        let digits: String = before
            .chars()
            .rev()
            .take_while(char::is_ascii_digit)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        digits.parse().ok()
    });
    let charging = out.contains("; charging") || out.contains("; finishing charge");
    (pct, out.contains("AC Power"), charging)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_battery_discharging() {
        let out = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=5308515)\t89%; discharging; 4:32 remaining present: true\n";
        assert_eq!(parse_battery(out), (Some(89), false, false));
    }

    #[test]
    fn parses_battery_on_ac() {
        let out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=5308515)\t100%; charged; 0:00 remaining present: true\n";
        assert_eq!(parse_battery(out), (Some(100), true, false));
    }

    #[test]
    fn parses_battery_charging() {
        let out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=5308515)\t64%; charging; 1:10 remaining present: true\n";
        assert_eq!(parse_battery(out), (Some(64), true, true));
    }

    #[test]
    fn battery_absent_on_desktops() {
        assert_eq!(
            parse_battery("Now drawing from 'AC Power'\n"),
            (None, true, false)
        );
    }

    #[test]
    fn parses_workspace_table() {
        let out = "1\tfalse\n2\ttrue\n3\tfalse\n";
        assert_eq!(
            parse_workspace_table(out),
            (
                vec!["1".into(), "2".into(), "3".into()],
                Some("2".to_owned())
            )
        );
        // Old aerospace without --format support still yields plain names.
        assert_eq!(
            parse_workspace_table("1\n2\n"),
            (vec!["1".into(), "2".into()], None)
        );
        assert_eq!(parse_workspace_table(""), (vec![], None));
    }

    #[test]
    fn parses_lsappinfo_name_forms() {
        assert_eq!(
            parse_lsappinfo_name("\"LSDisplayName\"=\"iTerm2\"\n"),
            Some("iTerm2".into())
        );
        assert_eq!(
            parse_lsappinfo_name("\"iTerm2\" ASN:0x0-0x9a09a: (in front)\n"),
            Some("iTerm2".into())
        );
        assert_eq!(parse_lsappinfo_name(""), None);
        assert_eq!(parse_lsappinfo_name("no quotes here"), None);
    }

    #[test]
    fn rejects_bad_workspace_names() {
        assert!(switch_workspace("").is_err());
        assert!(switch_workspace("1; rm -rf /").is_err());
    }

    #[test]
    fn parses_workspace_lines() {
        assert_eq!(parse_lines("1\n2\n\n3\n"), vec!["1", "2", "3"]);
        assert!(parse_lines("").is_empty());
    }
}
