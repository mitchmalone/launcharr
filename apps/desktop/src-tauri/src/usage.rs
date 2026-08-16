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

/// One account rate-limit window as the provider reports it ("5h session",
/// "weekly · opus", a model-scoped promo window, …). Mirrored in the frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub name: String,
    pub used_percent: f64,
    pub resets_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsage {
    pub provider: String,
    /// Oldest first, today last; always WINDOW_DAYS entries.
    pub days: Vec<DayUsage>,
    /// Window total per model, largest first.
    pub models: Vec<ModelUsage>,
    /// Account rate-limit windows (network opt-in; codex falls back to the
    /// local session snapshot, flagged in `limits_note`).
    pub limits: Vec<LimitWindow>,
    /// Human-readable status for the limits section: source off, token
    /// expired, HTTP failure, staleness caveat. None = limits are live.
    pub limits_note: Option<String>,
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

/// Settings → Agents gates (DECISIONS 2026-08-16): the whole monitor is off
/// by default, and each provider's account-limit fetch is a separate opt-in.
static ENABLED: AtomicBool = AtomicBool::new(false);
/// 0 = off, 1 = ~/.claude/.credentials.json, 2 = keychain via /usr/bin/security.
static CLAUDE_SRC: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);
/// 0 = off, 1 = ~/.codex/auth.json.
static CODEX_SRC: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

/// Apply settings; called at setup and from the config watcher. Drops the
/// report cache so a source change shows up on the next panel poll.
pub fn configure(cfg: &crate::config::AgentsConfig) {
    use crate::config::{ClaudeLimitsSource, CodexLimitsSource};
    ENABLED.store(cfg.usage, Ordering::Relaxed);
    CLAUDE_SRC.store(
        match cfg.claude_limits {
            ClaudeLimitsSource::Off => 0,
            ClaudeLimitsSource::CredentialsFile => 1,
            ClaudeLimitsSource::Keychain => 2,
        },
        Ordering::Relaxed,
    );
    CODEX_SRC.store(
        match cfg.codex_limits {
            CodexLimitsSource::Off => 0,
            CodexLimitsSource::AuthFile => 1,
        },
        Ordering::Relaxed,
    );
    *REPORT.lock().unwrap() = None;
}
#[allow(clippy::type_complexity)]
static FILE_CACHE: Mutex<Option<HashMap<PathBuf, (u64, SystemTime, FileScan)>>> = Mutex::new(None);

