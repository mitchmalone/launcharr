//! Wifi panel data (P0, plans/panel-framework-and-wifi.md): status, known
//! networks, connect, power — everything `networksetup`/`ipconfig`/`route`/
//! `scutil` give away without Location Services. Scanning goes through
//! `system_profiler SPAirPortDataType -json` (2026-08-16), which reports
//! nearby SSIDs without the Location opt-in CoreWLAN would need; it takes
//! seconds, so the command is async and the panel shows a spinner.

use serde::Serialize;

use crate::bar_modules::{read_wifi, run, wifi_iface};
use crate::error::{CmdError, CmdResult};

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiStatus {
    pub iface: Option<String>,
    pub power: bool,
    pub online: bool,
    pub ssid: Option<String>,
    pub ip: Option<String>,
    pub router: Option<String>,
    pub dns: Option<String>,
}

pub fn status() -> WifiStatus {
    let Some(iface) = wifi_iface() else {
        return WifiStatus::default();
    };
    let state = read_wifi();
    let power = run("/usr/sbin/networksetup", &["-getairportpower", &iface])
        .as_deref()
        .map(parse_power)
        .unwrap_or(false);
    WifiStatus {
        power,
        online: state.online,
        ssid: state.ssid,
        ip: run("/usr/sbin/ipconfig", &["getifaddr", &iface])
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty()),
        // DHCP option 3 straight from ipconfig — `route` lives in /sbin (not
        // /usr/sbin, found 2026-08-16) and points at utun when Tailscale owns
        // the default route anyway.
        router: run("/usr/sbin/ipconfig", &["getoption", &iface, "router"])
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty()),
        dns: run("/usr/sbin/scutil", &["--dns"])
            .as_deref()
            .and_then(parse_first_nameserver),
        iface: Some(iface),
    }
}

pub fn known_networks() -> Vec<String> {
    let Some(iface) = wifi_iface() else {
        return Vec::new();
    };
    run(
        "/usr/sbin/networksetup",
        &["-listpreferredwirelessnetworks", &iface],
    )
    .as_deref()
    .map(parse_preferred_networks)
    .unwrap_or_default()
}

pub fn connect(ssid: &str, password: Option<&str>) -> CmdResult<()> {
    let iface = wifi_iface().ok_or_else(|| CmdError::Internal("no wifi interface".into()))?;
    validate_ssid(ssid)?;
    let mut args = vec!["-setairportnetwork", iface.as_str(), ssid];
    if let Some(pw) = password {
        validate_password(pw)?;
        args.push(pw);
    }
    let out = run("/usr/sbin/networksetup", &args)
        .ok_or_else(|| CmdError::Internal("networksetup failed to run".into()))?;
    parse_connect_result(&out).map_err(CmdError::Internal)
}

/// One scan hit; `signal` is dBm (larger = stronger) when the OS reports it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScanNetwork {
    pub ssid: String,
    pub secured: bool,
    pub signal: Option<i64>,
}

pub fn scan() -> CmdResult<Vec<ScanNetwork>> {
    let out = run("/usr/sbin/system_profiler", &["SPAirPortDataType", "-json"])
        .ok_or_else(|| CmdError::Internal("system_profiler failed to run".into()))?;
    parse_scan(&out).map_err(CmdError::Internal)
}

/// Walk the SPAirPort JSON to the interface carrying
/// `spairport_airport_other_local_wireless_networks`; dedupe SSIDs (bands show
/// up as separate hits) keeping the strongest signal, strongest first.
fn parse_scan(json: &str) -> Result<Vec<ScanNetwork>, String> {
    let root: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("scan parse: {e}"))?;
    let interfaces = root
        .get("SPAirPortDataType")
        .and_then(|v| v.get(0))
        .and_then(|v| v.get("spairport_airport_interfaces"))
        .and_then(|v| v.as_array())
        .ok_or("scan parse: no interfaces")?;
    let mut by_ssid: std::collections::HashMap<String, ScanNetwork> =
        std::collections::HashMap::new();
    for iface in interfaces {
        let Some(nets) = iface
            .get("spairport_airport_other_local_wireless_networks")
            .and_then(|v| v.as_array())
        else {
            continue;
        };
        for net in nets {
            let Some(ssid) = net.get("_name").and_then(|v| v.as_str()) else {
                continue;
            };
            // Security strings are prose-ish (one macOS build ships a typo'd
            // "pairport_security_mode_wpa3_transition"): open networks are the
            // ones that say none/open, everything else counts as secured.
            let secured = net
                .get("spairport_security_mode")
                .and_then(|v| v.as_str())
                .map(|s| !(s.contains("none") || s.contains("open")))
                .unwrap_or(true);
            let signal = net
                .get("spairport_signal_noise")
                .and_then(|v| v.as_str())
                .and_then(parse_signal_dbm);
            let hit = ScanNetwork {
                ssid: ssid.to_owned(),
                secured,
                signal,
            };
            match by_ssid.get(ssid) {
                Some(prev) if prev.signal >= hit.signal => {}
                _ => {
                    by_ssid.insert(ssid.to_owned(), hit);
                }
            }
        }
    }
    let mut nets: Vec<ScanNetwork> = by_ssid.into_values().collect();
    nets.sort_by(|a, b| {
        b.signal
            .cmp(&a.signal)
            .then_with(|| a.ssid.to_lowercase().cmp(&b.ssid.to_lowercase()))
    });
    Ok(nets)
}

/// `-44 dBm / -84 dBm` → -44
fn parse_signal_dbm(s: &str) -> Option<i64> {
    s.split_whitespace().next()?.parse().ok()
}

