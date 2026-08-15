---
title: tui workbench — story-driven component testing across app and web
status: planned
created: 2026-08-16
updated: 2026-08-16
links:
  - packages/tui (gallery is the seed)
  - docs/ROADMAP.md v0.5 B0
  - docs/plans/active/panel-framework-and-wifi.md (first consumer of new components)
---

# tui workbench — story-driven component testing across app and web

## Goal

A Storybook-style workbench for `@launcharr/tui` that exercises every component, in
every state, on both surfaces the kit serves: launcharr's WKWebView windows (bar,
panels, settings-to-be) and the browser (apps/www adopting tui for demos later). The
current gallery shows eight happy-path screens; the workbench must show _states_ —
focused, selected, error, empty, overflow — and make keyboard behavior testable by
hand in seconds.

## Context

`packages/tui` ships with a hardcoded vite gallery (`gallery/main.tsx`). The panel
framework (sibling plan) is about to add real consumers with real states. The bar CSS
specificity bug (JOURNAL 2026-08-16) is exactly the class of bug a state-complete
workbench catches before a human does: "focused without hover" was never rendered
anywhere until Mitch hit it live.

## Decision: no Storybook dependency

Storybook is hundreds of transitive dependencies and its own build system — against
the repo's every-crate-and-package-is-a-liability stance, and we need maybe 5% of it.
Instead: a **stories convention + our own thin workbench app** (vite, React, zero new
runtime deps). If this outgrows us (interaction tests, docs pages), revisit —
recorded here as the trigger.

## Approach

- **Stories convention.** `packages/tui/src/**/*.stories.tsx`, each exporting
  `stories: Story[]` where `Story = { name, notes?, keys?, render: () => JSX }`.
  `keys` documents expected keyboard behavior ("↑↓ move · ↵ activate · esc back")
  and renders as a hint strip under the story.
- **Workbench app** replaces `gallery/`: auto-discovers stories via
  `import.meta.glob('../src/**/*.stories.tsx')`, sidebar nav (itself built with tui
  components — dogfood), one story per screen with keyboard focus pre-placed.
- **Surface controls** in the workbench chrome:
  - Theme switcher across all 14 built-ins (reuses `themeVars` from the desktop app
    — move theme tokens into `@launcharr/tui` or import; decide during build:
    tokens likely belong in the kit now that two apps consume them).
  - Viewport presets: bar strip (wide × 30), launcher panel (640 × N), www section
    (responsive) — components must hold up in all three.
- **State coverage bar:** every exported component gets stories for default,
  focused/selected, error/danger, empty, and overflow/truncation. The specificity
  class of bug = a "selected, no hover" story existing.
- **Web surface:** the workbench is a static vite site — runs in any browser today
  (`pnpm --filter @launcharr/tui workbench`); Safari locally is the WKWebView proxy.
  Publishing it (e.g. tui.launcharr.com or a /dev route) is out of scope until a
  second person needs it.
- **Migration:** current gallery screens become stories (menu, hotkeys, audio,
  network, usage, calendar, clipboard, wizard survive as composition stories);
  `gallery/` is deleted.

## Steps

- [ ] Story types + glob loader + workbench shell (sidebar, theme switch, viewports)
- [ ] Stories for primitives (Panel, ListRow, HotkeyRow, KeyHints, TextPrompt,
      TwoPane, SectionHeader, Divider) — all states
- [ ] Stories for controls (Slider, Toggle, SegmentedControl, MeterRow) + Calendar
- [ ] Composition stories migrated from the gallery; delete gallery/
- [ ] Theme tokens ownership decision (kit vs app) recorded in DECISIONS if moved
- [ ] `pnpm verify` green; STATUS updated

## Acceptance criteria

- [ ] Every `@launcharr/tui` export has ≥4 state stories, keyboard hints included
- [ ] Workbench runs via one filter command; theme + viewport switching live
- [ ] A "selected, not hovered" story exists for every selectable component
- [ ] No new runtime dependencies in `@launcharr/tui`

## Out of scope

Publishing the workbench; screenshot/visual-regression automation; interaction test
runner (triggers: a regression a story would have caught ships anyway, or a second
contributor appears).
