//! Notch detection per display: `NSScreen.safeAreaInsets` (macOS 12+) reports
//! a non-zero top inset on a notched built-in panel and zero everywhere else —
//! including when "Scale to fit below built-in camera" letterboxes the notch
//! away, which is exactly the answer the bar wants. Main-thread only
//! (NSScreen.screens is AppKit state); callers run inside run_on_main_thread.

use objc2_app_kit::NSScreen;
use objc2_foundation::MainThreadMarker;

/// Does the `index`-th screen carry a notch? Index matches
/// `available_monitors()` — tao derives its monitor list from the same
/// NSScreen array, so the orders agree. Off-main-thread or missing screen →
/// false (treat as notchless).
pub fn screen_has_notch(index: usize) -> bool {
    let Some(mtm) = MainThreadMarker::new() else {
        return false;
    };
    NSScreen::screens(mtm)
        .iter()
        .nth(index)
        .map(|screen| screen.safeAreaInsets().top > 1.0)
        .unwrap_or(false)
}
