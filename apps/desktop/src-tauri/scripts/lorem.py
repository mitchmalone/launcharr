#!/usr/bin/env python3
"""launcharr script: generate lorem ipsum. `lorem 3` = three paragraphs. Yours to edit."""
import sys

# The scripts dir is sys.path[0] when run as a file; drop it so a neighbouring script
# named after a stdlib module (json.py, string.py, ...) can't shadow real imports.
del sys.path[0]

import json

PARAGRAPH = (
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor "
    "incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud "
    "exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute "
    "irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla "
    "pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia "
    "deserunt mollit anim id est laborum."
)


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "manifest":
        print(
            json.dumps(
                {
                    "trigger": "lorem",
                    "name": "Lorem ipsum",
                    "description": "Generate placeholder text · lorem <paragraphs>",
                }
            )
        )
        return
    if mode != "query":
        sys.exit(1)

    args = sys.argv[2] if len(sys.argv) > 2 else ""
    try:
        count = max(1, min(int(args.strip() or "1"), 10))
    except ValueError:
        count = 1
    text = "\n\n".join([PARAGRAPH] * count)
    plural = "paragraph" if count == 1 else "paragraphs"
    print(
        json.dumps(
            {
                "items": [
                    {
                        "title": f"Copy {count} {plural} of lorem ipsum",
                        "subtitle": f"{len(text)} chars · {PARAGRAPH[:48]}…",
                        "action": {"type": "copy", "value": text},
                    }
                ]
            }
        )
    )


if __name__ == "__main__":
    main()
