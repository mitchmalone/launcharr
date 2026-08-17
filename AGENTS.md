# AGENTS.md — launcharr

> _An app launcher for pirates._ Always lowercase.

A macOS app launcher that dresses up as a shell prompt: global hotkey summons a floating
REPL-looking panel; type to fuzzy-launch apps and System Settings panes, or `!command` to fling
a command at iTerm2. Full product truth lives in `docs/PRD.md`. Two values govern every
decision: **lightweight** (idle invisibly, summon instantly) and **hackable** (extending it
feels like scripting). When a feature and the weight budget conflict, the feature loses.

## Standard

This project follows the jig standard, vendored at `docs/STANDARDS.md`. This file carries
**deltas only** — identity, stack, invariants, and the Rust rules the standard doesn't cover.
Divergences live in `DEVIATIONS.md`, never silently.

## Docs system

Stable rules live here; volatile state lives in `docs/`. **Docs link, never duplicate —
single source of truth per fact.** `docs/STATUS.md` is the cursor, `docs/ROADMAP.md` carries
milestones with triggers, `docs/JOURNAL.md` (append-only) dated gotchas, `docs/DECISIONS.md`
(append-only) lightweight ADRs, `docs/plans/` per-task plans (`_TEMPLATE.md` → `active/` →
`done/`), `LEARNINGS.md` the pruned per-topic reference promoted from JOURNAL.

Session protocol: read `STATUS.md` + `plans/active/` at start; plan before non-trivial work;
record decisions/gotchas as they happen; at close update `STATUS.md` and move the plan to
`done/` — **in the same commit as the code**.

## Repository shape

pnpm monorepo:

| Path            | What it is                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| `apps/desktop`  | The macOS app — Tauri 2 shell (Rust) + React panel UI (WKWebView)          |
| `apps/www`      | launcharr.com — static-export Next.js marketing site (Vercel)              |
| `packages/core` | The shared engine: grammar, fuzzy matcher, ranking, rows — pure TypeScript |

The only external repo is the generated satellite `mitchmalone/homebrew-tap` (shared tap; `Casks/launcharr.rb`),
written by the release pipeline — fix the generator, not the output.

**Rust owns the OS, TypeScript owns the experience.** Anything touching AppKit, the
filesystem, or process launch is a small, boring, well-named Rust command; everything with
product opinion (grammar, matching, ranking, rendering) is TypeScript. If a change puts
product opinion in Rust or AppKit calls in TypeScript, it's in the wrong layer. Keep the IPC
command surface tiny and typed; adding a Tauri command is an architectural decision — record
it in `docs/DECISIONS.md`.

## Stack

| Layer            | Choice                                                          | Notes                                                            |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Shell            | **Tauri 2** (Rust)                                              | Window mgmt, global shortcut plugin, accessory app (LSUIElement) |
| Panel            | **tauri-nspanel** (community plugin)                            | Non-activating `NSPanel`, Spotlight-style floating window        |
| UI               | **TypeScript + React** (WKWebView)                              | Vite; 8-row flat list, terminal-prompt visual identity           |
| Matching/ranking | **`packages/core`** (pure TypeScript)                           | The most unit-tested code in the repo                            |
| Indexing/launch  | **Rust commands**                                               | FS scan, FSEvents watch, icon cache, launch, AppleScript→iTerm2  |
| Persistence      | **SQLite** (rusqlite)                                           | Frecency events + icon cache metadata; config is plain JSON      |
| Site             | **Next.js** static export + Tailwind 4                          | Deploys to Vercel on push to main                                |
| Tooling          | pnpm · Vitest · ESLint · Prettier · Lefthook · cargo fmt/clippy | One gate: `pnpm verify`                                          |

## Invariants

1. **Zero required permissions.** The app runs with none (sole exception: the standard
   Automation consent prompt on first iTerm2 hand-off). Nothing requiring Accessibility.
   One opt-in, off by default: Settings → General → "Use the launcharr loupe" makes
   `colorpicker` ask for **Screen Recording** once (2× magnifier, DECISIONS 2026-08-17);
   off — and until granted — it's Apple's `NSColorSampler`, which needs nothing. Nothing
   ever prompts unless that toggle is flipped.
2. **Zero network.** The desktop app makes no network requests, ever. Two carve-outs,
   both user-initiated: a favicon fetch at quicklink-add time (DECISIONS 2026-08-09), and
   the usage monitor's account-limit fetches to the agent providers' own usage endpoints —
   strictly opt-in per provider in Settings → Agents, off by default, using credentials
   the provider CLIs already store, never refreshed or written by launcharr (DECISIONS
   2026-08-16). No background fetches, no update pings, no telemetry. `apps/www` is
   obviously networked — web-side convenience never leaks into the app.
3. **Tiny IPC surface.** A handful of typed Tauri commands; every command is a future
   plugin-API liability.
4. **Prefix dispatch is general.** `!` is mode dispatch via first-char lookup, not a special
   case — scripts join the same grammar.
5. **The matcher stays pure.** Fuzzy matching/ranking are I/O-free functions in
   `packages/core`; both apps consume the same implementation — never fork or hand-copy it.
6. **Focus discipline is sacred.** Summon never steals focus irrecoverably; Esc restores it
   exactly. Proven in M0 before anything was built on top.
7. **The site is fully static.** `output: 'export'` in `apps/www` — no API routes, no
   middleware, no server runtime.
