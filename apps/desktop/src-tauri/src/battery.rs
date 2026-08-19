//! Battery facts for the bar: the cheap reading the strip cell needs every
//! tick, and the fuller detail the hover card asks for on demand.
//!
//! Two sources, both permission-free CLIs: `pmset -g batt` for percent/AC/
//! charging (fast, already used by the strip), and `ioreg -rn AppleSmartBattery`
//! plus `pmset -g custom` for the card (cycles, capacity, draw, power mode).
//! Parsing is plain functions over captured output — the spawns are the only
//! untestable part.

use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

/// `(percent, on AC, charging)` — what the strip cell renders.
pub type Reading = (Option<u8>, bool, bool);

/// Battery changes on the scale of minutes; don't pay a pmset spawn per tick.
pub fn cached() -> Reading {
    static CACHE: Mutex<Option<(Instant, Reading)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, value)) = *cache {
        if at.elapsed() < Duration::from_secs(30) {
            return value;
        }
    }
    let value = Command::new("/usr/bin/pmset")
        .args(["-g", "batt"])
        .output()
        .ok()
        .map(|out| parse_battery(&String::from_utf8_lossy(&out.stdout)))
        .unwrap_or((None, false, false));
    *cache = Some((Instant::now(), value));
    value
}

/// The active charge limit, if the user set one. macOS keeps it in
/// `/Library/Preferences/com.apple.powerd.charging.plist` (world-readable): a
/// `policies` blob that is itself an NSKeyedArchiver plist of ChargeCtrlPolicy
/// objects — the one with `soclimit` (and not `terminated`) is the limit.
/// Cached a minute; the file only changes when the setting does.
pub fn charge_limit() -> Option<u8> {
    static CACHE: Mutex<Option<(Instant, Option<u8>)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, value)) = *cache {
        if at.elapsed() < Duration::from_secs(60) {
            return value;
        }
    }
    let value = std::fs::read("/Library/Preferences/com.apple.powerd.charging.plist")
        .ok()
        .and_then(|bytes| plist::Value::from_reader(std::io::Cursor::new(bytes)).ok())
        .and_then(|v| parse_charge_limit(&v));
    *cache = Some((Instant::now(), value));
    value
}

/// Walk the outer plist → `policies` data → archived `$objects` for a live
/// `soclimit`. Plain function over the parsed value so it's testable.
pub fn parse_charge_limit(outer: &plist::Value) -> Option<u8> {
    let blob = outer.as_dictionary()?.get("policies")?.as_data()?;
    let archive = plist::Value::from_reader(std::io::Cursor::new(blob)).ok()?;
    let objects = archive.as_dictionary()?.get("$objects")?.as_array()?;
    objects.iter().find_map(|o| {
        let d = o.as_dictionary()?;
        let limit = d.get("soclimit")?.as_signed_integer()?;
        let terminated = d
            .get("terminated")
            .and_then(plist::Value::as_boolean)
            .unwrap_or(false);
        (!terminated && (1..=100).contains(&limit)).then_some(limit as u8)
    })
}

/// Parse `pmset -g batt`: percentage from the first `NN%` token, AC from the
/// "Now drawing from 'AC Power'" header, charging from the state field
/// ("discharging" must not count).
pub fn parse_battery(out: &str) -> Reading {
    let pct = out.split('%').next().and_then(|before| {
        let digits: String = before
            .chars()
            .rev()
            .take_while(char::is_ascii_digit)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        digits.parse().ok()
    });
    let charging = out.contains("; charging") || out.contains("; finishing charge");
    (pct, out.contains("AC Power"), charging)
}

