# STATUS

> The cursor: where we are right now. Keep this **terse** — a snapshot, not a history.
> History lives in git, `plans/done/`, and `JOURNAL.md`.
>
> Last updated: 2026-08-19

## Where we are

**v0.6.0 in flight (2026-08-20):** everything below the v0.5.0 line ships — widgets +
Module API, bar colours as theme tokens (new `warn`), optical icon sizing, wifi arcs
keep their footprint, General sub-tabs, settings-to-front, widget credentials
(CLI piggyback, `requires`/`setup`, Keychain overrides; OAuth dormant), Hackables →
Config. Branch `worktree-widget-settings` merged; plan in `plans/done/widget-settings.md`.

**v0.5.0 released 2026-08-19** (signed + notarized; docs/releases/v0.5.0.md; fan-out
green: cask 0.5.0, Notion, mitchmalone.com hook). Headline: multi-display, agent
liveness + herdr, colorpicker loupe, lorem, `?` turns. **Post-release the same day, on
main and running (unreleased):** claude's background daemon filtered + subagents in the
hover; awake holds survive relaunch (proved live); the strip went **glyph-only** — wifi
strength arcs, no SSID, no awake timer, battery by lucide tier + colour from the adjusted
charge (see the first three bullets below). launcharr is a keyboard control surface:
launcher + bar + panels + agents + desktop layer, all in Mitch's daily use.

**Widgets landed 2026-08-19 (on main, unreleased — release held by request; running):**
the Module API is real. `~/.config/launcharr/widgets/*.ts` (TypeScript, run under Bun via
`runtime.rs`; any executable also works) answer `manifest`/`tick` JSON; one generic cell +
card renders them; live dir watch; `triggers/widget.<id>`; Settings → Menubar has
Layout / **Custom widgets** sub-tabs (board placement, health, install from URL/file,
tick, remove). Reference set uptime / github-actions / vercel (real API) / trmnl in
`apps/desktop/widgets/`, bundled scripts now `ip.ts` / `json-format.ts` (`.py` retired on
sight). Widget `ok` wears the agent blue; battery on AC at its limit reads as plugged in.
Docs: `docs/WIDGETS.md`, DECISIONS 2026-08-19 ×2, plans/done/widgets.md. **Seen live by
Mitch** (colour feedback applied); still to eyeball: the Custom widgets sub-tab, install
from URL. trmnl is hidden until its key resolves (JOURNAL 2026-08-19).

