//! External desktop-layer tools launcharr drives but never ships: AeroSpace
//! (tiling; a Homebrew cask dependency of ours), JankyBorders (opt-in Homebrew
//! formula — GPL-3, never vendored, DECISIONS 2026-08-17) and Homebrew itself,
//! through which the Settings → Desktop rows install them. Pure detection here;
//! `install` spawns `brew` and streams its output as events so the settings
//! window can show progress. Nothing here fetches anything itself.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::error::{CmdError, CmdResult};

/// Where Homebrew puts binaries on Apple silicon and Intel; a dev shell's PATH
/// (checked first) can override.
const BREW_BINS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Dep {
    Aerospace,
    Borders,
}

impl Dep {
    pub fn binary(self) -> &'static str {
        match self {
            Dep::Aerospace => "aerospace",
            Dep::Borders => "borders",
        }
    }
    /// The `brew install` arguments; AeroSpace's cask lives in nikitabobko's tap,
    /// which brew auto-taps for a fully qualified name; borders likewise (felixkratz/formulae,
    /// not homebrew-core).
    fn brew_args(self) -> &'static [&'static str] {
        match self {
            Dep::Aerospace => &["install", "--cask", "nikitabobko/tap/aerospace"],
            Dep::Borders => &["install", "felixkratz/formulae/borders"],
        }
    }
}

/// One tool's presence, as the settings row shows it. Mirrors `DepStatus` in TS.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepStatus {
    pub path: Option<String>,
    pub version: Option<String>,
}

/// Find `bin` on PATH or under Homebrew. PATH first so a dev shell wins.
pub fn locate(bin: &str) -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(bin);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    BREW_BINS
        .iter()
        .map(|d| Path::new(d).join(bin))
        .find(|p| is_executable(p))
}

pub fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(p)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

pub fn status(dep: Dep) -> DepStatus {
    let Some(path) = locate(dep.binary()) else {
        return DepStatus::default();
    };
    let version = Command::new(&path)
        .arg(match dep {
            Dep::Aerospace => "--version",
            Dep::Borders => "--version",
        })
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| parse_version(&String::from_utf8_lossy(&o.stdout)));
    DepStatus {
        path: Some(path.to_string_lossy().into_owned()),
        version,
    }
}

pub fn brew() -> Option<PathBuf> {
    locate("brew")
}

/// First `x.y[.z]` token — `aerospace --version` prints "aerospace CLI client
/// version: 0.19.2 …", borders prints "borders-v1.7.0" or similar.
pub fn parse_version(out: &str) -> Option<String> {
    out.split(|c: char| !(c.is_ascii_digit() || c == '.'))
        .find(|t| t.contains('.') && t.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(|t| t.trim_matches('.').to_owned())
}

/// Progress line for the settings window (`desktop-install` event).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallEvent {
    pub dep: Dep,
    pub line: Option<String>,
    /// Set on the final event: brew's exit status.
    pub done: Option<bool>,
}

/// `brew install …` in the background; every output line becomes an event, the
/// last one carries `done`. Errors before spawn come back through the Result.
pub fn install(app: AppHandle, dep: Dep) -> CmdResult<()> {
    let brew = brew().ok_or_else(|| {
        CmdError::NotFound("Homebrew (brew) — install it from https://brew.sh first".into())
    })?;
    std::thread::spawn(move || {
        let emit = |line: Option<String>, done: Option<bool>| {
            let _ = app.emit("desktop-install", InstallEvent { dep, line, done });
        };
        let mut child = match Command::new(&brew)
            .args(dep.brew_args())
            .env("HOMEBREW_NO_AUTO_UPDATE", "1")
            .env("HOMEBREW_NO_ENV_HINTS", "1")
            .env("HOMEBREW_NO_INSTALL_CLEANUP", "1")
            .env("NONINTERACTIVE", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                emit(Some(format!("failed to start brew: {e}")), Some(false));
                return;
            }
        };
        // Both streams, interleaved by whichever thread gets there first.
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let mut readers = Vec::new();
        for stream in [stdout.map(Pipe::Out), stderr.map(Pipe::Err)]
            .into_iter()
            .flatten()
        {
            let app = app.clone();
            readers.push(std::thread::spawn(move || {
                use std::io::BufRead;
                let reader: Box<dyn std::io::Read> = match stream {
                    Pipe::Out(s) => Box::new(s),
                    Pipe::Err(s) => Box::new(s),
                };
                for line in std::io::BufReader::new(reader)
                    .lines()
                    .map_while(Result::ok)
                {
                    let line = line.trim().to_owned();
                    if !line.is_empty() {
                        let _ = app.emit(
                            "desktop-install",
                            InstallEvent {
                                dep,
                                line: Some(line),
                                done: None,
                            },
                        );
                    }
                }
            }));
        }
        let ok = child.wait().map(|s| s.success()).unwrap_or(false);
        for r in readers {
            let _ = r.join();
        }
        emit(None, Some(ok));
    });
    Ok(())
}

enum Pipe {
    Out(std::process::ChildStdout),
    Err(std::process::ChildStderr),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_parses_both_tools() {
        assert_eq!(
            parse_version("aerospace CLI client version: 0.19.2-Beta 5d5be1e\n").as_deref(),
            Some("0.19.2")
        );
        assert_eq!(parse_version("borders-v1.7.0").as_deref(), Some("1.7.0"));
        assert_eq!(parse_version("no numbers here"), None);
        assert_eq!(parse_version("build 42"), None);
    }

    #[test]
    fn locate_finds_a_system_binary_and_not_nonsense() {
        assert!(locate("ls").is_some());
        assert!(locate("definitely-not-a-binary-launcharr").is_none());
    }
}
