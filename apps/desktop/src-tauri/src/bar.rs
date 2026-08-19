//! The menubar-replacement bar (v0.5 spike): one status-level, non-activating
//! panel per display, pinned to the top edge, visible on every space. Gated by
//! `bar.enabled` in config (default off) so the launcher is unaffected.
//!
//! Data gathering stays here as plain testable functions; the `bar_snapshot`
//! command is the only IPC surface (DECISIONS 2026-08-15).

use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelLevel, StyleMask, WebviewWindowExt};

use crate::error::{CmdError, CmdResult};

/// Logical bar height, matching the Sketchybar setup it replaces.
pub const BAR_HEIGHT: f64 = 30.0;

/// Extra logical height while a hover card is open — the strip can't host a
/// popover inside 30px, so the whole window grows downward briefly. The page
/// asks for the height its card needs; this is the fallback and the ceiling.
const DROPDOWN_EXTRA: f64 = 130.0;
const DROPDOWN_MAX: f64 = 480.0;

/// Extra height the open hover card wants, 0 when closed, and which bar
/// (`bar-{i}`) is hosting it; the reframe heartbeat must agree with the hover
/// state or it snaps the window back mid-hover.
static DROPDOWN_EXTRA_PX: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
static DROPDOWN_BAR: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// Wanted logical height of bar `index`: the strip, plus the open card on the
/// one bar that is hosting it.
fn wanted_height(index: usize) -> f64 {
    let extra = if DROPDOWN_BAR.load(std::sync::atomic::Ordering::Relaxed) == index {
        f64::from(DROPDOWN_EXTRA_PX.load(std::sync::atomic::Ordering::Relaxed))
    } else {
        0.0
    };
    BAR_HEIGHT + extra
}

/// `bar-{i}` → `i`.
fn bar_index(label: &str) -> Option<usize> {
    label.strip_prefix("bar-")?.parse().ok()
}

/// Open/close a hover dropdown by resizing the bar window that asked (only
/// that display's bar grows). Cards declare their own height — the agent card
/// is short, the battery card isn't.
pub fn set_dropdown(app: &AppHandle, label: &str, open: bool, height: Option<f64>) {
    let extra = if open {
        height.unwrap_or(DROPDOWN_EXTRA).clamp(0.0, DROPDOWN_MAX)
    } else {
        0.0
    };
    if let Some(index) = bar_index(label) {
        DROPDOWN_BAR.store(index, std::sync::atomic::Ordering::Relaxed);
    }
    DROPDOWN_EXTRA_PX.store(extra as u32, std::sync::atomic::Ordering::Relaxed);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || sync(&handle));
}

/// Synthetic hover: WebKit refuses to process hover for a never-active
/// accessory window even with an always-active tracking area (proven
/// 2026-08-16), so hover is driven from Rust — poll the global cursor
/// (permission-free) and feed window-local coordinates to the page, which
/// resolves the hovered element itself. `(-1, -1)` means "cursor left".
/// Each bar hears only about its own display.
fn watch_mouse(app: AppHandle) {
    std::thread::spawn(move || {
        let mut was_inside: Option<usize> = None;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(125));
            let inside = mouse_in_bar();
            if inside.is_none() && was_inside.is_none() {
                continue;
            }
            if let Some(prev) = was_inside {
                if inside.map(|(i, ..)| i) != Some(prev) {
                    if let Some(window) = app.get_webview_window(&format!("bar-{prev}")) {
                        let _ = window.eval("window.__barMouse && window.__barMouse(-1,-1)");
                    }
                }
            }
            if let Some((i, x, y)) = inside {
                if let Some(window) = app.get_webview_window(&format!("bar-{i}")) {
                    let _ = window.eval(format!(
                        "window.__barMouse && window.__barMouse({x:.1},{y:.1})"
                    ));
                }
            }
            was_inside = inside.map(|(i, ..)| i);
        }
    });
}

/// Which bar the cursor is inside (strip, or strip + dropdown while open) and
/// the cursor in that window's CSS coordinates. Bars hang from the top edge of
/// their screen, so screen-local is window-local.
fn mouse_in_bar() -> Option<(usize, f64, f64)> {
    let (mx, my) = crate::screens::mouse()?;
    crate::screens::all()
        .into_iter()
        .enumerate()
        .find_map(|(i, s)| {
            let (x, y) = (mx - s.x, my - s.y);
            let inside = (0.0..=s.width).contains(&x) && (0.0..=wanted_height(i)).contains(&y);
            inside.then_some((i, x, y))
        })
}