/// Everything the hover card shows. Every field is optional: `ioreg` key
/// shapes differ across Intel/Apple Silicon and macOS versions, and the card
/// simply drops rows it can't fill (desktop Macs drop the whole cell).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryDetail {
    pub pct: Option<u8>,
    pub on_ac: bool,
    pub charging: bool,
    pub fully_charged: bool,
    /// The user's charge limit (Battery → "Limit to 80 %"), when one is set —
    /// the strip treats that as full ("adjusted charge"); the card keeps the
    /// true percentage. None = no limit / unknown.
    pub charge_limit: Option<u8>,
    pub cycle_count: Option<u32>,
    /// Full-charge capacity in watt-hours (what this pack holds today).
    pub capacity_wh: Option<f64>,
    /// Design capacity in watt-hours (what it held new).
    pub design_wh: Option<f64>,
    /// Full-charge over design, capped at 100 — Apple's "maximum capacity".
    pub health_pct: Option<u8>,
    /// Minutes to empty (discharging) or to full (charging); `None` = unknown,
    /// which is what macOS reports for the first minutes after a state change.
    pub minutes_remaining: Option<u32>,
    /// Battery flow in watts, signed: negative discharging, positive charging.
    pub battery_watts: Option<f64>,
    /// Whole-system draw from the adapter in watts (only meaningful on AC).
    pub system_watts: Option<f64>,
    /// Active power mode for the current source: `low` | `automatic` | `high`.
    pub power_mode: Option<String>,
}

/// The card's data, cached for 20s — hover re-opens shouldn't respawn `ioreg`,
/// and nothing here moves faster than that anyway.
pub fn detail() -> BatteryDetail {
    static CACHE: Mutex<Option<(Instant, BatteryDetail)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, value)) = cache.as_ref() {
        if at.elapsed() < Duration::from_secs(20) {
            return value.clone();
        }
    }
    let ioreg = Command::new("/usr/sbin/ioreg")
        .args(["-rn", "AppleSmartBattery"])
        .output()
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
        .unwrap_or_default();
    let custom = Command::new("/usr/bin/pmset")
        .args(["-g", "custom"])
        .output()
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
        .unwrap_or_default();
    let value = build_detail(cached(), &ioreg, &custom, charge_limit());
    *cache = Some((Instant::now(), value.clone()));
    value
}

/// `ioreg` reports "unknown" time estimates as u16 max.
const TIME_UNKNOWN: i64 = 65535;

/// Assemble the card's view from a strip reading plus raw `ioreg`/`pmset`
/// output. Pure so the whole shape is testable off captured fixtures.
fn build_detail(
    reading: Reading,
    ioreg: &str,
    custom: &str,
    charge_limit: Option<u8>,
) -> BatteryDetail {
    let (pct, on_ac, charging) = reading;
    let volts = ioreg_num(ioreg, "Voltage").map(|mv| mv as f64 / 1000.0);
    // mAh × V → Wh. Apple reports capacity in mAh and voltage in mV.
    let wh = |mah: Option<i64>| match (mah, volts) {
        (Some(mah), Some(v)) if mah > 0 => Some((mah as f64 * v / 1000.0 * 10.0).round() / 10.0),
        _ => None,
    };
    let full = ioreg_num(ioreg, "FullChargeCapacity");
    let design = ioreg_num(ioreg, "DesignCapacity");
    let health_pct = match (full, design) {
        (Some(f), Some(d)) if d > 0 => Some(((f * 100 / d) as u8).min(100)),
        _ => None,
    };
    let minutes = if charging {
        ioreg_num(ioreg, "AvgTimeToFull")
    } else {
        ioreg_num(ioreg, "AvgTimeToEmpty")
    };
    let minutes_remaining = minutes
        .filter(|m| *m > 0 && *m < TIME_UNKNOWN)
        .map(|m| m as u32);
    // Amperage is a two's-complement value printed unsigned; negative = drain.
    let amps = ioreg_num(ioreg, "Amperage")
        .filter(|ma| *ma != 0)
        .or_else(|| ioreg_num(ioreg, "InstantAmperage").filter(|ma| *ma != 0));
    let battery_watts = match (amps, volts) {
        (Some(ma), Some(v)) => Some((ma as f64 / 1000.0 * v * 10.0).round() / 10.0),
        _ => None,
    };
    BatteryDetail {
        pct,
        on_ac,
        charging,
        fully_charged: ioreg_flag(ioreg, "FullyCharged").unwrap_or(false),
        charge_limit,
        cycle_count: ioreg_num(ioreg, "CycleCount").and_then(|c| u32::try_from(c).ok()),
        capacity_wh: wh(full),
        design_wh: wh(design),
        health_pct,
        minutes_remaining,
        battery_watts,
        system_watts: ioreg_num(ioreg, "SystemPowerIn")
            .filter(|mw| *mw > 0)
            .map(|mw| (mw as f64 / 100.0).round() / 10.0),
        power_mode: parse_power_mode(custom, on_ac),
    }
}

