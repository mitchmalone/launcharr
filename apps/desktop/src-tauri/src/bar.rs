//! The menubar-replacement bar (v0.5 spike): one status-level, non-activating
//! panel per display, pinned to the top edge, visible on every space. Gated by
//! `bar.enabled` in config (default off) so the launcher is unaffected.
//!
//! Data gathering stays here as plain testable functions; the `bar_snapshot`
//! command is the only IPC surface (DECISIONS 2026-08-15).

use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelLevel, StyleMask, WebviewWindowExt};

use crate::error::{CmdError, CmdResult};

/// Logical bar height, matching the Sketchybar setup it replaces.
pub const BAR_HEIGHT: f64 = 30.0;

tauri_panel! {
    panel!(BarPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

/// Create one bar per display. Called at setup only when `bar.enabled`.
pub fn init(app: &AppHandle) -> CmdResult<()> {
    // available_monitors() comes back empty for an accessory app even after
    // setup (observed 2026-08-15); primary_monitor() answers. Fall back so a
    // single-display Mac always gets its bar; multi-display revisits in B2.
    let mut monitors = app
        .available_monitors()
        .map_err(|e| CmdError::Internal(format!("monitors: {e}")))?;
    if monitors.is_empty() {
        monitors.extend(
            app.primary_monitor()
                .map_err(|e| CmdError::Internal(format!("primary monitor: {e}")))?,
        );
    }
    eprintln!("[launcharr bar] {} bar(s) up", monitors.len());
    for (i, monitor) in monitors.iter().enumerate() {
        let label = format!("bar-{i}");
        let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("bar.html".into()))
            .decorations(false)
            .transparent(true)
            .resizable(false)
            .shadow(false)
            .skip_taskbar(true)
            .accept_first_mouse(true)
            .visible(false)
            .build()
            .map_err(|e| CmdError::Internal(format!("bar window: {e}")))?;

        let panel = window
            .to_panel::<BarPanel>()
            .map_err(|e| CmdError::Internal(format!("bar to_panel: {e}")))?;
        panel.set_level(PanelLevel::Status.value());
        panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
        panel.set_collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .full_screen_auxiliary()
                .stationary()
                .into(),
        );
        panel.set_hides_on_deactivate(false);

        // Frame AFTER the panel conversion — the NSPanel swap re-derives the
        // frame from the builder config, dropping anything set before it. Use a
        // fresh handle: the pre-conversion one can point at the old NSWindow.
        let scale = monitor.scale_factor();
        let pos = monitor.position();
        let size = monitor.size();
        let window = app
            .get_webview_window(&label)
            .ok_or_else(|| CmdError::Internal(format!("{label} missing post-conversion")))?;
        window
            .set_size(PhysicalSize::new(size.width, (BAR_HEIGHT * scale) as u32))
            .and_then(|()| window.set_position(PhysicalPosition::new(pos.x, pos.y)))
            .map_err(|e| CmdError::Internal(format!("bar frame: {e}")))?;

        panel.order_front_regardless();
    }
    Ok(())
}

/// Everything the bar renders in one poll. All sources are optional-by-design:
/// no aerospace → no workspaces, no battery (desktop Mac) → no battery cell.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BarSnapshot {
    pub workspaces: Vec<String>,
    pub focused: Option<String>,
    pub front_app: Option<String>,
    pub battery_pct: Option<u8>,
    pub on_ac: bool,
}

pub fn snapshot() -> BarSnapshot {
    let workspaces = aerospace(&["list-workspaces", "--all"])
        .map(|out| parse_lines(&out))
        .unwrap_or_default();
    let focused = aerospace(&["list-workspaces", "--focused"])
        .map(|out| parse_lines(&out).into_iter().next())
        .unwrap_or_default();
    let (battery_pct, on_ac) = Command::new("/usr/bin/pmset")
        .args(["-g", "batt"])
        .output()
        .ok()
        .map(|out| parse_battery(&String::from_utf8_lossy(&out.stdout)))
        .unwrap_or((None, false));
    BarSnapshot {
        workspaces,
        focused,
        front_app: front_app(),
        battery_pct,
        on_ac,
    }
}

