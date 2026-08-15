//! Bar data modules beyond the core aerospace/battery/clock set: wifi and the
//! TRMNL device battery, ported from the retired Sketchybar plugins. Slow
//! sources refresh on their own threads into statics (an 8s HTTP timeout must
//! never stall the 1 Hz push loop); `snapshot()` only reads.

use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiState {
    pub online: bool,
    /// None while online means the SSID couldn't be recovered ("SSID hidden").
    pub ssid: Option<String>,
}

/// Present only when a TRMNL API token is available; `pct: None` means the
/// token exists but the API call failed (rendered as an error state).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrmnlState {
    pub pct: Option<u8>,
    pub name: Option<String>,
}

static WIFI: Mutex<WifiState> = Mutex::new(WifiState {
    online: false,
    ssid: None,
});
static TRMNL: Mutex<Option<TrmnlState>> = Mutex::new(None);

pub fn wifi() -> WifiState {
    WIFI.lock().unwrap().clone()
}

pub fn trmnl() -> Option<TrmnlState> {
    TRMNL.lock().unwrap().clone()
}

/// Start the refresh threads. Cadences match the Sketchybar update_freqs.
pub fn start() {
    std::thread::spawn(|| loop {
        let state = read_wifi();
        *WIFI.lock().unwrap() = state;
        std::thread::sleep(Duration::from_secs(20));
    });
    std::thread::spawn(|| loop {
        let state = read_trmnl();
        *TRMNL.lock().unwrap() = state;
        std::thread::sleep(Duration::from_secs(300));
    });
}

fn run(bin: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(bin).args(args).output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

// ---- Wifi ------------------------------------------------------------------
//
// The SSID chain from the sketchybar plugin, verbatim: `ipconfig getsummary`
// exposes SSID without Location Services on some macOS builds but redacts it
// on others; `networksetup -getairportnetwork` is the first fallback; the
// WiFiAgent plist heuristic (prefer `WIFI_HOME_SSID`, else a sole entry) is
// the last. Online-ness comes from LinkStatusActive.

fn read_wifi() -> WifiState {
    let Some(iface) = run("/usr/sbin/networksetup", &["-listallhardwareports"])
        .as_deref()
        .and_then(parse_wifi_iface)
    else {
        return WifiState::default();
    };
    let summary = run("/usr/sbin/ipconfig", &["getsummary", &iface]).unwrap_or_default();
    let (mut ssid, online) = parse_getsummary(&summary);
    if ssid.is_none() {
        ssid = run("/usr/sbin/networksetup", &["-getairportnetwork", &iface])
            .as_deref()
            .and_then(parse_airport_network);
    }
    if ssid.is_none() && online {
        let preferred = std::env::var("WIFI_HOME_SSID").unwrap_or_else(|_| "RamenAmok".into());
        ssid = run(
            "/usr/libexec/PlistBuddy",
            &[
                "-c",
                "Print :UserDismissedLimitedNetworkFirstJoins",
                &format!(
                    "{}/Library/Preferences/com.apple.wifi.WiFiAgent.plist",
                    std::env::var("HOME").unwrap_or_default()
                ),
            ],
        )
        .as_deref()
        .and_then(|out| parse_wifi_agent(out, &preferred));
    }
    WifiState { online, ssid }
}

/// Device name on the line after the Wi-Fi/AirPort hardware port.
fn parse_wifi_iface(out: &str) -> Option<String> {
    let mut lines = out.lines();
    while let Some(line) = lines.next() {
        if line.contains("Wi-Fi") || line.contains("AirPort") {
            return lines
                .next()?
                .strip_prefix("Device: ")
                .map(|d| d.trim().to_owned());
        }
    }
    None
}

/// (ssid, link-active) from `ipconfig getsummary`; redacted SSIDs are None.
fn parse_getsummary(out: &str) -> (Option<String>, bool) {
    let mut ssid = None;
    let mut online = false;
    for line in out.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("SSID : ") {
            if valid_ssid(v) {
                ssid = Some(v.to_owned());
            }
        } else if let Some(v) = line.strip_prefix("LinkStatusActive : ") {
            online = v.trim() == "TRUE";
        }
    }
    (ssid, online)
}

fn parse_airport_network(out: &str) -> Option<String> {
    let v = out.trim().strip_prefix("Current Wi-Fi Network: ")?;
    valid_ssid(v).then(|| v.to_owned())
}

/// Known networks from WiFiAgent: the preferred name if present, else a sole
/// entry, else nothing — guessing among many known networks would lie.
fn parse_wifi_agent(out: &str, preferred: &str) -> Option<String> {
    let names: Vec<&str> = out
        .lines()
        .filter(|l| l.contains(" = "))
        .filter_map(|l| l.split(" = ").next())
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .collect();
    if names.contains(&preferred) {
        return Some(preferred.to_owned());
    }
    match names.as_slice() {
        [only] => Some((*only).to_owned()),
        _ => None,
    }
}

fn valid_ssid(s: &str) -> bool {
    !s.is_empty() && s != "<redacted>" && !s.starts_with("You are not associated")
}

