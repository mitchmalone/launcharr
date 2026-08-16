---
title: bar chrome → packages/tui (one copy of the UI)
status: done
created: 2026-08-16
updated: 2026-08-16
links:
  - ./www-redesign.md # the follow-up this closes
  - ../../DECISIONS.md # 2026-08-16 · invariant 10 hardened; bar extracted
  - ../../AGENTS.md # invariant 10
---

# Bar chrome → `packages/tui`

## Goal

Delete the website's second copy of the bar. `apps/www` had a hand-written strip, agent
cluster and hover card that mirrored `apps/desktop/src/bar/` — the duplication that produced
the wrong cell colours, wrong state keys and broken hover Mitch caught on review.

## Context

Mitch's call, verbatim in spirit: **the website should never have a second copy of any
launcharr UI**, and this matters more as complexity grows. That closed the "port it with a
comment" escape hatch invariant 10 originally allowed, and overrode the earlier
recommendation to defer this until ROADMAP B2 settled.

The panels already worked this way — the demo imports `Panel`/`ListRow`/`MeterRow` from the
kit — so this is the bar catching up to a pattern the repo already had.

## Approach

Split the bar by what each side must own.

**Into `packages/tui/src/bar/`:** `bar.css` (everything from `.bar` down, verbatim),
`components.tsx` (`Bar`, `BarWorkspaces`, `BarAgents`, `BarFrontApp`, `BarClock`, `BarCell`,
`BarWifiCell`, `BarTrmnlCell`, `BarBatteryCell`, `BarBatteryCard`, `BarCard*` primitives,
`BarHoverCell`), `format.ts` (grouping, ages, clock, `timeLeft`, `batteryState`, tone
pickers), `types.ts` (`AgentSession`, `BatteryDetail`, `BarSnapshot`, `BarHoverApi`,
`BarModule`/`BarZones`).

**Staying in `apps/desktop`:** everything environmental — Rust snapshot delivery, every
`invoke`, `window.__notched`, zone resolution (`normalizeBarZones`/`notchedZones` encode
config semantics including legacy migration, so they belong beside `Config`), and
`useBarHover`'s Rust cursor feed. `bar/main.tsx` is now a container; `bar/bar.css` keeps
only the window chrome.

Three judgement calls worth recording:

- **Lucide became a kit dependency.** Icons-as-props would have left both consumers deriving
  which battery glyph a percentage gets — the same duplication in a new place.
- **The battery tier logic moved with it**, for the same reason.
- **Hover could not move.** The app polls the cursor from Rust (WebKit won't deliver hover to
  a never-active accessory window); a browser has real pointer events. The kit defines
  `BarHoverApi` and each consumer owns its feed — `useBarHover` already satisfied it exactly.

The hover-cell and card seams are generic (`BarHoverCell` takes an id, a card height, a cell
body and a card body), so a future cell — the planned `awake` module, say — needs no kit
change.

## Steps

- [x] Confirm `bar/` files clear with the streams that own them
- [x] Harden invariant 10: imported, never ported
- [x] Split `bar.css`; window chrome stays, component styles move
- [x] Move components, formatters and types into the kit, with tests
- [x] Rewrite `bar/main.tsx` as a container; `lib/config.ts` imports the zone types
- [x] Rewrite `apps/www` to import the kit; delete its `agent-cells.tsx`
- [x] Scope the bar's tokens on the website (`BarThemeScope`, via the kit's `themeVars`)
- [x] `pnpm verify` green; rebuild + relaunch the installed app

## Acceptance criteria

- [x] `apps/www` contains no bar markup, no bar CSS, and no bar colour values
- [x] Built site emits the kit's own classes (`bar-cell`, `bar-agent-attention`, …)
- [x] Desktop behaviour identical — battery detail still hover-only, no JS timers
- [x] `pnpm verify` green: 4 typechecks, lint, format, 165 JS tests, 89 cargo tests, clippy
- [x] Kit tests cover the moved pure logic (33 → 54)

## Out of scope

The settings zone board (`SettingsApp.tsx`/`settings.css`) is not bar chrome. No bar stories
in the workbench yet — worth adding, since state coverage (notched, alert tones, breathing
cell) is exactly what stories are for.

## Outcome (2026-08-16)

Done, green, and the installed app was rebuilt and relaunched on it.

`packages/tui` gained a `./bar` entry point beside `./themes`: the pure formatters must be
importable by a React Server Component, and the barrel re-exports hook-using components. The
exports map now carries one note covering both — the same trap will catch the next pure
module, so the pattern is written down rather than rediscovered.

## Follow-ups

- Bar stories in the workbench (notched profile, alert tones, blocked-cell breathe).
- The website's `BarThemeScope` exists because `bar.css` styles against unprefixed
  `--bg`/`--fg`/`--dim`, which are the _page_ palette's names on launcharr.com. Prefixing the
  kit's bar tokens (`--bar-*`, as the panel kit does with `--tui-*`) would remove the need
  for scoping entirely — worth doing next time the CSS is open anyway.
