---
title: Open-source release readiness review
status: active
created: 2026-08-17
updated: 2026-08-17
links:
  - ../../STANDARDS.md
  - ../../RELEASING.md
  - ../../STATUS.md
---

# Open-source release readiness review

## Goal

Audit the complete launcharr repository for security defects, poor engineering practices,
standards drift, and release-readiness gaps, then leave a prioritized, evidence-backed
document that can drive the hardening work before the next feature phase and public release.

## Context

launcharr spans a privileged macOS boundary (Rust/Tauri), a React interface, a shared pure
TypeScript engine, a static Next.js site, and local/GitHub release automation. The review
therefore covers source, configuration, capabilities, dependencies, tests, documentation,
generated artifacts, and the release supply chain rather than treating `pnpm verify` as the
whole assurance case.

The active `awake` feature remains separate. This review records findings against the tree as
found and does not silently fold unrelated product fixes into that work.

## Approach

Inventory every shipped/runtime surface, inspect high-risk boundaries first, then review each
module systematically. Combine manual review with the repository gate, dependency audits,
secret scanning, Rust advisory checks where available, and targeted static searches. Record
only reproducible findings, each with severity, evidence, impact, and a concrete remediation.

## Steps

- [ ] Map shipped artifacts, trust boundaries, permissions, IPC, persistence, and network use.
- [ ] Review Rust/Tauri code, native FFI, subprocesses, filesystem handling, SQLite, and config.
- [ ] Review desktop React, shared core/TUI, Next.js site, scripts, hooks, and release workflows.
- [ ] Run verification, dependency, secret, and repository hygiene checks; assess test gaps.
- [ ] Write the prioritized review report and update the project cursor.

## Acceptance criteria

- [ ] Every first-party source/config/workflow file is included in the review inventory.
- [ ] Findings have severity, evidence, impact, and remediation; uncertainty is explicit.
- [ ] `pnpm verify`, dependency audit, and secret scanning results are recorded.
- [ ] The report separates open-source blockers, pre-next-phase work, and accepted residual risk.
- [ ] `docs/STATUS.md` points to the report and this plan is closed.

## Out of scope

- Implementing the remediation backlog beyond trivial documentation corrections.
- Dynamic penetration testing of third-party services or macOS internals.
- Signing, notarization, and hands-on focus/lid checks that require Mitch's credentials or
  physical interaction.

## Risks / open questions

- Generated build output may differ from source; only tracked/released artifacts are security
  relevant, but stale local output can still reveal release hygiene problems.
- Tool availability and advisory database access may constrain automated checks; any such gap
  will be recorded rather than treated as a pass.