pub fn set_power(on: bool) -> CmdResult<()> {
    let iface = wifi_iface().ok_or_else(|| CmdError::Internal("no wifi interface".into()))?;
    run(
        "/usr/sbin/networksetup",
        &["-setairportpower", &iface, if on { "on" } else { "off" }],
    )
    .map(|_| ())
    .ok_or_else(|| CmdError::Internal("networksetup failed to run".into()))
}

/// SSIDs are near-arbitrary, but they end up as a process argument: forbid
/// empties, leading dashes (option injection), and absurd lengths.
fn validate_ssid(ssid: &str) -> CmdResult<()> {
    if ssid.is_empty() || ssid.len() > 64 || ssid.starts_with('-') {
        return Err(CmdError::Internal(format!("bad ssid: {ssid:?}")));
    }
    Ok(())
}

/// Same option-injection guard as SSIDs (WPA passphrases are 8–63 chars; a
/// leading dash would read as a networksetup flag). Never echo the value back.
fn validate_password(pw: &str) -> CmdResult<()> {
    if pw.is_empty() || pw.len() > 63 || pw.starts_with('-') {
        return Err(CmdError::Internal("bad wifi password".into()));
    }
    Ok(())
}

/// `Wi-Fi Power (en0): On`
fn parse_power(out: &str) -> bool {
    out.trim_end().ends_with(": On")
}

/// `scutil --dns` → first `nameserver[0] : 1.1.1.1`
fn parse_first_nameserver(out: &str) -> Option<String> {
    out.lines()
        .map(str::trim)
        .find(|l| l.starts_with("nameserver[0]"))
        .and_then(|l| l.split(" : ").nth(1))
        .map(str::to_owned)
}

/// Header line then one indented network per line, preference order.
fn parse_preferred_networks(out: &str) -> Vec<String> {
    out.lines()
        .skip(1)
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect()
}

/// networksetup exits 0 even on failure; errors arrive as prose on stdout.
fn parse_connect_result(out: &str) -> Result<(), String> {
    let msg = out.trim();
    if msg.is_empty() {
        return Ok(());
    }
    let lower = msg.to_lowercase();
    if lower.contains("failed") || lower.contains("could not") || lower.contains("error") {
        Err(msg.to_owned())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_power() {
        assert!(parse_power("Wi-Fi Power (en0): On\n"));
        assert!(!parse_power("Wi-Fi Power (en0): Off\n"));
    }

    #[test]
    fn parses_first_nameserver() {
        let out = "DNS configuration\n\nresolver #1\n  nameserver[0] : 1.1.1.1\n  nameserver[1] : 8.8.8.8\n";
        assert_eq!(parse_first_nameserver(out), Some("1.1.1.1".into()));
        assert_eq!(parse_first_nameserver(""), None);
    }

    #[test]
    fn parses_preferred_networks() {
        let out = "Preferred networks on en0:\n\tRamenAmok\n\tCinque\n\tW17_24\n";
        assert_eq!(
            parse_preferred_networks(out),
            vec!["RamenAmok", "Cinque", "W17_24"]
        );
        assert!(parse_preferred_networks("Preferred networks on en0:\n").is_empty());
    }

    #[test]
    fn connect_result_reads_prose_errors() {
        assert!(parse_connect_result("").is_ok());
        assert!(parse_connect_result("Failed to join network RamenAmok.\n").is_err());
        assert!(parse_connect_result("Could not find network Ghost.\n").is_err());
    }

    #[test]
    fn parses_scan_json() {
        let json = r#"{
          "SPAirPortDataType": [{
            "spairport_airport_interfaces": [
              { "_name": "awdl0" },
              {
                "_name": "en0",
                "spairport_airport_other_local_wireless_networks": [
                  { "_name": "Cinque",
                    "spairport_security_mode": "spairport_security_mode_wpa2_personal",
                    "spairport_signal_noise": "-70 dBm / -90 dBm" },
                  { "_name": "Cinque",
                    "spairport_security_mode": "spairport_security_mode_wpa2_personal",
                    "spairport_signal_noise": "-44 dBm / -84 dBm" },
                  { "_name": "Typo House",
                    "spairport_security_mode": "pairport_security_mode_wpa3_transition" },
                  { "_name": "Open Cafe",
                    "spairport_security_mode": "spairport_security_mode_none" }
                ]
              }
            ]
          }]
        }"#;
        let nets = parse_scan(json).unwrap();
        assert_eq!(
            nets,
            vec![
                ScanNetwork {
                    ssid: "Cinque".into(),
                    secured: true,
                    signal: Some(-44)
                },
                ScanNetwork {
                    ssid: "Open Cafe".into(),
                    secured: false,
                    signal: None
                },
                ScanNetwork {
                    ssid: "Typo House".into(),
                    secured: true,
                    signal: None
                },
            ]
        );
    }

    #[test]
    fn parses_signal_dbm() {
        assert_eq!(parse_signal_dbm("-44 dBm / -84 dBm"), Some(-44));
        assert_eq!(parse_signal_dbm(""), None);
    }

    #[test]
    fn rejects_bad_passwords() {
        assert!(validate_password("").is_err());
        assert!(validate_password("-hunter2").is_err());
        assert!(validate_password(&"x".repeat(64)).is_err());
        assert!(validate_password("correct horse battery").is_ok());
    }

    #[test]
    fn rejects_bad_ssids() {
        assert!(validate_ssid("").is_err());
        assert!(validate_ssid("--force").is_err());
        assert!(validate_ssid(&"x".repeat(65)).is_err());
        assert!(validate_ssid("RamenAmok-2.4").is_ok());
        assert!(validate_ssid("Ace Hotel Sydney").is_ok());
    }
}
