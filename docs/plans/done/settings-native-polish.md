---
title: Settings window native polish
status: done
created: 2026-08-10
updated: 2026-08-10
links:
  - docs/plans/done/settings-window.md
---

# Settings window native polish

## Goal

Make the settings window feel like a native macOS settings surface (Raycast-style structure)
while keeping the terminal identity: autosave instead of a Save button, toolbar tabs with
Lucide icons, hidden titlebar with overlay traffic lights, and a press-to-record hotkey
control replacing free-text accelerator fields.

## Context

`src/settings/SettingsApp.tsx` + `settings.css` shipped in v0.2.0 as a plain web form: stacked
labels, bordered card sections, fixed footer with a green Save button, free-text hotkey inputs.
The config watcher already hot-applies every field, so instant-apply is nearly free.

## Approach

Pure frontend + one window-builder change. No new IPC commands. New dep: `lucide-react`
(tree-shaken icons). Autosave debounces `write_config` on config change with an echo guard so
our own `config-changed` event doesn't clobber in-flight edits. Titlebar becomes
`TitleBarStyle::Overlay` + hidden title; the tab strip is the drag region. Green stays only on
the `❯` sigil glyph; interactive accents move to the existing blue.

## Steps

- [x] TDD: pure `acceleratorFromEvent` formatter (keyboard event → "Cmd+Shift+S" string) with Vitest coverage
- [x] `HotkeyRecorder` component (record on click, Esc cancels, Backspace clears where clearable)
- [x] Autosave: debounced write on config change, echo-guarded `config-changed` listener, remove footer/save
- [x] Tab strip with Lucide icons (General / Bang / Search / Links / Shortcuts / About placeholder), drag region
- [x] Two-column label/control grid, content-sized controls, hairline separators, `color-scheme: dark`
- [x] `settings_window.rs`: overlay titlebar, hidden title
- [x] De-green: checkboxes/buttons use accent blue; green only on sigil glyph
- [x] Docs: DECISIONS entry, STATUS update, plan → done, same commit

## Acceptance criteria

- [x] No Save button; edits persist to config.json within ~500 ms and hot-apply
- [x] Hand-editing config.json still live-updates the open settings window
- [x] Hotkey + shortcut keys captured by recorder, not typed
- [ ] Window has traffic lights but no titlebar; window draggable via tab strip
- [x] `pnpm typecheck` / `lint` / `test` + `cargo clippy -D warnings` / `cargo test` green

## Out of scope

- Real content for the About tab (placeholder only)
- Light-mode theme; validation UI beyond current error surface
- Any AppKit-native settings work

## Risks / open questions

- Accelerator string format must match what the global-shortcut plugin parses ("Cmd+Shift+S",
  "Alt+Space" style) — verify against existing registration code.
- Autosave of half-finished link rows writes transiently invalid entries; watcher tolerates
  them today (same as hand-editing), acceptable.
