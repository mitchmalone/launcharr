#!/usr/bin/env python3
"""launcharr widget: latest Vercel deployment per project (docs/WIDGETS.md).

Uses the token the Vercel CLI already stores (`vercel login`) — the same
"credentials the provider CLI already holds, never written by launcharr" shape
as the usage monitor — or VERCEL_TOKEN. Team comes from the CLI's currentTeam
or VERCEL_TEAM_ID. One `GET /v9/projects` per tick: each project's latest
production deployment becomes a row; the cell is the Vercel triangle, dashed
and red while any deployment has failed, amber while one is building.

Install: copy or symlink into ~/.config/launcharr/widgets/ (chmod +x).
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = "https://api.vercel.com"
CLI_DIR = os.path.expanduser("~/Library/Application Support/com.vercel.cli")
MAX_ROWS = 12

TONES = {
    "READY": "ok",
    "ERROR": "error",
    "CANCELED": "muted",
    "BUILDING": "warn",
    "QUEUED": "warn",
    "INITIALIZING": "warn",
}


def manifest():
    return {
        "id": "vercel",
        "name": "Vercel",
        "interval": 120,
        "zone": "right",
        "icon": "triangle",
        "timeout": 20,
    }


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def credentials():
    token = os.environ.get("VERCEL_TOKEN") or read_json(os.path.join(CLI_DIR, "auth.json")).get("token")
    if not token:
        raise SystemExit("no Vercel token: run `vercel login` or set VERCEL_TOKEN")
    team = os.environ.get("VERCEL_TEAM_ID") or read_json(os.path.join(CLI_DIR, "config.json")).get("currentTeam")
    return token, team


def get(path, token, params=None):
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v})
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "launcharr-widget"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"vercel api {e.code} on {path}")


def age(ms):
    if not isinstance(ms, (int, float)):
        return None
    s = max(0, int(datetime.now(timezone.utc).timestamp() - ms / 1000))
    if s < 3600:
        return f"{s // 60}m"
    if s < 86400:
        return f"{s // 3600}h"
    return f"{s // 86400}d"


def tick():
    token, team = credentials()
    slug = None
    if team:
        slug = get(f"/v2/teams/{team}", token).get("slug")
    else:
        slug = (get("/v2/user", token).get("user") or {}).get("username")
    projects = get("/v9/projects", token, {"teamId": team, "limit": 100}).get("projects", [])

    rows, states = [], []
    for p in projects:
        deps = p.get("latestDeployments") or []
        prod = [d for d in deps if d.get("target") == "production"] or deps
        if not prod:
            continue
        d = max(prod, key=lambda d: d.get("createdAt") or 0)
        state = (d.get("readyState") or "").upper()
        states.append(state)
        aliases = d.get("alias") or []
        domain = next((a for a in aliases if not a.endswith(".vercel.app")), aliases[0] if aliases else d.get("url"))
        dpl = (d.get("id") or "").replace("dpl_", "")
        url = f"https://vercel.com/{slug}/{p['name']}/{dpl}" if slug and dpl else f"https://vercel.com/{slug}/{p['name']}"
        rows.append(
            {
                "sort": d.get("createdAt") or 0,
                "dot": TONES.get(state, "muted"),
                "text": f"{p['name']} → {domain}" if domain else p["name"],
                "hint": age(d.get("createdAt")),
                "action": {"type": "open", "value": url},
            }
        )
    rows.sort(key=lambda r: r["sort"], reverse=True)
    for r in rows:
        r.pop("sort")

    failed = sum(1 for s in states if s == "ERROR")
    building = any(TONES.get(s) == "warn" for s in states)
    return {
        "icon": "triangle-dashed" if failed else "triangle",
        "label": str(failed) if failed else None,
        "tone": "error" if failed else ("warn" if building else "ok"),
        "click": {"type": "open", "value": f"https://vercel.com/{slug}" if slug else "https://vercel.com"},
        "card": {
            "title": "Vercel",
            "subtitle": f"{failed} failed" if failed else ("deploying…" if building else f"{len(rows)} projects ready"),
            "rows": rows[:MAX_ROWS],
            "hint": "click a project to open the deployment",
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
