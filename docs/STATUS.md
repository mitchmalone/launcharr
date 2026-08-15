# STATUS

> The cursor: where we are right now. Keep this **terse** — a snapshot, not a history.
> History lives in git, `plans/done/`, and `JOURNAL.md`.
>
> Last updated: 2026-08-15

## Done

- **v1 shipped and human-verified** (2026-08-08): panel/focus dance, index + fuzzy + frecency,
  bang mode, config, instrumentation, launch-at-login, first-run hint. Budgets: cold start
  157ms, native summon 3.7ms, RSS ~90MB. Plans in `plans/done/`.
- **v1.1 built overnight** (2026-08-08, Sol parity — scope in DECISIONS, contract in
  `docs/SCRIPTS.md`):
  - **Script protocol** (v2 pulled forward): `~/.config/launcharr/scripts/`, manifest/query,
    FSEvents-watched. Bundled: `lorem`, `json` (format clipboard), `ip` (local only).
  - **Clipboard history**: `clip` trigger, copy-on-Enter, concealed types never recorded,
    SQLite cap 200, `clip clear`.
  - **Inline math**: arithmetic query → result row → Enter copies.
  - **Custom links + custom shortcuts** in config.json, hot-reloading.
  - PRD rewritten to v1.1; grammar is now the full dispatch table (`!` + trigger words).
  - All machine-verifiable paths tested live; 41 TS + 24 Rust tests green.
- **Installed**: `/Applications/launcharr.app` running with all of the above.
- **Menubar icon** (2026-08-09): template pirate-flag NSStatusItem with summon/config/
  scripts/reindex/quit menu — the future settings gateway. Icon regenerates via
  `cargo run --example make_tray_icon` from `design/menubar-icon-source.png`. Accessory
  policy unchanged (no Dock icon). Eyeball check: icon crispness + dark/light menubar.

## Done (latest)

- **v1.2 release core — v0.2.0** (2026-08-09): system commands (sleep displays et al),
  ⌥⏎ secondary actions (+ script `altAction`), opt-in bookmarks, `:emoji` picker,
  settings window over config.json, README + RELEASING.md. File search deferred by choice.
  Plan: `plans/done/v1.2-release-core.md`. **Release blocked only on signing** — needs
  Mitch's Apple Developer ID (checklist in `docs/RELEASING.md`).

- **Add-quicklink flow + favicons** (2026-08-09): URL detected → Open / Add quicklink…;
  two-step mini-form (name → browser: default or any installed browser); saved to config
  `links`; favicon fetched once at add time preferring apple-touch-icon/sized PNGs over
  .ico (network carve-out in DECISIONS — core stays otherwise zero-network). Esc backs out
  of the form before dismissing. Plan: `plans/done/add-quicklink-flow.md`.

- **URLs + search + quicklinks** (2026-08-09): URL-ish queries get an "Open ▸" top row;
  dead-end queries offer "Search Google for …" (Alfred-style, engine configurable via
  `searchFallback`); `links` entries with `trigger` + `{query}` are Raycast-style
  quicklinks (`yt cute otters ⏎` — example seeded in config). Plan:
  `plans/done/urls-and-search.md`.

## Done (latest)

- **Settings native polish** (2026-08-10): autosave (no Save button, echo-guarded against the
  watcher loop), Lucide toolbar tabs, hidden titlebar (`Overlay` + hidden title, tab strip
  drags), press-to-record hotkey pills for summon + custom shortcuts, two-column native rows,
  green demoted to sigil-glyph-only. New dep: `lucide-react`. Decision + gotcha logged.
  Plan: `plans/done/settings-native-polish.md`. **Needs eyeball pass** (see checklist).
- **Brand colors + flat toggles + bare-trigger quicklinks** (2026-08-10): new app-icon SVG on
  About; settings on icon-blue `#1c1d2d` with pink `#ff6b8c` accents; flat accentless
  checkboxes/radios; `chill ⏎` → site root, `chill captain hook ⏎` → templated search.
