use std::process::Command;

use crate::error::{CmdError, CmdResult};

/// System commands — the "sleep displays" tier of launcher table stakes. A static table
/// like the settings panes: boring, greppable, versioned. Finder/System Events entries
/// trigger macOS's standard Automation consent on first use (same class as iTerm2).
pub enum Action {
    /// osascript -e <script>
    Script(&'static str),
    /// argv exec
    Exec(&'static [&'static str]),
}

pub struct SystemCommand {
    pub slug: &'static str,
    pub name: &'static str,
    pub aliases: &'static str,
    pub action: Action,
}

pub const SYSTEM_COMMANDS: &[SystemCommand] = &[
    SystemCommand {
        slug: "sleep",
        name: "Sleep",
        aliases: "sleep suspend",
        action: Action::Exec(&["pmset", "sleepnow"]),
    },
    SystemCommand {
        slug: "sleep-displays",
        name: "Sleep Displays",
        aliases: "display monitor screen off",
        action: Action::Exec(&["pmset", "displaysleepnow"]),
    },
    SystemCommand {
        slug: "lock-screen",
        name: "Lock Screen",
        aliases: "lock afk",
        // CGSession is ancient but still present; risk noted like the settings-pane IDs.
        action: Action::Exec(&[
            "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession",
            "-suspend",
        ]),
    },
    SystemCommand {
        slug: "screen-saver",
        name: "Start Screen Saver",
        aliases: "screensaver",
        action: Action::Exec(&["open", "-b", "com.apple.ScreenSaver.Engine"]),
    },
    SystemCommand {
        slug: "empty-trash",
        name: "Empty Trash",
        aliases: "trash bin",
        action: Action::Script(r#"tell application "Finder" to empty trash"#),
    },
    SystemCommand {
        slug: "toggle-dark-mode",
        name: "Toggle Dark Mode",
        aliases: "dark light appearance theme",
        action: Action::Script(
            r#"tell application "System Events" to tell appearance preferences to set dark mode to not dark mode"#,
        ),
    },
    SystemCommand {
        slug: "toggle-mute",
        name: "Toggle Mute",
        aliases: "mute unmute volume sound audio",
        action: Action::Script(
            r#"set volume output muted not (output muted of (get volume settings))"#,
        ),
    },
    SystemCommand {
        slug: "eject-all",
        name: "Eject All Disks",
        aliases: "eject unmount usb",
        action: Action::Script(
            r#"tell application "Finder" to eject (every disk whose ejectable is true)"#,
        ),
    },
    SystemCommand {
        slug: "restart",
        name: "Restart…",
        aliases: "reboot",
        action: Action::Script(r#"tell application "System Events" to restart"#),
    },
    SystemCommand {
        slug: "shut-down",
        name: "Shut Down…",
        aliases: "shutdown power off",
        action: Action::Script(r#"tell application "System Events" to shut down"#),
    },
    SystemCommand {
        slug: "log-out",
        name: "Log Out…",
        aliases: "logout",
        action: Action::Script(r#"tell application "System Events" to log out"#),
    },
];

pub fn run(slug: &str) -> CmdResult<()> {
    let command = SYSTEM_COMMANDS
        .iter()
        .find(|c| c.slug == slug)
        .ok_or_else(|| CmdError::NotFound(format!("cmd:{slug}")))?;
    match &command.action {
        Action::Script(script) => {
            Command::new("osascript").arg("-e").arg(script).spawn()?;
        }
        Action::Exec(argv) => {
            Command::new(argv[0]).args(&argv[1..]).spawn()?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn slugs_and_names_are_unique() {
        let slugs: HashSet<_> = SYSTEM_COMMANDS.iter().map(|c| c.slug).collect();
        let names: HashSet<_> = SYSTEM_COMMANDS.iter().map(|c| c.name).collect();
        assert_eq!(slugs.len(), SYSTEM_COMMANDS.len());
        assert_eq!(names.len(), SYSTEM_COMMANDS.len());
    }

    #[test]
    fn exec_actions_have_argv0() {
        for c in SYSTEM_COMMANDS {
            if let Action::Exec(argv) = &c.action {
                assert!(!argv.is_empty(), "{} has empty argv", c.slug);
            }
        }
    }

    #[test]
    fn unknown_slug_errors() {
        assert!(run("cmd-that-does-not-exist").is_err());
    }
}
