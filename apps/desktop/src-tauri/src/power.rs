//! Keep-awake power assertions for `awake ⏎` — held in-process, never by
//! spawning `caffeinate`, so they carry launcharr's name in `pmset -g
//! assertions`, are introspectable, and vanish on release, quit, or crash
//! (assertions are per-process kernel state; the OS reaps them with us).
//!
//! `IOPMAssertionCreateWithName` needs no entitlement and no TCC prompt.
//! This is the repo's dedicated-unsafe module for IOKit power management,
//! same shape as `coreaudio.rs`: hand-declared FFI (two calls plus CFString
//! plumbing — a binding crate would be the heavier tree), safety argument per
//! block, safe public surface.

use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;

use crate::error::{CmdError, CmdResult};

mod ffi {
    use std::ffi::c_void;
    use std::os::raw::c_char;

    pub type IOPMAssertionID = u32;
    pub const LEVEL_ON: u32 = 255; // kIOPMAssertionLevelOn
    pub const CFSTRING_ENCODING_UTF8: u32 = 0x0800_0100;

    #[link(name = "IOKit", kind = "framework")]
    unsafe extern "C" {
        /// CFStringRefs passed as `*const c_void`; returns kIOReturnSuccess (0) on success.
        pub fn IOPMAssertionCreateWithName(
            assertion_type: *const c_void,
            level: u32,
            name: *const c_void,
            out_id: *mut IOPMAssertionID,
        ) -> i32;
        pub fn IOPMAssertionRelease(id: IOPMAssertionID) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        pub fn CFStringCreateWithCString(
            alloc: *const c_void,
            cstr: *const c_char,
            encoding: u32,
        ) -> *const c_void;
        pub fn CFRelease(cf: *const c_void);
    }
}

/// The assertion kinds slice A holds. Raw names are the documented
/// `kIOPMAssertionType*` string values — stable API, not private strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// Work keeps running; the display sleeps as configured.
    System,
    /// The display stays lit too.
    Display,
    /// External disks don't park.
    Disk,
    /// On AC only: also survives lid close (macOS ignores it on battery by
    /// policy — the plan's slice E covers that gap, deliberately deferred).
    SystemOnAc,
}

impl Kind {
    fn raw(self) -> &'static str {
        match self {
            Kind::System => "PreventUserIdleSystemSleep",
            Kind::Display => "PreventUserIdleDisplaySleep",
            Kind::Disk => "PreventDiskIdle",
            Kind::SystemOnAc => "PreventSystemSleep",
        }
    }
}

/// An owned, live assertion: releases on drop, which covers panel disarm,
/// session replacement, and orderly quit; a crash releases via process death.
struct Assertion {
    id: ffi::IOPMAssertionID,
}

impl Assertion {
    fn create(kind: Kind) -> Option<Assertion> {
        // NUL-free by construction: both strings are ASCII literals.
        let raw_type = std::ffi::CString::new(kind.raw()).ok()?;
        let raw_name = std::ffi::CString::new("launcharr").ok()?;
        // SAFETY: CFStringCreateWithCString copies the bytes of a valid
        // NUL-terminated C string; we own the returned CFStrings and release
        // them below on every path. IOPMAssertionCreateWithName only reads
        // its arguments and writes the out id; a non-zero return means no
        // assertion was created and there is nothing to release.
        unsafe {
            let cf_type = ffi::CFStringCreateWithCString(
                std::ptr::null(),
                raw_type.as_ptr(),
                ffi::CFSTRING_ENCODING_UTF8,
            );
            let cf_name = ffi::CFStringCreateWithCString(
                std::ptr::null(),
                raw_name.as_ptr(),
                ffi::CFSTRING_ENCODING_UTF8,
            );
            if cf_type.is_null() || cf_name.is_null() {
                if !cf_type.is_null() {
                    ffi::CFRelease(cf_type);
                }
                if !cf_name.is_null() {
                    ffi::CFRelease(cf_name);
                }
                return None;
            }
            let mut id: ffi::IOPMAssertionID = 0;
            let ret = ffi::IOPMAssertionCreateWithName(cf_type, ffi::LEVEL_ON, cf_name, &mut id);
            ffi::CFRelease(cf_type);
            ffi::CFRelease(cf_name);
            (ret == 0).then_some(Assertion { id })
        }
    }
}

impl Drop for Assertion {
    fn drop(&mut self) {
        // SAFETY: `id` came from a successful create and is released exactly
        // once — the handle is neither Copy nor Clone.
        unsafe {
            ffi::IOPMAssertionRelease(self.id);
        }
    }
}

