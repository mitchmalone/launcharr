#!/usr/bin/env python3
"""Claude Code hook adapter for launcharr's agent monitor (agents.rs).

Claude supplies hook JSON on stdin; this maps the lifecycle event to an agent
state and emits one JSON line to launcharr's agents socket. It degrades
safely: malformed payloads and a missing socket (launcharr not running) both
exit 0 — a status widget must never break the agent it watches.

Install: point every Claude hook group (SessionStart, UserPromptSubmit,
PreToolUse, PostToolUse, PermissionRequest, Notification, Stop, SessionEnd)
at this script in ~/.claude/settings.json.
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
}


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


def socket_path() -> str:
    state_home = os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state")
    return os.path.join(state_home, "launcharr", "agents.sock")


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
    line = json.dumps(
        {
            "session": session,
            "agent": "claude",
            "state": STATES.get(event, "unknown"),
            "title": prompt[:100],
            "detail": detail,
            "tmux": os.environ.get("TMUX_PANE", ""),
            "pid": agent_pid(),
        }
    )
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(2)
            sock.connect(socket_path())
            sock.sendall(line.encode() + b"\n")
    except OSError:
        pass


if __name__ == "__main__":
    main()
