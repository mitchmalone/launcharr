#!/usr/bin/env python3
"""launcharr script: format the JSON on your clipboard and copy it back. Yours to edit."""
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
                    "trigger": "json",
                    "name": "Format JSON",
                    "description": "Pretty-print clipboard JSON and copy it back",
                }
            )
        )
        return
    if mode != "query":
        sys.exit(1)

    raw = subprocess.run(["pbpaste"], capture_output=True, text=True).stdout
    try:
        formatted = json.dumps(json.loads(raw), indent=2, ensure_ascii=False)
    except (json.JSONDecodeError, TypeError) as err:
        print(
            json.dumps(
                {
                    "items": [
                        {
                            "title": "Clipboard is not valid JSON",
                            "subtitle": str(err)[:80],
                            "action": {"type": "none"},
                        }
                    ]
                }
            )
        )
        return

    lines = formatted.count("\n") + 1
    preview = " ".join(formatted.split())[:64]
    print(
        json.dumps(
            {
                "items": [
                    {
                        "title": f"Copy formatted JSON ({lines} lines)",
                        "subtitle": preview,
                        "action": {"type": "copy", "value": formatted},
                    },
                    {
                        "title": "Copy minified JSON",
                        "subtitle": "single line, no whitespace",
                        "action": {
                            "type": "copy",
                            "value": json.dumps(
                                json.loads(raw), separators=(",", ":"), ensure_ascii=False
                            ),
                        },
                    },
                ]
            }
        )
    )


if __name__ == "__main__":
    main()
