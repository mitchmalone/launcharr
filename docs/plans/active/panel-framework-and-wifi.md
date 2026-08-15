---
title: Panel framework + wifi panel — Super+Space does things
status: planned
created: 2026-08-16
updated: 2026-08-16
links:
  - docs/DECISIONS.md 2026-08-15 (v0.5 direction), 2026-08-16 (module carve-out shape)
  - docs/plans/active/tui-workbench.md (components proven there land here)
  - docs/PRD.md §4 (panel behavior, grammar), §7 (budgets)
---

# Panel framework + wifi panel — Super+Space does things

## Goal

Super+Space stops being launch-only: trigger words open full keyboard-driven
Omarchy-style panels inside the existing launcher window. Wifi is the first tenant —
the hardest representative case (live data + selectable list + real actions + error
states). System info and settings then land as new tenants on a proven frame.

## Context

Direction agreed 2026-08-16 in conversation: prove the _framework_ first; wifi scoped
to what needs zero permissions. The grammar already dispatches trigger words (`clip`,
`:`, scripts); panels are a new row-mode, not a new window. The tui kit + workbench
(sibling plan) supply the components.

## Approach

### Panel framework

- **Entry:** `wifi ⏎` — a grammar trigger like `clip`, added in `packages/core`
  grammar with tests. (An Omarchy-style drill-down menu listing all panels comes
  free once 2–3 panels exist; not this slice.)
- **Panel mode in the launcher window:** App.tsx gains a mode stack:
  `prompt → panel(name)`. In panel mode the results list is replaced by the panel
  component (tui kit), the window resizes via the existing `resize_panel`, and the
  prompt row collapses to a breadcrumb (`❯ wifi`). **Esc pops the stack** — panel →
  prompt → dismiss — extending the existing Esc behavior, never breaking the focus
  dance (summon/restore untouched).
- **Panel contract** (what makes tenant #2 cheap): a panel is a React component
  receiving `{ onClose }`, owning its keyboard handling via `useListNav`, fetching
  through typed invoke wrappers, rendering entirely from `@launcharr/tui`.
- **Budgets:** summon path untouched; panel opens instantly and data streams in
  (render skeleton < 1 frame, no spinner-first design); keystroke nav < 16 ms.
  Numbers measured and recorded here before the plan closes.

### Wifi panel (first tenant — permission-free scope)

Layout mirrors the Omarchy wifi panel: header (SSID + state + power toggle), stats
grid, network list.

- **Data (Rust commands, all wrapping tested parsers; extends bar_modules wifi):**
  - `wifi_status` — iface, power, link, SSID (existing chain), IP, router, DNS
    (`ipconfig getpacket` / `networksetup -getinfo` / `scutil --dns`)
  - `wifi_known_networks` — `networksetup -listpreferredwirelessnetworks`
  - `wifi_connect(ssid)` — `networksetup -setairportnetwork` (its own password
    flow); returns typed success/failure surfaced in the panel
  - `wifi_set_power(on)` — `networksetup -setairportpower`
  - All async (never on the main thread — JOURNAL 2026-08-16). Four new commands =
    an IPC-surface decision → DECISIONS entry with this plan.
- **Interaction:** ↑↓ through known networks, ↵ connects (row shows pending →
  connected/failed states), `p` or a toggle row for power, Esc back. Current
  network pinned + marked. Status refreshes while open (reuse the push/eval
  pattern or a panel-scoped poll — decide during build; must not violate the
  no-JS-timers rule if the panel can be open while unfocused... it cannot be:
  panels only exist in the key launcher window, so timers are safe here. Note why.)
- **Deliberately absent:** scanning for new networks. `airport` CLI is gone
  (14.4+), CoreWLAN scan SSIDs need Location Services. A greyed "Scan for
  networks…" row states why. **Trigger to build it:** Mitch wants to join a new
  network from the panel more than ~never; then the Location Services opt-in gets
  its own DECISIONS entry and consent flow.

### Verification

- Grammar + parsers + command mappers: TDD.
- Panel focus/Esc/resize behavior: manual checklist in this plan (native behavior,
  per the Rust standards): summon → `wifi ⏎` → nav → Esc → prompt → Esc → focus
  restored to previous app, incl. over a full-screen app; connect to a known
  network end-to-end; power off → offline states everywhere (panel + bar).

## Steps

- [ ] Grammar: `wifi` trigger + tests (packages/core)
- [ ] Panel-mode stack in App.tsx + breadcrumb prompt + resize + Esc-stack
- [ ] Rust: wifi_status / wifi_known_networks / wifi_connect / wifi_set_power
      (+ parsers TDD, DECISIONS entry for the IPC additions)
- [ ] Wifi panel component from the tui kit (stories in the workbench first)
- [ ] Live refresh while open; pending/failed connect states
- [ ] Budgets measured; manual checklist run; STATUS + plan → done

## Acceptance criteria

- [ ] `wifi ⏎` opens the panel; full session possible without touching the mouse
- [ ] Connect to a known network works; failure is visible, never silent
- [ ] Esc-stack: panel → prompt → dismiss with focus restored exactly
- [ ] Summon and keystroke budgets unregressed (numbers recorded)
- [ ] Launcher-only users unaffected (no bar required for panels)

## Out of scope

Network scanning + Location Services; system-info and settings panels (tenants #2
and #3 — settings migration gets its own plan); drill-down panel menu; panel access
from the bar's wifi cell (later: click-through opens the panel).