tauri_panel! {
    panel!(BarPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

/// The support threads (push, reframe, triggers, mouse) spawn once per
/// process; they look windows up per tick, so they idle harmlessly while the
/// bar is toggled off and re-attach when it returns.
static THREADS_STARTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// `bar.enabled`, mirrored so the heartbeat knows whether to show or hide.
static ENABLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Which display id each `bar-{i}` was last framed to and whether that display
/// was notched — so `sync` only re-frames and re-announces the notch on change.
static ASSIGNED: std::sync::Mutex<Vec<(u32, bool)>> = std::sync::Mutex::new(Vec::new());

/// Hot-apply `bar.enabled` from the config watcher (DECISIONS 2026-08-16):
/// on → build/show the windows; off → hide them.
/// Hide, never destroy: tearing the NSPanel subclass down mid-run-loop threw
/// an ObjC exception that crossed into tao's run-loop observer and aborted the
/// whole process (crash report + JOURNAL 2026-08-16). Hidden panels idle — the
/// support threads skip invisible windows.
pub fn set_enabled(app: &AppHandle, on: bool) {
    ENABLED.store(on, std::sync::atomic::Ordering::Relaxed);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if on && handle.get_webview_window("bar-0").is_none() {
            if let Err(e) = init(&handle) {
                eprintln!("[launcharr bar] enable failed: {e:?}");
            }
            return;
        }
        sync(&handle);
    });
}

/// Create one bar per display and start the support threads. Called at setup
/// only when `bar.enabled`. Main thread.
pub fn init(app: &AppHandle) -> CmdResult<()> {
    ENABLED.store(true, std::sync::atomic::Ordering::Relaxed);
    sync(app);
    let up = (0..)
        .take_while(|i| app.get_webview_window(&format!("bar-{i}")).is_some())
        .count();
    if up == 0 {
        return Err(CmdError::Internal("no bar window came up".into()));
    }
    eprintln!("[launcharr bar] {up} bar(s) up");
    crate::bar_constrain::prevent_app_nap();
    if !THREADS_STARTED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        crate::bar_modules::start();
        crate::widgets::start(app.clone());
        watch(app.clone());
        watch_triggers(app.clone());
        watch_mouse(app.clone());
        push_loop(app.clone());
    }
    Ok(())
}

/// Reconcile bar windows to the displays: `bar-{i}` sits on the `i`-th screen
/// (main first — screens.rs order). Missing windows are built, every window is
/// re-framed if it drifted (display mode changes strand it off-screen, JOURNAL
/// 2026-08-16), the notch profile is re-announced when a window lands on a
/// different display, and windows beyond the screen count (a display went
/// away) are hidden — never destroyed. Main thread; a no-op when nothing moved.
fn sync(app: &AppHandle) {
    let enabled = ENABLED.load(std::sync::atomic::Ordering::Relaxed);
    let screens = crate::screens::all();
    for (i, screen) in screens.iter().enumerate() {
        let label = format!("bar-{i}");
        if app.get_webview_window(&label).is_none() {
            if !enabled {
                continue;
            }
            let notched = crate::screens::notched(screen.id);
            if let Err(e) = build(app, &label, notched) {
                eprintln!("[launcharr bar] {label} build failed: {e:?}");
                continue;
            }
            let mut assigned = ASSIGNED.lock().unwrap();
            if assigned.len() <= i {
                assigned.resize(i + 1, (0, false));
            }
            assigned[i] = (screen.id, notched);
        }
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        if !enabled {
            let _ = window.hide();
            continue;
        }
        frame(&window, i, screen);
        // Landed on a different display than last time → its notch profile
        // may differ; the page swaps layouts live.
        let notched = crate::screens::notched(screen.id);
        let mut assigned = ASSIGNED.lock().unwrap();
        if assigned.len() <= i {
            assigned.resize(i + 1, (0, false));
        }
        if assigned[i] != (screen.id, notched) {
            assigned[i] = (screen.id, notched);
            let _ = window.eval(format!(
                "window.__barNotched && window.__barNotched({notched})"
            ));
        }
        if !window.is_visible().unwrap_or(false) {
            let _ = window.show();
        }
    }
    // Surplus windows: their display went away.
    for i in screens.len().. {
        let Some(window) = app.get_webview_window(&format!("bar-{i}")) else {
            break;
        };
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            eprintln!("[launcharr bar] bar-{i} hidden: display gone");
        }
    }
}

