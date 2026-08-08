use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::CmdResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: i64,
    pub content: String,
    pub ts: i64,
}

const MAX_CLIPS: i64 = 200;
/// Poll interval: changeCount comparison only when idle — reads happen on change.
const POLL: Duration = Duration::from_millis(800);

pub fn init_table(conn: &Connection) -> CmdResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clips (
            id INTEGER PRIMARY KEY,
            content TEXT NOT NULL,
            ts INTEGER NOT NULL
        );",
    )?;
    Ok(())
}

pub fn record(conn: &Connection, content: &str, ts: i64) -> CmdResult<()> {
    // Re-copying something moves it to the top rather than duplicating it.
    conn.execute("DELETE FROM clips WHERE content = ?1", [content])?;
    conn.execute(
        "INSERT INTO clips (content, ts) VALUES (?1, ?2)",
        (content, ts),
    )?;
    conn.execute(
        "DELETE FROM clips WHERE id NOT IN (SELECT id FROM clips ORDER BY id DESC LIMIT ?1)",
        [MAX_CLIPS],
    )?;
    Ok(())
}

pub fn history(conn: &Connection) -> CmdResult<Vec<Clip>> {
    let mut stmt = conn.prepare("SELECT id, content, ts FROM clips ORDER BY id DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(Clip {
            id: row.get(0)?,
            content: row.get(1)?,
            ts: row.get(2)?,
        })
    })?;
    Ok(rows.flatten().collect())
}

pub fn clear(conn: &Connection) -> CmdResult<()> {
    conn.execute("DELETE FROM clips", [])?;
    Ok(())
}

/// Put text on the general pasteboard (the whole of "paste" launcharr is allowed to do —
/// auto-⌘V would need Accessibility, which the PRD bans).
pub fn set_string(text: &str) {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
    use objc2_foundation::NSString;
    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        pasteboard.setString_forType(&NSString::from_str(text), NSPasteboardTypeString);
    }
}

/// Read the pasteboard as text, honouring the de-facto privacy conventions: concealed
/// (password managers) and transient contents are never recorded.
fn read_if_recordable() -> Option<String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
    use objc2_foundation::NSString;
    objc2::rc::autoreleasepool(|_| unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        for marker in [
            "org.nspasteboard.ConcealedType",
            "org.nspasteboard.TransientType",
        ] {
            let marker = NSString::from_str(marker);
            if pasteboard.dataForType(&marker).is_some() {
                return None;
            }
        }
        let s = pasteboard.stringForType(NSPasteboardTypeString)?;
        let s = s.to_string();
        // Ignore the empty string and absurd payloads (a 10MB copied file dump is not
        // something the history needs to hold).
        if s.is_empty() || s.len() > 100_000 {
            return None;
        }
        Some(s)
    })
}

/// Watch the pasteboard by changeCount. launcharr's own writes are recorded too, on
/// purpose: re-copying from history bumps the item to the top via `record`'s dedupe.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        use objc2_app_kit::NSPasteboard;
        let mut last_count = NSPasteboard::generalPasteboard().changeCount();
        loop {
            std::thread::sleep(POLL);
            let count = NSPasteboard::generalPasteboard().changeCount();
            if count == last_count {
                continue;
            }
            last_count = count;
            if let Some(text) = read_if_recordable() {
                let state = app.state::<crate::AppState>();
                let db = state.db.lock().unwrap();
                if let Err(e) = record(&db, &text, crate::frecency::now_secs()) {
                    eprintln!("[launcharr] clip record failed: {e}");
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_table(&conn).unwrap();
        conn
    }

    #[test]
    fn records_newest_first_and_dedupes() {
        let conn = mem_db();
        record(&conn, "one", 1).unwrap();
        record(&conn, "two", 2).unwrap();
        record(&conn, "one", 3).unwrap(); // re-copy bumps to top
        let clips = history(&conn).unwrap();
        assert_eq!(
            clips.iter().map(|c| c.content.as_str()).collect::<Vec<_>>(),
            vec!["one", "two"]
        );
    }

    #[test]
    fn caps_history_at_max() {
        let conn = mem_db();
        for i in 0..(MAX_CLIPS + 50) {
            record(&conn, &format!("clip {i}"), i).unwrap();
        }
        assert_eq!(history(&conn).unwrap().len() as i64, MAX_CLIPS);
    }

    #[test]
    fn clear_empties_history() {
        let conn = mem_db();
        record(&conn, "secret-ish", 1).unwrap();
        clear(&conn).unwrap();
        assert!(history(&conn).unwrap().is_empty());
    }
}
