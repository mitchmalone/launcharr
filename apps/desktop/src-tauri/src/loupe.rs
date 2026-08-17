//! The launcharr loupe (colorpicker feedback, 2026-08-17: "try a zoom of 2"). Apple's
//! `NSColorSampler` magnifies more than Mitch wants and offers no knob, so this is our
//! own: a transparent, non-activating key panel over the mouse's screen; the webview
//! (`src/loupe/`) draws the magnifier and asks Rust for the pixels around the cursor.
//!
//! Capturing pixels needs **Screen Recording** — the one permission the picker may
//! ask for (invariant 1 amended, DECISIONS 2026-08-17). Not granted → we request it
//! once and fall back to the system sampler for that pick.
//!
//! FFI: CoreGraphics window-list capture + a bitmap context, hand-declared like
//! coreaudio.rs (no crate for a handful of functions). All `unsafe` stays in here.
//! Coordinates: everything is AppKit/CG *points* with the top-left origin of the main
//! display — Tauri's logical positions on macOS use the same space.

use std::ffi::c_void;

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

use crate::error::{CmdError, CmdResult};

pub const LABEL: &str = "loupe";

tauri_panel! {
    panel!(LoupePanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })

    panel_event!(LoupePanelEvents {
        window_did_resign_key(notification: &NSNotification) -> ()
    })
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct CGSize {
    width: f64,
    height: f64,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

type CGImageRef = *mut c_void;
type CGContextRef = *mut c_void;
type CGColorSpaceRef = *mut c_void;

const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_BELOW_WINDOW: u32 = 1 << 2;
const K_CG_WINDOW_IMAGE_BEST_RESOLUTION: u32 = 1 << 3;
/// kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big → RGBA bytes.
const K_CG_BITMAP_RGBA8: u32 = 1 | (4 << 12);

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
    fn CGWindowListCreateImage(
        screen_bounds: CGRect,
        list_option: u32,
        window_id: u32,
        image_option: u32,
    ) -> CGImageRef;
    fn CGImageGetWidth(image: CGImageRef) -> usize;
    fn CGImageGetHeight(image: CGImageRef) -> usize;
    fn CGImageRelease(image: CGImageRef);
    fn CGColorSpaceCreateDeviceRGB() -> CGColorSpaceRef;
    fn CGColorSpaceRelease(space: CGColorSpaceRef);
    fn CGBitmapContextCreate(
        data: *mut c_void,
        width: usize,
        height: usize,
        bits_per_component: usize,
        bytes_per_row: usize,
        space: CGColorSpaceRef,
        bitmap_info: u32,
    ) -> CGContextRef;
    fn CGContextDrawImage(ctx: CGContextRef, rect: CGRect, image: CGImageRef);
    fn CGContextRelease(ctx: CGContextRef);
}

/// Screen Recording granted to launcharr?
pub fn capture_allowed() -> bool {
    // SAFETY: plain C call, no arguments.
    unsafe { CGPreflightScreenCaptureAccess() }
}

/// Ask macOS to prompt (once per app; later calls are no-ops until the user acts).
pub fn request_capture() -> bool {
    // SAFETY: plain C call.
    unsafe { CGRequestScreenCaptureAccess() }
}

/// The screen the loupe covers, remembered per show so `capture` (any thread) can
/// translate webview coordinates into CG global points.
#[derive(Clone, Copy)]
struct Shown {
    /// Top-left of the covered screen, CG global points.
    origin: (f64, f64),
    /// NSWindow number of the loupe panel — capture excludes it and everything above.
    window_number: u32,
}

static SHOWN: std::sync::Mutex<Option<Shown>> = std::sync::Mutex::new(None);

/// (x, y, width, height) of a screen in CG points, top-left origin.
type ScreenFrame = (f64, f64, f64, f64);

/// Mouse position + the frame of the screen under it, both as CG points (top-left
/// origin). AppKit gives bottom-left; the main screen's height flips it.
fn mouse_screen(mtm: MainThreadMarker) -> Option<((f64, f64), ScreenFrame)> {
    let mouse = NSEvent::mouseLocation();
    let screens = objc2_app_kit::NSScreen::screens(mtm);
    let main_h = screens.iter().next()?.frame().size.height;
    let screen = screens.iter().find(|s| {
        let f = s.frame();
        mouse.x >= f.origin.x
            && mouse.x < f.origin.x + f.size.width
            && mouse.y >= f.origin.y
            && mouse.y < f.origin.y + f.size.height
    })?;
    let f = screen.frame();
    let top = main_h - (f.origin.y + f.size.height);
    Some((
        (mouse.x, main_h - mouse.y),
        (f.origin.x, top, f.size.width, f.size.height),
    ))
}