/// The one active keep-awake session. Session *semantics* (which trigger,
/// every word of copy) live in TypeScript; Rust holds the assertions plus the
/// two mechanical rails a webview can't be trusted with across sleep/undock —
/// the absolute deadline and the battery floor. `spec` is the TS session
/// descriptor stored verbatim, never interpreted here.
struct Session {
    /// Never read — owned so the assertions live exactly as long as the session.
    _held: Vec<Assertion>,
    display: bool,
    disks: bool,
    since: Instant,
    until_epoch_ms: Option<i64>,
    battery_floor: Option<u8>,
    spec: Option<String>,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);
/// Why the last session ended without the user asking: "deadline" | "floor".
static RELEASED: Mutex<Option<&'static str>> = Mutex::new(None);

/// Arm (or re-arm, replacing the current set). Always holds system-awake plus
/// the on-AC lid-close assertion — that pair is the plan's default and costs
/// nothing when unplugged (macOS just ignores the AC one).
pub fn arm(
    display: bool,
    disks: bool,
    until_epoch_ms: Option<i64>,
    battery_floor: Option<u8>,
    spec: Option<String>,
) -> CmdResult<()> {
    let mut kinds = vec![Kind::System, Kind::SystemOnAc];
    if display {
        kinds.push(Kind::Display);
    }
    if disks {
        kinds.push(Kind::Disk);
    }
    let held: Vec<Assertion> = kinds.into_iter().filter_map(Assertion::create).collect();
    if held.is_empty() {
        return Err(CmdError::Internal(
            "could not create any power assertion".into(),
        ));
    }
    *RELEASED.lock().unwrap() = None;
    *SESSION.lock().unwrap() = Some(Session {
        _held: held,
        display,
        disks,
        since: Instant::now(),
        until_epoch_ms,
        battery_floor,
        spec,
    });
    start_watchdog();
    Ok(())
}

/// Release everything. Dropping the session drops its assertions.
pub fn release() {
    *RELEASED.lock().unwrap() = None;
    *SESSION.lock().unwrap() = None;
}

fn release_because(reason: &'static str) {
    let mut session = SESSION.lock().unwrap();
    if session.is_some() {
        *session = None;
        *RELEASED.lock().unwrap() = Some(reason);
    }
}

fn now_epoch_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The mechanical rails: a session with a deadline ends at the deadline, and
/// a session with a battery floor ends when an unplugged battery reaches it.
/// Checked here (5s cadence) so they fire even with every webview asleep;
/// `battery::cached` keeps this spawn-free most ticks.
fn check_rails() {
    let (deadline, floor) = match &*SESSION.lock().unwrap() {
        Some(s) => (s.until_epoch_ms, s.battery_floor),
        None => return,
    };
    if let Some(at) = deadline {
        if now_epoch_ms() >= at {
            release_because("deadline");
            return;
        }
    }
    if let Some(floor) = floor {
        let (pct, on_ac, _) = crate::battery::cached();
        if !on_ac && pct.is_some_and(|p| p <= floor) {
            release_because("floor");
        }
    }
}

fn start_watchdog() {
    static STARTED: std::sync::Once = std::sync::Once::new();
    STARTED.call_once(|| {
        std::thread::spawn(|| loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            check_rails();
        });
    });
}

/// The session as every surface sees it (bar snapshot, panel, hover card).
/// Cheap: in-memory reads only. Mirrored by `AwakeState` in @launcharr/core.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwakeState {
    pub armed: bool,
    pub display: bool,
    pub disks: bool,
    /// Seconds since arming; 0 when not armed.
    pub elapsed_seconds: u64,
    pub until_epoch_ms: Option<i64>,
    pub battery_floor: Option<u8>,
    /// The TypeScript session descriptor, stored verbatim at arm time.
    pub spec: Option<String>,
    /// Why the last session ended on its own ("deadline" | "floor"), until
    /// the next arm. User releases clear it — nothing surprising happened.
    pub released: Option<String>,
}

/// Cheap in-memory snapshot; rails are re-checked inline so a passed deadline
/// never renders as still-armed between watchdog ticks.
pub fn state() -> AwakeState {
    check_rails();
    let released = RELEASED.lock().unwrap().map(str::to_owned);
    match &*SESSION.lock().unwrap() {
        Some(s) => AwakeState {
            armed: true,
            display: s.display,
            disks: s.disks,
            elapsed_seconds: s.since.elapsed().as_secs(),
            until_epoch_ms: s.until_epoch_ms,
            battery_floor: s.battery_floor,
            spec: s.spec.clone(),
            released,
        },
        None => AwakeState {
            released,
            ..AwakeState::default()
        },
    }
}

