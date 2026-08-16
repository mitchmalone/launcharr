# STATUS

> The cursor: where we are right now. Keep this **terse** — a snapshot, not a history.
> History lives in git, `plans/done/`, and `JOURNAL.md`.
>
> Last updated: 2026-08-16

## Where we are

launcharr is mid-**v0.5**: launcher → launcher + menubar replacement + keyboard control
surface (direction: DECISIONS 2026-08-15 — own bar, wrapped Aerospace, modular install,
**not a distro**). Mitch runs it all daily; latest verdict: "insanely good."

## Shipped and live (v0.5 era — details in plans/done/ + JOURNAL)

- **v1 launcher line (through v0.3.1, signed + released)**: panel/focus dance, index +
  fuzzy + frecency, bang mode, scripts protocol, clipboard, math, quicklinks, emoji,
  settings window, themes, menubar icon, release pipeline + shared tap. Monorepo on the
  jig standard since 2026-08-11.
- **`packages/tui`** — Omarchy-inspired kit (panels, rows, hotkeys, controls, calendar,
  nav hooks; theme tokens live here now, desktop shims). **Workbench** replaces the
  gallery: `pnpm --filter @launcharr/tui workbench` — state stories (incl. "selected,
  not hovered" and clipped-list scroll), theme + viewport switching, app-panel stories
  auto-discovered.
- **The bar** (`bar.enabled` in config, ON for Mitch; Sketchybar retired — revert
  `brew services start sketchybar`): Omarchy-flat strip — workspaces (clickable +
  hotkey-tracked), front app, clock, wifi SSID, TRMNL battery (fail-soft, token
  currently unresolvable), battery states. Architecture: Rust-pushed snapshots via
  webview eval at 1 Hz + FSEvents triggers dir (`~/.config/launcharr/triggers/` —
  aerospace exec-on-workspace-change touches it; **dotfiles change uncommitted**),
  async commands only, Floating level + constrainFrameRect override (menu bar slides
  over), 15s reframe heartbeat, ~19 MB marginal memory (gate passed).
- **Agent monitoring** (B4 slice, plans/done/agent-monitoring.md): launcharr absorbed
  sketchybar-agent-status — Rust socket monitor (`agents.rs`, old wire protocol
  unchanged), bar agent cells, `agents ⏎` panel. WIP color semantics (2026-08-16):
  blocked red breathing, working accent, **done-unread blue** (Stop → `done`, read on
  jump), idle/unknown green. Cells grouped in bordered boxes by tmux session, ordered by
  tab (`list-panes` enrichment, 2s cache); hover opens a dropdown card — the bar window
  grows downward (`bar_set_dropdown`) since the 30px strip can't host a popover. Claude hooks → in-repo `apps/desktop/hooks/claude-status.py`;
  Go daemon booted out (revert: bootstrap
  `~/Library/LaunchAgents/com.mitchmalone.sketchybar-agent-status.plist` + repoint
  hooks; settings backups at `~/.claude*/settings.json.bak-agent-status`).
- **`usage ⏎` token monitor** (plans/done/usage-panel.md + agents-settings-and-limits.md):
  journals parsed in Rust (dedup, per-file cache) for tokens by day/model, **plus opt-in
  account limits** from the providers' own usage endpoints (invariant 2 amended,
  DECISIONS 2026-08-16) — Claude 5h/weekly/model-scoped (Fable window live at 59%),
  Codex account-wide weekly (8% vs 5% stale local = the openclaw delta). No token
  refresh, ever; credential access is a per-provider **consent toggle** (source order +
  fallback are code-owned; last-good cache bridges failures with "as of" stamps) in
  **Settings → Agents**,
  which also gates local monitoring (prune window, show-idle). **Settings → Menubar**:
  bar on/off hot-applied + widget order (`bar.modules`, clock = center anchor).
- **`?` agent mode** (ported 2026-08-16 from the spike-ask-ai branch, adapted to the
  monorepo + prefix grammar): type `?` + a question → streamed conversation with the
  user's own `claude` CLI (caged child: empty cwd, no fs/exec tools — JOURNAL
  2026-08-10), markdown-lite rendering, `--continue` follow-ups, Esc ends. Gated by
  `agents.askMode` ("Enable agent mode", Settings → Agents, off by default). The spike's
  keystroke-switched input modes were deliberately NOT ported — main's prefix grammar
  won (invariant 4); branch kept for reference.
  launcher window — `PANELS` registry in App.tsx, breadcrumb prompt, Esc-stack, panels
  are storied presentational components + thin invoke containers. Tenants: **`wifi ⏎`**
  (active network pinned, known networks scroll + Enter-connects, `p` power, scan row
  greyed pending Location Services) and **`dns ⏎`** (interface/IP/router/resolver,
  MagicDNS note). Wifi commands ×4 in wifi.rs (DECISIONS 2026-08-16).

## In progress / next (ROADMAP B2–B4, P1)

- Panel tenants: `sysinfo`, then **settings migrated off the native window** (the big
  one); drill-down panel menu once 3 tenants exist.
- Bar: per-workspace app hints; right-side glyph set (bluetooth/sound — opens the
  per-module permissions conversation); NSWorkspace observer for event-driven front-app;
  multi-display fix (JOURNAL 2026-08-15); placement config + notched profiles.
- Aerospace vendored wrap + adopt-or-stop migration (B3); module API (B4 — agent bar
  shipped 2026-08-16, general any-language emitter API remains).
- Saved for last by request: vercel / GitHub Actions / uptime bar modules.
- Housekeeping (Mitch): commit the aerospace.toml triggers change in dotfiles; prune
  sketchybar config there when confident; TRMNL secret chain (age helper and infisical
  `secret` both fail for `shared/trmnl/api_key`) — module lights up when healed.

## Blocked / waiting on Mitch

- Panel focus checklist (only hands): summon → `wifi ⏎` → connect → Esc → Esc → focus
  restored exactly, incl. over a full-screen app.
- Agent monitoring hands-check: attention pulse visual; bar-cell click / `agents ⏎`
  Enter lands in the right tmux pane (plans/done/agent-monitoring.md field notes).
- Anything off in daily use → JOURNAL it, next session fixes.
