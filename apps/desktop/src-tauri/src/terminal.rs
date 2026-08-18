use std::{path::Path, process::Command};

use crate::{
    config::Terminal,
    error::{CmdError, CmdResult},
};

/// AppleScript string literal escaping: backslashes and double quotes only. The command is
/// otherwise passed through verbatim — no shell parsing, no quoting games (PRD §4.4).
fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Resolve the effective terminal: configured target, but fall back to Terminal.app when
/// iTerm2 isn't installed.
pub fn effective_terminal(configured: Terminal) -> Terminal {
    match configured {
        Terminal::ITerm2 if Path::new("/Applications/iTerm.app").exists() => Terminal::ITerm2,
        Terminal::ITerm2 => Terminal::TerminalApp,
        t => t,
    }
}

/// Build the AppleScript for a bang-mode hand-off. Empty command = just open a window.
pub fn script_for(terminal: Terminal, command: &str, new_window: bool) -> String {
    let escaped = applescript_escape(command);
    match terminal {
        Terminal::ITerm2 => {
            let write = if escaped.is_empty() {
                String::new()
            } else {
                format!("\n        write text \"{escaped}\"")
            };
            if new_window {
                format!(
                    r#"tell application id "com.googlecode.iterm2"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow{write}
    end tell
end tell"#
                )
            } else {
                format!(
                    r#"tell application id "com.googlecode.iterm2"
    activate
    if (count of windows) = 0 then
        create window with default profile
    end if
    tell current session of current window{write}
    end tell
end tell"#
                )
            }
        }
        Terminal::TerminalApp => {
            if escaped.is_empty() {
                r#"tell application id "com.apple.Terminal"
    activate
    do script ""
end tell"#
                    .to_string()
            } else {
                format!(
                    r#"tell application id "com.apple.Terminal"
    activate
    do script "{escaped}"
end tell"#
                )
            }
        }
    }
}

/// Build the AppleScript that raises the window/tab whose shell is on `tty`.
///
/// Activating the app is not enough once more than one terminal window is open:
/// `open -a iTerm` raises whichever window happened to be frontmost, so a jump
/// into a tmux pane could surface a completely unrelated window — a herdr one,
/// say (field report 2026-08-18). The tty is the one identifier shared by the
/// multiplexer's client and the terminal session hosting it, so it's what we
/// aim at. Terminal.app addresses its windows by tty directly; iTerm2 needs the
/// walk. Failing to find it is fine — the app still comes forward.
pub fn script_for_tty(terminal: Terminal, tty: &str) -> String {
    let tty = applescript_escape(tty);
    match terminal {
        Terminal::ITerm2 => format!(
            r#"tell application id "com.googlecode.iterm2"
    activate
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                if tty of s is "{tty}" then
                    select w
                    select t
                    select s
                    return
                end if
            end repeat
        end repeat
    end repeat
end tell"#
        ),
        Terminal::TerminalApp => format!(
            r#"tell application id "com.apple.Terminal"
    activate
    repeat with w in windows
        repeat with t in tabs of w
            if tty of t is "{tty}" then
                set frontmost of w to true
                set selected of t to true
                return
            end if
        end repeat
    end repeat
end tell"#
        ),
    }
}

/// Bring the terminal forward, aimed at `tty` when we know one. Blocking, and
/// deliberately so: the caller is a jump, and the pane selection underneath it
/// has already happened — racing the raise would land on the old view.
pub fn raise_tty(configured: Terminal, tty: Option<&str>) -> CmdResult<()> {
    let terminal = effective_terminal(configured);
    let Some(tty) = tty.filter(|t| !t.is_empty()) else {
        let app = match terminal {
            Terminal::ITerm2 => "iTerm",
            Terminal::TerminalApp => "Terminal",
        };
        let ok = Command::new("/usr/bin/open")
            .args(["-a", app])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        return ok
            .then_some(())
            .ok_or_else(|| CmdError::Terminal(format!("could not activate {app}")));
    };
    Command::new("osascript")
        .arg("-e")
        .arg(script_for_tty(terminal, tty))
        .status()
        .map_err(|e| CmdError::Terminal(e.to_string()))?;
    Ok(())
}

/// Fire-and-forget hand-off. iTerm2 owns output, interactivity, and lifetime from here.
pub fn run(configured: Terminal, command: &str, new_window: bool) -> CmdResult<()> {
    let terminal = effective_terminal(configured);
    let script = script_for(terminal, command, new_window);
    // Spawn, don't wait: the first run triggers macOS's Automation consent prompt, which
    // blocks osascript until the user answers. launcharr must dismiss immediately (PRD §4.4).
    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| CmdError::Terminal(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tty_script_aims_at_the_session_hosting_it() {
        let script = script_for_tty(Terminal::ITerm2, "/dev/ttys002");
        assert!(script.contains(r#"if tty of s is "/dev/ttys002""#));
        assert!(script.contains("select s"));
        let terminal_app = script_for_tty(Terminal::TerminalApp, "/dev/ttys002");
        assert!(terminal_app.contains(r#"if tty of t is "/dev/ttys002""#));
    }

    #[test]
    fn escapes_quotes_and_backslashes() {
        assert_eq!(
            applescript_escape(r#"echo "hi \ there""#),
            r#"echo \"hi \\ there\""#
        );
    }

    #[test]
    fn command_passed_verbatim_inside_script() {
        let script = script_for(Terminal::ITerm2, "git status && ls -la | head", true);
        assert!(script.contains(r#"write text "git status && ls -la | head""#));
        assert!(script.contains("create window with default profile"));
    }

    #[test]
    fn empty_command_opens_window_without_write() {
        let script = script_for(Terminal::ITerm2, "", true);
        assert!(!script.contains("write text"));
        assert!(script.contains("create window with default profile"));
    }

    #[test]
    fn reuse_session_script_targets_current_window() {
        let script = script_for(Terminal::ITerm2, "pwd", false);
        assert!(script.contains("current session of current window"));
        assert!(script.contains(r#"write text "pwd""#));
    }

    #[test]
    fn terminal_app_uses_do_script() {
        let script = script_for(Terminal::TerminalApp, "echo hi", true);
        assert!(script.contains(r#"do script "echo hi""#));
        assert!(script.contains("com.apple.Terminal"));
    }
}
