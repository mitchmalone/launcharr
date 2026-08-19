#!/usr/bin/env python3
"""launcharr widget: latest GitHub Actions runs (docs/WIDGETS.md).

Reads a JSON feed of workflow runs — the shape the retired Sketchybar module
consumed: `{"failing": N, "items": [{"repo_label", "workflow", "latest": {"state"
| "conclusion", "url", "created_at"}}]}` — and paints a monitor glyph that goes
red while anything is failing, with the failing count as the label. The card
lists the ten most recent runs; a row opens the run.

Point GITHUB_ACTIONS_FEED_URL at your own feed (or rewrite `fetch_runs` to hit
`gh api` — the widget contract doesn't care where the data comes from).

Install: copy or symlink into ~/.config/launcharr/widgets/ (chmod +x).
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

FEED_URL = os.environ.get(
    "GITHUB_ACTIONS_FEED_URL",
    "https://0juxenscsxe5h3ff.public.blob.vercel-storage.com/glance/github-actions.json",
)
HOME_URL = os.environ.get("GITHUB_ACTIONS_HOME_URL", "https://github.com/RamenAmok")
MAX_ROWS = 10

TONES = {
    "success": "ok",
    "failure": "error",
    "cancelled": "error",
    "timed_out": "error",
    "action_required": "error",
    "running": "warn",
    "queued": "warn",
    "in_progress": "warn",
}


def manifest():
    return {
        "id": "github-actions",
        "name": "GitHub Actions",
        "interval": 120,
        "zone": "right",
        "icon": "monitor-check",
        "timeout": 15,
    }


def fetch_runs():
    req = urllib.request.Request(FEED_URL, headers={"User-Agent": "launcharr-widget"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.load(resp)


def age(iso):
    """'3m' / '2h' / '4d' since an ISO-8601 timestamp, or None."""
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    s = max(0, int((datetime.now(timezone.utc) - t).total_seconds()))
    if s < 3600:
        return f"{s // 60}m"
    if s < 86400:
        return f"{s // 3600}h"
    return f"{s // 86400}d"


def tick():
    feed = fetch_runs()
    if not isinstance(feed, dict) or not isinstance(feed.get("items"), list):
        raise SystemExit("feed is not {items: [...]}")
    runs = []
    for item in feed["items"]:
        latest = item.get("latest")
        if not isinstance(latest, dict):
            continue
        runs.append(
            {
                "repo": item.get("repo_label") or item.get("repo") or "repo",
                "workflow": item.get("workflow") or latest.get("name") or "workflow",
                "state": latest.get("state") or latest.get("conclusion") or item.get("latest_state") or "unknown",
                "url": latest.get("url") or item.get("workflow_url") or item.get("repo_url") or HOME_URL,
                "created_at": latest.get("created_at") or item.get("sort_time") or "",
            }
        )
    runs.sort(key=lambda r: r["created_at"], reverse=True)
    failing = feed.get("failing")
    if not isinstance(failing, int):
        failing = sum(1 for r in runs if TONES.get(r["state"]) == "error")
    running = any(TONES.get(r["state"]) == "warn" for r in runs)
    rows = [
        {
            "dot": TONES.get(r["state"], "muted"),
            "text": f"{r['repo']} · {r['workflow']}",
            "hint": age(r["created_at"]),
            "action": {"type": "open", "value": r["url"]},
        }
        for r in runs[:MAX_ROWS]
    ]
    return {
        "icon": "monitor-x" if failing else "monitor-check",
        "label": str(failing) if failing else None,
        "tone": "error" if failing else ("warn" if running else "ok"),
        "click": {"type": "open", "value": HOME_URL},
        "card": {
            "title": "GitHub Actions",
            "subtitle": f"{failing} failing" if failing else "all green",
            "rows": rows,
            "hint": "click a run to open it",
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
