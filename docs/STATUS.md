# STATUS

> The cursor: where we are right now. Keep this **terse** — a snapshot, not a history.
> History lives in git, `plans/done/`, and `JOURNAL.md`.
>
> Last updated: 2026-08-08

## Done

- **PRD v1 drafted** (2026-08-08). See `PRD.md`.
- **Pre-scaffold** (2026-08-08): repo, docs system, conventions (pnpm, Lefthook, Rust rules).
- **v1 core implemented** (2026-08-08): M0–M3 code complete — nspanel non-activating panel +
  ⌥Space toggle + accessory policy, indexer (apps, 35 settings panes, self-index) with
  FSEvents watch, icon cache, fzf-style TS matcher + frecency ranking (26 TS tests), SQLite
  launch log, bang mode with iTerm2/Terminal.app hand-off (17 Rust tests), watched config at
  `~/.config/launcharr/config.json`, terminal-prompt UI. All gates green.
- **First real bug found & fixed by smoke test** (2026-08-08): AppKit icon-rasterization leak
  took RSS to 10GB; extraction moved to a throwaway subprocess + 128px downscale. Steady-state
  **RSS 90MB** (budget <120), icon cache 7.5MB. See JOURNAL.
- **Installed**: `/Applications/launcharr.app` (ad-hoc signed local build), running.

## In progress

- **Manual verification** — ⚠️ the M0 focus dance is implemented but NO HUMAN has pressed
  ⌥Space yet. The M0 plan stays in `active/` until Mitch runs its acceptance checklist.

## Next

- Mitch: hit **⌥Space**. Then the M0 checklist in `plans/active/m0-nspanel-spike.md`
  (summon over a normal app, over full-screen, Esc/click-outside restore, second display).
- First `!` use will trigger the one-time macOS Automation consent prompt (expected).
- Instrument hotkey→visible and keystroke→results latency against PRD §7 (remaining M2 exit).
- Launch-at-login + first-run hint polish (M4).

## Blocked / waiting on Mitch

- Everything above — the panel/focus behavior can't be machine-verified.