8. **Design tokens only** in `apps/www`: page colors come from the CSS vars in
   `src/app/globals.css`, and shadcn/ui's semantic tokens are _mapped onto_ those vars,
   never imported (DECISIONS 2026-08-16). Exception: the demo renders a dark macOS desktop
   in both site themes, like a screenshot — but its panel and bar chrome are driven by the
   app's own theme tokens (`@launcharr/tui/themes`), not hand-typed hex, so the theme
   picker retints them exactly as the app does. Page-level design source of truth is the
   Claude Design project "Launcharr landing page design"
   (`02b1ac80-4556-43d7-810b-b5938cc2573e`) — visual changes round-trip through it, but it
   never overrides invariant 10 for anything depicting the app.
9. **Release facts are generated, not authored.** `apps/www/src/lib/release.json` is written
   by `scripts/release.sh` — never hand-edit it. `site.ts` derives version, artifact URLs,
   and install methods from it; site copy is free, release data is not.
10. **The website never holds a second copy of launcharr UI.** Every pixel `apps/www`
    renders of the app — panels, rows, the bar, agent cells, cards, themes, keyboard
    behaviour — is **imported from a shared package** (`packages/tui`, `packages/core`).
    Not ported, not mirrored, not "kept in sync": imported. If a surface the site needs
    lives only in `apps/desktop`, the fix is to **extract it into a package first**, then
    import it — never to retype it with a comment pointing at the original. Copying is not
    a shortcut to be justified; it is the failure. Never invent a component, and never
    build one from a design mockup: a mockup is a proposal, the app is the fact, and
    mockups go stale within hours (proven 2026-08-16, DECISIONS). Only genuinely absent
    **data** is fictional — a fake index, fake OS readings — and it is shaped like the
    real payload. **The demo being the actual app is the site's whole novelty; a replica
    that drifts is worse than no demo at all**, because it ships a confident lie that
    stays invisible until someone who knows the app looks at it. This scales the wrong way
    with complexity: every new surface doubles the copies, and each one drifts silently.
    Generalises invariant 5 from the matcher to the entire UI.

## Performance budgets (requirements, not aspirations)

| Metric                                     | Budget                     |
| ------------------------------------------ | -------------------------- |
| Hotkey → panel visible and accepting input | **< 100 ms** (target 50)   |
| Keystroke → updated results on screen      | **< 16 ms** (one frame)    |
| Enter → launch initiated + panel dismissed | **< 50 ms** launcharr-side |
| Idle memory (resident, panel hidden)       | **< 120 MB** ceiling       |
| Cold start → hotkey registered             | **< 1 s**                  |
| Full index rebuild (~300 apps)             | **< 500 ms**               |

A budget miss cuts or flags the offending feature. Changes touching summon, matching, or
launch paths must not regress these — measure before claiming; record numbers in the plan
file or JOURNAL. No UI animation on the hot path (keystroke → results). The matcher and
ranking are the highest-value test targets in the repo — exhaustive Vitest coverage,
property-style cases welcome.

## Rust standards

Same spirit as the TypeScript rules: strict, minimal, boring.

- Stable Rust, pinned via `rust-toolchain.toml`. `cargo fmt` with default rustfmt settings.
- `cargo clippy --all-targets -- -D warnings` must pass (it's part of `pnpm verify`). No
  `#[allow]` without a one-line comment saying why.
- No `unwrap()`/`expect()` outside tests. The only exception is a truly infallible case, with
  a comment proving it (`// infallible: regex is a literal`).
- Errors: `thiserror` for typed errors inside modules; Tauri command boundaries map errors to
  a serializable error type for the frontend. Never stringly-typed errors across IPC.
- `unsafe` (and raw `objc2`/AppKit bindings) live in dedicated, small modules with a safety
  comment per block — never inline in command handlers.
- Tauri commands are thin: validate input, call a plain function, map the result. Logic lives
  in plain functions so it's testable without a Tauri runtime.
- Types crossing IPC derive `Serialize`/`Deserialize` and have a mirrored TypeScript type;
  keep the pair adjacent in naming (`AppItem` ↔ `AppItem`).
- TDD applies to Rust wherever the code is testable in-process (index parsing, frecency SQL,
  config parsing). Native AppKit behavior (panel focus, activation, AppleScript hand-off)
  is verified manually against a written checklist in the task's plan file; quirks go to
  `docs/JOURNAL.md`.
- Every crate is a liability: prefer std, keep the tree shallow. `cargo audit` at release
  milestones.

## Commands

| Command                                      | What                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | All apps in parallel (desktop panel needs `pnpm --filter @launcharr/desktop tauri dev`) |
| `pnpm --filter @launcharr/desktop tauri dev` | The app, for real (Tauri shell + panel)                                                 |
| `pnpm --filter @launcharr/www dev`           | The site                                                                                |
| `pnpm verify`                                | The gate: typecheck + lint + format + test + cargo test + clippy                        |
| `scripts/release.sh X.Y.Z`                   | The only way to release (see `docs/RELEASING.md`)                                       |

## Definition of done

- `pnpm verify` green (typecheck, lint, format:check, Vitest, cargo test, clippy `-D warnings`).
- New pure logic (matcher, ranking, grammar) has unit tests written first.
- Performance budgets not regressed.
- `docs/STATUS.md` (and the task's plan file) updated in the same commit; pushed, CI green.
