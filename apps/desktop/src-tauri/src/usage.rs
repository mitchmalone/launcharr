//! Token-usage monitor (plans/usage-panel.md): local-only aggregation of the
//! journals the agent CLIs already write. CodexBar is the design reference but
//! not the mechanics — no OAuth, no cookie reading, no network (invariant 2).
//!
//! Sources:
//! - Claude Code: `~/.claude/projects/**/*.jsonl` — assistant messages carry
//!   `message.usage`, model, id, timestamp. Sessions fork and duplicate
//!   history, so entries dedup globally by message id.
//! - Codex: `~/.codex/sessions/**/*.jsonl` — `token_count` events carry
//!   per-turn totals plus a `rate_limits` snapshot; `turn_context` names the
//!   model for subsequent turns.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// Days shown, today inclusive.
const WINDOW_DAYS: i64 = 7;
/// Files untouched longer than this are skipped entirely.
const FILE_HORIZON_SECS: u64 = 8 * 86_400;
/// A finished scan is served from cache this long before rescanning.
const CACHE_TTL: Duration = Duration::from_secs(60);
const MAX_MODELS: usize = 6;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayUsage {
    /// "Mon" … "Sun", with today rendered as "Today".
    pub label: String,
    pub tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub model: String,
    pub tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimit {
    pub used_percent: f64,
    pub window_minutes: u64,
    pub resets_at: Option<u64>,
    pub plan: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsage {
    pub provider: String,
    /// Oldest first, today last; always WINDOW_DAYS entries.
    pub days: Vec<DayUsage>,
    /// Window total per model, largest first.
    pub models: Vec<ModelUsage>,
    pub rate_limit: Option<RateLimit>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    /// Unix seconds of the finished scan; 0 = never scanned.
    pub generated_at: u64,
    pub providers: Vec<ProviderUsage>,
}

/// One counted usage record. `id` is the dedup key where the journal has one.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Entry {
    id: Option<String>,
    epoch_day: i64,
    model: String,
    tokens: u64,
}

#[derive(Debug, Clone, Default)]
struct FileScan {
    entries: Vec<Entry>,
    /// Latest rate-limit snapshot in the file (codex), with its timestamp.
    rate_limit: Option<(u64, RateLimit)>,
}

static REPORT: Mutex<Option<(Instant, UsageReport)>> = Mutex::new(None);
static SCANNING: AtomicBool = AtomicBool::new(false);
#[allow(clippy::type_complexity)]
static FILE_CACHE: Mutex<Option<HashMap<PathBuf, (u64, SystemTime, FileScan)>>> = Mutex::new(None);

/// Cached report now; kick a background rescan when stale. Never blocks — the
/// panel polls and fills in when the scan lands.
pub fn report() -> UsageReport {
    let stale = {
        let cache = REPORT.lock().unwrap();
        match cache.as_ref() {
            Some((at, _)) => at.elapsed() > CACHE_TTL,
            None => true,
        }
    };
    if stale && !SCANNING.swap(true, Ordering::SeqCst) {
        std::thread::spawn(|| {
            let report = scan();
            *REPORT.lock().unwrap() = Some((Instant::now(), report));
            SCANNING.store(false, Ordering::SeqCst);
        });
    }
    REPORT
        .lock()
        .unwrap()
        .as_ref()
        .map(|(_, r)| r.clone())
        .unwrap_or_default()
}

fn scan() -> UsageReport {
    let home = dirs::home_dir().unwrap_or_default();
    let offset = local_offset_secs();
    let today = epoch_day(now_secs() as i64, offset);
    let claude = scan_provider(
        &home.join(".claude/projects"),
        parse_claude_line,
        offset,
        today,
    );
    let codex = scan_provider(
        &home.join(".codex/sessions"),
        parse_codex_line,
        offset,
        today,
    );
    UsageReport {
        generated_at: now_secs(),
        providers: vec![
            aggregate("claude", claude.0, claude.1, today),
            aggregate("codex", codex.0, codex.1, today),
        ],
    }
}

/// Walk a provider root, reusing per-file results keyed by (len, mtime) —
/// journals are append-only, so unchanged files cost nothing on rescans.
fn scan_provider(
    root: &Path,
    parse: fn(&str, i32, &mut ParseState) -> Option<Entry>,
    offset: i32,
    _today: i64,
) -> (Vec<Entry>, Option<RateLimit>) {
    let mut files = Vec::new();
    collect_jsonl(root, &mut files);
    let mut cache_guard = FILE_CACHE.lock().unwrap();
    let cache = cache_guard.get_or_insert_with(HashMap::new);
    let mut entries = Vec::new();
    let mut latest_limit: Option<(u64, RateLimit)> = None;
    for path in files {
        let Ok(meta) = std::fs::metadata(&path) else {
            continue;
        };
        let mtime = meta.modified().unwrap_or(UNIX_EPOCH);
        let age = SystemTime::now()
            .duration_since(mtime)
            .unwrap_or_default()
            .as_secs();
        if age > FILE_HORIZON_SECS {
            continue;
        }
        let key = (meta.len(), mtime);
        let scanned = match cache.get(&path) {
            Some((len, at, scanned)) if (*len, *at) == key => scanned.clone(),
            _ => {
                let scanned = scan_file(&path, parse, offset);
                cache.insert(path.clone(), (key.0, key.1, scanned.clone()));
                scanned
            }
        };
        entries.extend(scanned.entries);
        if let Some((at, limit)) = scanned.rate_limit {
            if latest_limit.as_ref().map(|(t, _)| *t < at).unwrap_or(true) {
                latest_limit = Some((at, limit));
            }
        }
    }
    (entries, latest_limit.map(|(_, l)| l))
}

fn scan_file(
    path: &Path,
    parse: fn(&str, i32, &mut ParseState) -> Option<Entry>,
    offset: i32,
) -> FileScan {
    let Ok(text) = std::fs::read_to_string(path) else {
        return FileScan::default();
    };
    let mut scan = FileScan::default();
    let mut state = ParseState::default();
    for line in text.lines() {
        if let Some(entry) = parse(line, offset, &mut state) {
            scan.entries.push(entry);
        }
    }
    scan.rate_limit = state.rate_limit;
    scan
}

/// Streaming state a parser carries through one file.
#[derive(Debug, Clone, Default)]
struct ParseState {
    /// Codex: model from the last `turn_context`, owning later token counts.
    model: Option<String>,
    rate_limit: Option<(u64, RateLimit)>,
}

fn parse_claude_line(line: &str, offset: i32, _state: &mut ParseState) -> Option<Entry> {
    // Cheap pre-filter before paying for JSON: only assistant messages with a
    // usage block count.
    if !line.contains("\"usage\"") || !line.contains("\"assistant\"") {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    if v.get("type")?.as_str()? != "assistant" {
        return None;
    }
    let ts = parse_rfc3339(v.get("timestamp")?.as_str()?)?;
    let message = v.get("message")?;
    let usage = message.get("usage")?;
    let tokens = [
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    ]
    .iter()
    .filter_map(|k| usage.get(k).and_then(|t| t.as_u64()))
    .sum();
    if tokens == 0 {
        return None;
    }
    let model = message
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("unknown");
    if model == "<synthetic>" {
        return None;
    }
    Some(Entry {
        id: message
            .get("id")
            .and_then(|i| i.as_str())
            .map(str::to_owned),
        epoch_day: epoch_day(ts, offset),
        model: model.to_owned(),
        tokens,
    })
}

fn parse_codex_line(line: &str, offset: i32, state: &mut ParseState) -> Option<Entry> {
    if line.contains("\"turn_context\"") {
        let v: serde_json::Value = serde_json::from_str(line).ok()?;
        let model = v.get("payload")?.get("model")?.as_str()?.to_owned();
        state.model = Some(model);
        return None;
    }
    if !line.contains("\"token_count\"") {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    let ts = parse_rfc3339(v.get("timestamp")?.as_str()?)?;
    let payload = v.get("payload")?;
    if let Some(limits) = payload.get("rate_limits") {
        if let Some(primary) = limits.get("primary") {
            let limit = RateLimit {
                used_percent: primary.get("used_percent").and_then(|p| p.as_f64())?,
                window_minutes: primary
                    .get("window_minutes")
                    .and_then(|w| w.as_u64())
                    .unwrap_or(0),
                resets_at: primary.get("resets_at").and_then(|r| r.as_u64()),
                plan: limits
                    .get("plan_type")
                    .and_then(|p| p.as_str())
                    .map(str::to_owned),
            };
            let newer = state
                .rate_limit
                .as_ref()
                .map(|(t, _)| *t < ts as u64)
                .unwrap_or(true);
            if newer {
                state.rate_limit = Some((ts as u64, limit));
            }
        }
    }
    let tokens = payload
        .get("info")?
        .get("last_token_usage")?
        .get("total_tokens")?
        .as_u64()?;
    if tokens == 0 {
        return None;
    }
    Some(Entry {
        id: None,
        epoch_day: epoch_day(ts, offset),
        model: state.model.clone().unwrap_or_else(|| "codex".into()),
        tokens,
    })
}

/// Fold entries into the 7-day view. Dedup by id where present — Claude
/// session forks replay history into new files.
fn aggregate(
    provider: &str,
    entries: Vec<Entry>,
    rate_limit: Option<RateLimit>,
    today: i64,
) -> ProviderUsage {
    let mut seen = HashSet::new();
    let mut by_day: HashMap<i64, u64> = HashMap::new();
    let mut by_model: HashMap<String, u64> = HashMap::new();
    let oldest = today - (WINDOW_DAYS - 1);
    for e in entries {
        if e.epoch_day < oldest || e.epoch_day > today {
            continue;
        }
        if let Some(id) = &e.id {
            if !seen.insert(id.clone()) {
                continue;
            }
        }
        *by_day.entry(e.epoch_day).or_default() += e.tokens;
        *by_model.entry(e.model).or_default() += e.tokens;
    }
    let days = (oldest..=today)
        .map(|day| DayUsage {
            label: if day == today {
                "Today".into()
            } else {
                weekday_label(day).into()
            },
            tokens: by_day.get(&day).copied().unwrap_or(0),
        })
        .collect();
    let mut models: Vec<ModelUsage> = by_model
        .into_iter()
        .map(|(model, tokens)| ModelUsage { model, tokens })
        .collect();
    models.sort_by(|a, b| b.tokens.cmp(&a.tokens).then(a.model.cmp(&b.model)));
    models.truncate(MAX_MODELS);
    ProviderUsage {
        provider: provider.into(),
        days,
        models,
        rate_limit,
    }
}

fn collect_jsonl(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl(&path, out);
        } else if path.extension().is_some_and(|e| e == "jsonl") {
            out.push(path);
        }
    }
}

// ---- Time ------------------------------------------------------------------
//
// No chrono: journals stamp RFC3339 UTC, and day bucketing only needs the
// local UTC offset, which `date +%z` answers. DST drift across the window
// shifts at most the boundary hours of the oldest days.

/// "+1000" / "-0530" → seconds east of UTC.
fn parse_utc_offset(s: &str) -> Option<i32> {
    let s = s.trim();
    let (sign, digits) = s.split_at(1);
    let sign = match sign {
        "+" => 1,
        "-" => -1,
        _ => return None,
    };
    if digits.len() != 4 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let hours: i32 = digits[..2].parse().ok()?;
    let minutes: i32 = digits[2..].parse().ok()?;
    Some(sign * (hours * 3600 + minutes * 60))
}

fn local_offset_secs() -> i32 {
    std::process::Command::new("/bin/date")
        .arg("+%z")
        .output()
        .ok()
        .and_then(|o| parse_utc_offset(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or(0)
}

/// RFC3339 UTC ("2026-08-13T04:40:16.354Z") → unix seconds. Non-UTC offsets
/// in journals don't occur; reject rather than guess.
fn parse_rfc3339(s: &str) -> Option<i64> {
    let s = s.strip_suffix('Z')?;
    let (date, time) = s.split_once('T')?;
    let mut d = date.split('-');
    let (y, m, day): (i64, i64, i64) = (
        d.next()?.parse().ok()?,
        d.next()?.parse().ok()?,
        d.next()?.parse().ok()?,
    );
    let time = time.split('.').next()?;
    let mut t = time.split(':');
    let (hh, mm, ss): (i64, i64, i64) = (
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
    );
    Some(days_from_civil(y, m, day) * 86_400 + hh * 3600 + mm * 60 + ss)
}

/// Howard Hinnant's days-from-civil: civil date → days since 1970-01-01.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn epoch_day(unix_secs: i64, offset: i32) -> i64 {
    (unix_secs + offset as i64).div_euclid(86_400)
}

/// 1970-01-01 was a Thursday.
fn weekday_label(epoch_day: i64) -> &'static str {
    const NAMES: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    NAMES[(epoch_day + 4).rem_euclid(7) as usize]
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "scans the real home dir; run by hand to eyeball numbers/speed"]
    fn scan_real_home() {
        let started = std::time::Instant::now();
        let report = scan();
        eprintln!("scan took {:?}", started.elapsed());
        for p in &report.providers {
            eprintln!(
                "{}: days={:?} models={:?} limit={:?}",
                p.provider, p.days, p.models, p.rate_limit
            );
        }
        let rescan = std::time::Instant::now();
        let _ = scan();
        eprintln!("cached rescan took {:?}", rescan.elapsed());
    }

    #[test]
    fn parses_utc_offsets() {
        assert_eq!(parse_utc_offset("+1000\n"), Some(36_000));
        assert_eq!(parse_utc_offset("-0530"), Some(-19_800));
        assert_eq!(parse_utc_offset("+0000"), Some(0));
        assert_eq!(parse_utc_offset("nope"), None);
    }

    #[test]
    fn parses_rfc3339_and_buckets_days() {
        let ts = parse_rfc3339("2026-08-13T04:40:16.354Z").expect("parses");
        // Spot value cross-checked with `date -j -u -f %FT%T 2026-08-13T04:40:16 +%s`.
        assert_eq!(ts, 1_786_596_016);
        // 04:40Z on the 13th is 14:40 AEST on the 13th, but 23:40 the 12th in UTC-5.
        assert_eq!(epoch_day(ts, 36_000), epoch_day(ts, 0));
        assert_eq!(epoch_day(ts, -18_000), epoch_day(ts, 0) - 1);
        assert!(parse_rfc3339("2026-08-13 04:40:16").is_none());
    }

    #[test]
    fn weekday_labels_anchor_correctly() {
        assert_eq!(weekday_label(0), "Thu"); // 1970-01-01
        assert_eq!(weekday_label(days_from_civil(2026, 8, 16)), "Sun");
    }

    #[test]
    fn parses_claude_usage_lines() {
        let line = r#"{"type":"assistant","timestamp":"2026-08-13T04:40:16.354Z","message":{"id":"msg_1","model":"claude-fable-5","usage":{"input_tokens":2,"cache_creation_input_tokens":100,"cache_read_input_tokens":50,"output_tokens":10}}}"#;
        let e = parse_claude_line(line, 0, &mut ParseState::default()).expect("entry");
        assert_eq!(e.tokens, 162);
        assert_eq!(e.model, "claude-fable-5");
        assert_eq!(e.id.as_deref(), Some("msg_1"));
        // Non-assistant and synthetic lines don't count.
        assert!(parse_claude_line(
            r#"{"type":"user","timestamp":"2026-08-13T04:40:16Z","message":{"usage":{"input_tokens":5},"model":"assistant"}}"#,
            0,
            &mut ParseState::default()
        )
        .is_none());
        assert!(parse_claude_line("not json", 0, &mut ParseState::default()).is_none());
    }

    #[test]
    fn parses_codex_lines_with_model_context() {
        let mut state = ParseState::default();
        assert!(parse_codex_line(
            r#"{"timestamp":"2026-08-12T03:52:23.630Z","type":"turn_context","payload":{"model":"gpt-5.5"}}"#,
            0,
            &mut state
        )
        .is_none());
        let count = r#"{"timestamp":"2026-08-12T03:52:44.588Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"total_tokens":17194}},"rate_limits":{"primary":{"used_percent":5.0,"window_minutes":10080,"resets_at":1787011420},"plan_type":"prolite"}}}"#;
        let e = parse_codex_line(count, 0, &mut state).expect("entry");
        assert_eq!(e.tokens, 17_194);
        assert_eq!(e.model, "gpt-5.5");
        let (_, limit) = state.rate_limit.expect("rate limit captured");
        assert_eq!(limit.used_percent, 5.0);
        assert_eq!(limit.window_minutes, 10_080);
        assert_eq!(limit.plan.as_deref(), Some("prolite"));
    }

    #[test]
    fn aggregates_with_dedup_and_window() {
        let today = days_from_civil(2026, 8, 16);
        let entry = |id: &str, day: i64, tokens: u64| Entry {
            id: Some(id.into()),
            epoch_day: day,
            model: "m".into(),
            tokens,
        };
        let usage = aggregate(
            "claude",
            vec![
                entry("a", today, 10),
                entry("a", today, 10), // forked-session duplicate
                entry("b", today - 1, 5),
                entry("c", today - 90, 99), // outside the window
            ],
            None,
            today,
        );
        assert_eq!(usage.days.len(), WINDOW_DAYS as usize);
        assert_eq!(usage.days.last().map(|d| d.tokens), Some(10));
        assert_eq!(usage.days.last().map(|d| d.label.as_str()), Some("Today"));
        assert_eq!(usage.days[WINDOW_DAYS as usize - 2].tokens, 5);
        assert_eq!(
            usage.models,
            vec![ModelUsage {
                model: "m".into(),
                tokens: 15
            }]
        );
    }
}
