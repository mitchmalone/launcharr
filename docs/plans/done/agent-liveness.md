---
title: agent liveness — reap ghosts, dismiss by hand
status: done
created: 2026-08-18
updated: 2026-08-18
links:
  - ../done/agent-monitoring.md
  - ../../DECISIONS.md (2026-08-18)
---

# Agent liveness

## Goal

An agent cell disappears when its agent does. Today removal has exactly one path —
an inbound `{state:"ended"}` from Claude's `SessionEnd` hook — so any agent that dies
without announcing it (closed terminal, killed pane, crash, SIGKILL) leaves a cell in
the bar until the 12 h `pruneHours` sweep. Field case 2026-08-18: a session quit ~30 min
earlier still sat in the bar, pane-less and ungrouped, unjumpable and undismissable.

## Context

`agents.rs` is a push-only store. `list()` already re-reads `tmux list-panes -a` every
tick and, when a session's pane is gone, _nulls_ its location and keeps the cell — it
notices the death and does nothing with it. Sessions that never had a pane (agent
started outside tmux) can't be checked that way at all, and `groupAgents` renders them
loose, outside the session boxes, which reads as breakage rather than "not in tmux".

## Approach

Stop trusting the agent to report its own death; verify liveness from facts launcharr
can observe, cheapest first.

1. **Pane check** — a session with a pane id absent from a _successful_ `list-panes`
   read is dead. Free: the layout is already fetched. Guarded on a successful read so a
   failed spawn (cold start, tmux absent) never reaps a live fleet.
2. **Process check** — adapters report the agent's pid; a session is dead when that pid
   is gone, or when it now belongs to a different command (pid reuse). Adapter-agnostic:
   the comm is recorded at first sight, never matched against a known agent name, so
   herdr and friends work without touching the reaper. Lazy — the `ps` sweep only runs
   when a session actually needs it.
3. **Manual dismiss** — `⌫`/`x` on a row in `agents ⏎`. Whatever the heuristics miss,
   the user can clear; "edit agents.json" is not an answer.
4. **Loose rendering** — after 1–3, a pane-less cell means "not in tmux", not "stuck".
   Give it a dashed box of its own instead of a bare floating glyph.

Also: the hook maps every `SessionEnd` to `ended`, but `/clear` fires `SessionEnd` with
`reason: "clear"` on a live session — the opposite bug. Ignore that reason.

## Steps

- [x] `pid` on the wire event + `AgentSession` (blank-inherits, like `tmux`)
- [x] `tmux_layout()` reports whether the read was fresh; `list()` reaps dead panes
- [x] cached, lazy pid→comm sweep; `pid_comm` recorded at first sight, compared after
- [x] `agent_forget` command + `⌫`/`x` in AgentsPanel
- [x] loose cells in their own dashed group (tui, so the site follows)
- [x] hook: resolve the agent pid up the parent chain; ignore `SessionEnd reason=clear`
- [x] Rust unit tests for the reaper (pure fn, no tmux/ps in the test path)
- [x] `pnpm verify` green; rebuild (signed, JOURNAL 2026-08-17) + relaunch

## Acceptance criteria

- [x] Quitting an agent by closing its pane/window clears its cell within ~2 s —
      verified live 2026-08-18: probe session on a throwaway tmux pane, `kill-session`,
      gone inside 4 s, the four real sessions untouched
- [x] A pane-less agent's cell clears when its process exits — verified live: probe
      with `pid` of a `sleep`, `pidComm` stamped on first sight, gone once killed
- [x] `/clear` in a live agent does not remove its cell (hook returns early on
      `reason=clear`; unit-tested via the hook's own branch, not yet seen in anger)
- [x] tmux unavailable → no reaping (12 h prune only), never a mass clear
      (`an_untrusted_layout_reaps_nothing`)
- [x] The 2026-08-18 field orphan itself disappears. First cut failed this: pane-less and
      pid-less, it fell through to the 12 h prune and stayed put. Fixed by holding
      "nothing to interrogate" sessions to `UNVERIFIABLE_STALE_SECS` (15 min) — confirmed
      gone on relaunch, the three live sessions kept
- [ ] **Hands-check:** `⌫` on an `agents ⏎` row removes it immediately (no specimen left
      in the store now — make one by dismissing any live row; it repopulates on the next
      hook event)

## Out of scope

Bar-side dismiss gesture (panel only), a `herdr` adapter, reworking agent colour
semantics — the look-and-feel pass is a separate slice.

## Risks / open questions

- Parent-chain pid resolution picks the first non-shell ancestor; a wrapper process
  could make it wrong. Blast radius is bounded — the pane check runs first, and a
  wrongly-reaped session reappears on its next event.
- `ps` sweep cost: one spawn per 2 s _only_ while a pane-less session with a pid is
  on screen; zero in the common all-tmux case.