/// First numeric value for a quoted `ioreg` key, at any nesting depth: the
/// printed form is `"Key" = 13` at top level and `"Key"=13` inside dicts.
/// Searching for the quoted key means `"FedDesignCapacity"` can't answer for
/// `"DesignCapacity"`. Values are printed unsigned even when they're
/// two's-complement negatives, hence the `as i64`.
fn ioreg_num(out: &str, key: &str) -> Option<i64> {
    let rest = after_key(out, key)?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    digits.parse::<u64>().ok().map(|v| v as i64)
}

/// Flags print as `Yes`/`No` at top level but as `1`/`0` inside dicts — and
/// the nested copy usually comes first, so both spellings must read.
fn ioreg_flag(out: &str, key: &str) -> Option<bool> {
    let rest = after_key(out, key)?;
    if rest.starts_with("Yes") {
        Some(true)
    } else if rest.starts_with("No") {
        Some(false)
    } else {
        ioreg_num(out, key).map(|n| n != 0)
    }
}

/// The text just past `"Key" = ` / `"Key"=`, with the separator eaten.
fn after_key<'a>(out: &'a str, key: &str) -> Option<&'a str> {
    let at = out.find(&format!("\"{key}\""))?;
    let rest = out[at + key.len() + 2..].trim_start();
    Some(rest.strip_prefix('=')?.trim_start())
}

/// `pmset -g custom` prints one block per power source; `powermode` inside the
/// active block is 0 automatic / 1 low / 2 high. Macs without the setting
/// simply omit the line, and the card then omits the row.
fn parse_power_mode(custom: &str, on_ac: bool) -> Option<String> {
    let header = if on_ac { "AC Power:" } else { "Battery Power:" };
    let block = custom.split(header).nth(1)?;
    // Stop at the next source block so we never read the other one's value.
    let block = block.split("Power:").next().unwrap_or(block);
    let value: u8 = block
        .lines()
        .find_map(|l| l.trim().strip_prefix("powermode"))?
        .trim()
        .parse()
        .ok()?;
    match value {
        0 => Some("automatic".into()),
        1 => Some("low".into()),
        2 => Some("high".into()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build the two-layer plist macOS writes: outer dict → `policies` data →
    /// archived `$objects` array holding a ChargeCtrlPolicy dict.
    fn charging_plist(soclimit: i64, terminated: bool) -> plist::Value {
        let mut policy = plist::Dictionary::new();
        policy.insert("soclimit".into(), plist::Value::Integer(soclimit.into()));
        policy.insert("terminated".into(), plist::Value::Boolean(terminated));
        policy.insert("reason".into(), plist::Value::Integer(3.into()));
        let mut archive = plist::Dictionary::new();
        archive.insert(
            "$objects".into(),
            plist::Value::Array(vec![
                plist::Value::String("$null".into()),
                plist::Value::Dictionary(policy),
                plist::Value::String("manualChargeLimit".into()),
            ]),
        );
        let mut blob = Vec::new();
        plist::Value::Dictionary(archive)
            .to_writer_binary(&mut blob)
            .unwrap();
        let mut outer = plist::Dictionary::new();
        outer.insert("bootSessionUUID".into(), plist::Value::String("x".into()));
        outer.insert("policies".into(), plist::Value::Data(blob));
        plist::Value::Dictionary(outer)
    }

    #[test]
    fn reads_the_charge_limit_policy() {
        assert_eq!(parse_charge_limit(&charging_plist(80, false)), Some(80));
        assert_eq!(parse_charge_limit(&charging_plist(80, true)), None);
        assert_eq!(parse_charge_limit(&charging_plist(0, false)), None);
        assert_eq!(
            parse_charge_limit(&plist::Value::Dictionary(plist::Dictionary::new())),
            None
        );
    }

    #[test]
    fn parses_battery_discharging() {
        let out = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=5308515)\t89%; discharging; 4:32 remaining present: true\n";
        assert_eq!(parse_battery(out), (Some(89), false, false));
    }

    #[test]
    fn parses_battery_on_ac() {
        let out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=5308515)\t100%; charged; 0:00 remaining present: true\n";
        assert_eq!(parse_battery(out), (Some(100), true, false));
    }

    #[test]
    fn parses_battery_charging() {
        let out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=5308515)\t64%; charging; 1:10 remaining present: true\n";
        assert_eq!(parse_battery(out), (Some(64), true, true));
    }

    #[test]
    fn battery_absent_on_desktops() {
        assert_eq!(
            parse_battery("Now drawing from 'AC Power'\n"),
            (None, true, false)
        );
    }

    /// Trimmed from a real `ioreg -rn AppleSmartBattery` on an M-series laptop:
    /// the keys we read, in the shapes they're printed in (top level, nested
    /// dict, and the unsigned-printed negative amperage).
    const IOREG: &str = r#"+-o AppleSmartBattery  <class AppleSmartBattery, id 0x100000e45>
  | {
  |   "TimeRemaining" = 298
  |   "ExternalConnected" = No
  |   "AvgTimeToEmpty" = 298
  |   "Voltage" = 12336
  |   "MaxCapacity" = 100
  |   "CurrentCapacity" = 80
  |   "PowerTelemetryData" = {"SystemLoad"=8580,"SystemPowerIn"=8580,"SystemVoltageIn"=19544}
  |   "CycleCount" = 13
  |   "BatteryData" = {"FullChargeCapacity"=8745,"NominalChargeCapacity"=8989,"FullyCharged"=0,"DesignCapacity"=9000,"CurrentCapacity"=80}
  |   "AvgTimeToFull" = 65535
  |   "FedDetails" = ({"FedDesignCapacity"=0,"FedStateOfCharge"=0})
  |   "InstantAmperage" = 18446744073709551543
  |   "FullyCharged" = No
  |   "Amperage" = 18446744073709551543
  |   "IsCharging" = No
  | }
