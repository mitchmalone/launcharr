---
title: Config home move + themes
status: done
created: 2026-08-10
updated: 2026-08-10
links:
  - plans/done/settings-native-polish.md
---

# Config home move + themes

## Goal

Pre-release pair: (1) launcharr's home moves to `~/.launcharr` (config.json + scripts/), with
config/scripts access brought into settings instead of the tray; (2) a theme system — built-in
`launcharr` (brand blue/pink), `dracula`, and `terminal` (matrix black/green) themes, selectable
in settings, with user-defined themes as plain JSON in config.

## Context

Config lives at `~/.config/launcharr`; tray has "Open config" / "Open scripts folder" items.
Panel (`src/styles.css`) still wears the old GitHub-dark palette; settings already wears brand
blue/pink. Both windows read config and listen to `config-changed`.

## Approach

- **Home move:** `config_dir()` → `~/.launcharr`; one-shot migration renames the old dir if the
  new one doesn't exist (atomic, same volume; pure fn over (old, new) paths, tested). All doc
  references updated. Tray drops the two items; settings gains "edit config.json" / "open
  scripts folder" buttons backed by one new IPC command `open_path` (validated enum —
  DECISIONS).
- **Themes:** a theme is a flat map of the CSS tokens both windows already use (bg, panel,
  border, fg, dim, accent, sigil, bang, selected, danger). Built-ins live in TS
  (`src/lib/themes.ts`); `config.theme` picks one; `config.themes` (name → partial token map)
  defines/overrides custom themes — no new IPC, hand-editable, hot-applies via the existing
  watcher. Unknown names and missing tokens fall back to the default theme. Default `launcharr`
  theme = brand blue/pink, now applied to the panel too.

## Steps

- [x] TDD `src/lib/themes.ts`: resolveTheme(config) merge/fallback semantics
- [x] Apply theme tokens as CSS vars in panel + settings on config load/change
- [x] Theme selector in settings (General ▸ Appearance) listing built-ins + custom
- [x] Rust: config_dir → ~/.launcharr + tested migration; `theme`/`themes` fields; `open_path` command
- [x] Settings: config/scripts buttons; tray drops the two items
- [x] Docs: DECISIONS (home move + IPC + theme model), README/SCRIPTS/PRD path updates, STATUS

## Acceptance criteria

- [ ] Fresh run with only `~/.config/launcharr` present ends up with `~/.launcharr` and works
- [ ] `theme: "dracula"` (or "terminal") restyles panel + settings live on save
- [ ] A `themes` entry in config.json defines a selectable custom theme
- [x] All checks green (pnpm typecheck/lint/test, cargo test/clippy)

## Out of scope

- Theme editor UI (JSON editing is the editor); light themes; per-window themes
- Moving the SQLite/icon caches (they stay in Application Support)

## Risks / open questions

- Panel `--bg`/`--selected` carry alpha; tokens are plain CSS color strings so themes can
  express that — built-ins keep the panel translucency.
- Users with hand-built tooling pointing at `~/.config/launcharr` — release notes must call
  out the move.
