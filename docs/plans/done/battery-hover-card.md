---
title: Battery hover card
status: done
created: 2026-08-16
updated: 2026-08-16
links:
  - ./../done/agent-monitoring.md # the hover-dropdown mechanism this reuses
  - ./../../DECISIONS.md # 2026-08-16 bar_battery_detail
---

# Battery hover card

## Goal

Hovering the bar's battery cell opens a dropdown card (same mechanism as the agent
cells) with the detail the strip can't hold: charge state, capacity, time left, cycle
count, current draw, health, and the active power mode — Omarchy's battery card,
macOS-shaped.

## Context

- The bar's hover dropdown already exists for agent cells: WKWebView won't process hover
  for a never-active accessory window, so `bar.rs` polls the global cursor and feeds
  window-local coordinates to `window.__barMouse`; the page hit-tests with
  `elementFromPoint`, and `bar_set_dropdown` grows the bar window downward so the card
  has somewhere to live (JOURNAL 2026-08-16).
- That machinery lived inside `AgentCluster` and owned `window.__barMouse` outright —
  a second hovering cell would fight it for the global. It hoists to a shared hook.
- Battery data on the strip comes from `pmset -g batt` (30s cache). The card's extra
  facts come from `ioreg -rn AppleSmartBattery` plus `pmset -g custom` for power mode.

## Approach

- Move battery gathering out of `bar.rs` into `battery.rs`: the existing `pmset` reading
  plus a `detail()` built from `ioreg` + `pmset -g custom`, both plain parse functions
  with tests, both cached (30s / 60s) so hover never pays a cold spawn twice.
- One new command, `bar_battery_detail` (DECISIONS entry): lazy, on hover only — the
  1 Hz snapshot must not grow an `ioreg` spawn for data nobody is looking at.
- Generalize the hover machinery into `src/bar/hover.ts`: cells declare
  `data-hover="<id>"` and `data-hover-height="<px>"`, cards carry `.bar-card`, and one
  `useBarHover()` at `Bar` level owns `window.__barMouse`, the close timers, and the
  dropdown resize. `bar::set_dropdown` takes the wanted height so a tall card fits.
- Power mode is **read-only** chips (Mitch, 2026-08-16): `pmset` writes need admin auth,
  which the zero-permissions invariant won't spend. Clicking the cell opens System
  Settings → Battery instead, via a new validated target on `open_path` (no new command).

## Steps

- [x] `battery.rs`: move `parse_battery`/cache, add `ioreg`/`pmset -g custom` parsers +
      `BatteryDetail`, unit tests over captured fixtures
- [x] `bar_battery_detail` command; `set_dropdown(open, height)`; `open_path`
      `battery-settings` target
- [x] `src/bar/hover.ts` — shared hover hook; `AgentCluster` ported to it
- [x] `BatteryCell` + card markup, shared `.bar-card` CSS, battery-specific styles
- [x] `pnpm verify`, rebuild + relaunch, eyeball against the inspiration shot
- [x] DECISIONS + STATUS + move this plan to `done/`

## Acceptance criteria

- [x] Hovering the battery cell opens a card with percent, state, charge bar, capacity,
      time left, cycles, draw, health, and the active power mode; leaving closes it
- [x] Agent hover behaves exactly as before (grouping, jump-on-click, delayed close)
- [x] Clicking the battery cell opens System Settings → Battery
- [x] No new always-on subprocess spawns: `ioreg` runs on hover only
- [x] `pnpm verify` green

## Out of scope

- Setting the power mode (admin auth), battery history/graphs, per-app energy use.
- Hover cards for the other cells (wifi, TRMNL) — the hook makes them cheap later.

## Risks / open questions

- `ioreg` key shapes differ across Intel/Apple Silicon and macOS versions; every field is
  `Option` and the card drops rows it can't fill.
