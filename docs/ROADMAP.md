# ROADMAP

> Milestones and backlog. What we build next lives here; what's happening now lives in
> `STATUS.md`; how a specific task gets built lives in `plans/`. Milestones and exit criteria
> are from `PRD.md` §9 — this file tracks their state, the PRD stays the source for scope.

## v1 milestones

All v1 milestones below are **code-complete as of 2026-08-08**.

- **M0 — Spike (the scary parts first).** ✅ Tauri 2 + tauri-nspanel: hotkey summons a
  non-activating panel with a text field; Esc restores focus correctly over a full-screen app.
  _Exit: the focus dance works or the stack decision gets revisited._
  → `plans/done/m0-nspanel-spike.md` (verified by Mitch, incl. full-screen + second display)
- **M1 — Launcher.** ✅ Index + fuzzy match + launch + System Settings panes. No frecency, ugly UI.
  _Exit: Mitch can launch any app._
- **M2 — Feel.** ✅ (instrumented: cold start 163ms, summon 3.7ms) Frecency, keyboard bindings, terminal-prompt visual identity, performance
  instrumentation against the budgets. _Exit: launcharr replaces the incumbent daily launcher._
- **M3 — Bang mode.** ✅ `!` grammar dispatch, iTerm2 hand-off, Terminal.app fallback, config file.
  _Exit: `!git status ⏎` feels better than switching to iTerm2 by hand._
- **M4 — Polish & daily use.** 🔄 Launch-at-login + first-run hint shipped; features and
  fixes ship continuously. _Exit: launcharr is the incumbent and nothing broken survives
  a week._

## v1.1 — Sol parity, scripts-first ✅ (2026-08-08, overnight)

Script protocol (v2's flagship, pulled forward) + bundled lorem/json/ip scripts, clipboard
history (copy-on-Enter, concealed-safe), inline math, custom links, custom shortcuts. Scope
negotiation in DECISIONS (zero-network + zero-permissions held; Translate/Calendar/public-IP
deferred). Record: `plans/done/v1.1-scripts-and-sol-parity.md`.

## v1.2 — release core ✅ (2026-08-09) — v0.2.0

System commands, ⌥⏎ secondary actions, opt-in bookmarks, emoji picker, settings window,
README/RELEASING. Ship blocked only on signing (Mitch's Apple Developer ID).
Record: `plans/done/v1.2-release-core.md`. Deferred by choice: file search (mdfind route
documented), dx pack (tmux/projects/ssh/ports — see 2026-08-09 brainstorm in git history).

## v0.5 — the bar (decided 2026-08-15, DECISIONS entry)

launcharr grows a menubar replacement and wrapped Aerospace integration; launcher, bar,
and Aerospace are independently toggleable. Not a distro — bar + launcher + config only.

- **B0 — TUI kit.** `packages/tui`: Omarchy-inspired component library (panels, menus,
  hotkey rows, sliders, calendar, two-pane) with keyboard-nav logic TDD'd; gallery for
  eyeballing. _Exit: every 0.5 surface can be composed from the kit._
- **B1 — Bar spike (gate).** Status-level window per display: workspaces + clock +
  battery, default-off. _Exit: measured resident memory is acceptable or the bar
  approach gets revisited with data._
- **B2 — Bar core.** Layout regions (left/center/right), module placement config,
  notched vs notchless placement profiles, theming via existing theme system.
  _Exit: Mitch turns off Sketchybar._
- **B3 — Aerospace wrap.** Vendored pinned binary, generated opinionated config,
  process supervision, adopt-or-stop migration. _Exit: fresh Mac gets working tiling
  without ever seeing an aerospace.toml._
- **B4 — Panels + modules.** Rich TUI panels on bar items; module API (data-driven,
  any-language emitters); agent bar module. _Exit: sketchybar-agent-status retired._
- **P0 — Panel framework + wifi** (plan: `plans/active/panel-framework-and-wifi.md`).
  Super+Space trigger words open keyboard-driven tui panels in the launcher window;
  wifi (permission-free scope) proves the frame. _Exit: `wifi ⏎` → connect to a known
  network, mouse untouched._
- **P1 — Panel tenants.** System info, then settings migrated off the native window;
  drill-down panel menu once 2–3 tenants exist. _Exit: settings window retired._
- **W0 — tui workbench** (plan: `plans/active/tui-workbench.md`). Story-driven state
  coverage for the kit across app + web surfaces, no Storybook dep. _Exit: every kit
  component has state stories incl. "selected, not hovered"._

## v2 horizon (recorded now, built later — PRD §10)

| Item                                                      | Trigger                                                   |
| --------------------------------------------------------- | --------------------------------------------------------- |
| Per-query learned bindings (schema already records query) | Frecency data shows repeated query→pick                   |
| Richer bangs (`!!` repeat, project-scoped commands)       | Bang mode proves itself daily                             |
| Theming beyond the built-in look                          | A second user exists                                      |
| Signing, notarization, auto-update, public README         | Releasing to the wild                                     |
| Move matching to Rust                                     | R2 fires: WKWebView can't hold the 16 ms keystroke budget |

## Explicitly not doing (non-goals — load-bearing, PRD §3)

File search, window management, snippets, web search fallbacks, preferences UI beyond
essentials, light mode, Windows/Linux, anything requiring Accessibility permissions, any
network request from launcharr core. Deferred with triggers (DECISIONS): Google Translate,
public IP, Calendar.
