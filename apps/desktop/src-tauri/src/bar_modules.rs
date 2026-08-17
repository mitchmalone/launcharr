//! Bar data modules beyond the core aerospace/battery/clock set: wifi, ported
//! from the retired Sketchybar plugins. Slow sources refresh on their own
//! threads into statics so they never stall the 1 Hz push loop; `snapshot()`
//! only reads.

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

static WIFI: Mutex<WifiState> = Mutex::new(WifiState {
    online: false,
    ssid: None,
});

pub fn wifi() -> WifiState {
    WIFI.lock().unwrap().clone()
}

/// Start the refresh threads. Cadences match the Sketchybar update_freqs.
pub fn start() {
    std::thread::spawn(|| loop {
        refresh_wifi();
        std::thread::sleep(Duration::from_secs(20));
    });
}

pub(crate) fn run(bin: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(bin).args(args).output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

// ---- Wifi ------------------------------------------------------------------
//
// Cheap sources first: `ipconfig getsummary` exposes the SSID without
// Location Services on some macOS builds, `networksetup -getairportnetwork`
// on others. On builds that redact both (Tahoe, 2026-08-17) the only
// unprivileged truth is `system_profiler SPAirPortDataType`, which is a ~15 s
// radio scan — far too heavy for the 20 s poll, so it runs once per *join*:
// getsummary's DHCP lease start / router / security lines change on every
// association, and that key gates the slow resolve. The wifi panel's scan
// uses the same command, so its output tops up the cache for free. Never
// guess from known-network lists: a plausible name is worse than "hidden".
// Online-ness comes from LinkStatusActive.

/// Wi-Fi device name (e.g. "en0"); shared with the wifi panel (wifi.rs).
pub(crate) fn wifi_iface() -> Option<String> {
    run("/usr/sbin/networksetup", &["-listallhardwareports"])
        .as_deref()
        .and_then(parse_wifi_iface)
}

/// What the cheap probes give away in one pass.
#[derive(Debug, Default, PartialEq, Eq)]
struct WifiProbe {
    online: bool,
    ssid: Option<String>,
    /// Fingerprint of the current association (DHCP lease start, router,
    /// security, link); a change means a (re)join happened.
    join_key: String,
}

fn probe_wifi(iface: &str) -> WifiProbe {
    let summary = run("/usr/sbin/ipconfig", &["getsummary", iface]).unwrap_or_default();
    let mut probe = parse_getsummary(&summary);
    if probe.ssid.is_none() {
        probe.ssid = run("/usr/sbin/networksetup", &["-getairportnetwork", iface])
            .as_deref()
            .and_then(parse_airport_network);
    }
    probe
}

/// SSID resolved by the slow path, valid for one `join_key`. `attempts`
/// bounds retries when the scan comes back empty so a genuinely hidden SSID
/// doesn't cost a radio scan every poll.
#[derive(Debug, Default)]
struct Resolved {
    join_key: String,
    ssid: Option<String>,
    attempts: u8,
}

const RESOLVE_ATTEMPTS: u8 = 3;

static RESOLVED: Mutex<Resolved> = Mutex::new(Resolved {
    join_key: String::new(),
    ssid: None,
    attempts: 0,
});

/// Cached slow-path SSID for this association, if any.
fn resolved_for(join_key: &str) -> Option<String> {
    let r = RESOLVED.lock().unwrap();
    (r.join_key == join_key).then(|| r.ssid.clone()).flatten()
}

/// Whether the slow path should run for this association: never resolved,
/// or resolved empty fewer than RESOLVE_ATTEMPTS times.
fn needs_resolve(join_key: &str) -> bool {
    let r = RESOLVED.lock().unwrap();
    r.join_key != join_key || (r.ssid.is_none() && r.attempts < RESOLVE_ATTEMPTS)
}

fn record_resolved(join_key: &str, ssid: Option<String>) {
    let mut r = RESOLVED.lock().unwrap();
    if r.join_key != join_key {
        r.attempts = 0;
    }
    r.join_key = join_key.to_owned();
    r.attempts = r.attempts.saturating_add(1);
    r.ssid = ssid;
}

/// Non-blocking read: cheap probes plus whatever the slow path already
/// resolved for this association. Safe from Tauri commands.
pub(crate) fn read_wifi() -> WifiState {
    let Some(iface) = wifi_iface() else {
        return WifiState::default();
    };
    let probe = probe_wifi(&iface);
    let ssid = probe.ssid.or_else(|| {
        probe
            .online
            .then(|| resolved_for(&probe.join_key))
            .flatten()
    });
    WifiState {
        online: probe.online,
        ssid,
    }
}

/// One poller tick: publish the cheap state, then — only when the SSID is
/// redacted for a not-yet-resolved association — block on the ~15 s scan and
/// publish again. Runs on the wifi refresh thread only.
fn refresh_wifi() {
    let Some(iface) = wifi_iface() else {
        *WIFI.lock().unwrap() = WifiState::default();
        return;
    };
    let probe = probe_wifi(&iface);
    let cheap = WifiState {
        online: probe.online,
        ssid: probe.ssid.clone().or_else(|| resolved_for(&probe.join_key)),
    };
    *WIFI.lock().unwrap() = cheap.clone();
    if cheap.ssid.is_some() || !probe.online || !needs_resolve(&probe.join_key) {
        return;
    }
    let ssid = run("/usr/sbin/system_profiler", &["SPAirPortDataType", "-json"])
        .as_deref()
        .and_then(parse_current_network);
    record_resolved(&probe.join_key, ssid.clone());
    // The association may have changed during the scan; only publish if the
    // fingerprint still matches, otherwise the next tick sorts it out.
    if probe_wifi(&iface).join_key == probe.join_key {
        *WIFI.lock().unwrap() = WifiState {
            online: probe.online,
            ssid,
        };
    }
}

/// The wifi panel's scan is the same `system_profiler` call: harvest the
/// current network name from it so the bar learns the SSID without a second
/// scan.
pub(crate) fn note_scan_output(json: &str) {
    let Some(ssid) = parse_current_network(json) else {
        return;
    };
    let Some(iface) = wifi_iface() else {
        return;
    };
    let probe = probe_wifi(&iface);
    record_resolved(&probe.join_key, Some(ssid.clone()));
    if probe.online && probe.ssid.is_none() {
        *WIFI.lock().unwrap() = WifiState {
            online: true,
            ssid: Some(ssid),
        };
    }
}

/// `spairport_current_network_information._name` from SPAirPort JSON — the
/// one field macOS doesn't redact without Location Services.
pub(crate) fn parse_current_network(json: &str) -> Option<String> {
    let root: serde_json::Value = serde_json::from_str(json).ok()?;
    root.get("SPAirPortDataType")?
        .get(0)?
        .get("spairport_airport_interfaces")?
        .as_array()?
        .iter()
        .find_map(|iface| {
            iface
                .get("spairport_current_network_information")?
                .get("_name")?
                .as_str()
                .filter(|s| valid_ssid(s))
                .map(str::to_owned)
        })
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

/// Lines of `ipconfig getsummary` that fingerprint an association.
const JOIN_KEY_FIELDS: [&str; 4] = [
    "LinkStatusActive : ",
    "LeaseStartTime : ",
    "Router : ",
    "Security : ",
];

/// SSID (redacted → None), link-active, and join fingerprint from
/// `ipconfig getsummary`.
fn parse_getsummary(out: &str) -> WifiProbe {
    let mut probe = WifiProbe::default();
    let mut key = Vec::new();
    for line in out.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("SSID : ") {
            if valid_ssid(v) {
                probe.ssid = Some(v.to_owned());
            }
        } else if let Some(v) = line.strip_prefix("LinkStatusActive : ") {
            probe.online = v.trim() == "TRUE";
        }
        if JOIN_KEY_FIELDS.iter().any(|f| line.starts_with(f)) {
            key.push(line.to_owned());
        }
    }
    probe.join_key = key.join("|");
    probe
}

fn parse_airport_network(out: &str) -> Option<String> {
    let v = out.trim().strip_prefix("Current Wi-Fi Network: ")?;
    valid_ssid(v).then(|| v.to_owned())
}

fn valid_ssid(s: &str) -> bool {
    !s.is_empty() && s != "<redacted>" && !s.starts_with("You are not associated")
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
        let p = parse_getsummary(redacted);
        assert_eq!((p.ssid, p.online), (None, true));
        let clear = "  SSID : Cinque\n  LinkStatusActive : TRUE\n";
        let p = parse_getsummary(clear);
        assert_eq!((p.ssid, p.online), (Some("Cinque".into()), true));
        assert_eq!(parse_getsummary(""), WifiProbe::default());
    }

    #[test]
    fn join_key_tracks_association_not_ssid() {
        let a = "  BSSID : <redacted>\n      LeaseStartTime : 08/17/2026 08:18:12\n      Router : 192.168.1.1\n  LinkStatusActive : TRUE\n  SSID : <redacted>\n  Security : WPA2_PSK\n";
        let b = a.replace("08:18:12", "09:00:00");
        let same_but_redacted_differently = a.replace("<redacted>", "<hidden>");
        assert_ne!(parse_getsummary(a).join_key, parse_getsummary(&b).join_key);
        assert_eq!(
            parse_getsummary(a).join_key,
            parse_getsummary(&same_but_redacted_differently).join_key
        );
        assert!(!parse_getsummary(a).join_key.contains("SSID"));
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
    fn parses_current_network_from_system_profiler() {
        let json = r#"{"SPAirPortDataType":[{"spairport_airport_interfaces":[
            {"_name":"en0","spairport_current_network_information":{"_name":"RamenAmok-2.4","spairport_network_channel":"1 (2GHz, 20MHz)"}},
            {"_name":"awdl0","spairport_current_network_information":{"spairport_network_type":"spairport_network_type_station"}}
        ]}]}"#;
        assert_eq!(parse_current_network(json), Some("RamenAmok-2.4".into()));
        let off = r#"{"SPAirPortDataType":[{"spairport_airport_interfaces":[{"_name":"en0"}]}]}"#;
        assert_eq!(parse_current_network(off), None);
        assert_eq!(parse_current_network("not json"), None);
    }

    #[test]
    fn resolve_cache_is_per_join_and_bounded() {
        record_resolved("k1", None);
        assert!(needs_resolve("k1"));
        record_resolved("k1", None);
        record_resolved("k1", None);
        assert!(!needs_resolve("k1"), "gives up after RESOLVE_ATTEMPTS");
        assert!(needs_resolve("k2"), "new association resolves again");
        record_resolved("k2", Some("Cinque".into()));
        assert_eq!(resolved_for("k2"), Some("Cinque".into()));
        assert_eq!(resolved_for("k1"), None);
        assert!(!needs_resolve("k2"));
    }

    #[test]
    #[ignore = "runs the ~15 s system_profiler scan against this Mac; run by hand to check the resolved SSID"]
    fn live_wifi_resolve() {
        let iface = wifi_iface().expect("wifi iface");
        let probe = probe_wifi(&iface);
        println!("probe: {probe:#?}");
        refresh_wifi();
        println!("published: {:#?}", wifi());
        if probe.online {
            assert!(wifi().ssid.is_some(), "online but SSID unresolved");
        }
    }
}
