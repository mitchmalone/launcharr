# STATUS

> The cursor: where we are right now. Keep this **terse** — a snapshot, not a history.
> History lives in git, `plans/done/`, and `JOURNAL.md`.
>
> Last updated: 2026-08-08 (late)

## Done

- **v1 shipped and human-verified** (2026-08-08): panel/focus dance, index + fuzzy + frecency,
  bang mode, config, instrumentation, launch-at-login, first-run hint. Budgets: cold start
  157ms, native summon 3.7ms, RSS ~90MB. Plans in `plans/done/`.
- **v1.1 built overnight** (2026-08-08, Sol parity — scope in DECISIONS, contract in
  `docs/SCRIPTS.md`):
  - **Script protocol** (v2 pulled forward): `~/.config/launcharr/scripts/`, manifest/query,
    FSEvents-watched. Bundled: `lorem`, `json` (format clipboard), `ip` (local only).
  - **Clipboard history**: `clip` trigger, copy-on-Enter, concealed types never recorded,
    SQLite cap 200, `clip clear`.
  - **Inline math**: arithmetic query → result row → Enter copies.
  - **Custom links + custom shortcuts** in config.json, hot-reloading.
  - PRD rewritten to v1.1; grammar is now the full dispatch table (`!` + trigger words).
  - All machine-verifiable paths tested live; 41 TS + 24 Rust tests green.
- **Installed**: `/Applications/launcharr.app` running with all of the above.
- **Menubar icon** (2026-08-09): template pirate-flag NSStatusItem with summon/config/
  scripts/reindex/quit menu — the future settings gateway. Icon regenerates via
  `cargo run --example make_tray_icon` from `design/menubar-icon-source.png`. Accessory
  policy unchanged (no Dock icon). Eyeball check: icon crispness + dark/light menubar.

## Done (latest)

- **v1.2 release core — v0.2.0** (2026-08-09): system commands (sleep displays et al),
  ⌥⏎ secondary actions (+ script `altAction`), opt-in bookmarks, `:emoji` picker,
  settings window over config.json, README + RELEASING.md. File search deferred by choice.
  Plan: `plans/done/v1.2-release-core.md`. **Release blocked only on signing** — needs
  Mitch's Apple Developer ID (checklist in `docs/RELEASING.md`).

- **Add-quicklink flow + favicons** (2026-08-09): URL detected → Open / Add quicklink…;
  two-step mini-form (name → browser: default or any installed browser); saved to config
  `links`; favicon fetched once at add time preferring apple-touch-icon/sized PNGs over
  .ico (network carve-out in DECISIONS — core stays otherwise zero-network). Esc backs out
  of the form before dismissing. Plan: `plans/done/add-quicklink-flow.md`.

- **URLs + search + quicklinks** (2026-08-09): URL-ish queries get an "Open ▸" top row;
  dead-end queries offer "Search Google for …" (Alfred-style, engine configurable via
  `searchFallback`); `links` entries with `trigger` + `{query}` are Raycast-style
  quicklinks (`yt cute otters ⏎` — example seeded in config). Plan:
  `plans/done/urls-and-search.md`.

## In progress

- **Mitch's morning checklist** (the parts only hands can verify):
  1. `lorem 2 ⏎` → paste somewhere. `json` with JSON on the clipboard. `ip ⏎`.
  2. `2*(14.5+3)` → `= 35` top row, Enter, ⌘V.
  3. Copy a few things, then `clip` → filter → Enter → ⌘V. `clip clear` too.
  4. Add a link + a shortcut to config.json (examples in PRD §5.4) and try both.
  5. Drop any executable answering `manifest`/`query` into scripts/ — trigger goes live,
     no restart (`docs/SCRIPTS.md`).

## Next

- Fixes from the checklist; features ship whenever — daily use is the judge.
- While living with it, watch: per-keystroke script latency feel, clip privacy comfort, whether
  deferred items (Translate, Calendar, public IP) earn a PRD revision.

## Blocked / waiting on Mitch

- The checklist above. Anything off → JOURNAL it, I fix.