/// Show the loupe over the mouse's screen. Builds the window on first use, then
/// hides/reuses (destroying nspanel-converted windows aborts — JOURNAL 2026-08-16).
/// Main thread only (NSScreen/NSEvent).
pub fn show(app: &AppHandle, zoom: u32) -> CmdResult<()> {
    let mtm = MainThreadMarker::new()
        .ok_or_else(|| CmdError::Internal("loupe::show off the main thread".into()))?;
    let ((mx, my), (sx, sy, sw, sh)) =
        mouse_screen(mtm).ok_or_else(|| CmdError::Internal("no screen under the mouse".into()))?;

    if app.get_webview_window(LABEL).is_none() {
        let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("loupe.html".into()))
            .decorations(false)
            .transparent(true)
            .resizable(false)
            .shadow(false)
            .skip_taskbar(true)
            .accept_first_mouse(true)
            .visible(false)
            .build()
            .map_err(|e| CmdError::Internal(format!("loupe window: {e}")))?;
        let panel = window
            .to_panel::<LoupePanel>()
            .map_err(|e| CmdError::Internal(format!("loupe to_panel: {e}")))?;
        panel.set_level(PanelLevel::ScreenSaver.value());
        panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
        panel.set_collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .full_screen_auxiliary()
                .stationary()
                .into(),
        );
        panel.set_hides_on_deactivate(false);
        // Losing key = the user clicked elsewhere or switched apps: cancel.
        let events = LoupePanelEvents::new();
        let handle = app.clone();
        events.window_did_resign_key(move |_n| {
            if let Ok(p) = handle.get_webview_panel(LABEL) {
                if p.is_visible() {
                    p.hide();
                }
            }
        });
        panel.set_event_handler(Some(events.as_ref()));
        // NSWindow delegates are weak; keep the handler alive for the process.
        std::mem::forget(events);
    }

    let window = app
        .get_webview_window(LABEL)
        .ok_or_else(|| CmdError::Internal("loupe window missing".into()))?;
    window.set_size(LogicalSize::new(sw, sh))?;
    window.set_position(LogicalPosition::new(sx, sy))?;

    let ns_window = window.ns_window()?;
    // SAFETY: a live NSWindow for the lifetime of `window`; windowNumber is a plain
    // integer getter.
    let window_number: isize =
        unsafe { objc2::msg_send![ns_window as *mut objc2::runtime::AnyObject, windowNumber] };
    *SHOWN.lock().unwrap() = Some(Shown {
        origin: (sx, sy),
        window_number: window_number.max(0) as u32,
    });

    // Where the mouse is in the webview's coordinates (so the loupe draws before
    // the first mousemove) plus the configured zoom.
    let _ = window.emit("loupe-open", (mx - sx, my - sy, zoom.clamp(2, 8)));

    let panel = app
        .get_webview_panel(LABEL)
        .map_err(|e| CmdError::Internal(format!("loupe panel: {e:?}")))?;
    panel.show_and_make_key();
    Ok(())
}

pub fn hide(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(LABEL) {
        panel.hide();
    }
}

/// Pixels in a `size`×`size` point square centred on (`x`, `y`) — the webview's
/// coordinates on the loupe window. Returns `[w u32 LE][h u32 LE][RGBA…]` at native
/// resolution (retina → 2× the points), captured *below* the loupe window so the
/// magnifier never sees itself.
pub fn capture(x: f64, y: f64, size: f64) -> CmdResult<Vec<u8>> {
    let shown = SHOWN
        .lock()
        .unwrap()
        .ok_or_else(|| CmdError::Internal("loupe not shown".into()))?;
    let half = size / 2.0;
    let rect = CGRect {
        origin: CGPoint {
            x: shown.origin.0 + x - half,
            y: shown.origin.1 + y - half,
        },
        size: CGSize {
            width: size,
            height: size,
        },
    };

    // SAFETY: CG calls with valid arguments; every created object is released below;
    // the bitmap context writes exactly w*h*4 bytes into `out` after the 8-byte header.
    unsafe {
        let image = CGWindowListCreateImage(
            rect,
            K_CG_WINDOW_LIST_OPTION_ON_SCREEN_BELOW_WINDOW,
            shown.window_number,
            K_CG_WINDOW_IMAGE_BEST_RESOLUTION,
        );
        if image.is_null() {
            return Err(CmdError::Internal("screen capture returned nothing".into()));
        }
        let w = CGImageGetWidth(image);
        let h = CGImageGetHeight(image);
        if w == 0 || h == 0 {
            CGImageRelease(image);
            return Err(CmdError::Internal("empty capture".into()));
        }
        let mut out = vec![0u8; 8 + w * h * 4];
        out[0..4].copy_from_slice(&(w as u32).to_le_bytes());
        out[4..8].copy_from_slice(&(h as u32).to_le_bytes());
        let space = CGColorSpaceCreateDeviceRGB();
        let ctx = CGBitmapContextCreate(
            out.as_mut_ptr().add(8).cast(),
            w,
            h,
            8,
            w * 4,
            space,
            K_CG_BITMAP_RGBA8,
        );
        if !ctx.is_null() {
            CGContextDrawImage(
                ctx,
                CGRect {
                    origin: CGPoint { x: 0.0, y: 0.0 },
                    size: CGSize {
                        width: w as f64,
                        height: h as f64,
                    },
                },
                image,
            );
            CGContextRelease(ctx);
        }
        CGColorSpaceRelease(space);
        CGImageRelease(image);
        if ctx.is_null() {
            return Err(CmdError::Internal("bitmap context failed".into()));
        }
        Ok(out)
    }
}