/// What the panel renders: the state plus the "also keeping this Mac awake"
/// list.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwakeStatus {
    pub state: AwakeState,
    /// Every *other* process holding a sleep-preventing assertion.
    pub others: Vec<OtherHolder>,
}

/// Another process's sleep-preventing assertion, as the panel lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtherHolder {
    /// Process name as `pmset` prints it (e.g. `Terminal`, `coreaudiod`).
    pub app: String,
    /// How long it has been held.
    pub seconds: u64,
    /// True if it also keeps the display lit.
    pub display: bool,
}

/// Snapshot for the panel / hover card. Spawns `pmset` for the "others" list —
/// call on panel or card open only, **never on the bar tick**.
pub fn status() -> AwakeStatus {
    let others = Command::new("/usr/bin/pmset")
        .args(["-g", "assertions"])
        .output()
        .ok()
        .map(|out| parse_assertions(&String::from_utf8_lossy(&out.stdout), std::process::id()))
        .unwrap_or_default();
    AwakeStatus {
        state: state(),
        others,
    }
}

/// The sleep-preventing assertion types worth listing. `UserIsActive` and the
/// bookkeeping types are noise, not holds.
fn preventing(kind: &str) -> Option<bool> {
    match kind {
        "PreventUserIdleSystemSleep" | "PreventSystemSleep" | "NoIdleSleepAssertion" => Some(false),
        "PreventUserIdleDisplaySleep" | "NoDisplaySleepAssertion" => Some(true),
        _ => None,
    }
}

/// Parse the "Listed by owning process:" section of `pmset -g assertions`.
/// Line shape (stable across recent macOS, but parsed fail-soft — anything
/// unrecognised is skipped, and a format change degrades to an empty list):
///
/// ```text
///    pid 3627(caffeinate): [0x0000123400098765] 04:12:10 PreventUserIdleDisplaySleep named: "..."
/// ```
///
/// One entry per pid (longest hold wins, display-holding sticky); our own pid
/// is excluded — we are not "also" keeping the Mac awake.
pub fn parse_assertions(out: &str, own_pid: u32) -> Vec<OtherHolder> {
    let mut holders: Vec<(u32, OtherHolder)> = Vec::new();
    for line in out.lines() {
        let Some((pid, app, seconds, display)) = parse_assertion_line(line) else {
            continue;
        };
        if pid == own_pid {
            continue;
        }
        match holders.iter_mut().find(|(p, _)| *p == pid) {
            Some((_, h)) => {
                h.seconds = h.seconds.max(seconds);
                h.display |= display;
            }
            None => holders.push((
                pid,
                OtherHolder {
                    app,
                    seconds,
                    display,
                },
            )),
        }
    }
    let mut list: Vec<OtherHolder> = holders.into_iter().map(|(_, h)| h).collect();
    list.sort_by_key(|h| std::cmp::Reverse(h.seconds));
    list
}

/// One process line → `(pid, name, held seconds, keeps display lit)`.
fn parse_assertion_line(line: &str) -> Option<(u32, String, u64, bool)> {
    let rest = line.trim_start().strip_prefix("pid ")?;
    let open = rest.find('(')?;
    let pid: u32 = rest[..open].parse().ok()?;
    let close = rest.find(')')?;
    let app = rest.get(open + 1..close)?.to_string();
    // Past the assertion id bracket to " HH:MM:SS Type ...".
    let after_bracket = rest[close..].split(']').nth(1)?;
    let mut words = after_bracket.split_whitespace();
    let seconds = parse_hms(words.next()?)?;
    let display = preventing(words.next()?)?;
    Some((pid, app, seconds, display))
}

