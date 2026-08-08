/// Curated System Settings panes → `x-apple.systempreferences:` deep-link IDs.
///
/// Enumerating panes programmatically is unreliable; this static table is the pragmatic
/// answer (PRD §5.1, accepted risk R4). Curated for macOS 13+ (System Settings era);
/// refresh as macOS updates. A broken link is low-severity — the pane just doesn't open.
pub const SETTINGS_PANES: &[(&str, &str)] = &[
    (
        "Accessibility",
        "com.apple.Accessibility-Settings.extension",
    ),
    ("Appearance", "com.apple.Appearance-Settings.extension"),
    ("Apple ID", "com.apple.systempreferences.AppleIDSettings"),
    ("Battery", "com.apple.Battery-Settings.extension"),
    ("Bluetooth", "com.apple.BluetoothSettings"),
    (
        "Control Center",
        "com.apple.ControlCenter-Settings.extension",
    ),
    ("Date & Time", "com.apple.Date-Time-Settings.extension"),
    ("Desktop & Dock", "com.apple.Desktop-Settings.extension"),
    ("Displays", "com.apple.Displays-Settings.extension"),
    ("Focus", "com.apple.Focus-Settings.extension"),
    ("Game Center", "com.apple.Game-Center-Settings.extension"),
    ("General", "com.apple.systempreferences.GeneralSettings"),
    (
        "Internet Accounts",
        "com.apple.Internet-Accounts-Settings.extension",
    ),
    ("Keyboard", "com.apple.Keyboard-Settings.extension"),
    ("Lock Screen", "com.apple.Lock-Screen-Settings.extension"),
    ("Login Items", "com.apple.LoginItems-Settings.extension"),
    ("Mouse", "com.apple.Mouse-Settings.extension"),
    ("Network", "com.apple.Network-Settings.extension"),
    (
        "Notifications",
        "com.apple.Notifications-Settings.extension",
    ),
    ("Passwords", "com.apple.Passwords-Settings.extension"),
    (
        "Printers & Scanners",
        "com.apple.Print-Scan-Settings.extension",
    ),
    (
        "Privacy & Security",
        "com.apple.settings.PrivacySecurity.extension",
    ),
    ("Screen Saver", "com.apple.ScreenSaver-Settings.extension"),
    ("Screen Time", "com.apple.Screen-Time-Settings.extension"),
    ("Sharing", "com.apple.Sharing-Settings.extension"),
    ("Siri", "com.apple.Siri-Settings.extension"),
    (
        "Software Update",
        "com.apple.Software-Update-Settings.extension",
    ),
    ("Sound", "com.apple.Sound-Settings.extension"),
    ("Storage", "com.apple.settings.Storage"),
    ("Time Machine", "com.apple.Time-Machine-Settings.extension"),
    (
        "Touch ID & Password",
        "com.apple.Touch-ID-Settings.extension",
    ),
    ("Trackpad", "com.apple.Trackpad-Settings.extension"),
    (
        "Users & Groups",
        "com.apple.Users-Groups-Settings.extension",
    ),
    ("Wallpaper", "com.apple.Wallpaper-Settings.extension"),
    ("Wi-Fi", "com.apple.wifi-settings-extension"),
];

pub fn deep_link(pane_id: &str) -> String {
    format!("x-apple.systempreferences:{pane_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn no_duplicate_names_or_ids() {
        let names: HashSet<_> = SETTINGS_PANES.iter().map(|(n, _)| n).collect();
        let ids: HashSet<_> = SETTINGS_PANES.iter().map(|(_, i)| i).collect();
        assert_eq!(names.len(), SETTINGS_PANES.len());
        assert_eq!(ids.len(), SETTINGS_PANES.len());
    }

    #[test]
    fn ids_are_plausible_bundle_ids() {
        for (name, id) in SETTINGS_PANES {
            assert!(
                id.starts_with("com.apple."),
                "{name} has suspicious id {id}"
            );
            assert!(!id.contains(' '), "{name} id contains whitespace");
        }
    }

    #[test]
    fn deep_link_format() {
        assert_eq!(
            deep_link("com.apple.BluetoothSettings"),
            "x-apple.systempreferences:com.apple.BluetoothSettings"
        );
    }
}
