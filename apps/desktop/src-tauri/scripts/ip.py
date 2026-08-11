#!/usr/bin/env python3
"""launcharr script: show local IP addresses (zero-network: no external lookups). Yours to edit."""
import sys

# The scripts dir is sys.path[0] when run as a file; drop it so a neighbouring script
# named after a stdlib module (json.py, string.py, ...) can't shadow real imports.
del sys.path[0]

import json
import subprocess


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "manifest":
        print(
            json.dumps(
                {
                    "trigger": "ip",
                    "name": "IP address",
                    "description": "Local network addresses (no external lookup)",
                }
            )
        )
        return
    if mode != "query":
        sys.exit(1)

    items = []
    for iface in ("en0", "en1", "en2", "utun0"):
        result = subprocess.run(
            ["ipconfig", "getifaddr", iface], capture_output=True, text=True
        )
        addr = result.stdout.strip()
        if addr:
            items.append(
                {
                    "title": addr,
                    "subtitle": f"{iface} · copy",
                    "action": {"type": "copy", "value": addr},
                }
            )
    if not items:
        items.append(
            {
                "title": "No active network interface",
                "subtitle": "nothing on the horizon",
                "action": {"type": "none"},
            }
        )
    print(json.dumps({"items": items}))


if __name__ == "__main__":
    main()
