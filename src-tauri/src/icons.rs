use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Emitter, Manager};

use crate::indexer::{IndexItem, ItemKind};

/// Cache filename for an app's icon: content-addressed by bundle path + mtime, so an app
/// update naturally invalidates its icon (PRD keys by bundle id + version; path+mtime is the
/// same property with less plist parsing).
fn cache_name(app_path: &str) -> Option<String> {
    let mtime = fs::metadata(app_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())?;
    let mut hasher = DefaultHasher::new();
    app_path.hash(&mut hasher);
    mtime.hash(&mut hasher);
    Some(format!("{:016x}.png", hasher.finish()))
}

pub fn icon_path(icon_dir: &Path, app_path: &str) -> Option<PathBuf> {
    cache_name(app_path).map(|n| icon_dir.join(n))
}

/// Fill `icon` for items whose cached PNG already exists on disk.
pub fn annotate_cached(items: &mut [IndexItem], icon_dir: &Path) {
    for item in items.iter_mut() {
        if item.kind == ItemKind::App {
            if let Some(p) = icon_path(icon_dir, &item.path) {
                // Zero-byte files are failed-extraction markers, not icons.
                if fs::metadata(&p).map(|m| m.len() > 0).unwrap_or(false) {
                    item.icon = Some(p.to_string_lossy().into_owned());
                }
            }
        }
    }
}

/// Extract any missing icons, then re-annotate state and notify. The actual extraction runs
/// in a throwaway child process (`launcharr --extract-icons <dir>`): AppKit's icon machinery
/// retains ~30MB of rasterized data per icon and no amount of autoreleasepool/recache gives
/// it back — exiting the process is the only reliable release (see JOURNAL 2026-08-08).
pub fn extract_missing(app: AppHandle) {
    std::thread::spawn(move || {
        let state = app.state::<crate::AppState>();
        let icon_dir = state.icon_dir.clone();
        let _ = fs::create_dir_all(&icon_dir);

        let missing = {
            let index = state.index.read().unwrap();
            index
                .iter()
                .filter(|i| i.kind == ItemKind::App && i.icon.is_none())
                // Failed-extraction markers exist on disk; only truly-unattempted apps count.
                .filter(|i| icon_path(&icon_dir, &i.path).is_none_or(|p| !p.exists()))
                .count()
        };
        if missing == 0 {
            return;
        }

        let Ok(exe) = std::env::current_exe() else {
            return;
        };
        let ok = std::process::Command::new(exe)
            .arg("--extract-icons")
            .arg(&icon_dir)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            eprintln!("[launcharr] icon extraction subprocess failed");
        }

        let mut index = state.index.write().unwrap();
        annotate_cached(&mut index, &icon_dir);
        drop(index);
        let _ = app.emit("icons-updated", ());
    });
}

/// Entry point for the `--extract-icons <dir>` child process: extract every missing app
/// icon into the cache directory, then exit (taking AppKit's icon caches with it).
pub fn extract_cli(icon_dir: &Path) {
    let _ = fs::create_dir_all(icon_dir);
    for item in crate::indexer::scan(&[]) {
        if item.kind != ItemKind::App {
            continue;
        }
        if let Some(dest) = icon_path(icon_dir, &item.path) {
            if !dest.exists() && !extract_icon(&item.path, &dest) {
                // Zero-byte marker: don't retry this app version on every index refresh.
                let _ = fs::write(&dest, []);
            }
        }
    }
}

const ICON_SIZE: u32 = 128;

/// NSWorkspace icon → downscaled PNG on disk. Returns false (and stays quiet) on any
/// failure — a missing icon is cosmetic.
fn extract_icon(app_path: &str, dest: &Path) -> bool {
    let Some(png) = native_icon_png(app_path) else {
        return false;
    };
    // AppKit hands back the full-size raster (often 1024²); downscale before caching so the
    // cache stays ~10KB/app and the results list never touches megapixel images.
    let Ok(decoded) = image::load_from_memory(&png) else {
        return false;
    };
    let small = decoded.thumbnail(ICON_SIZE, ICON_SIZE);
    small
        .save_with_format(dest, image::ImageFormat::Png)
        .is_ok()
}

