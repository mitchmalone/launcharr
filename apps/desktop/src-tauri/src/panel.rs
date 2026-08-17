use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

use crate::error::{CmdError, CmdResult};

pub const PANEL_WIDTH: f64 = 640.0;

tauri_panel! {
    panel!(LauncharrPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })

    panel_event!(LauncharrPanelEvents {
        window_did_resign_key(notification: &NSNotification) -> ()
    })
}

/// Convert the main window into the non-activating floating panel. The whole product hangs
/// on this dance: the panel takes key status (so typing lands in it) without ever activating
/// launcharr, so dismissing it hands focus straight back to whatever was frontmost.
pub fn init(app: &AppHandle) -> CmdResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| CmdError::Internal("main window missing".into()))?;

    let panel = window
        .to_panel::<LauncharrPanel>()
        .map_err(|e| CmdError::Internal(format!("to_panel failed: {e}")))?;

    panel.set_level(PanelLevel::Status.value());
    panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .full_screen_auxiliary()
            .can_join_all_spaces()
            .into(),
    );
    panel.set_hides_on_deactivate(false);

    // Click-outside dismiss: losing key status hides the panel.
    let events = LauncharrPanelEvents::new();
    let handle = app.clone();
    events.window_did_resign_key(move |_notification| {
        if let Ok(panel) = handle.get_webview_panel("main") {
            if panel.is_visible() {
                panel.hide();
                let _ = handle.emit("panel-hidden", ());
            }
        }
    });
    panel.set_event_handler(Some(events.as_ref()));
    // NSWindow delegates are weak references; the handler must outlive the panel.
    std::mem::forget(events);

    Ok(())
}

pub fn toggle(app: &AppHandle) {
    let Ok(panel) = app.get_webview_panel("main") else {
        return;
    };
    if panel.is_visible() {
        hide(app);
    } else {
        show(app);
    }
}

pub fn show(app: &AppHandle) {
    let started = std::time::Instant::now();
    let Ok(panel) = app.get_webview_panel("main") else {
        return;
    };
    position_on_mouse_screen(app);
    // Fresh prompt every summon (PRD §4.1): the frontend clears on this event.
    let _ = app.emit("panel-shown", ());
    panel.show_and_make_key();
    // §7 budget: hotkey → visible < 100ms. This measures the native side of that path.
    eprintln!(
        "[launcharr perf] summon {}µs",
        started.elapsed().as_micros()
    );
}

/// Flash a one-line confirmation ("Copied #FF6B8C to clipboard") without taking key
/// focus: the panel orders front on the mouse screen, the frontend renders the `toast`
/// row and hides itself on a short timer. Used after actions that finish while the
/// panel is already dismissed (the color sampler); a macOS notification would need a
/// granted permission (invariant 1), this needs none.
pub fn flash(app: &AppHandle, text: &str) {
    position_on_mouse_screen(app);
    let _ = app.emit("toast", text);
    // Give the webview a beat to swap the stale rows for the toast row before the
    // window orders front, so no old content flashes.
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(40));
        let inner = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Ok(panel) = inner.get_webview_panel("main") {
                panel.show();
            }
        });
    });
}

pub fn hide(app: &AppHandle) {
    let Ok(panel) = app.get_webview_panel("main") else {
        return;
    };
    panel.hide();
    let _ = app.emit("panel-hidden", ());
}

/// Horizontally centered, ~30% down, on the screen containing the mouse pointer (PRD §4.1).
fn position_on_mouse_screen(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|cursor| app.monitor_from_point(cursor.x, cursor.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let scale = monitor.scale_factor();
    let size = monitor.size();
    let pos = monitor.position();
    let panel_width_phys = (PANEL_WIDTH * scale) as i32;
    let x = pos.x + (size.width as i32 - panel_width_phys) / 2;
    let y = pos.y + (size.height as f64 * 0.30) as i32;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Resize keeping the top edge anchored (the panel grows downward as results appear).
pub fn resize(app: &AppHandle, height: f64) -> CmdResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| CmdError::Internal("main window missing".into()))?;
    let top_left = window.outer_position()?;
    window.set_size(tauri::LogicalSize::new(PANEL_WIDTH, height))?;
    window.set_position(top_left)?;
    Ok(())
}
