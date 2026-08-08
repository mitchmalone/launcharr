# launcharr scripts

Scripts are first-class citizens: drop an executable into `~/.config/launcharr/scripts/` and
its trigger word joins the launcher grammar — no restart, no store, no manifest file. The
bundled scripts (`lorem`, `json`, `ip`) are reference implementations and yours to edit.

## The contract

Any executable (any language) that answers two invocations:

### `<script> manifest`

Print a JSON manifest to stdout and exit 0:

```json
{
  "trigger": "lorem",
  "name": "Lorem ipsum",
  "description": "Generate placeholder text"
}
```

- `trigger` — the word that activates the script (`lorem 3`). No whitespace. First
  registration wins on collision.
- `description` — optional, shown nowhere yet (reserved for a future script browser).

### `<script> query <args>`

`<args>` is everything the user typed after the trigger word, verbatim, as one argument.
Called on every keystroke (debounced ~120ms). Print results to stdout and exit 0:

```json
{
  "items": [
    {
      "title": "Copy 3 paragraphs of lorem ipsum",
      "subtitle": "1,338 chars",
      "action": { "type": "copy", "value": "Lorem ipsum dolor…" }
    }
  ]
}
```

- Up to 8 items are shown. `subtitle` is optional (renders in the dimmed hint column).
- `action` decides what Enter does:
  - `{"type": "copy", "value": "…"}` — put text on the clipboard
  - `{"type": "open", "value": "…"}` — `open` a URL, file, or app
  - `{"type": "none"}` (default) — informational row, Enter dismisses only

## Rules of the road

- **Timeouts:** manifest 1.5s, query 3s. A slow script gets killed, not waited for.
- **stderr is ignored**, exit non-zero = no results. Debug by running the script by hand.
- **Zero-network is culture, not enforcement** for scripts: launcharr core never touches the
  network; what your own scripts do is your business.
- **Python gotcha:** the scripts dir is `sys.path[0]` for python scripts run from it — a
  script named `json.py`/`string.py` shadows the stdlib for its neighbours. Bundled scripts
  `del sys.path[0]` first; do the same (and don't name scripts after stdlib modules).

## Built-in triggers

`clip` (clipboard history) is a built-in, not a script — its trigger participates in the
same grammar and cannot be claimed by a script.