// ---- TRMNL -----------------------------------------------------------------

fn read_trmnl() -> Option<TrmnlState> {
    let token = trmnl_token()?;
    let url =
        std::env::var("TRMNL_API_URL").unwrap_or_else(|_| "https://trmnl.com/api/devices".into());
    let body = ureq::get(&url)
        .set("Authorization", &format!("Bearer {token}"))
        .timeout(Duration::from_secs(8))
        .call()
        .ok()
        .and_then(|r| r.into_string().ok());
    match body.as_deref().and_then(parse_trmnl_devices) {
        Some(state) => Some(state),
        // Token exists but the API failed: visible error state, not hidden.
        None => Some(TrmnlState::default()),
    }
}

/// `TRMNL_API_KEY` wins; otherwise the age/secret decrypt helper the
/// sketchybar module used. No token → module hidden entirely.
fn trmnl_token() -> Option<String> {
    if let Ok(token) = std::env::var("TRMNL_API_KEY") {
        if !token.trim().is_empty() {
            return Some(token.trim().to_owned());
        }
    }
    let helper = std::env::var("AGE_DECRYPT_HELPER").unwrap_or_else(|_| {
        format!(
            "{}/.config/age/decrypt.sh",
            std::env::var("HOME").unwrap_or_default()
        )
    });
    let id = std::env::var("TRMNL_API_SECRET_ID").unwrap_or_else(|_| "shared/trmnl/api_key".into());
    let request = format!("{{\"protocolVersion\":1,\"ids\":[\"{id}\"]}}\n");
    let mut child = Command::new(&helper)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    use std::io::Write;
    child.stdin.take()?.write_all(request.as_bytes()).ok()?;
    let out = child.wait_with_output().ok()?;
    let json: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    let token = json.get("values")?.get(&id)?.as_str()?.trim().to_owned();
    (!token.is_empty()).then_some(token)
}

/// Most recently pinged device's charge, from the /api/devices payload.
fn parse_trmnl_devices(body: &str) -> Option<TrmnlState> {
    let json: serde_json::Value = serde_json::from_str(body).ok()?;
    let devices = json.get("data")?.as_array()?;
    let latest = devices.iter().max_by_key(|d| {
        d.get("hardware_last_ping_at")
            .or_else(|| d.get("last_ping_at"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned()
    })?;
    let pct = latest
        .get("percent_charged")
        .and_then(|v| v.as_f64())
        .map(|p| p.round().clamp(0.0, 100.0) as u8);
    let name = latest
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::to_owned);
    Some(TrmnlState { pct, name })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_wifi_iface() {
        let out = "Hardware Port: Thunderbolt Bridge\nDevice: bridge0\n\nHardware Port: Wi-Fi\nDevice: en0\nEthernet Address: aa:bb\n";
        assert_eq!(parse_wifi_iface(out), Some("en0".into()));
        assert_eq!(
            parse_wifi_iface("Hardware Port: Ethernet\nDevice: en5\n"),
            None
        );
    }

    #[test]
    fn parses_getsummary_states() {
        let redacted = "  LinkStatusActive : TRUE\n  SSID : <redacted>\n";
        assert_eq!(parse_getsummary(redacted), (None, true));
        let clear = "  SSID : Cinque\n  LinkStatusActive : TRUE\n";
        assert_eq!(parse_getsummary(clear), (Some("Cinque".into()), true));
        assert_eq!(parse_getsummary(""), (None, false));
    }

    #[test]
    fn parses_airport_network() {
        assert_eq!(
            parse_airport_network("Current Wi-Fi Network: RamenAmok\n"),
            Some("RamenAmok".into())
        );
        assert_eq!(
            parse_airport_network("You are not associated with an AirPort network.\n"),
            None
        );
    }

    #[test]
    fn wifi_agent_prefers_home_then_sole_entry() {
        let many = "    Airport Free Wi-Fi = 1\n    RamenAmok = 2\n    WeWorkGuest = 3\n";
        assert_eq!(
            parse_wifi_agent(many, "RamenAmok"),
            Some("RamenAmok".into())
        );
        assert_eq!(parse_wifi_agent(many, "Elsewhere"), None);
        let sole = "    OnlyNet = 1\n";
        assert_eq!(parse_wifi_agent(sole, "RamenAmok"), Some("OnlyNet".into()));
    }

    #[test]
    fn parses_trmnl_devices() {
        let body = r#"{"data":[
            {"name":"Desk","friendly_id":"ABC","percent_charged":66.7,
             "battery_voltage":3.9,"hardware_last_ping_at":"2026-08-16T01:00:00Z"},
            {"name":"Old","friendly_id":"XYZ","percent_charged":10.0,
             "last_ping_at":"2026-08-01T01:00:00Z"}
        ]}"#;
        assert_eq!(
            parse_trmnl_devices(body),
            Some(TrmnlState {
                pct: Some(67),
                name: Some("Desk".into())
            })
        );
        assert_eq!(parse_trmnl_devices("{}"), None);
        assert_eq!(parse_trmnl_devices("not json"), None);
    }
}
