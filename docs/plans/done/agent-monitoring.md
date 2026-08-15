---
title: Agent monitoring — bar cluster + agents panel
status: done
created: 2026-08-16
updated: 2026-08-16
links:
  - ROADMAP B4 (module API + agent bar) — this pulls the agent bar forward
  - ~/Developer/sketchybar-agent-status (the system being absorbed)
  - docs/DECISIONS.md 2026-08-16 (agent monitoring absorbed)
---

# Agent monitoring — bar cluster + agents panel

## Goal

Absorb the sketchybar-agent-status system (Go daemon + emoji sketchybar widgets) into
launcharr: live Claude Code session states in the bar, in the bar's own design language,
with click/Enter jump-to-tmux-pane. Retires the last piece of the Sketchybar setup that
the launcharr bar didn't already replace.

## Context

Today: Claude Code hooks → `claude-status.sh` → `agent-statusctl emit` → `agent-statusd`
(launchd, Go) listening on a unix socket → `state.json` → sketchybar renderer (emoji
🧑‍🍳/😴/👀, blink on attention, popup with task/detail/tmux + jump). The daemon's store
semantics: sessions keyed by id; `ended` deletes; blank title/detail/tmux inherit the
previous value; newest-first ordering.

launcharr's bar is Rust-pushed snapshots at 1 Hz + event triggers — exactly the shape this
needs. The panel framework gives the popup a better home (`agents ⏎`).

## Approach

- **Rust `agents.rs`**: unix socket listener at
  `${XDG_STATE_HOME:-~/.local/state}/launcharr/agents.sock` (0600), speaking the _same_
  newline-JSON event protocol `{session, agent, state, title, detail, tmux}`. Store ports
  the Go semantics (tested in-process); persists `agents.json` next to the socket so
  restarts keep context; every applied event pushes a fresh bar snapshot immediately.
  Stale-session hygiene the old daemon lacked: sessions untouched for 12 h are pruned.
- **Bar**: agents cluster on the left (where the sketchybar item sat), one small cell per
  session — state glyph in theme tokens (working ●, idle ○, attention ‼ with a CSS pulse;
  the bar is not the launcher hot path). Click = jump to that tmux pane.
- **Panel**: `agents ⏎` tenant — sessions with state/title/detail/target/age, Enter jumps.
  Presentational half storied in the workbench.
- **Jump** (Rust): `tmux switch-client` + `select-window` to the pane id, then `open -a`
  the configured terminal. No Accessibility, no new permissions.
- **Hook adapter**: `apps/desktop/hooks/claude-status.sh` in-repo — one python3 pass:
  parse hook JSON, map event → state, write the event line to the socket; exits 0 when
  launcharr isn't running. `~/.claude/settings.json` hooks point here instead of the old
  adapter.
- **Retire the daemon**: `launchctl bootout` `com.mitchmalone.sketchybar-agent-status`.
  Revert = bootstrap the plist back and repoint the hooks — recorded below.

## Steps

- [x] Plan + DECISIONS entry
- [x] `agents.rs`: store (ported semantics + prune, unit-tested), socket listener,
      persistence, bar push on event
- [x] Snapshot + bar UI: agents cluster, attention pulse, click-to-jump
- [x] `agent_jump` + `agents_status` commands (DECISIONS)
- [x] `agents ⏎` panel tenant (+ workbench stories)
- [x] Hook script in repo; repoint `~/.claude/settings.json` (and `~/.claude-psyke` if
      hooked); bootout the Go daemon
- [x] `pnpm verify`, rebuild + relaunch, live-test with real sessions

## Acceptance criteria

- [x] Typing in a Claude session flips its bar cell to working within ~1 s; Stop → idle;
      permission prompt → attention pulse
- [ ] Click on a cell (and Enter in the panel) lands in the right tmux pane with the
      terminal frontmost
- [x] `agents ⏎` panel lists live sessions with task titles
- [x] Old sessions (>12 h idle) don't linger
- [x] `pnpm verify` green; no new permissions; bar memory unchanged (~19 MB marginal)

## Out of scope

- Codex/other-agent adapters (protocol is agent-agnostic; adapters come with B4 module API)
- Packaging the hook for non-dev installs (release/resource path concern, B4)
- Per-agent icons/config surface

## Risks / open questions

- Socket path is new: anything still emitting via `agent-statusctl` targets the old
  socket and goes nowhere once the daemon is dead — acceptable; hooks are the only
  emitter on this machine.
- Revert path: `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.mitchmalone.sketchybar-agent-status.plist`
  and repoint `~/.claude/settings.json` hooks at
  `~/.local/share/sketchybar-agent-status/hooks/claude-status.sh`.

## Field notes (2026-08-16)

- Live-tested: hook → socket → store → bar push confirmed with this very session and a
  6-thread concurrent burst; `ended` cleanup verified. Concurrent saves tore agents.json
  on the first live test — fixed (mutex + temp-file rename), JOURNAL 2026-08-16.
- Waiting on hands: attention-pulse visual, cell-click / panel-Enter jump landing in the
  right pane over a full-screen app.