**Bar colours → theme tokens, 2026-08-19 (on main, running):** one rule — a fine cell is
`fg`; accent = busy, warn/danger = needs you. New `warn` theme token; `--warn`/`--danger`
now in the panel var set. Agents done/idle/unknown fg, working accent, attention danger;
widget `ok` fg; battery charging/good fg; awake armed fg; wifi poor link warn (`wifiTone`).
Wifi glyph no longer shrinks with strength: `WifiStrengthIcon` draws all four arcs and ghosts
the lost ones (lucide's tiers drop arcs); the wifi panel rows use it too. Battery + wifi
are landscape glyphs, so they get `WIDE_ICON_PROPS` (17 px box) to match the cup's visual
height — optical sizing. **Hands-check:** does 17 sit right, or nudge to 16/18?
Settings → General now has sub-tabs General / Color picker / Config (Hackables row renamed
Config). Settings opened from the panel comes to the front (`activation.rs`; JOURNAL
2026-08-19). Local rebuilds are `tauri build --bundles app` — no DMG, no Finder flash.
DECISIONS 2026-08-19. **Hands-check:** eyeball the strip in launcharr + a couple of
themes; is a charging battery < 90 % readable without its blue?

**Widget credentials (2026-08-20, in v0.6.0):** CLI piggyback first (`gh auth token`,
Vercel CLI store), fail-visible: manifest `requires` (prereqs + copyable fix) and tick
`setup` ({message, fix} → dim cell, fix in card + settings row) replace silent `hidden`;
Settings shows a widget's fields only while it needs attention. All three states proven
live (gh token → runs; no gh → setup; stale Vercel CLI → setup). DECISIONS 2026-08-20.

**Widget settings + OAuth (2026-08-19, in v0.6.0):**
manifest `settings[]` → fields in Custom widgets → Keychain (secrets) / `config.widgets`
(plain) → env on tick; `required` gate ("needs setup"); `auth` protocol (JSON lines,
`widget-auth` events). `vercel.ts` = stored token; `github-actions.ts` rewritten onto the
GitHub API with device-flow sign-in (`GITHUB_CLIENT_ID` setting). Both proven by hand
against the real APIs and through Mitch's hands-on rounds (2026-08-20). OAuth is dormant
until a launcharr OAuth App client id is baked into `github-actions.ts`.
DECISIONS 2026-08-19; plan `plans/done/widget-settings.md`.

**Next: the v0.5 scope talk** (ROADMAP "v0.5 — plugins": widget follow-ups, settings-in-panels,
per-monitor workspaces, bar polish, awake loose ends, PANEL_INFO single-source, PRD
revision). Open hands-checks: hover a cell while a session has an Agent running (subagent
lines), the awake "resumed" toast, wifi arcs at 14 px against the theme, unplug/replug a
display. Consider a v0.5.1 for the post-release batch once those pass.

## Shipped and live (v0.5 era — details in plans/done/ + JOURNAL)

- **Awake survives relaunch + Wi-Fi strength glyph, 2026-08-19** (plans/active/awake.md
  slice A, JOURNAL 2026-08-19): armed holds are mirrored to `awake.json` and re-armed at
  launch (deadline ahead / condition / manual ≤ 12 h / same boot), toast + "since
  relaunch" in the panel. Bar wifi cell is glyph-only, four lucide arcs by RSSI
  (`corewlan.rs`, no permission); SSID + "−66 dBm · good" moved into the hover card. Awake
  cell is glyph-only too — elapsed/remaining live in its card. **Battery cell** is
  glyph-only as well: lucide tier + colour from the _adjusted charge_ (the macOS charge
  limit read from `com.apple.powerd.charging.plist` counts as full), blue while charging,
  red tier alone prints the number; card shows the true % and "limit 80%".
- **Daemon filter + subagents, 2026-08-19** (plans/done/agent-daemon-and-subagents.md,
  JOURNAL 2026-08-19): Claude's background daemon (`bg-spare`, pty sessions) no longer
  gets cells — the hook flags `background`, `apply` won't create from it without a prompt.
  Subagents (`SubagentStart`/`SubagentStop`, now in settings.json) ride the parent:
  `subagents[]` on the wire, listed in the hover card, count on the cell, `⑂ N` in
  `agents ⏎`. **Hands-check:** hover a cell while a session has an Agent running.
- **Multi-display, 2026-08-19** (plans/done/multi-display.md, JOURNAL 2026-08-19): a bar
  on every screen and the launcher on the screen under the mouse. New `screens.rs`
  (CoreGraphics reads, CG points; `notch.rs` folded in, keyed by display id) replaces
  Tauri's monitor API, which was silently collapsing both to the primary. Bar windows
  reconcile to screens on a 5 s heartbeat (build / re-frame / hide surplus, live notch
  flag); hover and the dropdown are per-bar. Verified: two bars framed right on Studio
  Display + built-in. **Hands-check:** ⌥Space with the mouse on the built-in, hover
  cards on the second bar, unplug/replug.
- **Ready-column round, 2026-08-17** (plans/done/ready-column-2026-08-17.md, DECISIONS
  2026-08-17 ×4): **`colorpicker`** (the launcharr **loupe** at 2× — own transparent panel +
  `CGWindowListCreateImage` below it, **opt-in via Settings → General → "Use the
  launcharr loupe"**, Screen Recording, invariant 1 reworded — default and fallback is
  Apple's `NSColorSampler`, no prompt unless the toggle is on; `#RRGGBB` on the pasteboard,
  Esc copies nothing) and **`lorem`** (built-in, five
  volumes, semi-random, `lorem.py` retired from the bundle) — both confirm with the new
  **toast** row (frontend `copy_text keepOpen`, Rust `panel::flash`); **`?` agent mode**
  redesigned as turns: first question pinned in the header, transcript below, follow-up
  prompt at the bottom, Claude-style thinking spinner + shimmer verbs — `AskSurface` lives
  in `@launcharr/tui` and the www demo imports it (images in answers declined: invariant
  2); **Settings**: Agents → three sub-tabs, Shortcuts tab removed (config key still
  live), About fleshed out (byline + site/docs/GitHub/releases/X links; brand icons now
  `@launcharr/tui/icons`). **Round 2 (same day):** wifi cell hovers a card (SSID, IP,
  router, DNS, interface — what `dns ⏎` shows; `dns ⏎` stays; click → Wi-Fi settings),
  battery card breathes (padding, 10px clear of the strip, power mode as read-only text
  instead of button-like segments) — all cards share the new spacing. **AeroSpace
  `gaps` now means the visible gap** (`gapPlan`: borders + whichever bar is showing are
  factored in; native menu-bar state read on apply — DECISIONS 2026-08-17).
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
  hotkey-tracked), front app, clock, wifi SSID, battery states — the battery cell **hovers open a card**
  (plans/done/battery-hover-card.md): capacity, time left, cycles, draw, health, and the
  active power mode read-only, click for System Settings → Battery. Hover machinery is
  now shared (`src/bar/hover.ts`), cards declare their own dropdown height.
  Architecture: Rust-pushed snapshots via
  webview eval at 1 Hz + FSEvents triggers dir (`~/.config/launcharr/triggers/` —
  aerospace exec-on-workspace-change touches it; **dotfiles change uncommitted**),
  async commands only, Floating level + constrainFrameRect override (menu bar slides
  over), 15s reframe heartbeat, ~19 MB marginal memory (gate passed).
