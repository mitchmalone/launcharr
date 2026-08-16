//! Agent mode: `?` pipes a prompt to the user's own `claude` CLI — their
//! subscription, their credentials, their network. launcharr spawns a process
//! and streams stdout; it makes zero network requests itself (same family as
//! the iTerm2 hand-off). Ported from the spike-ask-ai branch 2026-08-16;
//! gated by `agents.askMode` (Settings → Agents, off by default).
//!
//! Rust is a dumb spawner: raw stream-json lines go to the frontend as
//! `ask-chunk` events; parsing is TypeScript's job (src/lib/ask.ts).
//! `ask-done` carries success.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

use crate::error::{CmdError, CmdResult};

static CLAUDE_PATH: Mutex<Option<String>> = Mutex::new(None);

/// GUI apps get launchd's anemic PATH; resolve the claude binary from the usual homes,
/// falling back to a login shell lookup once, then cache.
fn find_claude() -> CmdResult<String> {
    if let Some(cached) = CLAUDE_PATH.lock().unwrap().clone() {
        return Ok(cached);
    }
    let home = dirs::home_dir().unwrap_or_default();
    let candidates: [PathBuf; 4] = [
        home.join(".local/bin/claude"),
        home.join(".claude/local/claude"),
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
    ];
    for candidate in candidates {
        if candidate.exists() {
            let found = candidate.to_string_lossy().into_owned();
            *CLAUDE_PATH.lock().unwrap() = Some(found.clone());
            return Ok(found);
        }
    }
    let out = Command::new("/bin/zsh")
        .args(["-lc", "command -v claude"])
        .output()?;
    let found = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() && !found.is_empty() {
        *CLAUDE_PATH.lock().unwrap() = Some(found.clone());
        return Ok(found);
    }
    Err(CmdError::Internal(
        "claude CLI not found — install Claude Code to use ? mode".into(),
    ))
}

/// Fire a prompt at the claude CLI; stream stdout lines as `ask-chunk`, then `ask-done`.
/// `continue_conversation` rides `--continue` so follow-ups keep context.
#[tauri::command]
pub fn ask(
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    prompt: String,
    continue_conversation: bool,
) -> CmdResult<()> {
    if !state.config.read().unwrap().agents.ask_mode {
        return Err(CmdError::Internal(
            "agent mode is off — enable it in Settings → Agents".into(),
        ));
    }
    let bin = find_claude()?;
    // The child inherits launcharr's TCC identity: anything it touches, macOS bills to
    // us. Cage it — empty cwd we own (so project discovery finds nothing) and no
    // filesystem/exec tools (`?` is Q&A, not an agent). Zero-permissions invariant.
    let cage = app
        .path()
        .app_data_dir()
        .map_err(|e| CmdError::Internal(format!("app data dir: {e}")))?
        .join("ask-home");
    std::fs::create_dir_all(&cage)?;
    std::thread::spawn(move || {
        let mut cmd = Command::new(&bin);
        cmd.current_dir(&cage);
        // NB: --disallowedTools is VARIADIC — anything after it becomes a "tool name",
        // including the prompt. The prompt must come first.
        cmd.args(["-p", &prompt]);
        if continue_conversation {
            cmd.arg("--continue");
        }
        cmd.args([
            "--output-format",
            "stream-json",
            "--include-partial-messages",
            "--verbose",
            "--disallowedTools",
        ]);
        // Variadic flag stays LAST and each tool is its own argument.
        cmd.args([
            "Bash",
            "Read",
            "Write",
            "Edit",
            "Glob",
            "Grep",
            "NotebookEdit",
            "WebFetch",
            "WebSearch",
            "Task",
        ]);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        match cmd.spawn() {
            Ok(mut child) => {
                // Drain stderr on the side; surfaced only if the CLI exits unhappy.
                let stderr_buf = child.stderr.take().map(|s| {
                    std::thread::spawn(move || {
                        let mut buf = String::new();
                        use std::io::Read as _;
                        let _ = BufReader::new(s).read_to_string(&mut buf);
                        buf
                    })
                });
                if let Some(stdout) = child.stdout.take() {
                    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                        let _ = app.emit("ask-chunk", &line);
                    }
                }
                let ok = child.wait().map(|s| s.success()).unwrap_or(false);
                if !ok {
                    let err = stderr_buf.and_then(|h| h.join().ok()).unwrap_or_default();
                    let mut last_lines: Vec<&str> = err.lines().rev().take(3).collect();
                    last_lines.reverse();
                    let tail = last_lines.join(" · ");
                    let msg = serde_json::json!({
                        "type": "result", "is_error": true,
                        "result": if tail.is_empty() { "claude exited with an error".into() } else { tail }
                    });
                    let _ = app.emit("ask-chunk", msg.to_string());
                }
                let _ = app.emit("ask-done", ok);
            }
            Err(e) => {
                let _ = app.emit("ask-chunk", format!(r#"{{"type":"result","is_error":true,"result":"failed to start claude: {e}"}}"#));
                let _ = app.emit("ask-done", false);
            }
        }
    });
    Ok(())
}
