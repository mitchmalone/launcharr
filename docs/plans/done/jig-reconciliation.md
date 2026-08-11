---
title: Jig reconciliation — one monorepo, one gate, CI fan-out
status: done
created: 2026-08-11
updated: 2026-08-11
links:
  - ~/Developer/mitch/jig (the standard)
  - docs/STANDARDS.md (vendored copy)
---

# Jig reconciliation

## Goal

Bring launcharr onto the jig standard: single monorepo (`apps/desktop` + `apps/www` +
`packages/core`), one verify gate, AGENTS.md-canonical docs, CI, and the release split
(local physics / tag-triggered fan-out). Dissolve the umbrella dir, the sibling web repo,
and the "port, don't fork" hand-sync invariant.

## Context

Defect list: `~/Desktop/jig-defects/launcharr.md` (the hardest reconciliation of the
batch). Jig session rulings: snapshot import (beeptui precedent, PR #52), canonical
`apps/desktop` shape, extraction now (the second consumer already exists), fan-out per the
jig public layer with `vars.*`/`secrets.*` no-op gating, CI asserts release facts match
the tag.

## Steps

- [x] Monorepo skeleton; app → `apps/desktop`; jig root tooling; stricter shared tsconfig
      (~80 `noUncheckedIndexedAccess` fixes, behavior-preserving); repo-wide reformat.
- [x] Snapshot-import launcharr-web as `apps/www` (@launcharr/www); docs folded into the
      single docs system.
- [x] Extract `packages/core`; both apps import it; web forks + invariant deleted.
- [x] Governance: AGENTS.md canonical + CLAUDE.md pointer, `DEVIATIONS.md`,
      `docs/STANDARDS.md` (vendored, stamped), CONTRIBUTING/CoC/issue templates,
      `PRD.md` → `docs/PRD.md`.
- [x] CI: `verify.yml` (node gate on ubuntu, cargo gates on macos, commitlint on PRs).
- [x] Release split: `release.sh` = preflight/gates/bump/build/sign/notarize/smoke/push +
      `gh release create` (mints the tag); `release.yml` = check + tap/Notion/deploy-hook
      fan-out. Repo vars/secrets set (TAP_TOKEN pending — needs a fine-grained PAT).
- [x] Cut over: PR merged, launcharr-web archived, Vercel repointed to the monorepo
      (`apps/www` root), umbrella dir dissolved.

## Acceptance criteria

`pnpm verify` green; www static export builds; app rebuilt + relaunched and smoke-tested;
CI green on the PR; site deploys from the monorepo.

## Out of scope

Editing the jig repo (feedback handed to the jig session); mechanical zero-network
enforcement in CI; moving signing to CI; Turborepo/changesets/CODEOWNERS.