/// Cached report now; kick a background rescan when stale. Never blocks — the
/// panel polls and fills in when the scan lands.
pub fn report() -> UsageReport {
    if !ENABLED.load(Ordering::Relaxed) {
        return UsageReport::default();
    }
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
    let (claude_limits, claude_note) = claude_account_limits(&home);
    let (codex_limits, codex_note) = codex_account_limits(&home, codex.1);
    UsageReport {
        generated_at: now_secs(),
        providers: vec![
            aggregate("claude", claude.0, claude_limits, claude_note, today),
            aggregate("codex", codex.0, codex_limits, codex_note, today),
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
    limits: Vec<LimitWindow>,
    limits_note: Option<String>,
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
        limits,
        limits_note,
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

// ---- Account limits (network, opt-in) ---------------------------------------
//
// The primary use-case — "how soon am I limited?" — cannot be derived locally:
// the windows are account-wide and server-computed (other devices count).
// Both fetches reuse credentials the CLIs already store; launcharr NEVER
// refreshes or writes another app's tokens — an expired token degrades to a
// visible note instead (DECISIONS 2026-08-16, invariant 2 carve-out).

const SETTINGS_HINT: &str = "account limits off — enable in Settings → Agents";

fn claude_account_limits(home: &Path) -> (Vec<LimitWindow>, Option<String>) {
    let token = match CLAUDE_SRC.load(Ordering::Relaxed) {
        0 => return (Vec::new(), Some(SETTINGS_HINT.into())),
        1 => claude_token_from_file(&home.join(".claude/.credentials.json")),
        _ => claude_token_from_keychain(),
    };
    let token = match token {
        Ok(t) => t,
        Err(note) => return (Vec::new(), Some(note)),
    };
    let response = ureq::get("https://api.anthropic.com/api/oauth/usage")
        .set("Authorization", &format!("Bearer {token}"))
        .set("anthropic-beta", "oauth-2025-04-20")
        .set("Accept", "application/json")
        .timeout(Duration::from_secs(8))
        .call();
    match response {
        Ok(r) => match r.into_string() {
            Ok(body) => (parse_claude_limits(&body), None),
            Err(_) => (
                Vec::new(),
                Some("claude limits: unreadable response".into()),
            ),
        },
        Err(ureq::Error::Status(401 | 403, _)) => (
            Vec::new(),
            Some("claude token expired — use Claude Code once, then reopen".into()),
        ),
        Err(e) => (
            Vec::new(),
            Some(format!("claude limits: {}", short_err(&e))),
        ),
    }
}

fn claude_token_from_file(path: &Path) -> Result<String, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|_| "no ~/.claude/.credentials.json — try the keychain source".to_string())?;
    parse_claude_credentials(&raw)
}

/// Claude Code's keychain item, read via the system CLI so macOS runs its
/// standard consent prompt — launcharr never links Security.framework for this.
fn claude_token_from_keychain() -> Result<String, String> {
    let out = std::process::Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
        .map_err(|_| "keychain read failed".to_string())?;
    if !out.status.success() {
        return Err("keychain access denied or item missing".into());
    }
    parse_claude_credentials(&String::from_utf8_lossy(&out.stdout))
}

/// Both credential stores hold the same JSON: `claudeAiOauth.accessToken`
/// with `expiresAt` (unix millis). The file copy can lag far behind the
/// keychain (observed 5 days stale, 2026-08-16 — Claude Code maintains the
/// keychain item, not always the file), so expiry is checked up front with a
/// pointer at the better source instead of a bare 401.
fn parse_claude_credentials(raw: &str) -> Result<String, String> {
    let v: serde_json::Value =
        serde_json::from_str(raw.trim()).map_err(|_| "credentials unreadable".to_string())?;
    let oauth = v
        .get("claudeAiOauth")
        .ok_or_else(|| "no claudeAiOauth in credentials".to_string())?;
    if let Some(expires_ms) = oauth.get("expiresAt").and_then(|e| e.as_u64()) {
        if expires_ms / 1000 < now_secs() {
            return Err(
                "stored claude token expired — try the keychain source in Settings → Agents".into(),
            );
        }
    }
    oauth
        .get("accessToken")
        .and_then(|t| t.as_str())
        .map(str::to_owned)
        .ok_or_else(|| "no accessToken in credentials".into())
}

/// The /api/oauth/usage shape (fields verified against CodexBar's decoder):
/// `five_hour`/`seven_day`/`seven_day_opus`/`seven_day_sonnet` with
/// `{utilization, resets_at}`, plus a newer `limits[]` list whose entries can
/// scope to a model (`scope.model.display_name`, e.g. "Fable").
fn parse_claude_limits(body: &str) -> Vec<LimitWindow> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(body) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut push = |name: &str, node: Option<&serde_json::Value>| {
        let Some(node) = node else { return };
        let Some(pct) = node.get("utilization").and_then(|u| u.as_f64()) else {
            return;
        };
        out.push(LimitWindow {
            name: name.into(),
            used_percent: pct.clamp(0.0, 100.0),
            resets_at: node.get("resets_at").and_then(parse_reset_value),
        });
    };
    push("5h session", v.get("five_hour"));
    push("weekly · all models", v.get("seven_day"));
    push("weekly · opus", v.get("seven_day_opus"));
    push("weekly · sonnet", v.get("seven_day_sonnet"));
    for entry in v
        .get("limits")
        .and_then(|l| l.as_array())
        .map(|a| a.as_slice())
        .unwrap_or_default()
    {
        if entry.get("is_active").and_then(|a| a.as_bool()) == Some(false) {
            continue;
        }
        let Some(pct) = entry.get("percent").and_then(|p| p.as_f64()) else {
            continue;
        };
        let model = entry
            .get("scope")
            .and_then(|s| s.get("model"))
            .and_then(|m| m.get("display_name"))
            .and_then(|n| n.as_str());
        let group = entry.get("group").and_then(|g| g.as_str());
        let name = match (group, model) {
            (Some(g), Some(m)) => format!("{g} · {m}"),
            (None, Some(m)) => m.to_owned(),
            (Some(g), None) => g.to_owned(),
            (None, None) => entry
                .get("kind")
                .and_then(|k| k.as_str())
                .unwrap_or("limit")
                .to_owned(),
        };
        // The flat seven_day_* fields above may repeat here in newer payloads.
        if out.iter().any(|w: &LimitWindow| w.name == name) {
            continue;
        }
        out.push(LimitWindow {
            name,
            used_percent: pct.clamp(0.0, 100.0),
            resets_at: entry.get("resets_at").and_then(parse_reset_value),
        });
    }
    out
}

