---
title: Hide claude-owned daemon sessions; subagents in the parent's hover
status: done
created: 2026-08-19
updated: 2026-08-19
links:
  - plans/done/agent-liveness.md, plans/done/herdr-multiplexer.md
  - JOURNAL 2026-08-19 (daemon diagnosis)
---

# Agent daemon filter + subagents

## Goal

Two cells that were never agents disappear, and an agent that forks subagents shows them
in its own hover card instead of on the bar.

## Context

Claude Code now runs a background daemon (`claude daemon run` → `--bg-pty-host` →
`bg-spare` / `--session-id` pty sessions), spawned by an interactive session. Its children
run the same hooks, and the pty-host scrubs `TMUX_PANE`, so each became a pane-less
"outside a multiplexer" cell — alive (pid + comm check out), never yours. Subagents
(Agent tool) run in-process; `SubagentStart`/`SubagentStop` hooks carry
`agent_id`/`agent_type`/`description`.

## Approach

- **Hook**: walk the parent chain once; a `daemon run` / `--bg-pty-host` / `bg-spare`
  ancestor marks the event `background: true`. `SubagentStart`/`SubagentStop` map to
  state `working` plus a `subagent: {op, id, type, description}` field.
- **Rust** (`apply`): a background event may **not create** a session — it only updates one
  that already exists — unless it carries a prompt (`UserPromptSubmit`). So the spare and
  idle pty sessions never surface; a background session someone actually drives does, on
  its first prompt. Subagents live on the session (`subagents: [{id, kind, description,
startedAt}]`): start pushes (dedup by id), stop removes, `done`/`ended` clears.
- **TUI**: card lists subagents (kind · description · age); cell carries a small count
  when > 0. `agents ⏎` appends the count to the row.

## Steps

- [x] hook: ancestry flag + subagent events; settings.json gains the two hook groups
- [x] agents.rs: `background`, `subagent` on the wire; `subagents` on the session; tests
- [x] tui types + card + cell badge; AgentsPanel row; www types compile
- [x] verify, relaunch, confirm the two daemon cells are gone and a forked subagent shows

## Acceptance criteria

- [x] `bg-spare` / idle daemon pty sessions produce no cell (socket probe + hook probe under a fake pty-host)
- [x] a subagent shows in the parent's hover while running, gone after stop (store verified via socket; card is a hands-check — this session predates the new hook groups)
- [x] `pnpm verify` green

## Out of scope

Cells for subagents; hiding sessions by name; herdr-side subagents (herdr owns those).