- **Home + themes** (2026-08-10): home stays `~/.config/launcharr` (briefly `~/.launcharr`,
  reversed same day — DECISIONS; auto-migration heals either direction); tray slimmed,
  config/scripts buttons in settings (new `open_path`
  command — DECISIONS); theme system with 14 built-ins (launcharr, dracula, terminal, amber CRT, catppuccin, gruvbox, monokai, nord, one-dark, rose-pine, solarized, solarized-light, synthwave, tokyo-night) +
  user themes in config.json, hot-applied to panel and settings. The panel now wears the
  brand palette by default. Plan: `plans/done/config-home-and-themes.md`.
  **Needs eyeball pass:** theme switch restyles both windows live; migration kept config +
  scripts working; Hackables buttons open the right things.

- **Project restructure + release pipeline** (2026-08-10): parent dir now holds the app
  repo (`launcharr/`) and website repo (`launcharr-web/`, Next.js/Vercel) side by side —
  rules in parent CLAUDE.md. `scripts/release.sh` is the deterministic release: gates →
  bump → build (app+dmg) → sign/notarize → verify → smoke-test gates → tag → GitHub
  Release → website release.json push → cask bump. Notes-file-first (docs/releases/).
  Blocked on: Developer ID cert, notary profile, tap repo, LICENSE pick (checklist in
  RELEASING.md). Plan: `plans/done/project-restructure-and-release-pipeline.md`.

- **v0.3.0 RELEASED** (2026-08-10, unsigned interim): first public release — repo made
  public, GitHub Release (zip/dmg/SHA256SUMS), tap live (`brew install
mitchmalone/launcharr/launcharr` verified end-to-end), launcharr.com flipped to
  Download, Notion Version row + mitchmalone.com deploy hook fired (release.sh step 10).
  Shipped `--unsigned` because Apple's first-submission review exceeded an hour.
- **v0.3.1 RELEASED, signed + notarized** (2026-08-10): identical features, Developer ID
  signed, `spctl` accepted (`source=Notarized Developer ID`). Full pipeline incl. new
  step 10 (Notion Version row + mitchmalone.com hook). Mitch runs the brew-managed 0.3.1.
  `?`-mode AI spike in progress on `worktree-spike-ask-ai` (see its JOURNAL entries).

- **Jig reconciliation — one monorepo** (2026-08-11): launcharr-web absorbed as `apps/www`
  (old repo archived), app moved to `apps/desktop`, shared engine extracted to
  `packages/core` (@launcharr/core — matcher/grammar/ranking/rows/emoji/math/url/types;
  the web hand-ports and the port-don't-fork invariant are gone). One verify gate
  (`pnpm verify`), CI (`verify.yml`) + tag-triggered release fan-out (`release.yml`:
  tap/Notion/deploy-hook, each no-oping without its token). `release.sh` keeps only the
  local physics (sign/notarize/smoke), pushes main, and `gh release create` mints the tag.
  AGENTS.md canonical (CLAUDE.md is a pointer), jig standard vendored at
  `docs/STANDARDS.md`, deviations in `DEVIATIONS.md`. Site state at merge: mock-macOS
  desktop demo, theme switcher, monochrome accent + CTA pink, release.json-driven install
  section — live at launcharr.com. Plan: `plans/done/jig-reconciliation.md`.

## Done (latest)

- **v0.5 slice 1 — TUI kit + bar spike** (2026-08-15): direction decided (DECISIONS
  2026-08-15: own bar, wrapped/vendored Aerospace, modular install, NOT a distro; ROADMAP
  B0–B4). `packages/tui` shipped: Omarchy-inspired component kit (Panel, rows, hotkeys,
  Slider/Toggle/Segmented/Meter, Calendar with ISO weeks, TwoPane, prompt, useListNav) —
  nav logic TDD'd (23 tests), gallery via `pnpm --filter @launcharr/tui gallery`.
  Bar spike shipped behind `bar.enabled` (default off): status-level non-activating
  NSPanel strip, workspaces (aerospace CLI) + clock + battery via one `bar_snapshot`
  command. **Memory gate PASSED: bar costs ~19 MB marginal** (shares the WebKit pool;
  numbers + gotchas in the plan file and JOURNAL). Mitch's config left bar-off.
  Plan: `plans/done/v0.5-tui-kit-and-bar-spike.md`.
  **Eyeball checklist:** run the tui gallery (keyboard nav feel).
- **Bar daily-drivable + enabled** (2026-08-15, same day): clickable workspace cells
  (`bar_switch_workspace`), front-app cell (lsappinfo), themed via the panel token vars.
  `bar.enabled` is ON in Mitch's config; Sketchybar stopped by Mitch (revert:
  `brew services start sketchybar`).
