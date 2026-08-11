use std::path::PathBuf;

/// Browser bookmarks — strictly opt-in (`indexBookmarks: true` in config; default off,
/// decided 2026-08-09). Local file reads only: Chrome-family JSON and Safari's plist.
/// Safari's file is TCC-protected on recent macOS; failure is silent by design.

#[derive(Debug, Clone, PartialEq)]
pub struct Bookmark {
    pub name: String,
    pub url: String,
}

const CAP: usize = 2000;

const CHROME_FAMILY: &[&str] = &[
    "Google/Chrome",
    "Arc/User Data",
    "BraveSoftware/Brave-Browser",
    "Microsoft Edge",
    "Chromium",
    "Vivaldi",
];

pub fn collect() -> Vec<Bookmark> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let mut out: Vec<Bookmark> = Vec::new();

    for family in CHROME_FAMILY {
        let base = home.join("Library/Application Support").join(family);
        for profile_dir in profile_dirs(&base) {
            let file = profile_dir.join("Bookmarks");
            if let Ok(raw) = std::fs::read_to_string(&file) {
                out.extend(parse_chrome_json(&raw));
            }
        }
    }

    if let Ok(bytes) = std::fs::read(home.join("Library/Safari/Bookmarks.plist")) {
        if let Ok(value) = plist::Value::from_reader(std::io::Cursor::new(bytes)) {
            collect_safari(&value, &mut out);
        }
    }

    // Dedupe by URL, keep first (bookmark bar order tends first), cap hard.
    let mut seen = std::collections::HashSet::new();
    out.retain(|b| !b.name.is_empty() && b.url.starts_with("http") && seen.insert(b.url.clone()));
    out.truncate(CAP);
    out
}

fn profile_dirs(base: &std::path::Path) -> Vec<PathBuf> {
    let mut dirs = vec![base.join("Default")];
    if let Ok(entries) = std::fs::read_dir(base) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("Profile ") {
                dirs.push(entry.path());
            }
        }
    }
    dirs
}

/// Chrome's Bookmarks file: `roots.{bookmark_bar,other,synced}` of nested folders. Pure.
pub fn parse_chrome_json(raw: &str) -> Vec<Bookmark> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(roots) = value.get("roots").and_then(|r| r.as_object()) {
        for root in roots.values() {
            collect_chrome(root, &mut out);
        }
    }
    out
}

fn collect_chrome(node: &serde_json::Value, out: &mut Vec<Bookmark>) {
    match node.get("type").and_then(|t| t.as_str()) {
        Some("url") => {
            if let (Some(name), Some(url)) = (
                node.get("name").and_then(|v| v.as_str()),
                node.get("url").and_then(|v| v.as_str()),
            ) {
                out.push(Bookmark {
                    name: name.to_string(),
                    url: url.to_string(),
                });
            }
        }
        _ => {
            if let Some(children) = node.get("children").and_then(|c| c.as_array()) {
                for child in children {
                    collect_chrome(child, out);
                }
            }
        }
    }
}

fn collect_safari(value: &plist::Value, out: &mut Vec<Bookmark>) {
    let Some(dict) = value.as_dictionary() else {
        return;
    };
    if dict.get("WebBookmarkType").and_then(|v| v.as_string()) == Some("WebBookmarkTypeLeaf") {
        let url = dict.get("URLString").and_then(|v| v.as_string());
        let name = dict
            .get("URIDictionary")
            .and_then(|v| v.as_dictionary())
            .and_then(|d| d.get("title"))
            .and_then(|v| v.as_string());
        if let (Some(name), Some(url)) = (name, url) {
            out.push(Bookmark {
                name: name.to_string(),
                url: url.to_string(),
            });
        }
        return;
    }
    if let Some(children) = dict.get("Children").and_then(|v| v.as_array()) {
        for child in children {
            collect_safari(child, out);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_chrome_bookmarks_recursively() {
        let raw = r#"{
          "roots": {
            "bookmark_bar": {
              "type": "folder",
              "children": [
                {"type": "url", "name": "Emberstash", "url": "https://emberstash.com"},
                {"type": "folder", "children": [
                  {"type": "url", "name": "HN", "url": "https://news.ycombinator.com"}
                ]}
              ]
            },
            "other": {"type": "folder", "children": []}
          }
        }"#;
        let bookmarks = parse_chrome_json(raw);
        assert_eq!(bookmarks.len(), 2);
        assert_eq!(bookmarks[0].name, "Emberstash");
        assert_eq!(bookmarks[1].url, "https://news.ycombinator.com");
    }

    #[test]
    fn garbage_json_yields_nothing() {
        assert!(parse_chrome_json("not json").is_empty());
        assert!(parse_chrome_json("{}").is_empty());
    }
}