- **herdr as a second multiplexer, 2026-08-18** (plans/done/herdr-multiplexer.md,
  DECISIONS 2026-08-18): the agent monitor is no longer tmux-shaped. Location fields are
  `mux`/`muxTarget`/`muxGroup`/`muxIndex`/`muxLabel` (tmux session/window ↔ herdr
  workspace/tab), and **`herdr.rs`** reads herdr's socket directly — `session.snapshot`
  on a 1 s cache, `agent.focus` to jump — so every agent herdr detects gets a cell, not
  just the hook-capable ones. herdr agents are read live and never persisted; presence in
  the snapshot _is_ liveness. The Claude hook stands down inside a herdr pane and calls
  `pane.report_metadata` with the prompt instead, so one pane is one cell. Verified live
  against herdr 0.8.0 (workspace "launcharr", agent L2): mapping, grouping, and
  `working`/`done` tracking, plus the title landing in herdr's own record.
- **Agent liveness, 2026-08-18** (plans/done/agent-liveness.md, DECISIONS 2026-08-18):
  agent cells now disappear when the agent does. `list()` reaps a session whose tmux pane
  is gone from a _successful_ `list-panes` read, and a pane-less one whose reported `pid`
  is dead or now runs a different command (`pidComm` fingerprint, stamped at first sight —
  adapter-agnostic, so herdr drops in without touching the reaper). New wire field `pid`
  (hook walks the parent chain; `LAUNCHARR_AGENT_PID` overrides), new `agent_forget`
  command on `⌫`/`x` in `agents ⏎`, agents outside tmux share a dashed box instead of
  floating loose. Hook also stopped mapping `/clear`'s `SessionEnd` to `ended`.
  A session with neither pane nor pid can only be judged on silence, so it gets 15 min,
  not the 12 h `pruneHours` sweep — the fix that finally cleared the field orphan.
  All reaping paths verified live; `⌫` awaits a hands-check.
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
  bar on/off hot-applied + the zone board (see the zone-layouts bullet below).
- **`?` agent mode** (ported 2026-08-16 from the spike-ask-ai branch): press `?` —
  the key flips the mode and is consumed (spike's keystroke-switched modes adopted for
  `!` `?` `:` after all, same day); provider selectable claude|codex (`agents.askProvider`,
  codex via `exec --json --sandbox read-only`, `resume --last` follow-ups). Type a question → streamed conversation with the
  user's own `claude` CLI (caged child: empty cwd, no fs/exec tools — JOURNAL
  2026-08-10), markdown-lite rendering, `--continue` follow-ups, Esc ends. Gated by
  `agents.askMode` ("Enable agent mode", Settings → Agents, off by default); Esc/Backspace
  return to search, mode keys hop directly. Branch kept for reference.
