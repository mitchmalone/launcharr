# Bar zones, notch profiles, and the settings zone board

> 2026-08-16, three feedback rounds in one session (written up at close — the work
> iterated live with Mitch; DECISIONS entries were recorded per round as the source of
> record, this file collects them).

## What shipped

1. **Notch detection** — `notch.rs`, `NSScreen.safeAreaInsets.top > 0` per display,
   safe objc2 API, no crate, no permission. Bar windows learn their profile via an
   initialization script (`window.__notched`) before first render.
2. **Zone layout** (round 2, replacing round 1's clock-anchored flat list within
   hours): `bar.layout = BarZones { left, center, right }`, clock ordinary;
   `bar.notchedLayout` optional, no center zone — absent → derived (center folds into
   the head of right). Legacy `modules`/`notchedModules` migrate at load, unit-tested.
3. **Settings zone board** (rounds 2–3): columns per zone (three main, two notched),
   HTML5 drag between/within columns, full-width sections (`.row-full` — deliberate
   break of the settings label grid), ✕ retires a widget to a **Retired tray**,
   dragging a chip back restores it. Persistence is `enabled: false` in place — no
   schema change, no bar-renderer edits.
4. **Crash fix** — `bar.enabled` off hides the NSPanels instead of destroying them
   (destroy → ObjC exception → SIGABRT; JOURNAL). Verified live: toggle off/on with
   the running app survives both directions.
5. **Agent-border fix** — `tmux_layout` caches only successful `list-panes` reads.

## Coordination

Ran concurrently with the `battery` session (battery hover card: bar.rs, battery.rs,
hover.ts, bar.css) and `LauncharrWeb` (www redesign). Boundaries agreed by message:
this stream owned SettingsApp.tsx, settings.css, lib/config.ts, config.rs, notch.rs;
scoped staging, no `git add -A`; relaunches handed off explicitly.

## Manual checklist (Mitch's hands)

- [ ] Drag widgets between zones on the board; order survives a settings reopen.
- [ ] ✕ a widget → appears in Retired; drag back into a zone → returns to the bar.
- [ ] Notched MacBook display: no widget renders under the camera housing; separate
      arrangement kicks in when enabled.
- [ ] External (notchless) display shows the center zone.
- [ ] Toggle "Enable the launcharr bar" off/on — no crash, bar returns.
