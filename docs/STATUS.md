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

## In progress

- **Mitch's morning checklist** (the parts only hands can verify):
  1. `lorem 2 ⏎` → paste somewhere. `json` with JSON on the clipboard. `ip ⏎`.
  2. `2*(14.5+3)` → `= 35` top row, Enter, ⌘V.
  3. Copy a few things, then `clip` → filter → Enter → ⌘V. `clip clear` too.
  4. Add a link + a shortcut to config.json (examples in PRD §5.4) and try both.
  5. Drop any executable answering `manifest`/`query` into scripts/ — trigger goes live,
     no restart (`docs/SCRIPTS.md`).

## Next

- Fixes from the checklist. **No holdout — the freeze is repealed** (Mitch, 2026-08-09);
  features and fixes ship continuously, daily use is the judge.
- While living with it, watch: per-keystroke script latency feel, clip privacy comfort, whether
  deferred items (Translate, Calendar, public IP) earn a PRD revision.

## Blocked / waiting on Mitch

- The checklist above. Anything off → JOURNAL it, I fix.
