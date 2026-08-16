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

static CLI_PATHS: Mutex<Option<std::collections::HashMap<String, String>>> = Mutex::new(None);

/// GUI apps get launchd's anemic PATH; resolve a CLI binary from the usual
/// homes, falling back to a login shell lookup once, then cache per name.
fn find_cli(name: &str) -> CmdResult<String> {
    if let Some(cached) = CLI_PATHS
        .lock()
        .unwrap()
        .get_or_insert_with(Default::default)
        .get(name)
        .cloned()
    {
        return Ok(cached);
    }
    let home = dirs::home_dir().unwrap_or_default();
    let mut candidates = vec![
        home.join(".local/bin").join(name),
        PathBuf::from("/opt/homebrew/bin").join(name),
        PathBuf::from("/usr/local/bin").join(name),
    ];
    if name == "claude" {
        candidates.push(home.join(".claude/local/claude"));
    }
    let mut found = candidates
        .into_iter()
        .find(|c| c.exists())
        .map(|c| c.to_string_lossy().into_owned());
    if found.is_none() {
        let out = Command::new("/bin/zsh")
            .args(["-lc", &format!("command -v {name}")])
            .output()?;
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if out.status.success() && !path.is_empty() {
            found = Some(path);
        }
    }
    match found {
        Some(path) => {
            CLI_PATHS
                .lock()
                .unwrap()
                .get_or_insert_with(Default::default)
                .insert(name.to_owned(), path.clone());
            Ok(path)
        }
        None => Err(CmdError::Internal(format!(
            "{name} CLI not found — install it to use ? mode"
        ))),
    }
}

/// Fire a prompt at the selected agent CLI; stream stdout lines as
/// `ask-chunk`, then `ask-done`. `continue_conversation` keeps context
/// (`--continue` for claude, `exec resume --last` for codex).
#[tauri::command]
pub fn ask(
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    prompt: String,
    continue_conversation: bool,
) -> CmdResult<()> {
    let (enabled, provider) = {
        let cfg = state.config.read().unwrap();
        (cfg.agents.ask_mode, cfg.agents.ask_provider.clone())
    };
    if !enabled {
        return Err(CmdError::Internal(
            "agent mode is off — enable it in Settings → Agents".into(),
        ));
    }
    let bin = find_cli(if provider == "codex" {
        "codex"
    } else {
        "claude"
    })?;
    // The child inherits launcharr's TCC identity: anything it touches, macOS bills to
    // us. Cage it — empty cwd we own (so project discovery finds nothing) and the
    // tightest tool restrictions each CLI offers (`?` is Q&A, not an agent).
    let cage = app
        .path()
        .app_data_dir()
        .map_err(|e| CmdError::Internal(format!("app data dir: {e}")))?
        .join("ask-home");
    std::fs::create_dir_all(&cage)?;
    std::thread::spawn(move || {
        let mut cmd = Command::new(&bin);
        cmd.current_dir(&cage);
        if provider == "codex" {
            // Verified against codex-cli 0.147: `exec --json` emits
            // thread/turn/item events; `resume --last` keeps context. Cage is
            // read-only sandbox — codex has no per-tool disallow flag.
            cmd.arg("exec");
            if continue_conversation {
                cmd.args(["resume", "--last"]);
            }
            cmd.args(["--json", "--sandbox", "read-only", "--skip-git-repo-check"]);
            cmd.arg(&prompt);
        } else {
            // NB: --disallowedTools is VARIADIC — anything after it becomes a
            // "tool name", including the prompt. The prompt must come first.
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
        }
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
