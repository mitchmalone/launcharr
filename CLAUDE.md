# launcharr

> _An app launcher for pirates._ Always lowercase.

A macOS app launcher that dresses up as a shell prompt: global hotkey summons a floating
REPL-looking panel; type to fuzzy-launch apps and System Settings panes, or `!command` to fling
a command at iTerm2. Full product truth lives in `PRD.md`. Two values govern every decision:
**lightweight** (idle invisibly, summon instantly) and **hackable** (extending it feels like
scripting). When a feature and the weight budget conflict, the feature loses.

## Docs system (developer context between sessions)

Stable rules live here and rarely change; volatile state lives in `docs/`. **Docs link, never
duplicate — single source of truth per fact:**

| File                | Role                                                        | Discipline                                               |
| ------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `PRD.md`            | Product requirements (v1 scope, UX, budgets)                | Revise cleanly from the top when truth changes           |
| `docs/STATUS.md`    | The cursor — done / in progress / next / blocked            | Terse snapshot, fits a screen; **not** a history         |
| `docs/ROADMAP.md`   | Milestones & backlog with triggers                          | Stable-ish                                               |
| `docs/JOURNAL.md`   | Dated learnings & gotchas as they happen                    | **Append-only**, newest first, short, factual            |
| `docs/DECISIONS.md` | Dated decisions + reasoning                                 | **Append-only**, newest first, lightweight ADR           |
| `docs/plans/`       | Per-task plans                                              | `_TEMPLATE.md` → `active/` → `done/`; frontmatter status |
| `LEARNINGS.md`      | Distilled, per-topic gotchas (promoted from JOURNAL)        | Grouped by topic, pruned regularly                       |
| `AGENTS.md`         | Project deltas from global AGENTS.md (incl. all Rust rules) | Stable                                                   |

JOURNAL vs LEARNINGS: JOURNAL is the dated raw log ("what happened this session"); LEARNINGS is
the pruned reference ("what the next session must know"). A fact lives in one or the other,
never both — promote it out of JOURNAL context when it proves durable.

**Session operating protocol:**

1. **Start:** read `docs/STATUS.md` and any plan in `docs/plans/active/`.
2. **Before non-trivial work:** write a plan from `_TEMPLATE.md` into `plans/active/`.
3. **While working:** record decisions in `DECISIONS.md` and gotchas in `JOURNAL.md` as they
   happen, not at the end.
4. **Finish:** update `STATUS.md`, move the plan to `plans/done/` — **in the same commit as the
   code**. Docs ship with the code, never after.

## Stack (decided — see DECISIONS)

| Layer            | Choice                                                            | Notes                                                            |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Shell            | **Tauri 2** (Rust)                                                | Window mgmt, global shortcut plugin, accessory app (LSUIElement) |
| Panel            | **tauri-nspanel** (community plugin)                              | Non-activating `NSPanel`, Spotlight-style floating window        |
| UI               | **TypeScript + React** (WKWebView)                                | Vite; 8-row flat list, terminal-prompt visual identity           |
| Matching/ranking | **TypeScript** (frontend)                                         | Pure functions, the most unit-tested code in the repo            |
| Indexing/launch  | **Rust commands**                                                 | FS scan, FSEvents watch, icon cache, launch, AppleScript→iTerm2  |
| Persistence      | **SQLite** (rusqlite)                                             | Frecency events + icon cache metadata; config is plain JSON      |
| Tooling          | pnpm · Vitest · ESLint 9 · Prettier · Lefthook · cargo fmt/clippy | Per global + project AGENTS.md                                   |

Guiding split: **Rust owns the OS, TypeScript owns the experience.** Anything touching AppKit,
the filesystem, or process launch is a small, boring, well-named Rust command; everything with
product opinion (grammar, matching, ranking, rendering) is TypeScript.

## Invariants

- **Zero granted permissions.** v1 runs with none (sole exception: the standard Automation
  consent prompt on first iTerm2 hand-off). Nothing requiring Accessibility.
- **Zero network.** launcharr makes no network requests, ever, in v1.
- **Tiny IPC surface.** A handful of typed Tauri commands (`get_index`, `record_launch`,
  `launch`, `run_in_terminal`, `read_config`); every command is a future plugin-API liability.
- **Prefix dispatch is general.** `!` is mode dispatch via first-char lookup, not a special
  case — v2 scripts join the same grammar.
- **The matcher stays pure.** Fuzzy matching/ranking are I/O-free TypeScript functions.
- **Focus discipline is sacred.** Summon never steals focus irrecoverably; Esc restores it
  exactly. This was proven in M0 before anything was built on top.

## Performance budgets (requirements, not aspirations)

| Metric                                     | Budget                     |
| ------------------------------------------ | -------------------------- |
| Hotkey → panel visible and accepting input | **< 100 ms** (target 50)   |
| Keystroke → updated results on screen      | **< 16 ms** (one frame)    |
| Enter → launch initiated + panel dismissed | **< 50 ms** launcharr-side |
| Idle memory (resident, panel hidden)       | **< 120 MB** ceiling       |
| Cold start → hotkey registered             | **< 1 s**                  |
| Full index rebuild (~300 apps)             | **< 500 ms**               |

A budget miss cuts or flags the offending feature. Instrument from day one.

## Local dev

_(To be filled when the Tauri scaffold lands — dev command, test commands, build.)_

## Definition of done

`pnpm typecheck` + `pnpm lint` + `pnpm test` + `cargo test` + `cargo clippy -- -D warnings`
green; new pure logic (matcher, ranking, grammar) has unit tests written first (TDD per
AGENTS.md); performance budgets not regressed; `docs/STATUS.md` (and the task's plan file)
updated in the same commit.