fn codex_account_limits(
    home: &Path,
    local: Option<RateLimit>,
) -> (Vec<LimitWindow>, Option<String>) {
    let local_fallback = |note: String| -> (Vec<LimitWindow>, Option<String>) {
        match local {
            Some(l) => (
                vec![LimitWindow {
                    name: format!("{} · this device", humanize_window(l.window_minutes * 60)),
                    used_percent: l.used_percent.clamp(0.0, 100.0),
                    resets_at: l.resets_at,
                }],
                Some(note),
            ),
            None => (Vec::new(), Some(note)),
        }
    };
    if CODEX_SRC.load(Ordering::Relaxed) == 0 {
        return local_fallback(format!("stale local snapshot — {SETTINGS_HINT}"));
    }
    let creds = match codex_credentials(&home.join(".codex/auth.json")) {
        Ok(c) => c,
        Err(note) => return local_fallback(note),
    };
    let mut request = ureq::get("https://chatgpt.com/backend-api/wham/usage")
        .set("Authorization", &format!("Bearer {}", creds.0))
        .set("Accept", "application/json")
        .set("User-Agent", "launcharr")
        .timeout(Duration::from_secs(8));
    if let Some(account) = &creds.1 {
        request = request.set("ChatGPT-Account-Id", account);
    }
    match request.call() {
        Ok(r) => match r.into_string() {
            Ok(body) => {
                let windows = parse_codex_limits(&body);
                if windows.is_empty() {
                    local_fallback("codex limits: empty response".into())
                } else {
                    (windows, None)
                }
            }
            Err(_) => local_fallback("codex limits: unreadable response".into()),
        },
        Err(ureq::Error::Status(401 | 403, _)) => {
            local_fallback("codex token expired — run codex once, then reopen".into())
        }
        Err(e) => local_fallback(format!("codex limits: {}", short_err(&e))),
    }
}

/// (access_token, account_id) from the Codex CLI's auth file.
fn codex_credentials(path: &Path) -> Result<(String, Option<String>), String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|_| "no ~/.codex/auth.json — run codex to log in".to_string())?;
    let v: serde_json::Value =
        serde_json::from_str(&raw).map_err(|_| "auth.json unreadable".to_string())?;
    let tokens = v.get("tokens").ok_or("no tokens in auth.json")?;
    let access = tokens
        .get("access_token")
        .and_then(|t| t.as_str())
        .ok_or("no access_token in auth.json")?;
    let account = tokens
        .get("account_id")
        .and_then(|a| a.as_str())
        .map(str::to_owned);
    Ok((access.to_owned(), account))
}

/// The wham/usage shape (verified against CodexBar's decoder): `rate_limit`
/// with `primary_window`/`secondary_window` `{used_percent, reset_at,
/// limit_window_seconds}` plus named `additional_rate_limits`.
fn parse_codex_limits(body: &str) -> Vec<LimitWindow> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(body) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut push_windows = |label: Option<&str>, details: Option<&serde_json::Value>| {
        let Some(details) = details else { return };
        for key in ["primary_window", "secondary_window"] {
            let Some(w) = details.get(key) else { continue };
            let Some(pct) = w.get("used_percent").and_then(|p| p.as_f64()) else {
                continue;
            };
            let window = w
                .get("limit_window_seconds")
                .and_then(|s| s.as_u64())
                .unwrap_or(0);
            let base = humanize_window(window);
            out.push(LimitWindow {
                name: match label {
                    Some(l) => format!("{base} · {l}"),
                    None => base,
                },
                used_percent: pct.clamp(0.0, 100.0),
                resets_at: w.get("reset_at").and_then(|r| r.as_u64()),
            });
        }
    };
    push_windows(None, v.get("rate_limit"));
    for extra in v
        .get("additional_rate_limits")
        .and_then(|a| a.as_array())
        .map(|a| a.as_slice())
        .unwrap_or_default()
    {
        let label = extra.get("limit_name").and_then(|n| n.as_str());
        push_windows(label, extra.get("rate_limit"));
    }
    out
}

/// Window length in seconds → "5h" / "weekly" / "30m".
fn humanize_window(secs: u64) -> String {
    match secs {
        s if s >= 6 * 86_400 => "weekly".into(),
        s if s >= 3600 => format!("{}h", s / 3600),
        s if s > 0 => format!("{}m", s / 60),
        _ => "window".into(),
    }
}

/// `resets_at` arrives as an epoch number (codex-style) or an RFC3339 string.
fn parse_reset_value(v: &serde_json::Value) -> Option<u64> {
    if let Some(n) = v.as_u64() {
        return Some(n);
    }
    let s = v.as_str()?;
    parse_rfc3339_offset(s).map(|t| t as u64)
}

/// RFC3339 with `Z` or a numeric offset ("2026-08-17T09:00:00+10:00").
fn parse_rfc3339_offset(s: &str) -> Option<i64> {
    if let Some(t) = parse_rfc3339(s) {
        return Some(t);
    }
    let (idx, sign) = match (s.rfind('+'), s.rfind('-').filter(|&i| i > 10)) {
        (Some(i), _) => (i, 1),
        (None, Some(i)) => (i, -1),
        (None, None) => return None,
    };
    let offset_secs = sign * parse_hhmm_offset(&s[idx + 1..])?;
    parse_rfc3339(&format!("{}Z", &s[..idx])).map(|t| t - offset_secs)
}

