//! Wifi panel data (P0, plans/panel-framework-and-wifi.md): status, known
//! networks, connect, power — everything `networksetup`/`ipconfig`/`route`/
//! `scutil` give away without Location Services. Scanning for unknown
//! networks is deliberately absent (needs the Location opt-in; see the plan).

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
        router: run("/usr/sbin/route", &["-n", "get", "default"])
            .as_deref()
            .and_then(parse_router),
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

pub fn connect(ssid: &str) -> CmdResult<()> {
    let iface = wifi_iface().ok_or_else(|| CmdError::Internal("no wifi interface".into()))?;
    validate_ssid(ssid)?;
    let out = run(
        "/usr/sbin/networksetup",
        &["-setairportnetwork", &iface, ssid],
    )
    .ok_or_else(|| CmdError::Internal("networksetup failed to run".into()))?;
    parse_connect_result(&out).map_err(CmdError::Internal)
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

/// `Wi-Fi Power (en0): On`
fn parse_power(out: &str) -> bool {
    out.trim_end().ends_with(": On")
}

/// `route -n get default` → `    gateway: 192.168.0.1`
fn parse_router(out: &str) -> Option<String> {
    out.lines()
        .map(str::trim)
        .find_map(|l| l.strip_prefix("gateway: "))
        .map(str::to_owned)
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
    fn parses_router() {
        let out = "   route to: default\ndestination: default\n    gateway: 192.168.0.1\n  interface: en0\n";
        assert_eq!(parse_router(out), Some("192.168.0.1".into()));
        assert_eq!(parse_router("no default route\n"), None);
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
    fn rejects_bad_ssids() {
        assert!(validate_ssid("").is_err());
        assert!(validate_ssid("--force").is_err());
        assert!(validate_ssid(&"x".repeat(65)).is_err());
        assert!(validate_ssid("RamenAmok-2.4").is_ok());
        assert!(validate_ssid("Ace Hotel Sydney").is_ok());
    }
}