/// Rasterize the app's icon via NSWorkspace, returning PNG bytes at native resolution.
fn native_icon_png(app_path: &str) -> Option<Vec<u8>> {
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
    use objc2_foundation::NSString;

    // The pool is load-bearing: without it, hundreds of autoreleased NSImages/TIFF buffers
    // pile up on this background thread and RSS climbs into the gigabytes.
    objc2::rc::autoreleasepool(|_| {
        // SAFETY: NSWorkspace.iconForFile and NSImage reps are read-only AppKit calls that
        // are safe off the main thread in practice (this is how every launcher does it).
        // All objc2 calls below are memory-safe wrappers; the unsafe blocks are FFI-required.
        unsafe {
            let workspace = NSWorkspace::sharedWorkspace();
            let image = workspace.iconForFile(&NSString::from_str(app_path));
            // TIFFRepresentation rasterizes whatever reps the icon carries (modern icons
            // often have no NSBitmapImageRep of their own).
            let tiff = image.TIFFRepresentation();
            // NSWorkspace keeps every icon NSImage in its shared cache; recache() drops the
            // rasterized bitmap data we just forced into it, or RSS grows ~20MB per icon.
            image.recache();
            let tiff = tiff?;
            let bitmap = NSBitmapImageRep::imageRepWithData(&tiff)?;
            let data = bitmap.representationUsingType_properties(
                NSBitmapImageFileType::PNG,
                &objc2_foundation::NSDictionary::new(),
            )?;
            Some(data.to_vec())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rss_mb() -> f64 {
        let out = std::process::Command::new("ps")
            .args(["-o", "rss=", "-p", &std::process::id().to_string()])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout)
            .trim()
            .parse::<f64>()
            .unwrap()
            / 1024.0
    }

    /// Stage probe (run with --ignored): does the objc side alone leak?
    #[test]
    #[ignore]
    fn bulk_native_png_only_probe() {
        let apps = crate::indexer::scan(&[]);
        let before = rss_mb();
        let mut n = 0;
        for app in apps.iter().filter(|a| a.kind == ItemKind::App) {
            if native_icon_png(&app.path).is_some() {
                n += 1;
            }
        }
        eprintln!("native png x{n}: RSS {before:.0} MB -> {:.0} MB", rss_mb());
    }

    /// Diagnostic (run with --ignored): documents WHY extraction runs in a subprocess.
    /// In-process bulk extraction leaks ~20–30MB per icon inside AppKit (autoreleasepool
    /// and NSImage.recache() both don't help). Expect multi-GB RSS here — that's the point.
    #[test]
    #[ignore]
    fn bulk_extraction_in_process_leaks_by_design_of_appkit() {
        let dir = std::env::temp_dir().join("launcharr-icon-bulk");
        let _ = fs::create_dir_all(&dir);
        let apps = crate::indexer::scan(&[]);
        let before = rss_mb();
        let mut n = 0;
        for app in apps.iter().filter(|a| a.kind == ItemKind::App) {
            let dest = dir.join(format!("{n}.png"));
            if extract_icon(&app.path, &dest) {
                n += 1;
            }
        }
        eprintln!(
            "extracted {n} icons in-process, RSS {before:.0} MB -> {:.0} MB",
            rss_mb()
        );
    }

    #[test]
    fn extracts_a_real_app_icon_as_png() {
        let dir = std::env::temp_dir().join("launcharr-icon-test");
        let _ = fs::create_dir_all(&dir);
        let dest = dir.join("calculator.png");
        let _ = fs::remove_file(&dest);
        assert!(extract_icon("/System/Applications/Calculator.app", &dest));
        let bytes = fs::read(&dest).unwrap();
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    }
}
