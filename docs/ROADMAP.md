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

## v0.4 — the control surface ✅ (released 2026-08-17)

Decided 2026-08-15 as "v0.5 — the bar" (DECISIONS entry); renumbered at release because
0.4 shipped it all: launcharr grows a menubar replacement, TUI panels, agent monitoring
and a wrapped AeroSpace desktop layer; launcher, bar, and tiling are independently
toggleable. Not a distro — bar + launcher + config only. Record: docs/releases/v0.4.0.md.

- **B0 — TUI kit.** ✅ (2026-08-15) `packages/tui`: Omarchy-inspired component library
  with keyboard-nav logic TDD'd. _Exit met: bar + panels compose from the kit._
- **B1 — Bar spike (gate).** ✅ (2026-08-15) _Exit met: ~19 MB marginal (shared WebKit
  pool) — gate PASSED; numbers in plans/done/v0.5-tui-kit-and-bar-spike.md._
- **B2 — Bar core.** ✅ Mitch's daily menubar (Sketchybar retired 2026-08-16); zones +
  drag arranger, notch profiles, battery hover card, wifi SSID, awake cell; a bar per
  display + launcher on the mouse's screen (2026-08-19). Left for v0.5: per-monitor
  workspaces, app hints, event-driven front-app, bluetooth glyph.
- **B3 — Desktop layer.** ✅ (2026-08-17, was "Aerospace wrap") AeroSpace as a cask
  dependency (never vendored), generated opinionated config with adopt-or-leave and a
  managed/unmanaged switch (edit / use my own / save a copy), opt-in JankyBorders,
  corner radius. _Exit met: fresh Mac gets working tiling without seeing a toml._
- **B4 — Agents.** ✅ Agent bar cells + `agents ⏎` + `usage ⏎` + `?` mode
  (plans/done/agent-monitoring.md). Module API deferred to v0.5.
- **P0 — Panel framework + wifi.** ✅ (2026-08-16) `wifi ⏎`, `dns ⏎`; PANELS registry
  makes tenants one-entry cheap.
- **P1 — Panel tenants.** ✅ audio, clipboard, awake, aerospace, help, **screenshots**
  (`ss ⏎`, plans/done/screenshots-panel.md — first grid + scrolling panel). Settings
  migration deferred to v0.5.
- **W0 — tui workbench.** ✅ (2026-08-16) Story-driven state coverage, no Storybook dep.

## v0.5 — plugins (next; scope talk pending)

Candidates carried over from v0.4, to be cut down in the 0.5 scope session:

- **Module API** — data-driven, any-language bar emitters ("same contract philosophy as
  scripts"); TRMNL returns through it. Rich TUI panels on bar items.
- **Multi-display** — ✅ bar per display, launcher on the mouse's screen (2026-08-19,
  plans/done/multi-display.md). Left: per-monitor workspace lists (aerospace
  `--monitor`), a screen-parameters observer instead of the 5 s heartbeat.
- **Bar polish** — glyph-only strip landed 2026-08-19 (DECISIONS: wifi arcs, battery
  tiers by adjusted charge, awake timer card-side). Left: NSWorkspace-observer front-app,
  bluetooth glyph; per-workspace app hints only as hover. Saved for last by request:
  Vercel / GitHub Actions / uptime modules.
- **Settings into panels** — the native window retires (re-decide: 0.4 invested in it).
  Drill-down panel menu.
- **awake loose ends** — timed agents-idle release observed end-to-end, lid-closed-on-AC,
  slice E. (Relaunch persistence shipped 2026-08-19, DECISIONS.)
- **Site/app single-source gaps** — `PANEL_INFO` is hand-mirrored in `apps/www`
  (invariant 10 smell); extract to a package.
- **PRD revision pass** — predates the control-surface direction (DECISIONS 2026-08-15 is
  the scope source until then).

## v2 horizon (recorded now, built later — PRD §10)

| Item                                                      | Trigger                                                   |
| --------------------------------------------------------- | --------------------------------------------------------- |
| Per-query learned bindings (schema already records query) | Frecency data shows repeated query→pick                   |
| Richer bangs (`!!` repeat, project-scoped commands)       | Bang mode proves itself daily                             |
| Theming beyond the built-in look                          | A second user exists                                      |
| Signing, notarization, auto-update, public README         | Releasing to the wild                                     |
| Move matching to Rust                                     | R2 fires: WKWebView can't hold the 16 ms keystroke budget |

## Explicitly not doing (non-goals — load-bearing, PRD §3, amended by v0.4)

File search, snippets, light mode, Windows/Linux, **anything distro-shaped**. Still true
for the **launcher core**: zero network, zero permissions. Amended by DECISIONS
2026-08-15/16 for v0.4: window management arrives _wrapped_ (Aerospace, which brings its
own Accessibility grant — launcharr itself still requests nothing), and bar **modules**
may be credentialed + networked per-module, fail-visible (TRMNL was the first; pulled 2026-08-17 pending the plugin API). The PRD predates
v0.4 and needs a revision pass — until then DECISIONS 2026-08-15 is the scope source for
bar/panel questions.
