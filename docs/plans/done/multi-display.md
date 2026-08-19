---
title: Multi-display — a bar per screen, launcher on the mouse's screen
status: done
created: 2026-08-19
updated: 2026-08-19
links:
  - ROADMAP "v0.5 — plugins" › Multi-display
  - JOURNAL 2026-08-15 (available_monitors() empty), 2026-08-16 (bar stranded off-screen)
---

# Multi-display

## Goal

On a two-screen setup the bar shows on **every** display and the launcher panel opens on
the display the user is on (mouse screen, PRD §4.1) — today both collapse to the primary.

## Context

Both paths were written for multi-display on paper and both fail in the same place:
Tauri's monitor API.

- `bar::init` iterates `available_monitors()`, which comes back **empty** for this
  accessory app (JOURNAL 2026-08-15) → falls back to `primary_monitor()` → one bar.
  Hot-plug never creates a bar; `reframe`, hover and the dropdown assume `bar-0`.
- `panel::position_on_mouse_screen` asks `monitor_from_point(cursor)`. tao's
  `cursor_position()` mixes pixels and points (`pixels_high - mouseLocation.y`, then
  ×scale) and `monitor_from_point` compares that _physical_ point against
  `CGDisplayBounds` (points) → never matches on Retina → primary.

## Approach

Stop asking Tauri about screens. New `screens.rs`: thread-safe CoreGraphics reads
(`CGGetActiveDisplayList`, `CGDisplayBounds`, `CGDisplayPixelsWide`) in CG global points,
top-left origin — exactly what `LogicalPosition` wants, no scale ambiguity — plus the
mouse via `NSEvent.mouseLocation` flipped by the main display's height, and a main-thread
`notched(display_id)` (NSScreen `safeAreaInsets`, keyed by `NSScreenNumber`, replacing
index-keyed `notch.rs`).

Bar: `sync()` (main thread) is the one place that reconciles windows to screens — build
`bar-{i}` when missing (never destroy: JOURNAL 2026-08-16), frame it to screen _i_, hide
surplus windows when a screen goes away, show them again when it returns. Called at
init, from the enable toggle, and from the heartbeat (now 5 s). Notchedness becomes live
(`window.__barNotched(bool)`), since a window can be reassigned to a different screen.
Hover and the dropdown become per-bar: the mouse poll finds which bar the cursor is
over, and `bar_set_dropdown` grows only the window that asked (`window.label()`).

Panel: `screens::under_mouse()` → centred, 30 % down, `LogicalPosition`.

## Steps

- [x] `screens.rs` (all / under_mouse / notched); loupe's `mouse_screen` uses it; drop `notch.rs`
- [x] bar: `sync()` build/frame/hide per screen; per-bar hover + dropdown; live notch flag
- [x] panel: position on the mouse's screen
- [x] `pnpm verify`, relaunch, verify on Studio Display + built-in

## Acceptance criteria

- [x] Two bars, one per screen, notch profile right on the built-in
- [ ] ⌥Space opens the panel on whichever screen holds the mouse (hands-check — synthetic
      keystrokes don't reach the global hotkey from an agent shell)
- [ ] Hover cards open on the bar the mouse is over, and only that bar grows (hands-check)
- [ ] Unplug/replug: the second bar hides / returns within one heartbeat (hands-check)

## Out of scope

Per-monitor workspace lists (aerospace `--monitor`): every bar shows the same snapshot
for now. Front-app / workspaces per screen is a follow-up. Mixed-scale sanity beyond
Mitch's two 2× displays is untested. `NSApplicationDidChangeScreenParameters` observer
instead of the heartbeat.

## Risks / open questions

Bar labels are index-keyed; when displays are re-ordered the windows are reframed, not
recreated — the live notch flag exists for exactly that.
