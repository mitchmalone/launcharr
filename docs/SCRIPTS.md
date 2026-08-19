# launcharr scripts

Scripts are first-class citizens: drop a **TypeScript file** (or any executable) into
`~/.config/launcharr/scripts/` and its trigger word joins the launcher grammar — no
build, no chmod, no restart, no store, no manifest file. `.ts` runs under Bun (or Node —
DECISIONS 2026-08-19). The bundled scripts (`json-format.ts`, `ip.ts`) are reference
implementations and yours to edit; `lorem` is a built-in.

## The contract

Any `.ts`/`.js` file (Bun/Node) or executable (any language) that answers two invocations:

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
- `altAction` (optional, same shape as `action`) runs on ⌥⏎ instead.
- `action` decides what Enter does:
  - `{"type": "copy", "value": "…"}` — put text on the clipboard
  - `{"type": "open", "value": "…"}` — `open` a URL, file, or app
  - `{"type": "none"}` (default) — informational row, Enter dismisses only

## Rules of the road

- **Timeouts:** manifest 1.5s, query 3s. A slow script gets killed, not waited for.
- **stderr is ignored**, exit non-zero = no results. Debug by running the script by hand.
- **Zero-network is culture, not enforcement** for scripts: launcharr core never touches the
  network; what your own scripts do is your business.
- **TypeScript:** guard the entry point with `if (import.meta.main)` (see the bundled
  scripts) so the file also imports cleanly into a test; type-only imports from
  `@launcharr/core/types` are erased at run time. No Bun or Node on the machine → the
  script is skipped with a log line (`needs bun — brew install oven-sh/bun/bun`).
- **Python gotcha** (if you still write one): the scripts dir is `sys.path[0]` for python
  scripts — don't name one after a stdlib module. The old bundled `.py` scripts are parked
  as `*.py.retired` on first launch of a TS-era build.

## Widgets

The bar has the same idea for cells: `docs/WIDGETS.md` — executables in
`~/.config/launcharr/widgets/` answering `manifest` / `tick`.

## Built-in triggers

`clip` (clipboard history) is a built-in, not a script — its trigger participates in the
same grammar and cannot be claimed by a script.