- **Panel framework** (P0): trigger words open keyboard-driven TUI panels in the
  launcher window — metadata in `panels/registry.ts`, components in App.tsx, breadcrumb
  prompt, Esc-stack, panels are storied presentational components + thin invoke
  containers. Tenants: **`wifi ⏎`** (pinned active, known networks Enter-connect, `p`
  power, **`s` scan** via async `system_profiler` — no Location Services, JOURNAL
  2026-08-16 — with masked-password join for unknown secured networks), **`dns ⏎`**,
  **`audio ⏎`** (output/input volume sliders ←→, device lists Enter-switches via
  hand-rolled CoreAudio FFI in coreaudio.rs, `m` mute), **`clipboard ⏎`** (TwoPane:
  search + history left, preview right, ⌘⌫ delete; `clip` inline rows remain), and
  **`help ⏎`** (filterable reference: modes, keys, panels, commands, scripts,
  quicklinks), and **`ss ⏎` screenshots** (2026-08-17, plans/done/screenshots-panel.md:
  newest-first thumbnail grid of the capture folder, ↵ copies the file for ⌘V into an
  agent, ⌘↵ reveal, ⌘⇧↵ open, pages of 24 — the first grid/scrolling panel; DECISIONS
  2026-08-17). Wifi commands ×5 + audio ×4 + screenshots ×3 in Rust.
- **2026-08-16 polish wave**: launcharr theme repainted (#1C1D2A ground, #B5B9D9/
  #73747C fg/dim; accent stayed #FF6B8C after an #FF176C detour); lucide icons in the
  bar (wifi/battery), launcher panel rows, and panel internals (wifi strength tiers
  from scan dBm, speaker/headphones/mic device glyphs); panel keywords fuzzy-match
  like apps (`usag` → Usage, panel-kind index items); frecency = launches in past
  5 days, multiplier cap 2.0 — `code` learns VS Code (DECISIONS 2026-08-16).
- **Notch profiles + zone layouts** (DECISIONS 2026-08-16 ×2): per-display notch
  detection (`NSScreen.safeAreaInsets`, notch.rs); `bar.layout` is explicit zones
  (left/center/right, clock ordinary) with optional `bar.notchedLayout` (no center
  zone; absent → derived, center folds into right head); legacy flat lists migrate
  at load. Settings → Menubar is a full-width drag zone board (columns per zone, both
  profiles; ✕ retires a widget to a tray, dragging back restores — DECISIONS
  2026-08-16). Bar disable now hides panels instead of destroying
  (destroy = SIGABRT, JOURNAL 2026-08-16); tmux layout cache keeps only successes
  so agent borders survive cold start.

- **launcharr.com redesigned** (plans/done/www-redesign.md, DECISIONS 2026-08-16):
  repositioned from "an app launcher for pirates" to **the keyboard control surface for
  macOS** — the v0.5 story now has a site. New `/docs` route (scripts protocol, config,
  panel triggers, uninstall); the demo grew the bar strip, agent hover cards, `?` ask
  mode and live `wifi`/`dns`/`usage` panels. Two architecture changes: `apps/www` adopts
  **shadcn/ui** (tokens mapped onto the launcharr vars, never imported; Radix only for
  Tabs), and the site now consumes **`@launcharr/tui`** so the demo panels are the
  shipping components — `src/lib/demo-themes.ts`, a hand-copy that had already drifted to
  the retired `#ff176c`, is gone. **`packages/tui` is multi-consumer now**: www typecheck
  catches kit changes. Site copy is fact-checked against the repo; the design guide's
  `~90MB` (main-process RSS, not the whole app) and `bar.modules`/clock-anchor claims were
  corrected on the way in. **Review caught the bar strip / agent cells / hover card built
  from the design export instead of `bar/{main.tsx,bar.css}`** — wrong cell colors
  (`--dim` where `.bar-cell` is `--fg`), pink instead of theme accent, broken hover, and
  `blocked` used as a state key when the wire name is `attention`. Fixed, and the lesson is
  now **AGENTS invariant 10** (the site demos the real thing, never a replica —
  DECISIONS 2026-08-16). `packages/tui` also gained a `./themes` entry point: server
  components can't import the barrel (JOURNAL 2026-08-16). **The bar chrome now lives in
  `packages/tui/src/bar/`** (plans/done/bar-extraction.md): Mitch made "no second copy of any
  launcharr UI" a hard rule, invariant 10 lost its port-with-a-comment escape hatch, and
  `bar/main.tsx` became a thin container while `apps/www` imports the same components. The
  kit owns the strip, cells, cards, `bar.css` and the pure formatters; the app keeps every
  `invoke`, `window.__notched`, zone resolution and its window chrome.

## In progress / next (ROADMAP B2–B4, P1)

- **`awake` keep-alive sessions** (plans/active/awake.md — retire Amphetamine +
  Caffeinated): **slices A–D shipped** — in-process assertions (`power.rs`, release on
  drop/quit/crash), `awake ⏎` panel (form: what stays on / until / rails, two-keystroke
  arm), grammar (`awake 2h`, `awake until 6pm`, `awake while agents`, `awake off`),
  trigger reducer in `@launcharr/core/awake` (agents/app/power/ssid/display/busy, all
  hysteresed, exhaustively tested), Rust watchdog rails (deadline + battery floor), bar
  coffee cell + hover card with the "also keeping this Mac awake" list. Four `awake_*`
  IPC commands total (DECISIONS 2026-08-16 ×2). **Both Amphetamine and Caffeinated quit
  in favour of awake, 2026-08-17 — working in real use.** **Outstanding**: the timed
  agents-idle release observed end-to-end, lid-closed-on-AC measurement (needs a human
  lid), slice E deferred.
- Panel tenants: `sysinfo`, then **settings migrated off the native window** (the big
  one); drill-down panel menu once 3 tenants exist.
- Bar: per-workspace app hints; bluetooth glyph (audio + battery shipped 2026-08-16);
  NSWorkspace observer for event-driven front-app; multi-display fix (JOURNAL
  2026-08-15 — notch detection assumes NSScreen order matches monitors, revisit
  together); placement config (notched profiles shipped, plans/done/bar-zones-and-arranger.md).
- **v0.4 desktop layer — shipped in 0.4.0** (plans/done/v0.4-desktop-aerospace-borders.md,
  DECISIONS 2026-08-17 ×3): `@launcharr/core/desktop` renders `aerospace.toml` + borders
  flags, Rust `deps.rs`/`desktop.rs`, Settings → Desktop with sub-tabs (AeroSpace +
  JankyBorders / macOS adjustments), "Let launcharr manage AeroSpace" with the unmanaged
  hand-offs (edit / use my own via symlink / save a copy — `desktop_toml`), borders ride
  on tiling, `aerospace ⏎` panel. Module API (B4) → v0.5.
- **0.4 feedback round (2026-08-17)** all landed: settings tabs clear of the traffic
  lights, Search+Links → Quicklinks, scrollbar at the window edge, 760px wide, sub-tabs,
  HTML DnD fixed on the zone board (wry file-drop hook — JOURNAL), `ss ⏎` screenshots
  panel (first grid + scrolling panel), TRMNL removed pending the plugin API.
- Saved for last by request: vercel / GitHub Actions / uptime bar modules.
- Housekeeping (Mitch): commit the aerospace.toml triggers change in dotfiles; prune
  sketchybar config there when confident.
- TRMNL battery module **removed 2026-08-17** (personal; returns later as a plugin once
  the module API exists — DECISIONS 2026-08-16 carve-out stays as history).

## Blocked / waiting on Mitch

- **Ready-column hands-check** (plans/done/ready-column-2026-08-17.md): `colorpicker ⏎`
  — default = Apple's sampler; flip Settings → General → loupe to compare (first pick
  prompts for Screen Recording → grant → relaunch → 2× loupe), loupe over a full-screen app, click copies + toast,
  Esc copies nothing; `lorem` → five
  rows → Enter copies + toast auto-hides with focus returned; `?` conversation keeps the
  input focused across turns; Settings → Agents sub-tabs / About links open in the browser.
