//! Screenshots panel, the OS half (plans/done/screenshots-panel.md): list the
//! capture folder newest-first, thumbnail on demand into a file cache the asset
//! protocol serves, and put a chosen file on the pasteboard so ⌘V pastes it into
//! an agent surface. Everything with opinion (paging, filtering, layout) is TS.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::error::{CmdError, CmdResult};

/// Mirrors `Screenshot` in `apps/desktop/src/lib/screenshots.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Screenshot {
    pub path: String,
    pub name: String,
    pub mtime_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScreenshotAction {
    Copy,
    Open,
}

/// Listing cap: enough to scroll back a long way, small enough that the IPC
/// payload stays trivial (~100 B per item).
const MAX_LISTED: usize = 2000;
const THUMB_WIDTH: u32 = 320;
const IMAGE_EXTS: [&str; 4] = ["png", "jpg", "jpeg", "gif"];

/// `defaults read com.apple.screencapture location`, else `~/Desktop`. Resolved
/// once: changing it is rare and takes effect on relaunch.
pub fn dir() -> PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
        Command::new("defaults")
            .args(["read", "com.apple.screencapture", "location"])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| expand_home(s.trim(), &home))
            .filter(|p| p.is_dir())
            .unwrap_or_else(|| home.join("Desktop"))
    })
    .clone()
}

fn expand_home(raw: &str, home: &Path) -> PathBuf {
    match raw.strip_prefix("~") {
        Some(rest) => home.join(rest.trim_start_matches('/')),
        None => PathBuf::from(raw),
    }
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Every image in the folder, newest first (by mtime), capped at MAX_LISTED.
pub fn list(dir: &Path) -> std::io::Result<Vec<Screenshot>> {
    let mut shots: Vec<Screenshot> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            if !is_image(&path) {
                return None;
            }
            let meta = e.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            let mtime_ms = meta
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            Some(Screenshot {
                name: path.file_name()?.to_string_lossy().into_owned(),
                path: path.to_string_lossy().into_owned(),
                mtime_ms,
            })
        })
        .collect();
    shots.sort_by(|a, b| {
        b.mtime_ms
            .cmp(&a.mtime_ms)
            .then_with(|| b.name.cmp(&a.name))
    });
    shots.truncate(MAX_LISTED);
    Ok(shots)
}

fn thumb_name(path: &str, mtime_ms: u64) -> String {
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    mtime_ms.hash(&mut h);
    format!("{:016x}.jpg", h.finish())
}

/// Path of the cached thumbnail for `path`, generating it if missing. Decodes
/// are serialised: a cold first page of Retina PNGs must never spike memory.
pub fn thumb(thumb_dir: &Path, path: &str) -> CmdResult<PathBuf> {
    static GATE: Mutex<()> = Mutex::new(());
    let meta = std::fs::metadata(path)?;
    let mtime_ms = meta
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let dest = thumb_dir.join(thumb_name(path, mtime_ms));
    if dest.is_file() {
        return Ok(dest);
    }
    // A poisoned gate only means another decode panicked; the lock itself is fine.
    let _gate = GATE.lock().unwrap_or_else(|e| e.into_inner());
    if dest.is_file() {
        return Ok(dest);
    }
    std::fs::create_dir_all(thumb_dir)?;
    let img = image::open(path).map_err(|e| CmdError::Internal(e.to_string()))?;
    let scaled = img.thumbnail(THUMB_WIDTH, THUMB_WIDTH * 2);
    // Write to a temp name then rename so a half-written file is never served.
    let tmp = dest.with_extension("jpg.part");
    scaled
        .to_rgb8()
        .save_with_format(&tmp, image::ImageFormat::Jpeg)
        .map_err(|e| CmdError::Internal(e.to_string()))?;
    std::fs::rename(&tmp, &dest)?;
    Ok(dest)
}

/// Put the file on the general pasteboard two ways — file URL and the raw image
/// bytes — so Finder/Slack (file targets) and browsers/terminals (image
/// targets) all paste something sensible.
pub fn copy_to_pasteboard(path: &str) -> CmdResult<()> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeFileURL, NSPasteboardTypePNG};
    use objc2_foundation::{NSArray, NSData, NSString};

    let bytes = std::fs::read(path)?;
    let is_png = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("png"))
        .unwrap_or(false);
    let url = format!("file://{}", percent_encode_path(path));
    // SAFETY: plain AppKit pasteboard writes on the general pasteboard; every
    // argument is an owned Foundation object of the type the method expects.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        let png_type: &NSString = NSPasteboardTypePNG;
        let jpeg_type = NSString::from_str("public.jpeg");
        let image_type: &NSString = if is_png { png_type } else { &jpeg_type };
        let types = NSArray::from_slice(&[NSPasteboardTypeFileURL, image_type]);
        pb.declareTypes_owner(&types, None);
        pb.setString_forType(&NSString::from_str(&url), NSPasteboardTypeFileURL);
        pb.setData_forType(Some(&NSData::from_vec(bytes)), image_type);
    }
    Ok(())
}

/// Minimal RFC 3986 path escaping for `file://` URLs (spaces are the common case).
fn percent_encode_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for b in path.bytes() {
        let keep = b.is_ascii_alphanumeric() || b"-._~/".contains(&b);
        if keep {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn open(path: &str) -> CmdResult<()> {
    Command::new("open").arg(path).spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_tilde() {
        let home = Path::new("/Users/x");
        assert_eq!(
            expand_home("~/Shots", home),
            PathBuf::from("/Users/x/Shots")
        );
        assert_eq!(expand_home("~", home), PathBuf::from("/Users/x"));
        assert_eq!(expand_home("/tmp/s", home), PathBuf::from("/tmp/s"));
    }

    #[test]
    fn lists_images_newest_first() {
        let dir = std::env::temp_dir().join(format!("launcharr-shots-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for (name, secs) in [
            ("old.png", 1),
            ("new.PNG", 3),
            ("mid.jpg", 2),
            ("note.txt", 4),
        ] {
            let p = dir.join(name);
            std::fs::write(&p, b"x").unwrap();
            let t = std::fs::FileTimes::new()
                .set_modified(UNIX_EPOCH + std::time::Duration::from_secs(secs));
            std::fs::File::options()
                .write(true)
                .open(&p)
                .unwrap()
                .set_times(t)
                .unwrap();
        }
        let names: Vec<String> = list(&dir).unwrap().into_iter().map(|s| s.name).collect();
        assert_eq!(names, ["new.PNG", "mid.jpg", "old.png"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn thumbnails_are_cached_by_path_and_mtime() {
        let dir = std::env::temp_dir().join(format!("launcharr-thumbs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let src = dir.join("src.png");
        std::fs::create_dir_all(&dir).unwrap();
        image::RgbImage::from_pixel(1200, 800, image::Rgb([200, 40, 90]))
            .save(&src)
            .unwrap();
        let a = thumb(&dir, src.to_str().unwrap()).unwrap();
        let b = thumb(&dir, src.to_str().unwrap()).unwrap();
        assert_eq!(a, b);
        let t = image::open(&a).unwrap();
        assert_eq!((t.width(), t.height()), (320, 213));
        assert_ne!(thumb_name("a", 1), thumb_name("a", 2));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn encodes_file_url_paths() {
        assert_eq!(
            percent_encode_path("/Users/m/Desktop/Screenshot 1 at 2.png"),
            "/Users/m/Desktop/Screenshot%201%20at%202.png"
        );
    }
}
