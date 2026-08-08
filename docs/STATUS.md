# STATUS

> The cursor: where we are right now. Keep this **terse** — a snapshot, not a history.
> History lives in git, `plans/done/`, and `JOURNAL.md`.
>
> Last updated: 2026-08-08

## Done

- **PRD v1 drafted** (2026-08-08): scope, UX, stack, performance budgets, milestones M0–M4.
  See `PRD.md`.
- **Pre-scaffold** (2026-08-08): repo initialized, docs system seeded (this structure), project
  conventions set (pnpm, Lefthook, Rust standards in `AGENTS.md`), founding decisions recorded
  in `DECISIONS.md`.

## In progress

- Nothing in flight. No code exists yet.

## Next

- **M0 — nspanel spike** (`plans/active/m0-nspanel-spike.md`): scaffold Tauri 2 + tauri-nspanel,
  prove the focus dance (non-activating panel receives keys; Esc restores focus over a
  full-screen app) before building anything else. Scaffold step includes tooling config
  (tsconfig strict, ESLint 9 flat, Prettier, Vitest, Lefthook, rust-toolchain) and filling in
  CLAUDE.md's "Local dev" section.

## Blocked / waiting on Mitch

- Open questions in `PRD.md` §11 (hotkey default, bang-mode session reuse, empty-query panel) —
  none block M0.
