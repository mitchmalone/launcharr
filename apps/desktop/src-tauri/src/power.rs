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

/// The one active keep-awake session. Session semantics (until-conditions,
/// triggers) live in TypeScript; Rust only knows what is held right now.
struct Session {
    /// Never read — owned so the assertions live exactly as long as the session.
    _held: Vec<Assertion>,
    display: bool,
    disks: bool,
    since: Instant,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

/// Arm (or re-arm, replacing the current set). Always holds system-awake plus
/// the on-AC lid-close assertion — that pair is the plan's default and costs
/// nothing when unplugged (macOS just ignores the AC one).
pub fn arm(display: bool, disks: bool) -> CmdResult<()> {
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
    *SESSION.lock().unwrap() = Some(Session {
        _held: held,
        display,
        disks,
        since: Instant::now(),
    });
    Ok(())
}

/// Release everything. Dropping the session drops its assertions.
pub fn release() {
    *SESSION.lock().unwrap() = None;
}

/// What the panel header and hover card render.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwakeStatus {
    pub armed: bool,
    pub display: bool,
    pub disks: bool,
    /// Seconds since arming; 0 when not armed.
    pub elapsed_seconds: u64,
    /// "Also keeping this Mac awake" — every *other* process holding a
    /// sleep-preventing assertion.
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
    let (armed, display, disks, elapsed_seconds) = match &*SESSION.lock().unwrap() {
        Some(s) => (true, s.display, s.disks, s.since.elapsed().as_secs()),
        None => (false, false, false, 0),
    };
    let others = Command::new("/usr/bin/pmset")
        .args(["-g", "assertions"])
        .output()
        .ok()
        .map(|out| parse_assertions(&String::from_utf8_lossy(&out.stdout), std::process::id()))
        .unwrap_or_default();
    AwakeStatus {
        armed,
        display,
        disks,
        elapsed_seconds,
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

    #[test]
    fn arm_and_release_round_trip() {
        // Real assertions against this Mac — create, observe, release. Cheap
        // and side-effect-free beyond the seconds the test holds them.
        arm(false, false).expect("arm");
        let s = status();
        assert!(s.armed);
        assert!(!s.display);
        release();
        assert!(!status().armed);
    }

    #[test]
    #[ignore = "spawns pmset against this Mac; run by hand to eyeball the others list"]
    fn live_others() {
        println!("{:#?}", status().others);
    }
}