fn parse_hhmm_offset(s: &str) -> Option<i64> {
    let (h, m) = s.split_once(':')?;
    let h: i64 = h.parse().ok()?;
    let m: i64 = m.parse().ok()?;
    Some(h * 3600 + m * 60)
}

fn short_err(e: &ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, _) => format!("HTTP {code}"),
        ureq::Error::Transport(_) => "network unreachable".into(),
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
                "{}: days={:?} models={:?} limits={:?} note={:?}",
                p.provider, p.days, p.models, p.limits, p.limits_note
            );
        }
        let rescan = std::time::Instant::now();
        let _ = scan();
        eprintln!("cached rescan took {:?}", rescan.elapsed());
    }

    #[test]
    fn parses_claude_account_limits() {
        let body = r#"{
            "five_hour": {"utilization": 62.5, "resets_at": "2026-08-16T11:00:00Z"},
            "seven_day": {"utilization": 41.0, "resets_at": "2026-08-19T09:00:00+10:00"},
            "seven_day_opus": {"utilization": 12.0, "resets_at": null},
            "limits": [
                {"kind": "weekly_scoped", "group": "weekly", "percent": 30.5,
                 "resets_at": 1787011420, "scope": {"model": {"display_name": "Fable"}}},
                {"kind": "weekly_scoped", "group": "weekly", "percent": 99.0,
                 "is_active": false, "scope": {"model": {"display_name": "Retired"}}}
            ]
        }"#;
        let limits = parse_claude_limits(body);
        let names: Vec<&str> = limits.iter().map(|l| l.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "5h session",
                "weekly · all models",
                "weekly · opus",
                "weekly · Fable"
            ]
        );
        assert_eq!(limits[0].used_percent, 62.5);
        // Anchored to the verified epoch in parses_rfc3339_and_buckets_days.
        assert_eq!(limits[0].resets_at, Some(1_786_878_000));
        // +10:00 offset: 09:00 AEST on the 19th = 23:00Z on the 18th.
        assert_eq!(limits[1].resets_at, Some(1_787_094_000));
        assert_eq!(limits[3].resets_at, Some(1_787_011_420));
        assert!(parse_claude_limits("not json").is_empty());
    }

    #[test]
    fn parses_codex_account_limits() {
        let body = r#"{
            "plan_type": "prolite",
            "rate_limit": {
                "primary_window": {"used_percent": 5, "reset_at": 1787011420, "limit_window_seconds": 604800},
                "secondary_window": {"used_percent": 40, "reset_at": 1786840000, "limit_window_seconds": 18000}
            },
            "additional_rate_limits": [
                {"limit_name": "GPT-5.3-Codex-Spark",
                 "rate_limit": {"primary_window": {"used_percent": 12, "reset_at": 1787000000, "limit_window_seconds": 604800}}}
            ]
        }"#;
        let limits = parse_codex_limits(body);
        let names: Vec<&str> = limits.iter().map(|l| l.name.as_str()).collect();
        assert_eq!(names, vec!["weekly", "5h", "weekly · GPT-5.3-Codex-Spark"]);
        assert_eq!(limits[0].used_percent, 5.0);
        assert_eq!(limits[1].resets_at, Some(1_786_840_000));
        assert!(parse_codex_limits("{}").is_empty());
    }

    #[test]
    fn extracts_credentials() {
        let claude = r#"{"claudeAiOauth":{"accessToken":"tok-1","expiresAt":9787000000000}}"#;
        assert_eq!(parse_claude_credentials(claude), Ok("tok-1".into()));
        assert!(parse_claude_credentials("{}").is_err());
        // Stale file copy (observed in the field): expiry beats a bare 401.
        let expired = r#"{"claudeAiOauth":{"accessToken":"tok","expiresAt":1000000000000}}"#;
        assert!(parse_claude_credentials(expired)
            .unwrap_err()
            .contains("expired"));
        let dir = std::env::temp_dir().join(format!("launcharr-usage-cred-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("tmp dir");
        let path = dir.join("auth.json");
        std::fs::write(
            &path,
            r#"{"tokens":{"access_token":"tok-2","account_id":"acct-9"}}"#,
        )
        .expect("write");
        assert_eq!(
            codex_credentials(&path),
            Ok(("tok-2".into(), Some("acct-9".into())))
        );
        assert!(codex_credentials(&dir.join("missing.json")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn humanizes_windows() {
        assert_eq!(humanize_window(604_800), "weekly");
        assert_eq!(humanize_window(18_000), "5h");
        assert_eq!(humanize_window(1_800), "30m");
        assert_eq!(humanize_window(0), "window");
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
            Vec::new(),
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
