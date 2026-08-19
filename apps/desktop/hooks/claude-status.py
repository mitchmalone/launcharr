#!/usr/bin/env python3
"""Claude Code hook adapter for launcharr's agent monitor (agents.rs).

Claude supplies hook JSON on stdin; this maps the lifecycle event to an agent
state and emits one JSON line to launcharr's agents socket. It degrades
safely: malformed payloads and a missing socket (launcharr not running) both
exit 0 — a status widget must never break the agent it watches.

Inside a herdr pane it does the opposite: herdr already owns that pane's agent
state and launcharr reads it from there, so the hook enriches herdr's record
with the user's prompt instead of emitting a second, competing cell.

Install: point every Claude hook group (SessionStart, UserPromptSubmit,
PreToolUse, PostToolUse, PermissionRequest, Notification, Stop, SessionEnd,
SubagentStart, SubagentStop) at this script in ~/.claude/settings.json.
"""

import json
import os
import socket
import subprocess
import sys

STATES = {
    "SessionStart": "idle",
    "UserPromptSubmit": "working",
    "PreToolUse": "working",
    "PostToolUse": "working",
    "PermissionRequest": "attention",
    "Notification": "attention",
    # done, not idle: a finished turn stays "unread" (blue) until visited.
    "Stop": "done",
    "SessionEnd": "ended",
    # Subagents run inside the parent, which is still working; the event
    # itself rides in the `subagent` field.
    "SubagentStart": "working",
    "SubagentStop": "working",
}

# Claude Code's background daemon (`claude daemon run` → `--bg-pty-host` →
# `bg-spare` / pty sessions) runs these hooks too, with TMUX_PANE scrubbed. It
# is plumbing, not an agent: launcharr shows a background session only once it
# is actually driven (first prompt), so we mark rather than drop (agents.rs).
BACKGROUND_MARKERS = ("daemon run", "--bg-pty-host", "bg-spare")


# Process names that are never the agent itself — the hook runs as
# python ← shell ← agent, and on some setups a wrapper or two in between.
PASSTHROUGH = {"sh", "bash", "zsh", "dash", "fish", "ksh", "csh", "tcsh", "env",
               "python", "python3", "Python", "uv", "uvx"}


def agent_pid() -> int:
    """The pid launcharr should watch for liveness.

    launcharr reaps a session when this process is gone (agents.rs), which is
    how an agent that dies without firing SessionEnd — closed window, killed
    pane, crash — stops haunting the bar. Adapters that know their own pid can
    say so outright; otherwise walk up the parent chain past the shells the
    hook was spawned through and take the first real process.
    """
    override = os.environ.get("LAUNCHARR_AGENT_PID", "").strip()
    if override.isdigit():
        return int(override)
    pid = os.getppid()
    for _ in range(6):
        try:
            out = subprocess.run(
                ["/bin/ps", "-o", "ppid=,comm=", "-p", str(pid)],
                capture_output=True, text=True, timeout=2,
            ).stdout.split(None, 1)
        except Exception:
            return pid
        if len(out) < 2:
            return pid
        parent, comm = int(out[0]), os.path.basename(out[1].strip().split()[0])
        if comm not in PASSTHROUGH:
            return pid
        if parent <= 1:
            return pid
        pid = parent
    return pid


def background_ancestry() -> bool:
    """Is a Claude background-daemon process among our ancestors?"""
    pid = os.getpid()
    for _ in range(12):
        try:
            out = subprocess.run(
                ["/bin/ps", "-o", "ppid=,command=", "-p", str(pid)],
                capture_output=True, text=True, timeout=2,
            ).stdout.split(None, 1)
        except Exception:
            return False
        if len(out) < 2:
            return False
        parent, command = int(out[0]), out[1]
        # Only the leading argv — `claude daemon run`, `claude --bg-pty-host …`,
        # `claude bg-spare …` — never a shell whose *arguments* mention them.
        head = " ".join(command.split()[:3])
        if any(marker in head for marker in BACKGROUND_MARKERS):
            return True
        if parent <= 1:
            return False
        pid = parent
    return False


def socket_path() -> str:
    state_home = os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state")
    return os.path.join(state_home, "launcharr", "agents.sock")


def send_line(path: str, line: str) -> None:
    """One newline-JSON line to a unix socket, failing silently.

    Both launcharr and herdr speak this; a status widget must never break the
    agent it watches, so an absent socket is a no-op, not an error.
    """
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(2)
            sock.connect(path)
            sock.sendall(line.encode() + b"\n")
    except OSError:
        pass


def report_to_herdr(pane: str, title: str, detail: str) -> None:
    """Inside a herdr pane, herdr owns the cell — we only enrich it.

    herdr classifies agent state itself and launcharr reads that (herdr.rs), so
    emitting our own event too would put two cells on the bar for one pane.
    Instead we hand herdr the thing it can't know: the user's actual prompt.
    `pane.report_metadata` is presentation-only by design — it cannot take
    lifecycle state away from herdr's own integration — so the two can't
    disagree. Bonus: the title shows up in herdr's sidebar as well.
    """
    path = os.environ.get("HERDR_SOCKET_PATH") or os.path.expanduser(
        "~/.config/herdr/herdr.sock"
    )
    if not title:
        return
    send_line(
        path,
        json.dumps(
            {
                "id": "launcharr-claude-title",
                "method": "pane.report_metadata",
                "params": {
                    "pane_id": pane,
                    "source": "user:launcharr-claude",
                    "agent": "claude",
                    "title": title[:100],
                    "detail": detail[:100],
                },
            }
        ),
    )


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    event = str(payload.get("hook_event_name") or "")
    # /clear ends the session record but not the agent — treating it as `ended`
    # would delete a live cell until its next event repainted it.
    if event == "SessionEnd" and str(payload.get("reason") or "") == "clear":
        return
    session = str(payload.get("session_id") or "claude-unknown")
    prompt = str(payload.get("prompt") or "").replace("\n", " ").strip()
    tool = str(payload.get("tool_name") or "").strip()
    message = (
        str(payload.get("message") or payload.get("notification_type") or "")
        .replace("\n", " ")
        .strip()
    )
    detail = " · ".join(p for p in (event, tool or message[:100]) if p)

    herdr_pane = os.environ.get("HERDR_PANE_ID", "")
    if herdr_pane:
        report_to_herdr(herdr_pane, prompt, detail)
        return

    line = {
        "session": session,
        "agent": "claude",
        "state": STATES.get(event, "unknown"),
        "title": prompt[:100],
        "detail": detail,
        "tmux": os.environ.get("TMUX_PANE", ""),
        "pid": agent_pid(),
        "background": background_ancestry(),
    }
    if event in ("SubagentStart", "SubagentStop"):
        line["subagent"] = {
            "op": "start" if event == "SubagentStart" else "stop",
            "id": str(payload.get("agent_id") or ""),
            "type": str(payload.get("agent_type") or ""),
            "description": str(payload.get("description") or "")
            .replace("\n", " ")
            .strip()[:100],
        }
    send_line(socket_path(), json.dumps(line))


if __name__ == "__main__":
    main()
