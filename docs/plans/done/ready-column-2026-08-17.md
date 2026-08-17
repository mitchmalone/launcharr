---
title: Ready column, 2026-08-17 (six Notion tickets)
status: done
created: 2026-08-17
updated: 2026-08-17
links:
  - Notion board: https://app.notion.com/p/ramenamok/3bf3d7d179ad800f9929ed8e06de704b
  - ROADMAP v0.5
---

# Ready column, 2026-08-17

## Goal

Land the six "Ready" tickets in one pass: two devtools (`colorpicker`, `lorem`), the
agent-mode feedback round, and three settings-window tickets (Agents sub-tabs, drop the
Shortcuts tab, flesh out About).

## Context

- Devtools tagged v0.5. Both end in "copy to clipboard + confirmation" — launcharr has no
  toast today (copies dismiss silently), so a **flash** primitive is the shared piece.
- macOS notifications need a granted permission (invariant 1) → confirmations are an
  in-panel toast row that auto-hides, never a system notification.
- `lorem` already exists as a bundled _script_ (`lorem.py`, fixed paragraph, `lorem 3`);
  the ticket wants a built-in with five volumes + semi-random text. Built-in wins the
  trigger (clip > scripts precedence) so the bundled script retires.
- Agent mode's answer surface is App.tsx-local and the www demo carries a hand-rolled
  copy → invariant 10 says extract to `@launcharr/tui` and import from both.

## Approach

1. **Color picker** — `launcharr:colorpicker` index item ("Color Picker", aliases
   colorpicker/color/eyedropper/hex). Execute → `NSColorSampler` (Apple's own loupe,
   zero permissions, Esc cancels) on the main thread → sRGB `#RRGGBB` to the pasteboard →
   `panel::flash("Copied #RRGGBB")`. HEX only (open question answered: HEX, uppercase;
   history out of scope).
2. **Lorem** — `@launcharr/core/lorem`: seeded-RNG generator (title / 1 sentence /
   2 sentences / paragraph / 2 paragraphs; classic opening kept for the first sentence
   of a paragraph, everything else shuffled), `loremRows` in rows.ts; Enter copies +
   toast "Copied 2 paragraphs of lorem ipsum". `lorem.py` leaves the bundle.
3. **Flash/toast** — frontend `toast` state renders one row and hides after ~1 s;
   `copy_text` gains `keepOpen` so the row can show; Rust `panel::flash(text)` shows the
   panel _without_ taking key (`show()`), emits `toast`, frontend hides on its timer.
4. **Agent mode** — `AskSurface` in `packages/tui` (transcript of turns, pinned first
   question in the header, Claude-style thinking spinner + shimmer verbs, streaming
   cursor); `parseMarkdownLite` moves to `@launcharr/core/markdown`; App.tsx keeps state
   - IPC; www demo imports the component. Images: **not built** — rendering remote
     images means the desktop app fetching over the network (invariant 2) and the caged CLI
     has no fetch tools; flagged back on the ticket.
5. **Settings** — Agents → SubTabs (Agent mode / Local monitoring / Usage monitoring);
   Shortcuts tab removed (config key + hot-apply untouched); About: wordmark, "by Mitch
   Malone", website / GitHub / X / docs / releases links, version. Brand icons move to
   `packages/tui` so www + settings share them.

## Steps

- [x] Settings: Agents sub-tabs, Shortcuts tab gone, About fleshed out
- [x] `packages/core/lorem.ts` + tests; `loremRows`; bundled `lorem.py` retired
- [x] Toast primitive (frontend row + `copy_text keepOpen` + `panel::flash`)
- [x] Color picker: `colorpicker.rs` (NSColorSampler), index item, execute arm
- [x] AskSurface in tui + markdown → core; App.tsx + www demo consume it
- [x] Help panel lists lorem + colorpicker; docs (DECISIONS/JOURNAL/STATUS)
- [x] `pnpm verify`; rebuild + relaunch (installed 2026-08-17); hands-check list below

## Acceptance criteria

- [ ] `colorpicker ⏎` → loupe; click copies `#RRGGBB`, toast confirms; Esc copies nothing
      (built + unit-tested; native behaviour is a hands-check — JOURNAL 2026-08-17 on why
      the panel can't be typed into from an agent shell)
- [ ] `lorem` → five rows; each Enter copies semi-random text of that volume + toast
      (generator + rows unit-tested; the Enter → toast → hide dance is a hands-check)
- [x] `?` conversation: first question pinned in the header, transcript below, follow-up
      input at the bottom, animated thinking state while the CLI works (AskSurface SSR
      tests + workbench stories; www build green)
- [x] Settings → Agents has three sub-tabs; no Shortcuts tab; About has links + byline
- [x] `pnpm verify` green; app rebuilt and relaunched

## Hands-check (only hands can feel these)

- [ ] Loupe over a full-screen app; Esc → nothing on the pasteboard
- [ ] Toast auto-hides and focus returns to the previous app
- [ ] `?` follow-up input keeps keyboard focus after each answer

## Feedback round (same day)

- Zoom too intense → the launcharr loupe at 2× (loupe.rs, src/loupe/), Screen Recording
  opt-in with the system sampler as fallback (DECISIONS 2026-08-17).
- `lorem` must confirm the keyword first → `lorem ⏎` opens the volume menu.
- Built-ins fuzzy-match (`lor` → Lorem ipsum): `builtin` item kind in core, items in App.

## Round 2 (Notion "Battery hover feedback", "DNS → Wifi Hover")

- `BarWifiCard` + `BarWifiCell` gains `hover`/`detail` (`WifiDetail` mirrors
  `WifiStatus`), desktop fetches `wifi_status` on hover only, `open_path wifi-settings`
  on click; www demo wires the same card with its fake addresses.
- Cards: `top: 100% + 10px`, padding 14/16, grid gaps 6/14; battery power mode → text
  (active accent, others dim, dots between).

## Out of scope

- Color history / non-HEX formats (ticket open questions → HEX now, revisit on use)
- Images in agent answers (invariant 2)
- Bringing Shortcuts back as a panel (config still works; JOURNAL note)
