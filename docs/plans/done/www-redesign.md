---
title: www redesign — control-surface positioning, live demo, docs route
status: done
created: 2026-08-16
updated: 2026-08-16
links:
  - ../../DECISIONS.md # 2026-08-16 · shadcn/ui in apps/www; site consumes @launcharr/tui
  - ../../ROADMAP.md # v0.5 — the bar
  - ~/Downloads/launcharr-website-redesign/ # Claude Design export (guide only)
---

# www redesign

## Goal

Repositions launcharr.com from "an app launcher for pirates" to **the keyboard control
surface for macOS** — the v0.5 story (bar, TUI panels, agent monitoring) that the current
site doesn't tell at all. Adds a `/docs` route so the scripts protocol and config shape
have a home outside the README.

## Context

A Claude Design export (`Launcharr Home.dc.html`, `Launcharr Docs.dc.html`) is the visual
and copy guide — **guide only**: its styling, `lib/engine.js`, and `lib/icons.js` are not
used. The token palette it uses is already what `globals.css` ships, so this is a content
and surface-area expansion rather than a reskin.

The existing demo (`demo-panel.tsx` + `demo-rows.ts`) is already correct architecture: it
drives the real `@launcharr/core` grammar/matcher rather than a copy. That stays and grows.

## Approach

**Stack.** Next 16 static export + Tailwind 4 (unchanged). Add **shadcn/ui**, wired to the
existing launcharr CSS vars — no shadcn oklch palette, so invariant 8 holds. Adopt the
foundation (`components.json`, `cn()`, CVA) plus the zero-Radix components; Radix arrives
only where it buys real keyboard a11y (Tabs). Rationale + the deliberately narrow surface
are recorded in DECISIONS.

**Reuse over re-mock.** `@launcharr/tui` is pure presentation with React as its only peer
dep, so the site consumes the real kit — `Panel`, `ListRow`, `KeyHints`, `SectionHeader`,
`MeterRow`, `SegmentedControl` — for the demo's wifi/dns/usage panels. Its `BUILTIN_THEMES`
replaces `src/lib/demo-themes.ts`, a hand-copied fork that had already drifted (it carries
the retired `#ff176c` accent; the kit has the reverted `#ff6b8c`).

Three things the guide does that we don't: fork the matcher (`engine.js` — invariant 5),
fetch Lucide from unpkg at runtime (we have `lucide-react`), and hard-code `v0.3.1`
(invariant 9 — release facts derive from `release.json`).

## Corrections the guide needs

The design copy is accurate except where the app moved under it. Verified against the repo:

| Claim                                    | Verdict                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `+19MB` marginal for the bar             | ✅ JOURNAL 2026-08-15, ROADMAP B1                                       |
| `<100ms` summon, single-digit ms         | ✅ ROADMAP M2 — instrumented at 3.7 ms                                  |
| 14 themes                                | ✅ `packages/tui/src/themes.ts`                                         |
| v0.5 roadmap ✓/◐/○ states                | ✅ maps cleanly onto B0–B4 / P0–P1                                      |
| `~90MB` resident while idle              | ❌ **wrong** — that's main-process RSS. Whole app idle ≈ 187 MB         |
| `bar.modules`, clock = center anchor     | ❌ **stale** — DECISIONS 2026-08-16 replaced it with `bar.layout` zones |
| 4 panel triggers (wifi/dns/usage/agents) | ❌ **stale** — the registry ships 7 (adds audio, clipboard, help)       |
| "zero network" stated absolutely         | ⚠️ needs the opt-in carve-outs (favicon, usage limits, TRMNL module)    |

`~90MB` becomes `~96MB` labelled _main-process RSS_; the bar section and the docs config
example move to the zones shape with the clock as an ordinary module.

## Steps

- [x] DECISIONS entry: shadcn/ui in `apps/www`; site consumes `@launcharr/tui`
- [x] shadcn foundation + components, mapped onto launcharr tokens
- [x] `@launcharr/tui` as a www dependency; delete `src/lib/demo-themes.ts`
- [x] Fix `SOURCE_INSTALL_COMMANDS` in `site.ts` — still pre-monorepo paths
- [x] Demo v2: bar strip, agent hover cards, wifi/password/dns/usage/ask panel modes
- [x] Home sections: hero + video placeholder, features, stats, bar, agents, compare, install, roadmap, footer
- [x] `/docs` route: scripts protocol, config, panel triggers, uninstall
- [x] Metadata/OG copy for the new positioning

