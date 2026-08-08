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
                if p.exists() {
                    item.icon = Some(p.to_string_lossy().into_owned());
                }
            }
        }
    }
}

/// Extract any missing icons in a background thread, then re-annotate state and notify.
pub fn extract_missing(app: AppHandle) {
    std::thread::spawn(move || {
        let state = app.state::<crate::AppState>();
        let icon_dir = state.icon_dir.clone();
        let _ = fs::create_dir_all(&icon_dir);

        let todo: Vec<(String, PathBuf)> = {
            let index = state.index.read().unwrap();
            index
                .iter()
                .filter(|i| i.kind == ItemKind::App && i.icon.is_none())
                .filter_map(|i| icon_path(&icon_dir, &i.path).map(|p| (i.path.clone(), p)))
                .filter(|(_, dest)| !dest.exists())
                .collect()
        };
        if todo.is_empty() {
            return;
        }

        let mut extracted = 0usize;
        for (app_path, dest) in &todo {
            if extract_icon(app_path, dest) {
                extracted += 1;
            }
        }

        if extracted > 0 {
            let mut index = state.index.write().unwrap();
            annotate_cached(&mut index, &icon_dir);
            drop(index);
            let _ = app.emit("icons-updated", ());
        }
    });
}

/// NSWorkspace icon → downscaled PNG on disk. Returns false (and stays quiet) on any
/// failure — a missing icon is cosmetic.
fn extract_icon(app_path: &str, dest: &Path) -> bool {
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
    use objc2_foundation::NSString;

    // SAFETY: NSWorkspace.iconForFile and NSImage reps are read-only AppKit calls that are
    // safe off the main thread in practice (this is how every launcher does it). All objc2
    // calls below are memory-safe wrappers; the unsafe blocks are FFI-required.
    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let image = workspace.iconForFile(&NSString::from_str(app_path));
        let reps = image.representations();

        // Prefer the smallest representation that is still >= 64px so cached files stay small.
        let mut best: Option<(isize, objc2::rc::Retained<NSBitmapImageRep>)> = None;
        for rep in reps.iter() {
            let Ok(bitmap) = rep.downcast::<NSBitmapImageRep>() else {
                continue;
            };
            let width = bitmap.pixelsWide();
            let better = match &best {
                None => true,
                Some((best_width, _)) => {
                    if *best_width < 64 {
                        width > *best_width
                    } else {
                        width >= 64 && width < *best_width
                    }
                }
            };
            if better {
                best = Some((width, bitmap));
            }
        }
        let Some((_, bitmap)) = best else {
            return false;
        };

        let Some(data) = bitmap.representationUsingType_properties(
            NSBitmapImageFileType::PNG,
            &objc2_foundation::NSDictionary::new(),
        ) else {
            return false;
        };
        fs::write(dest, data.to_vec()).is_ok()
    }
}
