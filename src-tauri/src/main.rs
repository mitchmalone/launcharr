// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Icon extraction runs in a throwaway child process because AppKit's icon machinery
    // never releases rasterized icons (see src/icons.rs).
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--extract-icons") {
        if let Some(dir) = args.get(2) {
            launcharr_lib::extract_icons_cli(std::path::Path::new(dir));
        }
        return;
    }

    launcharr_lib::run()
}
