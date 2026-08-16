use std::{collections::HashMap, path::Path, time::UNIX_EPOCH};

use rusqlite::Connection;

use crate::error::CmdResult;

/// Trailing-window count (Mitch, 2026-08-16): the signal is "how often did I launch this
/// in the past 5 days" — each launch inside the window counts full weight so learned
/// preference can overtake the default fuzzy order. Older launches keep a small residual
/// so long-standing favourites still win ties against never-launched items.
const DAY: i64 = 86_400;
const WINDOW: i64 = 5 * DAY;

fn weight(age_secs: i64) -> f64 {
    if age_secs <= WINDOW {
        1.0
    } else {
        0.1
    }
}

pub fn open(db_path: &Path) -> CmdResult<Connection> {
    let conn = Connection::open(db_path)?;
    // The query column is unused in v1 ranking but recorded from day one so per-query
    // learned bindings (v1.x) need no schema change.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS launches (
            id INTEGER PRIMARY KEY,
            item TEXT NOT NULL,
            query TEXT NOT NULL,
            ts INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_launches_item ON launches(item);",
    )?;
    Ok(conn)
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn record(conn: &Connection, item: &str, query: &str, ts: i64) -> CmdResult<()> {
    conn.execute(
        "INSERT INTO launches (item, query, ts) VALUES (?1, ?2, ?3)",
        (item, query, ts),
    )?;
    Ok(())
}

/// Decayed launch count per item id. The frecency *multiplier* applied to fuzzy scores is
/// product opinion and lives in TypeScript; this is just the raw signal.
pub fn scores(conn: &Connection, now: i64) -> CmdResult<HashMap<String, f64>> {
    let mut stmt = conn.prepare("SELECT item, ts FROM launches")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let mut out: HashMap<String, f64> = HashMap::new();
    for row in rows {
        let (item, ts) = row?;
        *out.entry(item).or_insert(0.0) += weight(now - ts);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE launches (id INTEGER PRIMARY KEY, item TEXT NOT NULL, query TEXT NOT NULL, ts INTEGER NOT NULL);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn weight_is_full_inside_the_window_and_residual_beyond() {
        assert_eq!(weight(60), 1.0);
        assert_eq!(weight(3 * DAY), 1.0);
        assert_eq!(weight(5 * DAY), 1.0);
        assert_eq!(weight(5 * DAY + 1), 0.1);
        assert_eq!(weight(90 * DAY), 0.1);
    }

    #[test]
    fn scores_count_launches_in_the_window() {
        let conn = mem_db();
        let now = 1_000_000_000;
        record(&conn, "safari", "saf", now - 60).unwrap(); // 1.0
        record(&conn, "safari", "sa", now - 3 * DAY).unwrap(); // 1.0
        record(&conn, "iterm", "it", now - 90 * DAY).unwrap(); // 0.1
        let scores = scores(&conn, now).unwrap();
        assert!((scores["safari"] - 2.0).abs() < f64::EPSILON);
        assert!((scores["iterm"] - 0.1).abs() < f64::EPSILON);
    }

    #[test]
    fn launches_this_week_beat_heavy_ancient_use() {
        let conn = mem_db();
        let now = 2_000_000_000;
        // 8 ancient launches (0.8) vs one launch today (1.0): today wins.
        for i in 0..8 {
            record(&conn, "old-favourite", "", now - 90 * DAY - i).unwrap();
        }
        record(&conn, "new-thing", "", now - 30).unwrap();
        let scores = scores(&conn, now).unwrap();
        assert!(scores["new-thing"] > scores["old-favourite"]);
    }
}
