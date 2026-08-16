//! Permission-free system readings for awake trigger evaluation: load
//! average, external-display presence, cumulative network bytes, running
//! apps. Gathered on demand (`awake_readings`) while a conditional session is
//! armed — never on the bar's 1 Hz tick.
//!
//! Dedicated-unsafe module for the two tiny FFI reads (libc `getloadavg`,
//! CoreGraphics display list), per the repo's unsafe-lives-in-small-modules
//! rule. The one spawn here (`netstat -ib`) hides behind a 30 s cache and is
//! only paid while a busy-trigger session is armed.

use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::AppHandle;

mod ffi {
    use std::os::raw::{c_double, c_int};

    unsafe extern "C" {
        /// libc: fills up to `nelem` load averages, returns how many or -1.
        pub fn getloadavg(loadavg: *mut c_double, nelem: c_int) -> c_int;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        /// Thread-safe CoreGraphics reads; no window server privileges needed.
        pub fn CGGetOnlineDisplayList(
            max_displays: u32,
            online_displays: *mut u32,
            display_count: *mut u32,
        ) -> i32;
        pub fn CGDisplayIsBuiltin(display: u32) -> i32;
    }
}

/// 1-minute load average, or None if the libc call fails.
pub fn load1() -> Option<f64> {
    let mut loads = [0.0f64; 1];
    // SAFETY: getloadavg writes at most `nelem` doubles into the buffer we
    // own; a negative return means nothing was written.
    let n = unsafe { ffi::getloadavg(loads.as_mut_ptr(), 1) };
    (n >= 1).then_some(loads[0])
}

pub fn cores() -> u32 {
    std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(1)
}

/// Any online display that isn't the built-in one.
pub fn external_display() -> bool {
    let mut ids = [0u32; 16];
    let mut count: u32 = 0;
    // SAFETY: CGGetOnlineDisplayList writes at most `max_displays` ids into
    // the buffer we own and sets `count`; non-zero return leaves count at 0.
    let err = unsafe { ffi::CGGetOnlineDisplayList(16, ids.as_mut_ptr(), &mut count) };
    if err != 0 {
        return false;
    }
    ids.iter()
        .take(count as usize)
        // SAFETY: CGDisplayIsBuiltin is a pure query on a display id.
        .any(|&id| unsafe { ffi::CGDisplayIsBuiltin(id) } == 0)
}

/// Cumulative network bytes (in+out) across physical-ish interfaces, from
/// `netstat -ib`. Cached 30 s: the busy trigger's 5-minute-quiet hysteresis
/// doesn't need anything faster, and the spawn shouldn't ride every poll.
pub fn net_bytes() -> Option<u64> {
    static CACHE: Mutex<Option<(Instant, Option<u64>)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, value)) = *cache {
        if at.elapsed() < Duration::from_secs(30) {
            return value;
        }
    }
    let value = std::process::Command::new("/usr/sbin/netstat")
        .args(["-ib"])
        .output()
        .ok()
        .and_then(|out| parse_netstat(&String::from_utf8_lossy(&out.stdout)));
    *cache = Some((Instant::now(), value));
    value
}

/// Sum Ibytes+Obytes over `en*` interfaces, one row per interface (netstat
/// prints one row per address; the byte counters repeat, so dedup by name).
/// Fail-soft: unrecognized output yields None, and the trigger holds.
pub fn parse_netstat(out: &str) -> Option<u64> {
    let mut lines = out.lines();
    let header = lines.next()?;
    let cols: Vec<&str> = header.split_whitespace().collect();
    let ibytes = cols.iter().position(|c| *c == "Ibytes")?;
    let obytes = cols.iter().position(|c| *c == "Obytes")?;
    let mut seen: Vec<&str> = Vec::new();
    let mut total: u64 = 0;
    for line in lines {
        let fields: Vec<&str> = line.split_whitespace().collect();
        let Some(name) = fields.first() else { continue };
        if !name.starts_with("en") || seen.contains(name) {
            continue;
        }
        // Rows with fewer columns (no address) shift left; only take rows
        // wide enough to be the full form.
        let (Some(ib), Some(ob)) = (fields.get(ibytes), fields.get(obytes)) else {
            continue;
        };
        let (Ok(ib), Ok(ob)) = (ib.parse::<u64>(), ob.parse::<u64>()) else {
            continue;
        };
        seen.push(name);
        total = total.saturating_add(ib).saturating_add(ob);
    }
    (!seen.is_empty()).then_some(total)
}

/// Names of regular (Dock-visible) running applications, via NSWorkspace on
/// the main thread. ~1 Hz while an app-trigger session is armed; the list is
/// in-memory AppKit state, no spawn.
pub fn running_apps(app: &AppHandle) -> Option<Vec<String>> {
    let (tx, rx) = mpsc::channel();
    let sent = app.run_on_main_thread(move || {
        let _ = tx.send(running_apps_on_main());
    });
    if sent.is_err() {
        return None;
    }
    rx.recv_timeout(Duration::from_millis(500)).ok()
}

/// Runs on the main thread (run_on_main_thread above): read-only NSWorkspace
/// state; objc2's bindings are safe here.
fn running_apps_on_main() -> Vec<String> {
    use objc2_app_kit::{NSApplicationActivationPolicy, NSWorkspace};
    let workspace = NSWorkspace::sharedWorkspace();
    workspace
        .runningApplications()
        .iter()
        .filter(|a| a.activationPolicy() == NSApplicationActivationPolicy::Regular)
        .filter_map(|a| a.localizedName().map(|n| n.to_string()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const NETSTAT: &str = "\
Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                        797209     0  165933824   797209     0  165933824     0
lo0        16384 127           127.0.0.1         797209     -  165933824   797209     -  165933824     -
en0        1500  <Link#11>   aa:bb:cc:dd:ee:ff  4740028     0 5183181083  2557785     0  387893842     0
en0        1500  192.168.1     192.168.1.20     4740028     - 5183181083  2557785     -  387893842     -
en5        1500  <Link#8>    00:11:22:33:44:55        0     0          0        4     0        360     0
utun0      1380  <Link#18>                            0     0          0        2     0        296     0
";

    #[test]
    fn sums_en_interfaces_once_each() {
        // en0 (5183181083 + 387893842) + en5 (0 + 360), lo0/utun excluded,
        // en0's second row deduped.
        assert_eq!(parse_netstat(NETSTAT), Some(5_571_075_285));
    }

    #[test]
    fn garbage_degrades_to_none() {
        assert_eq!(parse_netstat(""), None);
        assert_eq!(parse_netstat("nothing here\n"), None);
        assert_eq!(parse_netstat("Name Mtu\nen0 1500\n"), None);
    }

    #[test]
    fn local_readings_answer() {
        // Real reads on this Mac: both must produce something sensible.
        assert!(load1().is_some_and(|l| l >= 0.0));
        assert!(cores() >= 1);
        external_display(); // must not crash; value depends on the desk
    }
}
