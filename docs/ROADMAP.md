# ROADMAP

> Milestones and backlog. What we build next lives here; what's happening now lives in
> `STATUS.md`; how a specific task gets built lives in `plans/`. Milestones and exit criteria
> are from `PRD.md` §9 — this file tracks their state, the PRD stays the source for scope.

## v1 milestones

All v1 milestones below are **code-complete as of 2026-08-08**; M4's holdout is running.

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
- **M4 — Polish & holdout.** 🔄 (launch-at-login + first-run hint shipped; holdout 2026-08-08 → ~08-22) Launch-at-login, first-run hint, two weeks of daily use with a
  "no new features, only fixes" rule. _Exit: v1 declared done._

## v2 horizon (recorded now, built later — PRD §10)

| Item                                                                        | Trigger                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Script plugins (`~/.config/launcharr/scripts/`, JSON-over-stdout responses) | v1 done + daily-driver confirmed                          |
| Per-query learned bindings (schema already records query)                   | Frecency data shows repeated query→pick                   |
| Richer bangs (`!!` repeat, project-scoped commands)                         | Bang mode proves itself daily                             |
| Theming beyond the built-in look                                            | A second user exists                                      |
| Signing, notarization, auto-update, public README                           | Releasing to the wild                                     |
| Move matching to Rust                                                       | R2 fires: WKWebView can't hold the 16 ms keystroke budget |

## Explicitly not doing (v1 non-goals — load-bearing, PRD §3)

File search, calculator, clipboard history, window management, snippets, web search fallbacks,
preferences UI beyond essentials, light mode, Windows/Linux, anything requiring Accessibility
permissions, any network request.
