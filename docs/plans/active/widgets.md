---
title: Bar widgets — user-built cells, scripts-style
status: active
created: 2026-08-19
updated: 2026-08-19
links:
  - ROADMAP "v0.5 — plugins" → Module API
  - docs/SCRIPTS.md (the contract this mirrors)
  - DECISIONS 2026-08-16 (TRMNL network carve-out), 2026-08-15 (per-module network)
  - dotfiles/macos/desktop/sketchybar/plugins (reference behaviour: uptime, github_actions, vercel, trmnl_battery)
---

# Bar widgets

## Goal

Anyone can add a cell to the bar by dropping an executable into
`~/.config/launcharr/widgets/` — any language, live (no relaunch), fail-visible — and
Mitch's four retired Sketchybar modules (uptime, GitHub Actions, Vercel, TRMNL) come back
as the reference widgets. Proves the ROADMAP "Module API" shape by building it.

## Context

- Scripts already do this for the launcher (`docs/SCRIPTS.md`): executable answers
  `manifest` / `query`, FSEvents-watched dir, bundled reference scripts. Widgets are the
  same idea for the bar.
- The bar is Rust-pushed snapshots at 1 Hz (`bar.rs`), slow sources on their own threads
  (`bar_modules.rs`), cells + hover cards from `@launcharr/tui` (invariant 10 — the site
  renders the same components from fixtures).
- Sketchybar originals: glyph + border-tone cell, popup of dot-rows that open URLs. Vercel's
  was hard-coded mock data; the rest hit public JSON / TRMNL API with a token.

## Approach

**Data-driven only.** A widget emits data; the kit renders it with one generic
`BarWidgetCell` + `BarWidgetCard`. No widget-supplied HTML/JS: invariant 10 holds for free,
no third-party code in the webview, every widget wears the theme.

Contract (full text: `docs/WIDGETS.md`):

- `<widget> manifest` → `{ id, name, interval, zone, icon, timeout }`
- `<widget> tick` → `{ icon, label, tone, click, card: { title, subtitle, rows: [{ dot, text, hint, action }], hint } }`
- Tones: `ok | warn | error | muted | accent`; icons: lucide names; actions: the scripts
  action vocabulary (`open` / `copy` / `none`).
- Refresh: Rust runs each widget on its `interval` (own thread, never on the push path);
  `touch ~/.config/launcharr/triggers/widget.<id>` re-ticks it now.
- Fail-visible: timeout / non-zero / bad JSON → the cell keeps its last view but goes
  `error` tone; the card shows the error + stderr tail + "last ok N ago".
- Layout: ids join the zones as `widget:<id>`; manifest `zone` is the default home;
  Settings → Menubar arranger sees them like any module.
- Network + secrets are the widget's business (scripts precedent; DECISIONS 2026-08-15).

## Steps

- [x] `widgets.rs`: discovery + manifest, scheduler, tick runner with timeout, stderr
      capture, trigger poke, FSEvents on the dir; `widgets` in `BarSnapshot`.
- [x] `@launcharr/tui`: `WidgetView` types, `BarWidgetCell`/`BarWidgetCard`, tone CSS,
      lucide `DynamicIcon` glyphs.
- [x] Desktop bar: render `widget:*` ids; `normalizeBarZones` keeps/places widget ids.
- [x] Reference widgets in `apps/desktop/widgets/`: `uptime`, `github-actions`, `vercel`
      (real API via the Vercel CLI's stored token), `trmnl` (token via `secret`).
- [x] `docs/WIDGETS.md`; DECISIONS entry; STATUS.
- [ ] Hands-check on the live bar (see below).

## Acceptance criteria

- [ ] Drop `uptime` into the widgets dir → cell appears within ~1 s, no relaunch; delete
      it → cell gone.
- [ ] Hover shows the dot-row card; a row click opens its URL.
- [ ] Kill the network → cell goes red, card explains; back → recovers on next tick.
- [ ] `pnpm verify` green; bar idle memory unchanged (widgets are child processes).

## Out of scope

`widgets ⏎` panel (health/toggle/install-from-URL), custom SVG icons, event-driven
(`watch`) widgets, a curated widget index. All noted in ROADMAP for the follow-up.

## Risks / open questions

- lucide's `DynamicIcon` splits ~1500 chunks in the bar bundle — acceptable, measure.
- Interactive-zsh `secret` lookup in the TRMNL widget is slow (~1 s); fine at 5 min.
