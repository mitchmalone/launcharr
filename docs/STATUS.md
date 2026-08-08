# STATUS

> The cursor: where we are right now. Keep this **terse** — a snapshot, not a history.
> History lives in git, `plans/done/`, and `JOURNAL.md`.
>
> Last updated: 2026-08-08

## Done

- **PRD v1 drafted** (2026-08-08): scope, UX, stack, budgets, milestones M0–M4. See `PRD.md`.
- **Pre-scaffold** (2026-08-08): repo, docs system, conventions (pnpm, Lefthook, Rust rules).
- **v1 core implemented in one pass** (2026-08-08): M0–M3 code complete — nspanel panel +
  hotkey + accessory policy, indexer (apps, settings panes, self-index) with FSEvents watch,
  NSWorkspace icon cache, fzf-style TS matcher + frecency ranking (26 TS tests), SQLite launch
  log, bang mode with iTerm2/Terminal.app AppleScript hand-off (16 Rust tests), watched JSON
  config at `~/.config/launcharr/config.json`, terminal-prompt UI. All gates green:
  typecheck, lint, Vitest, cargo test, clippy `-D warnings`.

## In progress

- **First release build + manual verification** — `pnpm tauri build` producing the `.app`.
  ⚠️ **The M0 focus dance is implemented but UNVERIFIED** — no human has pressed ⌥Space yet.
  The M0 plan stays in `active/` until Mitch runs its acceptance checklist.

## Next

- Mitch: run the M0 checklist in `plans/active/m0-nspanel-spike.md` (summon over a normal
  app, over full-screen, Esc/click-outside restore, second display).
- First-use notes → JOURNAL; anything broken → fix before features.
- Then: performance instrumentation against PRD §7 budgets (hotkey→visible, keystroke→results),
  which is the remaining M2 exit item, and launch-at-login (M4).

## Blocked / waiting on Mitch

- Manual verification (above) — the panel/focus behavior can't be machine-verified.
- First `!` use triggers the macOS Automation consent prompt (expected, one-time).