- **0.4.0 hands-check leftovers** (released; these are the bits only hands can feel):
  Settings → Desktop → uncheck manage → "use my own config…" / "save a copy to edit…"
  dialogs; `ss ⏎` → ⌘V lands in claude.ai _and_ Claude Code; the fresh-profile smoke ran
  by script (config recreated, hint summoned, cold 152 ms) — a human eyeball on it is
  still worth one minute.

- Panel focus checklist (only hands): summon → `wifi ⏎` → connect → Esc → Esc → focus
  restored exactly, incl. over a full-screen app.
- New-panel hands-check (plans/done/omarchy-panels-and-polish.md checklist): wifi `s`
  scan + secured join, audio slider steps + device switch audibly lands, clipboard
  copy-on-Enter dismisses, help filter, bar icons legible in all themes.
- Zone-board hands-check (plans/done/bar-zones-and-arranger.md checklist): drag
  between zones + retire/restore via the tray, notched vs external placement,
  bar off/on toggle survives.
- Agent monitoring hands-check: attention pulse visual; bar-cell click / `agents ⏎`
  Enter lands in the right tmux pane (plans/done/agent-monitoring.md field notes);
  `⌫` dismisses a row (specimen left in the store: the 2026-08-18 field orphan).
- Anything off in daily use → JOURNAL it, next session fixes.
