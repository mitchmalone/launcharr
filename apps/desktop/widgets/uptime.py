#!/usr/bin/env python3
"""launcharr widget: Upptime status of your sites (docs/WIDGETS.md).

Reads an Upptime `summary.json` (a public array of {name, url, status, time})
and paints an up/down arrow with the count of sites that are down. The card
lists every site with a dot; a row opens the site, the cell opens the status
page. Point UPTIME_SUMMARY_URL / UPTIME_STATUS_URL at your own.

Install: copy or symlink into ~/.config/launcharr/widgets/ (chmod +x).
"""

import json
import os
import sys
import urllib.request

SUMMARY_URL = os.environ.get(
    "UPTIME_SUMMARY_URL",
    "https://status.droiddroiddroid.com/api/mitchmalone-com/raw/RamenAmok/uptime/master/history/summary.json",
)
STATUS_URL = os.environ.get("UPTIME_STATUS_URL", "https://status.droiddroiddroid.com/")
MAX_ROWS = 12


def manifest():
    return {
        "id": "uptime",
        "name": "Uptime",
        "interval": 300,
        "zone": "right",
        "icon": "arrow-big-up",
        "timeout": 15,
    }


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "launcharr-widget"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.load(resp)


def open_action(url):
    return {"type": "open", "value": url}


def tick():
    sites = fetch(SUMMARY_URL)
    if not isinstance(sites, list):
        raise SystemExit("summary.json is not a list")
    down = [s for s in sites if s.get("status") != "up"]
    rows = []
    for s in sites[:MAX_ROWS]:
        up = s.get("status") == "up"
        ms = s.get("time")
        rows.append(
            {
                "dot": "ok" if up else "error",
                "text": s.get("name") or s.get("url") or "site",
                "hint": f"{ms} ms" if up and isinstance(ms, (int, float)) else ("down" if not up else None),
                "action": open_action(s["url"]) if s.get("url") else None,
            }
        )
    return {
        "icon": "arrow-big-down" if down else "arrow-big-up",
        "label": str(len(down)) if down else None,
        "tone": "error" if down else "ok",
        "click": open_action(STATUS_URL),
        "card": {
            "title": "Uptime",
            "subtitle": f"{len(down)} of {len(sites)} down" if down else f"all {len(sites)} up",
            "rows": rows,
            "hint": "click a site to open it · cell opens the status page",
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
