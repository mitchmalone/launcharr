---
title: Project restructure + deterministic release pipeline
status: done
created: 2026-08-10
updated: 2026-08-10
links:
  - ../DECISIONS.md (2026-08-10 release-channel entry)
  - docs/RELEASING.md
---

# Project restructure + deterministic release pipeline

## Goal

One parent project dir holding two sibling repos (app + web), with Claude rules for managing
them together, and a release that is a single deterministic script covering app artifacts
(dmg, zip, brew, source), the GitHub Release, and the website update — no ad-hoc agent work,
nothing forgettable.

## Context

App repo lives at `~/Developer/mitch/launcharr`; website (Next.js 16 on Vercel, own repo
`mitchmalone/launcharr-web`) at `~/Developer/mitch/launcharr-web`. The site's version/install
content is one constants file (`src/lib/site.ts`) — a clean seam for generated data.

## Approach

- **Layout:** `launcharr/` (parent, not a git repo) → `launcharr/launcharr` (app repo),
  `launcharr/launcharr-web` (web repo). Parent gets a CLAUDE.md with two-repo rules.
- **Determinism:** `scripts/release.sh` in the app repo is the only way to release. It
  fail-fasts on every precondition (clean trees both repos, notes file exists, cert present
  unless `--unsigned`, gh authed), runs all gates, bumps versions, builds dmg+zip, signs/
  notarizes, checksums, prompts for the two manual smoke tests, tags, creates the GitHub
  Release, writes `release.json` into the web repo (site reads it) and pushes both. Install
  methods: dmg (humans), zip (cask), Homebrew tap, build-from-source.
- **Website:** `src/lib/release.json` becomes generated data; `site.ts` derives VERSION and
  artifact URLs from it. Vercel auto-deploys on push — "website updated" is a push, not a task.

## Steps

- [x] Restructure dirs; verify both repos healthy after move
- [x] Parent CLAUDE.md (layout, two-repo discipline, release entry point)
- [x] tauri.conf bundle targets += dmg
- [x] `scripts/release.sh` + `docs/releases/_TEMPLATE.md` (notes-file-required design)
- [x] Web: release.json + site.ts consumes it; conditional download links in page.tsx
- [x] RELEASING.md rewritten around the script; STATUS/DECISIONS updated
- [x] Both repos committed

## Acceptance criteria

- [ ] `bash scripts/release.sh --dry-run 0.3.0` walks every step and fails fast on the
      missing notes file / cert with clear messages
- [ ] Web repo builds green with generated release.json
- [ ] All existing gates still green in the app repo

## Out of scope

- Actually cutting v0.3.0 (blocked on the Developer ID cert)
- CI; Homebrew tap creation (script handles "tap missing" gracefully); LICENSE choice
  (flagged, needs Mitch's pick)

## Risks / open questions

- Moving the app repo while the Claude session sits inside it — use absolute paths.
- DMG bundling needs no signing to produce, but an unsigned dmg download will quarantine;
  advertised path stays brew until signing lands.
