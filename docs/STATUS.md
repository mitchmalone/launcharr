# STATUS

> The cursor: where we are right now. Keep this **terse** — a snapshot, not a history.
> History lives in git, `plans/done/`, and `JOURNAL.md`.
>
> Last updated: 2026-08-08

## Done

- **PRD v1 drafted** (2026-08-08). See `PRD.md`.
- **Pre-scaffold + conventions** (2026-08-08): pnpm, Lefthook, Rust standards, docs system.
- **v1 core M0–M3** (2026-08-08): panel + hotkey, index + fuzzy + frecency, bang mode, config.
  **Mitch verified the M0 focus dance manually** — incl. full-screen and second display.
  Plan: `plans/done/m0-nspanel-spike.md`.
- **AppKit icon-leak fix** (2026-08-08): extraction in throwaway subprocess; RSS 90MB steady
  (budget <120). See JOURNAL.
- **v1 remaining polish** (2026-08-08): §7 instrumentation (**cold start 163ms** vs <1s,
  **native summon 3.7ms** vs <100ms; keystroke→results logged in webview console),
  **launch-at-login** (LaunchAgent, `launchAtLogin` config key, verified toggling live),
  **first-run hint** (fresh config → panel auto-shows once). Plan:
  `plans/done/v1-remaining-polish.md`.
- **Installed & running**: `/Applications/launcharr.app`, LaunchAgent points there.

## In progress

- **M4 holdout**: two weeks of daily use, "no new features, only fixes." Started 2026-08-08.

## Next

- Fixes only, driven by daily use. Watch for: keystroke→results >16ms in console, hotkey
  collisions (PRD §11.1), whether bang-mode session-reuse or empty-query top-3 earn their
  place (§11.2–3).
- Holdout ends ≈ 2026-08-22 → declare v1 done in ROADMAP + STATUS.

## Blocked / waiting on Mitch

- Living with it. Report anything that feels slow or wrong; JOURNAL it.