- **Bar hardened + Omarchy-flat, Mitch-verified "perfect"** (2026-08-16): async commands
  (sync spawns were janking the main thread AND backing up the aerospace server — 6s CLI
  latency), one aerospace round-trip per tick, event-driven refresh via FSEvents-watched
  `~/.config/launcharr/triggers/` (aerospace exec-on-workspace-change touches it —
  dotfiles change, uncommitted there), Rust-pushed snapshots via webview eval (WebKit
  throttles JS timers in never-focused windows; app.emit never reached the panel
  webview), Floating level + constrainFrameRect override so the native menu bar
  hover-slides over the bar at y=0, 15s reframe heartbeat for display changes, and the
  final boss: the focus indicator that "never worked" was a CSS specificity bug masked
  by :hover (full hunt in JOURNAL 2026-08-16). Design is Omarchy-flat: sigil, dim
  numbers, solid light block for the active workspace.

- **Simple bar modules shipped** (2026-08-16): wifi (Sketchybar SSID chain ported —
  ipconfig getsummary → networksetup → WiFiAgent heuristic, `WIFI_HOME_SSID` env;
  red Offline), TRMNL device battery (decrypt-helper token, fail-soft: hidden without
  token — note: token currently unresolvable via age helper AND infisical `secret`;
  module lights up when the secret chain heals), battery charging/low-color states +
  desktop AC case, Sketchybar clock format. `bar_modules.rs` refresh threads (20s/300s)
  keep HTTP off the 1 Hz push loop. Network carve-out: DECISIONS 2026-08-16.
  Plan: `plans/done/bar-simple-modules.md`. **Eyeball:** wifi label, TRMNL absent,
  battery colors when unplugged below 50/20%.

## In progress

- **v0.5 next slices** (ROADMAP B2–B4): per-workspace app hints in the cluster;
  right-side glyph set (wifi/bluetooth/sound — starts the per-module permissions
  conversation, DECISIONS 2026-08-15); NSWorkspace observer for event-driven front-app
  changes; multi-display enumeration fix (JOURNAL 2026-08-15); bar placement config +
  notched/notchless profiles; Aerospace vendored wrap + adopt-or-stop migration;
  panels + module API + agent bar. Housekeeping: commit the aerospace.toml trigger
  change in dotfiles; remove the sketchybar trigger config there when settled.
- **Settings eyeball checklist** (only hands can verify): traffic lights sit right over the
  tab strip; window drags by the strip; recorder captures ⌘⇧S-style chords and Esc cancels;
  edits hot-apply with no Save; hand-editing config.json live-updates the open window.
- **Mitch's morning checklist** (the parts only hands can verify):
  1. `lorem 2 ⏎` → paste somewhere. `json` with JSON on the clipboard. `ip ⏎`.
  2. `2*(14.5+3)` → `= 35` top row, Enter, ⌘V.
  3. Copy a few things, then `clip` → filter → Enter → ⌘V. `clip clear` too.
  4. Add a link + a shortcut to config.json (examples in PRD §5.4) and try both.
  5. Drop any executable answering `manifest`/`query` into scripts/ — trigger goes live,
     no restart (`docs/SCRIPTS.md`).

## Next

- Fixes from the checklist; features ship whenever — daily use is the judge.
- While living with it, watch: per-keystroke script latency feel, clip privacy comfort, whether
  deferred items (Translate, Calendar, public IP) earn a PRD revision.

## Blocked / waiting on Mitch

- The checklist above. Anything off → JOURNAL it, I fix.
