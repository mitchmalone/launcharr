---
title: usage panel — local token monitor
status: done
created: 2026-08-16
updated: 2026-08-16
links:
  - CodexBar (https://github.com/steipete/CodexBar) — design reference, NOT data-source reference
  - docs/DECISIONS.md 2026-08-16 (usage monitor is local-only)
  - plans/done/agent-monitoring.md (same morning's agent work)
---

# usage panel — local token monitor

## Goal

`usage ⏎` opens a CodexBar-style token monitor for Claude Code and Codex: provider tabs,
tokens-by-day (7 days), tokens-by-model, and Codex's rate-limit window — Omarchy-flat in
the TUI kit.

## Approach

CodexBar hits OAuth APIs and decrypts browser cookies; launcharr does neither (invariant
2). Both CLIs journal usage locally and that is the entire data source:

- **Claude**: `~/.claude/projects/**/*.jsonl` — assistant messages carry
  `message.usage` (input/output/cache tokens), model, message id, timestamp. Sessions
  fork/resume and duplicate history, so entries dedup by message id.
- **Codex**: `~/.codex/sessions/**/*.jsonl` — `token_count` events carry per-turn
  totals and a `rate_limits` snapshot (weekly window used %, resets_at); `turn_context`
  carries the model.

Mechanics: `usage.rs` scans files with mtime in the last 8 days on a background thread;
per-file entry cache keyed by (len, mtime) so rescans only pay for changed files
(~98 MB / 76 files currently). Day bucketing in local time via the `date +%z` offset;
RFC3339 parsed by hand (no chrono — every crate is a liability). `usage_status` returns
the cache instantly and kicks a refresh when stale; the panel polls while open.

## Steps

- [x] `usage.rs`: parsers (tested), walk + per-file cache, aggregation, background refresh
- [x] `usage_status` command (DECISIONS)
- [x] `UsagePanel` + container + stories; `usage` trigger in PANELS
- [x] verify, rebuild + relaunch, live check against real transcripts

## Acceptance criteria

- [ ] `usage ⏎` shows real 7-day Claude numbers matching a ccusage spot check
- [x] Codex tab shows tokens and the weekly rate-limit meter
- [x] No network, no new permissions; panel opens instantly (cached) and fills in
- [x] `pnpm verify` green

## Out of scope

- Other providers (Fireworks etc.) — the provider list is data-driven for later
- Cost estimation in dollars; 5h-window reconstruction for Claude
- Bar module/glyph for usage (panel first; bar cell is a later decision)

## Field notes (2026-08-16)

- Real-home scan (ignored test `usage::tests::scan_real_home`): 110ms cold, 12ms warm;
  claude 927M tokens/7d (fable-5 732M, opus-5 194M), codex 3.0M + weekly limit 5%.
- Visual check on Mitch: `usage ⏎`, tab between providers, numbers vs a ccusage run.