"#;

    const CUSTOM: &str = "Battery Power:\n powermode            1\n displaysleep         2\nAC Power:\n powermode            2\n displaysleep         10\n";

    #[test]
    fn reads_ioreg_keys_at_any_depth() {
        // Top level, nested dict, and a key that only a prefix-match would hit.
        assert_eq!(ioreg_num(IOREG, "CycleCount"), Some(13));
        assert_eq!(ioreg_num(IOREG, "DesignCapacity"), Some(9000));
        assert_eq!(ioreg_num(IOREG, "FullChargeCapacity"), Some(8745));
        // The nested `"FullyCharged"=0` comes first — flags read either spelling.
        assert_eq!(ioreg_flag(IOREG, "FullyCharged"), Some(false));
        assert_eq!(ioreg_flag(IOREG, "ExternalConnected"), Some(false));
        assert_eq!(ioreg_num(IOREG, "NoSuchKey"), None);
    }

    #[test]
    fn builds_detail_while_discharging() {
        let d = build_detail((Some(80), false, false), IOREG, CUSTOM, None);
        assert_eq!(d.cycle_count, Some(13));
        assert_eq!(d.health_pct, Some(97));
        assert_eq!(d.minutes_remaining, Some(298));
        assert_eq!(d.capacity_wh, Some(107.9));
        assert_eq!(d.design_wh, Some(111.0));
        // 73 mA out at 12.336 V — printed unsigned, read as a drain.
        assert_eq!(d.battery_watts, Some(-0.9));
        assert_eq!(d.system_watts, Some(8.6));
        assert_eq!(d.power_mode.as_deref(), Some("low"));
    }

    #[test]
    fn charging_reads_time_to_full_and_ac_power_mode() {
        // AvgTimeToFull is the unknown sentinel here, so no estimate at all.
        let d = build_detail((Some(80), true, true), IOREG, CUSTOM, None);
        assert_eq!(d.minutes_remaining, None);
        assert_eq!(d.power_mode.as_deref(), Some("high"));
    }

    #[test]
    fn health_never_exceeds_full() {
        // Fresh packs measure above design capacity; Apple caps the number.
        let fresh = IOREG.replace("\"DesignCapacity\"=9000", "\"DesignCapacity\"=8579");
        let d = build_detail((Some(80), false, false), &fresh, CUSTOM, None);
        assert_eq!(d.health_pct, Some(100));
    }

    #[test]
    #[ignore = "reads this Mac's real battery; run by hand to eyeball the card's numbers"]
    fn live_detail() {
        println!("{:#?}", detail());
    }

    #[test]
    fn survives_a_machine_with_no_battery() {
        let d = build_detail((None, true, false), "", "", None);
        assert_eq!(
            d,
            BatteryDetail {
                on_ac: true,
                ..Default::default()
            }
        );
    }
}
