//! AppKit/WebKit workarounds for the bar panel — all unsafe lives here.
//!
//! Defeats AppKit's menu-bar frame constraining for the bar panel class.
//!
//! Below MainMenu level (24), AppKit's `constrainFrameRect:toScreen:` refuses
//! to place a window inside the menu-bar reserve — the bar gets pushed to
//! y≈38 (observed 2026-08-16). Sketchybar's fix is a window subclass whose
//! `constrainFrameRect:` returns the rect unchanged; the tauri_panel! macro
//! can't express that override, so we install one onto the generated class via
//! the Objective-C runtime. All unsafe lives here, per the Rust rules.

use std::ffi::CStr;

use objc2::runtime::{AnyClass, AnyObject, Sel};
use objc2::sel;
use objc2_foundation::NSRect;

/// Replacement IMP: the proposed frame is always acceptable.
///
/// SAFETY: signature matches `-[NSWindow constrainFrameRect:toScreen:]`
/// (`NSRect` return, `NSRect` + nullable `NSScreen*` args); returning the
/// input rect is exactly what NSWindow does when no constraining applies.
unsafe extern "C-unwind" fn constrain_unchanged(
    _this: *mut AnyObject,
    _cmd: Sel,
    rect: NSRect,
    _screen: *mut AnyObject,
) -> NSRect {
    rect
}

/// WKWebView pauses compositing when it believes its window is occluded, and
/// aerospace's window shuffling confuses that state for our all-spaces panel:
/// the DOM keeps updating while the pixels freeze until a click forces a
/// frame (proven 2026-08-16 via DOM probes). Turn occlusion detection off for
/// the bar's webview. Private WebKit selector, guarded — a WebKit change makes
/// this a no-op, not a crash.
pub fn disable_occlusion_detection(webview: *mut AnyObject) -> bool {
    if webview.is_null() {
        return false;
    }
    let sel = sel!(_setWindowOcclusionDetectionEnabled:);
    // SAFETY: pointer comes from tauri's PlatformWebview (a live WKWebView);
    // respondsToSelector is checked before the private call.
    unsafe {
        let responds: bool = objc2::msg_send![&*webview, respondsToSelector: sel];
        if !responds {
            return false;
        }
        let _: () = objc2::msg_send![&*webview, _setWindowOcclusionDetectionEnabled: false];
    }
    true
}

/// Hover (mouseenter/leave/move) never reaches the bar's DOM: WKWebView's own
/// tracking area is active-in-active-app, and an accessory app is only active
/// after a click — so "hover" degraded to a click action and the mouseleave
/// that closes the agent dropdown never arrived (found 2026-08-16). Attach an
/// always-active tracking area owned by the webview so AppKit feeds it
/// enter/exit/move regardless of activation, and let the window pass
/// mouse-moved events along.
pub fn enable_hover_events(webview: *mut AnyObject) -> bool {
    if webview.is_null() {
        return false;
    }
    let Some(area_class) = AnyClass::get(c"NSTrackingArea") else {
        return false;
    };
    // NSTrackingArea options: MouseEnteredAndExited | MouseMoved |
    // ActiveAlways | InVisibleRect (values from NSTrackingArea.h).
    const OPTIONS: usize = 0x01 | 0x02 | 0x80 | 0x200;
    // SAFETY: pointer comes from tauri's PlatformWebview (a live WKWebView).
    // alloc+init returns +1; addTrackingArea: retains, so the release balances
    // our alloc and the view owns the area. InVisibleRect ignores the rect
    // argument and tracks the view's whole visible bounds.
    unsafe {
        let window: *mut AnyObject = objc2::msg_send![&*webview, window];
        if !window.is_null() {
            let _: () = objc2::msg_send![&*window, setAcceptsMouseMovedEvents: true];
        }
        let area: *mut AnyObject = objc2::msg_send![area_class, alloc];
        let area: *mut AnyObject = objc2::msg_send![
            area,
            initWithRect: NSRect::ZERO,
            options: OPTIONS,
            owner: &*webview,
            userInfo: std::ptr::null_mut::<AnyObject>()
        ];
        if area.is_null() {
            return false;
        }
        let _: () = objc2::msg_send![&*webview, addTrackingArea: &*area];
        let _: () = objc2::msg_send![&*area, release];
    }
    true
}

/// Global cursor position in screen points, origin at the primary screen's
/// bottom-left. `+[NSEvent mouseLocation]` is a permission-free global read
/// (unlike event *taps*, which need Accessibility) and safe off-main.
pub fn mouse_location() -> Option<(f64, f64)> {
    let cls = AnyClass::get(c"NSEvent")?;
    // SAFETY: class method with no args returning NSPoint; matches AppKit's
    // declared signature.
    let p: objc2_foundation::NSPoint = unsafe { objc2::msg_send![cls, mouseLocation] };
    Some((p.x, p.y))
}

/// App Nap can throttle frame delivery for a background accessory app. Take a
/// user-initiated activity assertion (allowing idle system sleep) for the
/// app's lifetime while the bar exists.
pub fn prevent_app_nap() {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
    let info = NSProcessInfo::processInfo();
    let reason = NSString::from_str("launcharr bar renders continuously");
    let token = info.beginActivityWithOptions_reason(
        NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
        &reason,
    );
    // Held for the process lifetime — the bar never stops.
    std::mem::forget(token);
}

/// Install the override on `class_name` (idempotent — replace, not add).
/// Returns false if the class isn't registered yet; call after the first
/// panel of that class exists.
pub fn install(class_name: &CStr) -> bool {
    let Some(class) = AnyClass::get(class_name) else {
        return false;
    };
    let sel = sel!(constrainFrameRect:toScreen:);
    // SAFETY: the encoding comes from the real superclass method, so the
    // replacement IMP (matching signature, above) is ABI-compatible. Replacing
    // an instance method on our own generated class affects only bar panels.
    unsafe {
        let super_method = objc2::ffi::class_getInstanceMethod(class, sel);
        if super_method.is_null() {
            return false;
        }
        let types = objc2::ffi::method_getTypeEncoding(super_method);
        objc2::ffi::class_replaceMethod(
            (class as *const AnyClass).cast_mut(),
            sel,
            std::mem::transmute::<
                unsafe extern "C-unwind" fn(*mut AnyObject, Sel, NSRect, *mut AnyObject) -> NSRect,
                unsafe extern "C-unwind" fn(),
            >(constrain_unchanged),
            types,
        );
    }
    true
}
