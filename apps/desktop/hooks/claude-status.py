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


def socket_path() -> str:
    state_home = os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state")
    return os.path.join(state_home, "launcharr", "agents.sock")


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    event = str(payload.get("hook_event_name") or "")
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