/// `HH:MM:SS` → seconds. Hours field grows past 24 rather than wrapping.
fn parse_hms(s: &str) -> Option<u64> {
    let mut parts = s.split(':');
    let (h, m, sec) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() {
        return None;
    }
    Some(h.parse::<u64>().ok()? * 3600 + m.parse::<u64>().ok()? * 60 + sec.parse::<u64>().ok()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed from a real `pmset -g assertions`: the summary table (which
    /// must not parse as holders), process lines in the shapes macOS prints,
    /// indented detail continuations, and the kernel section.
    const PMSET: &str = r#"2026-08-16 14:02:11 +1000
Assertion status system-wide:
   BackgroundTask                 0
   PreventUserIdleDisplaySleep    1
   PreventSystemSleep             0
   PreventUserIdleSystemSleep     1

Listed by owning process:
   pid 143(powerd): [0x0000000c00098000] 00:00:34 UserIsActive named: "com.apple.iohideventsystem.queue.tickle serviceID:1000003ac"
   pid 3627(caffeinate): [0x0000123400098765] 04:12:10 PreventUserIdleDisplaySleep named: "CAFFEINATE COMMAND-LINE TOOL"
   pid 3627(caffeinate): [0x0000123400098766] 04:12:10 PreventUserIdleSystemSleep named: "CAFFEINATE COMMAND-LINE TOOL"
   pid 500(Music): [0x0000567800012345] 00:22:33 PreventUserIdleSystemSleep named: "com.apple.Music.playback"
        Timeout will fire in 600 secs Action=TimeoutActionRelease
   pid 999(launcharr): [0x0000999900012345] 00:01:00 PreventUserIdleSystemSleep named: "launcharr"

Kernel Assertions: 0x100=MAGICWAKE
   id=502  level=255 0x100=MAGICWAKE mod=16/08/26, 9:01 description=en0 owner=en0
"#;

    #[test]
    fn parses_other_holders_excluding_self_and_noise() {
        let list = parse_assertions(PMSET, 999);
        assert_eq!(
            list,
            vec![
                OtherHolder {
                    app: "caffeinate".into(),
                    seconds: 4 * 3600 + 12 * 60 + 10,
                    display: true,
                },
                OtherHolder {
                    app: "Music".into(),
                    seconds: 22 * 60 + 33,
                    display: false,
                },
            ]
        );
    }

    #[test]
    fn own_pid_is_listed_for_other_processes() {
        // Same fixture read from a different pid: launcharr's hold shows.
        let list = parse_assertions(PMSET, 42);
        assert!(list.iter().any(|h| h.app == "launcharr"));
    }

    #[test]
    fn merges_a_pid_holding_system_and_display() {
        let list = parse_assertions(PMSET, 999);
        let caffeinate: Vec<_> = list.iter().filter(|h| h.app == "caffeinate").collect();
        assert_eq!(caffeinate.len(), 1);
        assert!(caffeinate[0].display);
    }

    #[test]
    fn unrecognised_output_degrades_to_empty() {
        assert_eq!(parse_assertions("", 1), vec![]);
        assert_eq!(parse_assertions("total garbage\nno pids here\n", 1), vec![]);
        // A future format change in the process line must skip, not panic.
        assert_eq!(parse_assertions("   pid abc(x): weird\n", 1), vec![]);
    }

    #[test]
    fn hms_parses_and_rejects() {
        assert_eq!(parse_hms("00:00:34"), Some(34));
        assert_eq!(parse_hms("27:00:00"), Some(27 * 3600));
        assert_eq!(parse_hms("12:00"), None);
        assert_eq!(parse_hms("a:b:c"), None);
    }

    /// Tests below share the global SESSION — serialize them.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn arm_and_release_round_trip() {
        let _guard = TEST_LOCK.lock().unwrap();
        // Real assertions against this Mac — create, observe, release. Cheap
        // and side-effect-free beyond the seconds the test holds them.
        arm(
            false,
            false,
            None,
            None,
            Some("{\"until\":{\"kind\":\"manual\"}}".into()),
        )
        .expect("arm");
        let s = state();
        assert!(s.armed);
        assert!(!s.display);
        assert_eq!(s.spec.as_deref(), Some("{\"until\":{\"kind\":\"manual\"}}"));
        release();
        assert!(!state().armed);
        assert_eq!(state().released, None);
    }

    #[test]
    fn passed_deadline_releases_and_records_why() {
        let _guard = TEST_LOCK.lock().unwrap();
        arm(false, false, Some(now_epoch_ms() - 1), None, None).expect("arm");
        // state() re-checks rails inline — no watchdog tick needed.
        let s = state();
        assert!(!s.armed);
        assert_eq!(s.released.as_deref(), Some("deadline"));
        // The next arm clears the reason.
        arm(false, false, None, None, None).expect("arm");
        assert_eq!(state().released, None);
        release();
    }

    #[test]
    #[ignore = "spawns pmset against this Mac; run by hand to eyeball the others list"]
    fn live_others() {
        println!("{:#?}", status().others);
    }
}
