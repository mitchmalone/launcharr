//! App activation. launcharr is an Accessory app and the launcher panel is
//! non-activating, so when a regular window (settings) is created or re-shown
//! from the panel, launcharr is *not* the active app: tao orders the window
//! front within launcharr but whatever app was in front stays in front and the
//! window lands behind it (Mitch, 2026-08-19). Regular windows call this after
//! ordering front.

use tauri::AppHandle;

/// Make launcharr the active app, from whatever thread; a no-op if the main
/// thread can't be reached.
pub fn bring_to_front(app: &AppHandle) {
    let _ = app.run_on_main_thread(activate_on_main);
}

fn activate_on_main() {
    use objc2_app_kit::NSApplication;
    use objc2_foundation::MainThreadMarker;
    // run_on_main_thread guarantees this; the marker is how objc2 proves it.
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let ns_app = NSApplication::sharedApplication(mtm);
    // `activate` (macOS 14+) is cooperative — it asks the front app to yield
    // and is refused from a background app, which is exactly our situation;
    // the deprecated form still works on 14/15 and is what tao itself uses.
    #[allow(deprecated)] // see above: the non-deprecated activate() is refused here
    ns_app.activateIgnoringOtherApps(true);
}