/// Assert bar `index`'s frame on `screen` (logical points — no scale math, so
/// mixed-density displays frame correctly). Only touches the window if the
/// frame differs: the heartbeat runs this every few seconds.
fn frame(window: &tauri::WebviewWindow, index: usize, screen: &crate::screens::Screen) {
    let want_pos = tauri::LogicalPosition::new(screen.x, screen.y);
    let want_size = tauri::LogicalSize::new(screen.width, wanted_height(index));
    let scale = window.scale_factor().unwrap_or(screen.scale);
    let moved = window
        .outer_position()
        .map(|p| p.to_logical::<f64>(scale) != want_pos)
        .unwrap_or(true);
    let resized = window
        .outer_size()
        .map(|s| s.to_logical::<f64>(scale) != want_size)
        .unwrap_or(true);
    if moved || resized {
        let _ = window.set_size(want_size);
        let _ = window.set_position(want_pos);
    }
}

/// Build one bar window as a floating, non-activating NSPanel. The frame is
/// set afterwards by `frame` (from `sync`) — it must come after the panel
/// conversion anyway (JOURNAL 2026-08-15).
fn build(app: &AppHandle, label: &str, notched: bool) -> CmdResult<()> {
    // Which layout profile this display uses (bar.notchedModules). Injected
    // before page scripts run so the very first render picks correctly;
    // `__barNotched` updates it if the window later moves display.
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("bar.html".into()))
        .initialization_script(format!("window.__notched = {notched};"))
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
    panel.order_front_regardless();

    // Fresh handle: the pre-conversion one can point at the old NSWindow.
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| CmdError::Internal(format!("{label} missing post-conversion")))?;
    let _ = window.with_webview(|platform| {
        if !crate::bar_constrain::disable_occlusion_detection(platform.inner().cast()) {
            eprintln!("[launcharr bar] occlusion-detection override unavailable");
        }
        if !crate::bar_constrain::enable_hover_events(platform.inner().cast()) {
            eprintln!("[launcharr bar] hover tracking unavailable");
        }
    });
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
        // Toggled-off or display-less bars are hidden, not destroyed — skip them.
        if !window.is_visible().unwrap_or(false) {
            continue;
        }
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
        while let Ok(first) = rx.recv() {
            let mut events = vec![first];
            // Coalesce bursts, then push a fresh snapshot immediately.
            while let Ok(ev) = rx.recv_timeout(std::time::Duration::from_millis(30)) {
                events.push(ev);
            }
            // `widget.<id>` files ask that widget to tick now (docs/WIDGETS.md).
            for id in events
                .iter()
                .filter_map(|ev| ev.as_ref().ok())
                .flat_map(|ev| ev.paths.iter())
                .filter_map(|p| p.file_name().and_then(|n| n.to_str()))
                .filter_map(widget_trigger_id)
            {
                crate::widgets::poke(id);
            }
            push(&app);
        }
    });
}

/// `widget.<id>` → `<id>`; anything else is a plain bar poke.
fn widget_trigger_id(name: &str) -> Option<&str> {
    name.strip_prefix("widget.").filter(|id| !id.is_empty())
}

/// Displays come and go (dock/undock) and mode changes strand the bar at stale
/// coordinates — observed 2026-08-16 at y=-111, invisibly off-screen. There is
/// no clean cross-platform "screens changed" event in Tauri, so reconcile
/// windows to screens on a heartbeat; `sync` is a no-op when nothing moved.
fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(5));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || sync(&handle));
    });
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
    /// The user's charge limit, when set (battery.rs) — the strip's "adjusted charge".
    pub charge_limit: Option<u8>,
    pub wifi: crate::bar_modules::WifiState,
    pub agents: Vec<crate::agents::AgentSession>,
    /// Keep-awake session state (power.rs) — cheap in-memory read.
    pub awake: crate::power::AwakeState,
    /// User widgets (widgets.rs) — last view per widget, in-memory read.
    pub widgets: Vec<crate::widgets::WidgetState>,
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
    let (battery_pct, on_ac, charging) = crate::battery::cached();
    BarSnapshot {
        workspaces,
        focused,
        front_app: front_app(),
        battery_pct,
        on_ac,
        charging,
        charge_limit: crate::battery::charge_limit(),
        wifi: crate::bar_modules::wifi(),
        agents: crate::agents::list(),
        awake: crate::power::state(),
        widgets: crate::widgets::snapshot(),
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

/// The aerospace CLI, wherever Homebrew put it (one locator for the bar and the
/// desktop layer: deps.rs).
pub(crate) fn aerospace(args: &[&str]) -> Option<String> {
    let bin = crate::deps::locate(crate::deps::Dep::Aerospace.binary())?;
    let out = Command::new(bin).args(args).output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

fn parse_lines(out: &str) -> Vec<String> {
    out.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

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
