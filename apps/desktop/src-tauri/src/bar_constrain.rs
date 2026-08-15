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