/// Focus a workspace (bar click). The name comes from our own snapshot, but
/// validate anyway — it ends up as a process argument.
pub fn switch_workspace(ws: &str) -> CmdResult<()> {
    if ws.is_empty()
        || !ws
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(CmdError::Internal(format!("bad workspace name: {ws:?}")));
    }
    aerospace(&["workspace", ws])
        .map(|_| ())
        .ok_or_else(|| CmdError::Internal("aerospace workspace switch failed".into()))
}

/// Frontmost app name via lsappinfo (no Accessibility, no AppKit thread hop).
fn front_app() -> Option<String> {
    let asn = Command::new("/usr/bin/lsappinfo")
        .arg("front")
        .output()
        .ok()?;
    let asn = String::from_utf8_lossy(&asn.stdout).trim().to_owned();
    if asn.is_empty() {
        return None;
    }
    let info = Command::new("/usr/bin/lsappinfo")
        .args(["info", "-only", "name", &asn])
        .output()
        .ok()?;
    parse_lsappinfo_name(&String::from_utf8_lossy(&info.stdout))
}

/// The app name is the first double-quoted token of lsappinfo output.
fn parse_lsappinfo_name(out: &str) -> Option<String> {
    let start = out.find('"')? + 1;
    let end = start + out[start..].find('"')?;
    let name = &out[start..end];
    // `-only name` normally yields `"LSDisplayName"="iTerm2"` — take the value
    // side when both halves are quoted.
    if name == "LSDisplayName" || name == "name" {
        let rest = &out[end + 1..];
        return parse_lsappinfo_name(rest);
    }
    (!name.is_empty()).then(|| name.to_owned())
}

/// The aerospace CLI, wherever Homebrew put it. PATH first for dev shells.
fn aerospace(args: &[&str]) -> Option<String> {
    for bin in [
        "aerospace",
        "/opt/homebrew/bin/aerospace",
        "/usr/local/bin/aerospace",
    ] {
        if let Ok(out) = Command::new(bin).args(args).output() {
            if out.status.success() {
                return Some(String::from_utf8_lossy(&out.stdout).into_owned());
            }
        }
    }
    None
}

fn parse_lines(out: &str) -> Vec<String> {
    out.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Parse `pmset -g batt`: percentage from the first `NN%` token, AC from the
/// "Now drawing from 'AC Power'" header.
fn parse_battery(out: &str) -> (Option<u8>, bool) {
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
    (pct, out.contains("AC Power"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_battery_discharging() {
        let out = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=5308515)\t89%; discharging; 4:32 remaining present: true\n";
        assert_eq!(parse_battery(out), (Some(89), false));
    }

    #[test]
    fn parses_battery_on_ac() {
        let out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=5308515)\t100%; charged; 0:00 remaining present: true\n";
        assert_eq!(parse_battery(out), (Some(100), true));
    }

    #[test]
    fn battery_absent_on_desktops() {
        assert_eq!(parse_battery("Now drawing from 'AC Power'\n"), (None, true));
    }

    #[test]
    fn parses_lsappinfo_name_forms() {
        assert_eq!(
            parse_lsappinfo_name("\"LSDisplayName\"=\"iTerm2\"\n"),
            Some("iTerm2".into())
        );
        assert_eq!(
            parse_lsappinfo_name("\"iTerm2\" ASN:0x0-0x9a09a: (in front)\n"),
            Some("iTerm2".into())
        );
        assert_eq!(parse_lsappinfo_name(""), None);
        assert_eq!(parse_lsappinfo_name("no quotes here"), None);
    }

    #[test]
    fn rejects_bad_workspace_names() {
        assert!(switch_workspace("").is_err());
        assert!(switch_workspace("1; rm -rf /").is_err());
    }

    #[test]
    fn parses_workspace_lines() {
        assert_eq!(parse_lines("1\n2\n\n3\n"), vec!["1", "2", "3"]);
        assert!(parse_lines("").is_empty());
    }
}
