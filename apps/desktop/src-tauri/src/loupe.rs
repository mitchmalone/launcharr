//! The launcharr loupe (colorpicker feedback, 2026-08-17: "try a zoom of 2"). Apple's
//! `NSColorSampler` magnifies more than Mitch wants and offers no knob, so this is our
//! own: a transparent, non-activating key panel over the mouse's screen; the webview
//! (`src/loupe/`) draws the magnifier and asks Rust for the pixels around the cursor.
//!
//! Capturing pixels needs **Screen Recording** — the one permission the picker may
//! ask for (invariant 1 amended, DECISIONS 2026-08-17). Not granted → we request it
//! once and fall back to the system sampler for that pick.
//!
//! FFI: CoreGraphics display capture + a bitmap context, hand-declared like
//! coreaudio.rs (no crate for a handful of functions). All `unsafe` stays in here.
//! Capture is the display framebuffer (`CGDisplayCreateImageForRect`) — what is
//! actually on screen, every app — with the loupe window itself excluded via
//! `sharingType = NSWindowSharingNone` (the window-list capture skipped some apps,
//! Notion among them — Mitch, 2026-08-17).
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

/// kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big → RGBA bytes.
const K_CG_BITMAP_RGBA8: u32 = 1 | (4 << 12);

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> *mut c_void;
    fn CFRelease(cf: *const c_void);
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
    fn CGDisplayCreateImageForRect(display: u32, rect: CGRect) -> CGImageRef;
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

/// Log the on-screen windows whose owners opted out of screen capture
/// (`sharingType = None`, e.g. Electron `setContentProtection`) — those render black
/// in every capture, ours included, and the log line is the only way to know why.
fn log_protected_windows() {
    const ON_SCREEN_ONLY: u32 = 1 << 0;
    // SAFETY: CF/NS bridging of a CFArray of CFDictionaries; released after use.
    unsafe {
        let list = CGWindowListCopyWindowInfo(ON_SCREEN_ONLY, 0);
        if list.is_null() {
            return;
        }
        let array: &objc2_foundation::NSArray<objc2_foundation::NSDictionary> = &*(list as *const _);
        let mut protected: Vec<String> = Vec::new();
        let owner_key = objc2_foundation::NSString::from_str("kCGWindowOwnerName");
        let sharing_key = objc2_foundation::NSString::from_str("kCGWindowSharingState");
        let layer_key = objc2_foundation::NSString::from_str("kCGWindowLayer");
        for dict in array.iter() {
            let dict: &objc2_foundation::NSDictionary<objc2_foundation::NSString, objc2::runtime::AnyObject> = &*(&*dict as *const _ as *const _);
            let Some(sharing) = dict.objectForKey(&sharing_key) else { continue };
            let sharing: i64 = objc2::msg_send![&*sharing, longLongValue];
            let layer: i64 = dict
                .objectForKey(&layer_key)
                .map(|l| objc2::msg_send![&*l, longLongValue])
                .unwrap_or(0);
            if sharing == 0 && layer == 0 {
                if let Some(owner) = dict.objectForKey(&owner_key) {
                    let owner: &objc2_foundation::NSString = &*(&*owner as *const _ as *const _);
                    let name = owner.to_string();
                    if !protected.contains(&name) {
                        protected.push(name);
                    }
                }
            }
        }
        CFRelease(list);
        if !protected.is_empty() {
            eprintln!(
                "[launcharr loupe] windows that block screen capture (render black): {}",
                protected.join(", ")
            );
        }
    }
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
    /// CGDirectDisplayID of the covered screen; capture rects are display-local points.
    display: u32,
}

static SHOWN: std::sync::Mutex<Option<Shown>> = std::sync::Mutex::new(None);

/// (x, y, width, height) of a screen in CG points, top-left origin.
type ScreenFrame = (f64, f64, f64, f64);

/// Mouse position + the frame of the screen under it (CG points, top-left origin —
/// AppKit gives bottom-left; the main screen's height flips it) + its display id.
fn mouse_screen(mtm: MainThreadMarker) -> Option<((f64, f64), ScreenFrame, u32)> {
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
    let key = objc2_foundation::NSString::from_str("NSScreenNumber");
    let number = screen.deviceDescription().objectForKey(&key)?;
    // SAFETY: NSScreenNumber is documented as an NSNumber; unsignedIntValue is a plain getter.
    let display: u32 = unsafe { objc2::msg_send![&*number, unsignedIntValue] };
    Some((
        (mouse.x, main_h - mouse.y),
        (f.origin.x, top, f.size.width, f.size.height),
        display,
    ))
}

/// Show the loupe over the mouse's screen. Builds the window on first use, then
/// hides/reuses (destroying nspanel-converted windows aborts — JOURNAL 2026-08-16).
/// Main thread only (NSScreen/NSEvent).
pub fn show(app: &AppHandle, zoom: u32, size: u32) -> CmdResult<()> {
    let mtm = MainThreadMarker::new()
        .ok_or_else(|| CmdError::Internal("loupe::show off the main thread".into()))?;
    let ((mx, my), (sx, sy, sw, sh), display) =
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
    // SAFETY: a live NSWindow for the lifetime of `window`. NSWindowSharingNone (0)
    // keeps the loupe out of every screen capture, ours included — that's how the
    // magnifier avoids seeing itself.
    unsafe {
        let _: () = objc2::msg_send![ns_window as *mut objc2::runtime::AnyObject, setSharingType: 0usize];
    }
    *SHOWN.lock().unwrap() = Some(Shown { display });
    log_protected_windows();

    // Where the mouse is in the webview's coordinates (so the loupe draws before
    // the first mousemove) plus the configured zoom.
    let _ = window.emit(
        "loupe-open",
        (mx - sx, my - sy, zoom.clamp(2, 8), size.clamp(120, 600)),
    );

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
/// coordinates on the loupe window, which are also display-local points. Returns
/// `[w u32 LE][h u32 LE][RGBA…]` at native resolution (retina → 2× the points), from
/// the display framebuffer with the loupe window excluded (sharing type none).
pub fn capture(x: f64, y: f64, size: f64) -> CmdResult<Vec<u8>> {
    let shown = SHOWN
        .lock()
        .unwrap()
        .ok_or_else(|| CmdError::Internal("loupe not shown".into()))?;
    let half = size / 2.0;
    let rect = CGRect {
        origin: CGPoint {
            x: x - half,
            y: y - half,
        },
        size: CGSize {
            width: size,
            height: size,
        },
    };

    // SAFETY: CG calls with valid arguments; every created object is released below;
    // the bitmap context writes exactly w*h*4 bytes into `out` after the 8-byte header.
    unsafe {
        let image = CGDisplayCreateImageForRect(shown.display, rect);
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
