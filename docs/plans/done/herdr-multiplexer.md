---
title: agents in other multiplexers — herdr first
status: done
created: 2026-08-18
updated: 2026-08-18
links:
  - ./agent-liveness.md
  - ../done/agent-monitoring.md
  - https://herdr.dev/docs/socket-api/
---

# Agents in other multiplexers — herdr first

## Goal

launcharr's agent monitor assumes tmux: the wire carries a pane id, grouping is by tmux
session, jumping shells out to `tmux switch-client`. herdr — "the runtime your coding
agents live on" — is a second multiplexer Mitch is moving work into, and agents living
there are invisible to the bar. Make the monitor multiplexer-agnostic, with herdr as the
second backend and tmux unchanged.

## Context

herdr (0.8.0, `~/.local/bin/herdr`) runs a background server that owns panes and, unlike
tmux, **classifies agents itself**: every pane is `working | blocked | done | idle |
unknown` — launcharr's own vocabulary, modulo `blocked` ↔ `attention`. Its socket
(`~/.config/herdr/herdr.sock`, newline-delimited JSON, the same shape as our own adapter
protocol) serves `session.snapshot` (workspaces + tabs + panes + agents in one read),
`agent.list`, and `agent.focus`. `AgentInfo` carries `agent`, `agent_status`, `title`,
`workspace_id`, `tab_id`, `pane_id`, `cwd`, `terminal_title_stripped`.

So herdr is not a second hook source — it's a **second store**, already authoritative
about its own agents. That covers every agent herdr detects (cursor, opencode, grok,
droid…), not just the two with hook systems.

## Approach

**Pull, don't subscribe.** `pane.agent_status_changed` requires a `pane_id`, so there is
no session-wide status push; a subscription client would have to re-subscribe per pane as
panes appear. `session.snapshot` on a 1 s cache — the exact shape of the existing
`tmux_layout()` — gets the same freshness for a fraction of the machinery. Upgrade path
noted if the cost ever shows.

**One store, two sources.** Hook-fed sessions keep the liveness reaper (plan:
agent-liveness). herdr-fed sessions skip it entirely: presence in herdr's snapshot _is_
liveness, and absence is death. They never touch disk either — herdr is the durable one.

**Generalise the location.** `tmux`/`tmuxSession`/`tmuxWindow`/`tmuxWindowName` become
`mux` (which multiplexer), `muxTarget` (pane id), `muxGroup`/`muxIndex`/`muxLabel`
(tmux session/window ↔ herdr workspace/tab). The hook wire protocol is untouched — a
`tmux` field still means `mux: "tmux"` — so nothing on the emitting side has to change.

**herdr owns cells in herdr panes.** Claude inside a herdr pane fires our hook _and_ is
seen by herdr; two cells for one pane. The hook detects `HERDR_PANE_ID` and, instead of
emitting to launcharr, calls herdr's `pane.report_metadata` with the user's prompt as the
title — enriching the record herdr already owns, which launcharr then reads. State stays
herdr's (`report_metadata` is explicitly presentation-only), so the two never disagree.

## Steps

- [x] Stage 1 — mux-agnostic store: rename/generalise the location fields end to end
      (Rust, tui types, format.ts grouping, panel, stories, demo data), tmux behaviour
      unchanged, `serde(alias)` so existing `agents.json` still loads
- [x] Stage 2 — `herdr.rs`: socket discovery (default + named sessions), cached
      `session.snapshot`, `AgentInfo` → `AgentSession` mapping, merged into `list()`
- [x] Stage 3 — jump dispatches on `mux`: tmux as today, herdr via `agent.focus`
- [x] Stage 4 — hook stands down inside herdr panes and reports metadata to herdr instead
- [x] Stage 5 — docs (DECISIONS, STATUS, LEARNINGS if it bites), `pnpm verify`, ship

## Acceptance criteria

- [x] The live herdr pane (`w1:p1`, agent "L2") maps to a cell grouped under its
      workspace label, and its state tracks herdr's — confirmed by driving L2 into a long
      task and watching `agent_status` go `done` → `working` with `state_change_seq` bumping
      (**visual check on the bar itself still owed**)
- [ ] Killing the herdr pane clears the cell; stopping the herdr server clears all of them
      (not exercised — Mitch's only herdr pane is a live agent)
- [ ] `⏎` on a herdr row focuses that pane and brings the terminal forward — **hands-check**
      (focusing someone else's live pane isn't mine to do unasked)
- [x] A Claude session in a herdr pane produces exactly **one** cell, titled with the
      user's prompt — fired the hook with `HERDR_PANE_ID` set and watched the title land on
      herdr's own record with no launcharr-side event
- [x] tmux agents behave exactly as before; herdr absent → not a single spawn or error
- [x] `pnpm verify` green, budgets unmoved

## Out of scope

herdr's token accounting (`AgentInfo.tokens`) into the `usage` panel — real, but a
separate slice. Driving agents from launcharr (`agent.prompt`, `agent.wait`): launcharr
watches, it doesn't herd. Remote herdr servers.

## Risks / open questions

- herdr is 0.8.0 and days old; the socket protocol carries a `protocol` version (19) and
  will move. Mapping lives in one function with fixtures from real captures.
- Polling a second local socket at 1 Hz — measure before claiming it's free.
