#!/usr/bin/env python3
"""launcharr widget: TRMNL e-ink device battery (docs/WIDGETS.md).

Polls https://trmnl.com/api/devices with your account API key and paints a
tablet glyph toned by the lowest device battery (green > 40 %, amber ≤ 40 %,
red < 20 % — the number shows only in the red tier, like the Mac's own
battery cell). The card lists every device with charge, voltage and last ping.

The key comes from TRMNL_API_KEY, else from the `secret` helper
(`secret shared/trmnl/api_key`) — launcharr never sees or stores it; the
widget is inert without one — `{"hidden": true}`, no cell, no request
(DECISIONS 2026-08-16).

Install: copy or symlink into ~/.config/launcharr/widgets/ (chmod +x).
"""

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

DEVICES_URL = os.environ.get("TRMNL_API_URL", "https://trmnl.com/api/devices")
SECRET_ID = os.environ.get("TRMNL_API_SECRET_ID", "shared/trmnl/api_key")
DASHBOARD_URL = "https://usetrmnl.com/devices"


def manifest():
    return {
        "id": "trmnl",
        "name": "TRMNL",
        "interval": 300,
        "zone": "right",
        "icon": "tablet",
        "timeout": 30,
    }


def token():
    key = os.environ.get("TRMNL_API_KEY")
    if key:
        return key
    # `secret` is a shell function in the interactive zsh config.
    try:
        out = subprocess.run(
            ["zsh", "-ic", f"secret {SECRET_ID}"],
            capture_output=True,
            text=True,
            timeout=20,
            stdin=subprocess.DEVNULL,
        )
        key = out.stdout.strip().splitlines()[-1] if out.stdout.strip() else ""
    except (OSError, subprocess.TimeoutExpired):
        key = ""
    return key


def age(iso):
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    s = max(0, int((datetime.now(timezone.utc) - t.astimezone(timezone.utc)).total_seconds()))
    if s < 3600:
        return f"{s // 60}m ago"
    if s < 86400:
        return f"{s // 3600}h ago"
    return f"{s // 86400}d ago"


def tone(pct):
    if pct is None:
        return "muted"
    if pct < 20:
        return "error"
    if pct <= 40:
        return "warn"
    return "ok"


def tick():
    key = token()
    if not key:
        # No credential → no cell, no request (DECISIONS 2026-08-16).
        print(f"no TRMNL key: set TRMNL_API_KEY or `secret {SECRET_ID}`", file=sys.stderr)
        return {"hidden": True}
    req = urllib.request.Request(
        DEVICES_URL,
        headers={"Authorization": f"Bearer {key}", "User-Agent": "launcharr-widget"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"trmnl api {e.code}")
    devices = body.get("data") if isinstance(body, dict) else None
    if not isinstance(devices, list):
        raise SystemExit("unexpected TRMNL response")

    rows, levels = [], []
    for d in devices:
        pct = d.get("percent_charged")
        pct = round(pct) if isinstance(pct, (int, float)) else None
        if pct is not None:
            levels.append(pct)
        volts = d.get("battery_voltage")
        bits = [f"{volts}V" if volts else None, age(d.get("hardware_last_ping_at") or d.get("last_ping_at"))]
        rows.append(
            {
                "dot": tone(pct),
                "text": f"{d.get('name') or 'TRMNL'} · {pct}%" if pct is not None else (d.get("name") or "TRMNL"),
                "hint": " · ".join(b for b in bits if b) or None,
                "action": {"type": "open", "value": DASHBOARD_URL},
            }
        )
    low = min(levels) if levels else None
    t = tone(low)
    return {
        "icon": "tablet",
        "label": f"{low}%" if t == "error" else None,
        "tone": t,
        "click": {"type": "open", "value": DASHBOARD_URL},
        "card": {
            "title": "TRMNL",
            "subtitle": f"{len(devices)} device{'s' if len(devices) != 1 else ''}",
            "rows": rows,
            "hint": "click to open usetrmnl.com",
        },
    }


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "manifest":
        print(json.dumps(manifest()))
    elif cmd == "tick":
        print(json.dumps(tick()))
    else:
        sys.exit(f"usage: {sys.argv[0]} manifest|tick")
