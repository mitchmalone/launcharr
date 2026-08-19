# launcharr widgets

Widgets are the bar's scripts: drop a **TypeScript file** into
`~/.config/launcharr/widgets/` and it owns a cell in the menubar — a glyph, an optional
short label, a tone, a click, and a hover card of rows. No build, no shebang, no chmod,
no restart: `.ts` runs under **Bun** (or Node when Bun is absent — DECISIONS 2026-08-19).
Any other executable in any language works too. The reference widgets in
`apps/desktop/widgets/` (`uptime.ts`, `github-actions.ts`, `vercel.ts`, `trmnl.ts`) are
yours to copy and edit; the shape is deliberately the same as `docs/SCRIPTS.md`.

```ts
// ~/.config/launcharr/widgets/hello.ts
import type { WidgetView } from '@launcharr/tui/bar/types'

// erased at run time

if (process.argv[2] === 'manifest') {
  console.log(
    JSON.stringify({ id: 'hello', name: 'Hello', interval: 60, icon: 'smile' }),
  )
} else {
  const view: WidgetView = {
    icon: 'smile',
    tone: 'ok',
    card: { title: 'Hello', rows: [] },
  }
  console.log(JSON.stringify(view))
}
```

**Widgets are data, never code.** A widget prints JSON; launcharr renders it with one
generic cell and card, in the theme, on every display. Nothing a widget says can put
markup or script in the bar — which is also why the same widget renders identically on
launcharr.com's demo.

## The contract

Any `.ts`/`.js` file (run under Bun/Node) or executable that answers two invocations:

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
- `settings` — what the widget needs from the user; see **Settings and sign-in** below.
- `auth` — `{ "label": "Sign in with GitHub" }`: the widget answers `auth` (below).

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
- `tone` — colours the cell: `ok` (plain fg) · `warn` (theme warn) · `error` (theme danger) · `muted` ·
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

## Settings and sign-in

A widget that needs a token or an id declares it; launcharr collects it in **Settings →
Menubar → Custom widgets** and hands it to every `tick` as an **environment variable**.
The widget never touches a store (try-out, 2026-08-19; plan `docs/plans/active/widget-settings.md`).

```json
"settings": [
  { "key": "VERCEL_TOKEN", "label": "Vercel", "hint": "a token from vercel.com/account/tokens", "secret": true, "required": true }
]
```

Keep it to what a user must type. One token is the norm; a widget that needs a plain value
(an id, a list) can declare it, but defaults in the file beat fields in the UI.

- `key` — the env-var name (`[A-Z][A-Z0-9_]*`, ≤ 40). `label`/`hint` are the field copy.
- `secret: true` — stored in the **macOS Keychain** (service `launcharr`, account
  `widget/<id>/<KEY>`), masked in the UI, never sent to the settings webview or written to
  `config.json`. Plain settings live in `config.json` under `widgets.<id>.<KEY>` — edit
  either place.
- `required: true` — until it's set the widget is **not run**: the cell is a dim glyph, the
  card and the settings row say `needs setup: <KEYS>`. Optional settings just arrive unset.
- Up to 16 settings. A widget still owns its fallbacks: `vercel.ts` reads `VERCEL_TOKEN`,
  else the Vercel CLI's own login.

### `<widget> auth` (optional)

A widget can own an OAuth / device flow. Declare `"auth": { "label": "Sign in with X" }`
and answer `auth`: launcharr runs it (same env as a tick; up to 15 minutes; **cancel**
kills it) and reads **one JSON object per stdout line**:

- `{"url": "https://github.com/login/device", "code": "ABCD-1234"}` — shown with an
  **open** button; the user types the code in the browser.
- `{"message": "waiting for approval…"}` — progress, shown dim. A non-JSON line is
  treated as a message.
- `{"settings": {"GITHUB_TOKEN": "gho_…"}}` — stored. Only keys declared **`secret`** may
  be set this way (an auth result is a credential); anything else fails the sign-in.

Exit 0 = signed in (the widget ticks at once); non-zero = the stderr tail is the error.
`github-actions.ts` is the worked example: GitHub's device flow against launcharr's own
OAuth App (its client id is a constant in the widget — a client id is public, it only names
the app being approved). **One row, two ways in:** the sign-in button, or paste a token —
never both plus plumbing (Mitch, 2026-08-19). The widget can't refresh a token on its own
yet; when one expires it should fail with a "sign in again" message.

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
- **Network is the widget's business.** launcharr core is zero-network; what your widget
  fetches, and with which credential, is yours (DECISIONS 2026-08-15). Credentials come
  from declared **settings** (above) or wherever you like (env, the CLI's own store,
  `secret`); launcharr stores only what a manifest declares, and never calls a provider.
- **Layout:** the widget appears in `bar.layout` as `widget:<id>`; toggle or move it in
  Settings → Menubar. Removed widgets keep their slot in the layout, so a re-install lands
  where you left it.
- **Runtime:** Bun is found on PATH, Homebrew, or `~/.bun`; Node on PATH, Homebrew,
  Volta/fnm/nvm. Neither → the cell reads `needs bun — brew install oven-sh/bun/bun`.
  Guard your entry point with `if (import.meta.main)` so the file also imports cleanly
  into a test (the reference widgets do; their `view()` halves are under Vitest).

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

| Widget              | Source                          | Cadence | Notes                                                                                                                                              |
| ------------------- | ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uptime.ts`         | Upptime `summary.json`          | 5 min   | Arrow up/down, down-count label, a row per site (opens it). Set `UPTIME_SUMMARY_URL`.                                                              |
| `github-actions.ts` | GitHub API, latest run per repo | 2 min   | **Sign in with GitHub** (device flow) or paste a token; your 10 most recently pushed repos (pin a list in the file); failing count, opens the run. |
| `vercel.ts`         | Vercel API `/v9/projects`       | 2 min   | `VERCEL_TOKEN` setting (Keychain) or the Vercel CLI's own login; latest production deployment per project; hidden without a token.                 |
| `trmnl.ts`          | TRMNL `/api/devices`            | 5 min   | Key via `TRMNL_API_KEY` or `secret shared/trmnl/api_key`; hidden without one.                                                                      |

Install one: `cp apps/desktop/widgets/uptime.ts ~/.config/launcharr/widgets/` (or
Settings → Menubar → Custom widgets → add file) — then it's yours to edit in place.
