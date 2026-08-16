---
title: Agents + Menubar settings, consent-gated account limits
status: done
created: 2026-08-16
updated: 2026-08-16
links:
  - plans/done/usage-panel.md (the local-only first pass this extends)
  - plans/done/agent-monitoring.md
  - docs/DECISIONS.md 2026-08-16 (account-limits carve-out)
---

# Agents + Menubar settings, consent-gated account limits

## Goal

The usage panel answers its real question — "how soon am I limited?" — via the providers'
own usage APIs, strictly opt-in per provider. Settings grows an **Agents** tab (local
monitoring + usage, both off by default) and a **Menubar** tab (bar on/off, widget
order). Mitch approved the HTTPS carve-out 2026-08-16.

## Approach

- **Config** (`agents`, `bar` blocks): `agents.monitor` / `showIdle` / `pruneHours`
  gate the socket monitor and bar cells; `agents.usage` gates the `usage ⏎` trigger;
  `agents.claudeLimits` (`off | credentialsFile | keychain`) and `agents.codexLimits`
  (`off | authFile`) select the credential interaction. `bar.enabled` now hot-applies;
  `bar.modules` is an ordered `{id, enabled}` list where **`clock` is the center
  anchor** — before it renders left, after it renders right (hackable in config.json).
- **Limits fetchers** (usage.rs, ureq): Claude `GET api.anthropic.com/api/oauth/usage`
  (Bearer from `~/.claude/.credentials.json` `claudeAiOauth.accessToken`, or the
  `Claude Code-credentials` keychain item via `/usr/bin/security` — standard consent
  prompt; header `anthropic-beta: oauth-2025-04-20`) → `five_hour`/`seven_day` +
  model-scoped `limits[]` (Fable et al). Codex `GET chatgpt.com/backend-api/wham/usage`
  (Bearer + `ChatGPT-Account-Id` from `~/.codex/auth.json`) → primary/secondary windows
  - `additional_rate_limits`. **No token refresh ever** — expired token → visible
    "run `claude`/`codex` to refresh" row, never a write to another app's credentials
    (CodexBar's refresh machinery is the cautionary tale). Fetch results are account-wide,
    fixing the multi-device blind spot (openclaw boxes share the account).
- **Panel**: a Limits section on top (5h/weekly/model meters + resets); codex falls
  back to the local session snapshot (marked stale) when its source is off.
- **Settings**: Agents tab (two checkboxes + options + per-provider source selects with
  plain-language privacy hints), Menubar tab (enable + reorder/toggle rows).

## Steps

- [x] Config structs + TS mirror + tests (defaults off; modules default order)
- [x] agents.rs gating (monitor, prune, empty when off); usage.rs gating
- [x] Limits fetchers + parsers (tested against captured shapes), report plumbing
- [x] UsagePanel Limits section (+ stories); trigger gating in App.tsx
- [x] Bar: modules order rendering, hot enable/disable, agents show-idle
- [x] Settings tabs: Agents, Menubar
- [x] AGENTS.md invariant amendment + DECISIONS; verify; rebuild + relaunch;
      enable on Mitch's config and live-check limits against claude.ai/settings/usage

## Acceptance criteria

- [x] Fresh config: no monitoring, no `usage` trigger, no network — identical to today’s
      defaults from the outside
- [ ] Enabling usage + sources shows Claude 5h/weekly (and Fable-scoped if present) and
      Codex weekly matching the providers' own UIs
- [ ] Bar modules reorder live from settings; bar toggles on/off without restart
- [x] `pnpm verify` green; no token refresh code paths exist

## Out of scope

- OAuth sign-in flows owned by launcharr (a "Sign in" source option can join later)
- Quota-threshold notifications; bar usage glyph
- Codex web-dashboard extras (credits, spend controls)

## Field notes (2026-08-16)

- Endpoints probed live before shipping: Claude 5h **9%**, weekly **31%**, and an
  _active model-scoped Fable window at 59%_ (`limits[]`, `scope.model.display_name`);
  Codex weekly **8% account-wide vs 5% in the stale local snapshot** — the delta is the
  openclaw boxes, proving the multi-device case.
- Gotcha: `~/.claude/.credentials.json` was 5 days stale (Claude Code maintains the
  keychain item, not always the file) → the file source checks `expiresAt` up front and
  points at the keychain source; Mitch's config uses `keychain`. First panel open will
  show the macOS keychain consent prompt — "Always Allow" persists.
- Hands-check: `usage ⏎` limits vs claude.ai; Settings → Menubar reorder; bar off/on.
