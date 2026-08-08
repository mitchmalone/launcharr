use std::{
    fs,
    path::{Path, PathBuf},
    sync::mpsc,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::settings_panes;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    App,
    Settings,
    Launcharr,
    Link,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexItem {
    /// Stable identity: app bundle path, `settings:<pane-id>`, or `launcharr:<action>`.
    pub id: String,
    pub name: String,
    pub kind: ItemKind,
    /// What launching opens: bundle path or deep link. Informational for internal items.
    pub path: String,
    /// Dimmed hint column in the results list.
    pub hint: String,
    /// Absolute path to a cached PNG icon, when one exists.
    pub icon: Option<String>,
    /// Extra strings the fuzzy matcher may match against.
    pub aliases: Vec<String>,
    /// Links only: open in this browser (`open -a`); None = default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser: Option<String>,
}

const APP_DIRS: &[&str] = &[
    "/Applications",
    "/Applications/Utilities",
    "/System/Applications",
    "/System/Applications/Utilities",
];

pub fn scan(links: &[crate::config::Link]) -> Vec<IndexItem> {
    let mut items: Vec<IndexItem> = Vec::with_capacity(300);

    let mut dirs: Vec<PathBuf> = APP_DIRS.iter().map(PathBuf::from).collect();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("Applications"));
    }
    for dir in dirs {
        scan_dir(&dir, 0, &mut items);
    }

    // De-dup by path (e.g. /Applications/Utilities is scanned via both its parent and itself).
    items.sort_by(|a, b| a.id.cmp(&b.id));
    items.dedup_by(|a, b| a.id == b.id);

    for (name, pane_id) in settings_panes::SETTINGS_PANES {
        items.push(IndexItem {
            id: format!("settings:{pane_id}"),
            name: (*name).to_string(),
            kind: ItemKind::Settings,
            path: settings_panes::deep_link(pane_id),
            hint: "settings".into(),
            icon: None,
            aliases: vec!["settings".into(), "preferences".into()],
            browser: None,
        });
    }

    // Custom links from config: first-class results that open in the browser.
    for link in links {
        items.push(IndexItem {
            id: format!("link:{}", link.url),
            name: link.name.clone(),
            kind: ItemKind::Link,
            path: link.url.clone(),
            hint: "link".into(),
            icon: None,
            aliases: Vec::new(),
            browser: link.browser.clone(),
        });
    }

    // launcharr self-indexes (PRD §4.5): the prompt is the preferences UI.
    for (action, name, alias) in [
        ("reindex", "launcharr — Reindex apps", "reindex"),
        (
            "config",
            "launcharr — Open config",
            "config settings preferences",
        ),
        ("quit", "launcharr — Quit", "quit exit"),
    ] {
        items.push(IndexItem {
            id: format!("launcharr:{action}"),
            name: name.into(),
            kind: ItemKind::Launcharr,
            path: String::new(),
            hint: "launcharr".into(),
            icon: None,
            aliases: alias.split(' ').map(String::from).collect(),
            browser: None,
        });
    }

    items
}

fn scan_dir(dir: &Path, depth: u8, items: &mut Vec<IndexItem>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if file_name.starts_with('.') {
            continue;
        }
        if file_name.ends_with(".app") {
            let name = file_name.trim_end_matches(".app").to_string();
            items.push(IndexItem {
                id: path.to_string_lossy().into_owned(),
                name,
                kind: ItemKind::App,
                path: path.to_string_lossy().into_owned(),
                hint: "app".into(),
                icon: None,
                aliases: Vec::new(),
                browser: None,
            });
        } else if depth < 1 && path.is_dir() {
            // One level of vendor folders (Adobe …, Utilities) is enough.
            scan_dir(&path, depth + 1, items);
        }
    }
}

/// Rescan, publish to state, notify the frontend, then top up missing icons.
pub fn refresh(app: &AppHandle) {
    let state = app.state::<crate::AppState>();
    let links = state.config.read().unwrap().links.clone();
    let mut items = scan(&links);
    crate::icons::annotate_cached(&mut items, &state.icon_dir);
    *state.index.write().unwrap() = items;
    let _ = app.emit("index-updated", ());
    crate::icons::extract_missing(app.clone());
}

/// Initial scan plus an FSEvents watch on the app directories.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        refresh(&app);

        use notify::{RecursiveMode, Watcher};
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[launcharr] app watcher failed: {e}");
                return;
            }
        };
        let mut dirs: Vec<PathBuf> = APP_DIRS.iter().map(PathBuf::from).collect();
        if let Some(home) = dirs::home_dir() {
            dirs.push(home.join("Applications"));
        }
        for dir in dirs {
            if dir.exists() {
                // NonRecursive: we only care about .app bundles appearing/disappearing.
                let _ = watcher.watch(&dir, RecursiveMode::NonRecursive);
            }
        }
        loop {
            if rx.recv().is_err() {
                return;
            }
            // Installs write many events; settle before rescanning.
            while rx.recv_timeout(Duration::from_millis(500)).is_ok() {}
            refresh(&app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_finds_apps_and_settings_and_self() {
        let items = scan(&[]);
        // Any Mac has Safari and Finder-adjacent system apps.
        assert!(items.iter().any(|i| i.kind == ItemKind::App));
        assert!(items
            .iter()
            .any(|i| i.name == "Bluetooth" && i.kind == ItemKind::Settings));
        assert!(items.iter().any(|i| i.id == "launcharr:quit"));
    }

    #[test]
    fn scan_has_no_duplicate_ids() {
        let items = scan(&[]);
        let mut ids: Vec<_> = items.iter().map(|i| &i.id).collect();
        let before = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(before, ids.len());
    }
}