## Acceptance criteria

- [x] `pnpm verify` green
- [x] `pnpm --filter @launcharr/www build` static-exports with no server runtime (invariant 7)
- [x] Every version/artifact string derives from `release.json` — no hard-coded `0.3.1`
- [x] No matcher/theme logic forked into the site; demo drives `@launcharr/core` + `@launcharr/tui`
- [x] Both themes render correctly; demo theme picker covers all 14
- [x] Every factual claim traces to a repo source or is cut

## Out of scope

The welcome video itself (placeholder frame only, per Mitch 2026-08-16). Aerospace/module-API
docs — neither has shipped. No blog, no changelog route.

## Risks / open questions

- The comparison table makes claims about Raycast/Alfred/Sketchybar. Kept conservative and
  temperament-framed; factual risk is ours, so anything not checkable gets cut.
- shadcn's Tailwind 4 story is `@theme`-based; its tokens must not shadow ours. Mapping,
  not importing, is the mitigation — check both themes after install.

## Outcome (2026-08-16)

Shipped. `pnpm verify` green (typecheck, lint, format:check, 111 JS tests, 89 cargo tests,
clippy clean); `next build` static-exports `/` and `/docs` with no server runtime.

Found on the way in, beyond the planned scope:

- **`site.ts` had pre-monorepo build commands** — `pnpm tauri build` and
  `src-tauri/target/...`. Anyone who followed the Source tab since the monorepo move got a
  failure. Fixed.
- **Next 16 writes its own `AGENTS.md`/`CLAUDE.md`** into `apps/www` on first dev run. A
  generated nested pair silently competes with the repo's single-source docs system, so
  `agentRules: false` is now set in `next.config.mjs`.
- The kit's `--tui-*` tokens fall back to `--bg`/`--fg`/`--border`, which on the website are
  _page_ tokens — the demo must set them explicitly or the panels inherit the marketing
  palette. Worth knowing for any future `@launcharr/tui` consumer.

## Correction after review (2026-08-16)

Mitch reviewed the running site and caught that the bar strip, agent cells and hover card
had been built from the **design export's** hardcoded values rather than the app source —
the exact failure the rest of this plan was careful to avoid for the matcher and panels.
Four wrong facts, all decided the same day the export was generated: front app and
right-side cells on `--dim` (bar.css is explicit that `.bar-cell` is `--fg`), the `working`
cell on the site's `--cta` instead of the theme accent so it never retinted, a hover card
missing its glyph and relative age with the wrong tmux line and offset, and `blocked` used
as a state key when the wire name is `attention`.

Hover was broken outright too: leaving a cell reset the card, so it reverted the moment the
cursor left a 16px glyph. `bar/hover.ts` holds its card open while the cursor is on the
cell _or_ the card and closes after a 200ms grace; `useCellHover` now ports that. Paddings
diverged because the spotlight had an invented "large" size — the cluster renders real
geometry now and the spotlight scales it with a transform, so there is one set of values.

Outcome: **AGENTS invariant 10** (the site demos the real thing, never a replica) +
DECISIONS entry, `264ca02` and `cc1a372`. `packages/tui` gained a `./themes` entry point
along the way (server components can't import the barrel — JOURNAL 2026-08-16).

## Follow-ups (not blocking)

- **Extract the bar chrome into `packages/tui`.** The website is a second consumer of a
  visual language that only exists in `apps/desktop/src/bar/`, so the port is debt per
  invariant 10. Needs Mitch's go-ahead (architecture) and coordination with whoever is live
  on `bar/` — it was the battery session's active file set at the time.
- The welcome video slot renders a placeholder frame; drop the embed in when footage exists.
- `og.png` still carries the old "app launcher for pirates" positioning — a rendered image,
  so it needs regenerating rather than editing.
- The comparison table's competitor claims are point-in-time and unversioned — worth a
  re-check whenever it's noticed to be stale.
