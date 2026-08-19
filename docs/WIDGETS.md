# launcharr widgets

Widgets are the bar's scripts: drop an executable into `~/.config/launcharr/widgets/` and
it owns a cell in the menubar — a glyph, an optional short label, a tone, a click, and a
hover card of rows. Any language, no restart, no store. The reference widgets in
`apps/desktop/widgets/` (`uptime`, `github-actions`, `vercel`, `trmnl`) are yours to copy
and edit; the shape is deliberately the same as `docs/SCRIPTS.md`.

**Widgets are data, never code.** A widget prints JSON; launcharr renders it with one
generic cell and card, in the theme, on every display. Nothing a widget says can put
markup or script in the bar — which is also why the same widget renders identically on
launcharr.com's demo.

## The contract

Any executable that answers two invocations:

### `<widget> manifest`

Print a JSON manifest to stdout and exit 0:

```json
{
  "id": "uptime",
  "name": "Uptime",
  "interval": 300,
  "zone": "right",
  "icon": "arrow-big-up",
  "timeout": 15
}
```

- `id` — `[a-z0-9-_]`, ≤ 32 chars. Names the layout slot (`widget:<id>`) and the trigger
  file. First registration wins on collision (alphabetical by filename).
- `name` — the card title until a tick sends one. Defaults to `id`.
- `interval` — seconds between ticks. Default 60, minimum 5.
- `zone` — `left` | `center` | `right`; where the cell first appears (default `right`).
  Move it in Settings → Menubar afterwards like any module.
- `icon` — a [lucide](https://lucide.dev/icons) icon name (kebab-case), shown until the
  first tick. Default `puzzle`.
- `timeout` — seconds a tick may run before it is killed. Default 10, maximum 60.

### `<widget> tick`

Called every `interval` seconds (and on demand, below). Print the cell + card and exit 0:

```json
{
  "icon": "arrow-big-down",
  "label": "2",
  "tone": "error",
  "click": { "type": "open", "value": "https://status.example.com/" },
  "card": {
    "title": "Uptime",
    "subtitle": "2 of 9 down",
    "rows": [
      {
        "dot": "ok",
        "text": "mitchmalone.com",
        "hint": "238 ms",
        "action": { "type": "open", "value": "https://mitchmalone.com" }
      },
      { "dot": "error", "text": "psyke.co", "hint": "down" }
    ],
    "hint": "click a site to open it"
  }
}
```

Every field is optional; `{}` is a valid blank cell.

- `icon` — lucide name for this tick (falls back to the manifest icon).
- `label` — short text beside the glyph. Keep it to a count or a percentage: the strip is
  glyph-first, details belong in the card.
- `tone` — colours the cell: `ok` (green) · `warn` (amber) · `error` (red) · `muted` ·
  `accent`; omitted = plain foreground.
- `click` — what clicking the cell does; the scripts action vocabulary:
  `{"type":"open","value":…}` (URL/file/app via `open`), `{"type":"copy","value":…}`,
  `{"type":"none"}`.
- `card` — the hover card: `title`, dim `subtitle`, `rows`, dim `hint` at the bottom.
  Each row: `dot` (a tone, or none for no dot), `text`, dim right-aligned `hint`, and an
  optional `action` that makes the row clickable.
- `hidden: true` — no cell this tick. For credentialed widgets with no credential: inert,
  not alarmed (no request, no red cell — DECISIONS 2026-08-16). The widget stays
  registered and re-ticks on schedule.

## Refresh, failure, and the rules of the road

- **On demand:** `touch ~/.config/launcharr/triggers/widget.<id>` ticks a widget now —
  wire it to a git hook, a cron, a keybinding, anything.
- **Live:** the dir is watched. Drop a widget in and its cell appears within a second;
  edit it and it re-ticks; delete it and the cell goes.
- **Fail-visible:** timeout, non-zero exit, or unparseable stdout keeps the last good view
  but turns the cell `error`; the card shows the reason (`exit 1: <stderr tail>` /
  `timed out after 15s` / `bad tick output`) and when it last worked. Nothing ever blanks
  silently. Debug by running `<widget> tick` by hand.
- **Off the hot path:** ticks run on their own thread and are stateless child processes —
  nothing resident between ticks, nothing on the 1 Hz push.
- **Network and secrets are the widget's business.** launcharr core is zero-network;
  what your widget fetches, and with which credential, is yours (DECISIONS 2026-08-15).
  Resolve tokens yourself (env, the CLI's own store, `secret`); launcharr never sees or
  stores them.
- **Layout:** the widget appears in `bar.layout` as `widget:<id>`; toggle or move it in
  Settings → Menubar. Removed widgets keep their slot in the layout, so a re-install lands
  where you left it.
- **Python gotcha** (same as scripts): the widgets dir is `sys.path[0]` for python
  widgets — don't name one after a stdlib module.

## Installing, arranging, removing

- **Settings → Menubar → Custom widgets** (its own sub-tab) lists what's installed with its health ("ok ·
  2m ago", "error · exit 1: …", "hidden"), and offers **install from URL** (one download,
  on click — the file must answer `manifest` or it's discarded with the reason), **add
  file…**, **tick** (run now), **remove** (deletes the file), and **open folder**.
- The **zone board** above it shows custom widgets beside the built-ins as soon as they
  exist — drag them between zones, ✕ retires one to the tray.
- Or skip the UI: `cp`/`ln -s`/`curl -o` into the folder, `rm` to remove — the dir is
  watched either way.

## Reference widgets

| Widget              | Source                           | Cadence | Notes                                                                                                |
| ------------------- | -------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `uptime.py`         | Upptime `summary.json`           | 5 min   | Arrow up/down, down-count label, a row per site (opens it). Set `UPTIME_SUMMARY_URL`.                |
| `github-actions.py` | a runs feed (`{failing, items}`) | 2 min   | Monitor glyph, failing count, latest 10 runs (opens the run). Set `GITHUB_ACTIONS_FEED_URL`.         |
| `vercel.py`         | Vercel API `/v9/projects`        | 2 min   | Token from the Vercel CLI's own login (or `VERCEL_TOKEN`); latest production deployment per project. |
| `trmnl.py`          | TRMNL `/api/devices`             | 5 min   | Key via `TRMNL_API_KEY` or `secret shared/trmnl/api_key`; hidden without one.                        |

Install one: `ln -s "$(pwd)/apps/desktop/widgets/uptime.py" ~/.config/launcharr/widgets/`
(or copy it — then it's yours to edit in place). `chmod +x` if you copied.
