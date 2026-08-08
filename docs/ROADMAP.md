# ROADMAP

> Milestones and backlog. What we build next lives here; what's happening now lives in
> `STATUS.md`; how a specific task gets built lives in `plans/`. Milestones and exit criteria
> are from `PRD.md` §9 — this file tracks their state, the PRD stays the source for scope.

## v1 milestones

- **M0 — Spike (the scary parts first).** Tauri 2 + tauri-nspanel: hotkey summons a
  non-activating panel with a text field; Esc restores focus correctly over a full-screen app.
  *Exit: the focus dance works or the stack decision gets revisited.*
  → `plans/active/m0-nspanel-spike.md`
- **M1 — Launcher.** Index + fuzzy match + launch + System Settings panes. No frecency, ugly UI.
  *Exit: Mitch can launch any app.*
- **M2 — Feel.** Frecency, keyboard bindings, terminal-prompt visual identity, performance
  instrumentation against the budgets. *Exit: launcharr replaces the incumbent daily launcher.*
- **M3 — Bang mode.** `!` grammar dispatch, iTerm2 hand-off, Terminal.app fallback, config file.
  *Exit: `!git status ⏎` feels better than switching to iTerm2 by hand.*
- **M4 — Polish & holdout.** Launch-at-login, first-run hint, two weeks of daily use with a
  "no new features, only fixes" rule. *Exit: v1 declared done.*

## v2 horizon (recorded now, built later — PRD §10)

| Item                                                        | Trigger                                    |
| ----------------------------------------------------------- | ------------------------------------------ |
| Script plugins (`~/.config/launcharr/scripts/`, JSON-over-stdout responses) | v1 done + daily-driver confirmed |
| Per-query learned bindings (schema already records query)   | Frecency data shows repeated query→pick    |
| Richer bangs (`!!` repeat, project-scoped commands)         | Bang mode proves itself daily              |
| Theming beyond the built-in look                            | A second user exists                       |
| Signing, notarization, auto-update, public README           | Releasing to the wild                      |
| Move matching to Rust                                       | R2 fires: WKWebView can't hold the 16 ms keystroke budget |

## Explicitly not doing (v1 non-goals — load-bearing, PRD §3)

File search, calculator, clipboard history, window management, snippets, web search fallbacks,
preferences UI beyond essentials, light mode, Windows/Linux, anything requiring Accessibility
permissions, any network request.
