//! `colorpicker` (Notion "Color Picker", 2026-08-17): Apple's own `NSColorSampler`
//! loupe — the magnifier that follows the cursor, click samples, Esc cancels. It runs
//! out-of-process on Apple's side, so it needs **no** Screen Recording or any other
//! grant (invariant 1) and costs launcharr nothing while idle (no window, no capture
//! code). The pick lands on the pasteboard as `#RRGGBB` (sRGB) and the panel flashes
//! a confirmation; a cancelled pick copies nothing.
//!
//! AppKit-only module (the AGENTS rule): the one `unsafe` block is the block callback,
//! kept here and out of the command handler.

use block2::RcBlock;
use objc2_app_kit::{NSColor, NSColorSampler, NSColorSpace};
use tauri::AppHandle;

/// Open the sampler on the main thread; the selection handler copies + flashes.
pub fn pick(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let sampler = NSColorSampler::new();
        let done = handle.clone();
        // The block owns a clone of the app handle; AppKit retains the sampler
        // (and therefore the block) until the session ends, so dropping `sampler`
        // at the end of this closure is fine per Apple's docs.
        let block = RcBlock::new(move |color: *mut NSColor| {
            if color.is_null() {
                return; // Esc / cancelled: nothing touches the pasteboard.
            }
            // SAFETY: AppKit hands a live NSColor for the duration of the callback;
            // we only read it and never retain the raw pointer past this scope.
            let hex = unsafe { hex_of(&*color) };
            if let Some(hex) = hex {
                crate::clipboard::set_string(&hex);
                crate::panel::flash(&done, &format!("Copied {hex} to clipboard"));
            }
        });
        // SAFETY: called on the main thread (run_on_main_thread), block outlives the
        // call because AppKit retains it via the sampler.
        unsafe { sampler.showSamplerWithSelectionHandler(&block) };
    });
}

/// sRGB `#RRGGBB`, uppercase (the ticket's example). Colors the sampler returns are
/// display-space; converting to sRGB is what every design tool copies.
fn hex_of(color: &NSColor) -> Option<String> {
    let srgb = color.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())?;
    Some(hex_rgb(
        srgb.redComponent(),
        srgb.greenComponent(),
        srgb.blueComponent(),
    ))
}

/// Component floats → `#RRGGBB`. Clamped so an out-of-gamut sample can't wrap.
pub fn hex_rgb(r: f64, g: f64, b: f64) -> String {
    let ch = |c: f64| (c.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02X}{:02X}{:02X}", ch(r), ch(g), ch(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_is_uppercase_and_zero_padded() {
        assert_eq!(hex_rgb(1.0, 0.0, 0.0), "#FF0000");
        assert_eq!(hex_rgb(0.0, 0.0, 0.05), "#00000D");
        assert_eq!(hex_rgb(1.0, 0.42, 0.55), "#FF6B8C");
    }

    #[test]
    fn hex_clamps_out_of_gamut() {
        assert_eq!(hex_rgb(1.4, -0.2, 0.5), "#FF0080");
    }
}
