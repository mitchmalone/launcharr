//! Display enumeration without Tauri's monitor API. `available_monitors()`
//! comes back empty in this accessory app and `monitor_from_point` compares a
//! mis-scaled cursor against point-space bounds (JOURNAL 2026-08-19), so both
//! the bar and the launcher ask CoreGraphics directly. Everything here is a
//! thread-safe CG read except [`notched`] (NSScreen, main thread only).
//!
//! Coordinates are CG global **points, top-left origin** — what tao's
//! `LogicalPosition`/`LogicalSize` take, so no per-display scale ever enters
//! the frame math. AppKit's bottom-left `mouseLocation` is flipped by the main
//! display's height, which is the origin of the CG global space.

use objc2::runtime::AnyClass;

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

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    /// Thread-safe display-list reads; no window server privileges needed.
    fn CGGetActiveDisplayList(max: u32, displays: *mut u32, count: *mut u32) -> i32;
    fn CGMainDisplayID() -> u32;
    fn CGDisplayBounds(display: u32) -> CGRect;
    fn CGDisplayPixelsWide(display: u32) -> usize;
}

/// One active display: `id` is its CGDirectDisplayID; the frame is CG points,
/// top-left origin; `scale` is the backing factor (2.0 on Retina).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Screen {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

impl Screen {
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }
}

fn screen(id: u32) -> Screen {
    // SAFETY: pure queries on a display id; an unknown id yields an empty
    // rect and zero width, both handled below.
    let (bounds, px) = unsafe { (CGDisplayBounds(id), CGDisplayPixelsWide(id)) };
    let scale = if bounds.size.width > 0.0 {
        px as f64 / bounds.size.width
    } else {
        1.0
    };
    Screen {
        id,
        x: bounds.origin.x,
        y: bounds.origin.y,
        width: bounds.size.width,
        height: bounds.size.height,
        scale,
    }
}

/// Every active display, main first, the rest ordered left-to-right then
/// top-to-bottom — a stable order for the bar's `bar-{i}` labels. Never
/// empty in practice; an enumeration failure returns the main display alone.
pub fn all() -> Vec<Screen> {
    let mut ids = [0u32; 16];
    let mut count: u32 = 0;
    // SAFETY: writes at most 16 ids into the buffer we own and sets `count`;
    // a non-zero return leaves count at 0.
    let err = unsafe { CGGetActiveDisplayList(16, ids.as_mut_ptr(), &mut count) };
    // SAFETY: plain getter.
    let main = unsafe { CGMainDisplayID() };
    if err != 0 || count == 0 {
        return vec![screen(main)];
    }
    let mut screens: Vec<Screen> = ids[..count as usize].iter().map(|&id| screen(id)).collect();
    screens.sort_by(|a, b| {
        (a.id != main)
            .cmp(&(b.id != main))
            .then(a.x.total_cmp(&b.x))
            .then(a.y.total_cmp(&b.y))
    });
    screens
}

/// The main display (the one with the menu bar / origin of the global space).
pub fn main() -> Screen {
    // SAFETY: plain getter.
    screen(unsafe { CGMainDisplayID() })
}

/// The mouse in CG global points (top-left origin). `+[NSEvent mouseLocation]`
/// is a permission-free global read (unlike event *taps*, which need
/// Accessibility) and safe off-main.
pub fn mouse() -> Option<(f64, f64)> {
    let cls = AnyClass::get(c"NSEvent")?;
    // SAFETY: class method with no args returning NSPoint; matches AppKit's
    // declared signature. Documented as callable from any thread.
    let p: objc2_foundation::NSPoint = unsafe { objc2::msg_send![cls, mouseLocation] };
    Some((p.x, main().height - p.y))
}

/// The display under the mouse and the mouse in that space, falling back to
/// the main display when the cursor is between screens.
pub fn under_mouse() -> (Screen, (f64, f64)) {
    let (mx, my) = mouse().unwrap_or((0.0, 0.0));
    let screen = all()
        .into_iter()
        .find(|s| s.contains(mx, my))
        .unwrap_or_else(main);
    (screen, (mx, my))
}

/// Does display `id` carry a notch? `NSScreen.safeAreaInsets` (macOS 12+)
/// reports a non-zero top inset on a notched built-in panel and zero
/// everywhere else — including when "Scale to fit below built-in camera"
/// letterboxes the notch away, which is exactly the answer the bar wants.
/// Main thread only (NSScreen.screens is AppKit state); elsewhere → false.
pub fn notched(id: u32) -> bool {
    use objc2_app_kit::NSScreen;
    use objc2_foundation::{MainThreadMarker, NSString};
    let Some(mtm) = MainThreadMarker::new() else {
        return false;
    };
    let key = NSString::from_str("NSScreenNumber");
    NSScreen::screens(mtm).iter().any(|s| {
        let Some(number) = s.deviceDescription().objectForKey(&key) else {
            return false;
        };
        // SAFETY: NSScreenNumber is documented as an NSNumber; unsignedIntValue is a plain getter.
        let display: u32 = unsafe { objc2::msg_send![&*number, unsignedIntValue] };
        display == id && s.safeAreaInsets().top > 1.0
    })
}
