# DECISIONS

> Append-only log of decisions with reasoning so choices aren't relitigated. Dated entries,
> **newest at the top.** Lightweight ADR format. The standing stack lives in `CLAUDE.md`.

---

### 2026-08-16 · Notch profiles + arranger; bar disable hides, never destroys

- **Decision (notch).** Notch detection is automatic per display —
  `NSScreen.safeAreaInsets.top > 0` (notch.rs; safe objc2 API, no new crate, no
  permission). The bar gains an optional second arrangement `bar.notchedModules`
  (None → main `modules` applies everywhere); each bar window learns its profile via
  an initialization script (`window.__notched`). Under a notch the absolute center is
  the camera housing, so notched bars render the clock at the head of the right
  cluster instead of mid-strip.
- **Decision (arranger).** Settings → Menubar's up/down buttons are replaced by an
  HTML5 drag-to-reorder list with per-module show/hide, duplicated for the notched
  profile behind a "separate arrangement" checkbox (seeded from the main list).
  Module normalization now lives once in `lib/config.ts` (`normalizeBarModules`),
  shared by the bar renderer and settings.
- **Decision (crash fix).** `bar.enabled` off now _hides_ the bar panels;
  `window.destroy()` on the NSPanel subclass raised an ObjC exception that crossed
  tao's run-loop observer and aborted the process (crash report 2026-08-16 15:18,
  `__rust_foreign_exception`). Hidden panels idle — the push loop skips invisible
  windows — and re-enable shows them again. Cost: a toggled-off bar keeps its webview
  resident until restart; fresh installs with the bar off never create it.
- **Also.** The launcharr accent reverted to `#ff6b8c` (Mitch: `#FF176C` reads too
  red); the 2026-08-16 ground/fg/dim repaint stands. `tmux_layout` caches successes
  only, so a failed `list-panes` spawn at cold start no longer paints agent cells
  without their session borders for the first seconds.

### 2026-08-16 · Omarchy panel wave: audio + clipboard + help tenants, wifi scan, fuzzy keywords, 5-day ranking

- **Decision (IPC).** Five commands join the surface: `wifi_scan`, `audio_status`,
  `audio_set_volume`, `audio_set_muted`, `audio_set_default`; `wifi_connect` gains an
  optional password argument (validated like SSIDs — no leading dash, bounded length).
- **Decision (wifi scan without Location Services).** The P0 stance "scanning needs the
  Location opt-in" is reversed without spending a permission: `system_profiler
SPAirPortDataType -json` reports nearby SSIDs + security + signal with no TCC prompt.
  It takes ~7 s, so the command is async, one-shot per keypress, spinner in the panel.
  Joining an unknown secured network gets a masked password step (TextPrompt `secret`).
- **Decision (audio, no new crates).** Volumes ride `osascript` (`get/set volume`);
  device enumeration + default switching use the CoreAudio property API via ~5
  hand-declared FFI calls in `coreaudio.rs` (dedicated unsafe module, safety comment per
  block) rather than a binding crate. Permission-free on both paths. Volume applies to
  the default device — same behavior as the hardware volume keys.
- **Decision (clipboard panel).** `clipboard ⏎` opens a TwoPane tenant (search prompt,
  history left, full-text preview right) over the existing `clips` backend; `clip`
  inline rows stay. Text-only, like the store (PRD §5.6) — image capture is a separate
  weight decision, not taken here.
- **Decision (help panel).** `help ⏎` renders the command reference (modes, keys,
  panels, system commands, scripts — `ScriptInfo.description`'s first consumer,
  quicklinks). Panel metadata moved to `panels/registry.ts` (pure) so help and the
  keyword items read it without importing the app shell.
- **Decision (fuzzy keywords).** Panel trigger words become rankable `panel`-kind items
  (`usag` → Usage) through the same `rank()`; exact tokens still dispatch via the
  grammar, so invariant 4 stands.
- **Decision (ranking, Mitch).** The frecency signal becomes "launches in the past
  5 days" (1.0 in-window, 0.1 residual) and the multiplier cap moves 1.5 → 2.0 so a few
  days of launching VS Code beats Codex on `code`. This half-reopens the 2026-08-08
  acronym-vs-prefix worry (JOURNAL) — accepted deliberately: learned preference is now
  _supposed_ to override the default textual order; watched in daily use.
- **Also.** launcharr theme repainted (#1C1D2A / #FF176C / #B5B9D9 / #73747C, mirrored
  in www demo-themes); bar wifi + battery cells draw lucide-react icons (custom
  Lucide-style brand icons can join with the same `ICON_PROPS`).

### 2026-08-16 · `?` agent mode ported; `ask` joins the IPC surface; prefix keys become mode switches

- **Decision (IPC).** One command joins the surface: `ask(prompt, continue_conversation)`
  — spawns the user's own agent CLI (claude or codex per `agents.askProvider`) from a
  caged cwd and streams raw stdout lines to the frontend as `ask-chunk` events; parsing
  is TypeScript's job. Gated by `agents.askMode` (off by default), checked in the command
  itself as well as the UI. launcharr still makes zero network requests here — the
  user's CLI does, on their credentials (same family as the iTerm2 hand-off).
- **Decision (interaction).** Prefix keys (`!` `?` `:`) pressed on an empty prompt now
  switch mode and are consumed; Esc/Backspace return to search, mode keys hop directly.
  This adopts the spike-ask-ai branch's keystroke-switched model (initially skipped in
  the port, requested by Mitch the same day). Pasted prefixed text still parses through
  the grammar, so invariant 4's first-char dispatch remains the substrate.
- **Why.** The spike proved the streaming, caging (TCC inheritance — JOURNAL
  2026-08-10), and markdown surface in July; the panel-framework era made porting cheap.
  Codex support reuses the same spawner with `exec --json --sandbox read-only` +
  `resume --last` (verified against codex-cli 0.147); its cage is weaker than claude's
  (no per-tool disallow flag) — watched in daily use.

### 2026-08-16 · Limits credentials: consent capabilities, not source pickers

- **Decision.** The per-provider source _selects_ (same day, below) are replaced by
  boolean consent toggles — `agents.claudeCreds` / `agents.codexCreds`, "launcharr may
  read the CLI's stored credentials". Source selection and fallback order belong to the
  code: Claude tries the credentials file first (silent, expiry-checked) and the
  keychain second (macOS prompts; last so a denied prompt can't re-fire every scan);
  Codex tiers live fetch → last-good → this device's session snapshot. A `LAST_GOOD`
  cache serves stamped stale limits ("as of 14m ago — offline") through transient
  failures. A future own-sign-in capability can join as another boolean.
- **Why.** Discussed with Mitch 2026-08-16: users should grant capabilities and get the
  best available data, not pick implementation details (the file-vs-keychain choice
  already mispicked once — the file was 5 days stale). Own-OAuth was considered and
  deferred: it makes launcharr a token custodian for near-zero marginal reliability;
  the last-good cache buys most of the resilience for a fraction of the surface.

### 2026-08-16 · Account limits join the usage monitor: opt-in HTTPS, opt-in credentials (invariant 2 amended)

- **Decision.** The usage panel's primary question — "how soon am I limited?" — is
  answered by the providers' own endpoints (`api.anthropic.com/api/oauth/usage`,
  `chatgpt.com/backend-api/wham/usage`), because the windows are account-wide and
  server-computed; local journals can't see other devices (Mitch's openclaw boxes share
  the Codex account). Everything is opt-in in the new Settings → Agents tab: the usage
  monitor itself, then per-provider credential sources — Claude
  `off | credentialsFile (~/.claude/.credentials.json) | keychain (via /usr/bin/security,
macOS consent prompt)`, Codex `off | authFile (~/.codex/auth.json)`. **launcharr never
  refreshes or writes another app's tokens** — expired → a visible "run the CLI" note.
  Invariant 2 gains this as its second carve-out. Local monitoring also becomes opt-in
  (`agents.monitor`, prune window + show-idle options), and `bar.enabled` +
  `bar.modules` (ordered, clock as center anchor) are Settings-managed and hot-applied.
- **Why.** Mitch approved HTTPS for this use-case (2026-08-16); the alternative
  mechanisms CodexBar uses (browser-cookie decryption, PTY-scraping the claude TUI,
  token refresh with keychain rewrite races) are exactly what the invariants exist to
  keep out. Off-by-default keeps the fresh-install posture identical to before.

### 2026-08-16 · Usage monitor is local-only: journals, not APIs

- **Decision.** The `usage ⏎` token monitor (CodexBar-inspired) reads only the journals
  the agent CLIs already write — `~/.claude/projects/**/*.jsonl` (per-message usage,
  deduped by message id across session forks) and `~/.codex/sessions/**/*.jsonl`
  (`token_count` totals + the local `rate_limits` snapshot). One command joins the IPC
  surface: `usage_status`, returning a cached report and kicking a background rescan
  when stale (per-file cache keyed by len+mtime; measured 110ms cold / 12ms warm over
  ~98MB).
- **Why.** CodexBar gets richer data via OAuth APIs and browser-cookie decryption — both
  unthinkable under invariants 1–2. The journals carry everything the panel needs, and
  local-only means the panel works offline and adds zero attack surface. Providers are
  data-driven; more can join without new architecture.

### 2026-08-16 · Agent monitoring absorbed: launcharr owns the agent-status socket

- **Decision.** launcharr replaces `sketchybar-agent-status` (Go daemon + sketchybar
  widgets). A Rust listener owns a unix socket at
  `${XDG_STATE_HOME:-~/.local/state}/launcharr/agents.sock` speaking that project's
  newline-JSON event protocol unchanged (`{session, agent, state, title, detail, tmux}`;
  `ended` deletes, blank fields inherit). Claude Code hooks emit via an in-repo adapter
  (`apps/desktop/hooks/claude-status.sh`); the Go launchd daemon is booted out (revert
  path in plans/agent-monitoring.md). Sessions idle >12 h are pruned — the old daemon
  accumulated forever.
- **Decision (IPC).** Two commands join the surface: `agents_status` (panel list) and
  `agent_jump` (tmux switch-client/select-window + `open -a` the configured terminal).
  The bar itself needs no new command — agents ride the existing pushed snapshot.
- **Why.** The bar replaced every other sketchybar module already; agent status was the
  last holdout, and its socket→state→push shape is exactly the bar's architecture. Keeping
  the wire protocol means any future adapter (Codex etc., B4) is just another emitter.
  The socket is local IPC, not network — invariant 2 holds.

### 2026-08-16 · Panel framework: trigger words open TUI panels; four wifi commands

- **Decision (framework).** Trigger words can now open full keyboard-driven TUI panels
  inside the launcher window (`wifi ⏎`): a `panelMode` state renders a tui-kit panel in
  place of the results list, the prompt collapses to a breadcrumb, Esc pops panel →
  prompt → dismiss. Panels are presentational components (workbench-storied, no tauri
  imports) plus a thin container owning invokes. JS timers are permitted in panel
  containers — panels exist only in the key window, which WebKit doesn't throttle
  (contrast: the bar, JOURNAL 2026-08-16).
- **Decision (IPC).** Four commands join the surface for the wifi panel: `wifi_status`,
  `wifi_known_networks`, `wifi_connect`, `wifi_set_power` — thin async wrappers over
  networksetup/ipconfig/route/scutil with tested parsers (wifi.rs). Permission-free by
  scope; network scanning (Location Services) deliberately excluded — trigger recorded
  in the plan.
- **Why.** Super+Space grows from launcher to control surface (P0/P1 on the ROADMAP);
  wifi first because it exercises list + live data + real actions + failure states.

### 2026-08-16 · First bar-module network carve-out: TRMNL device battery

- **Decision.** The TRMNL bar module polls `https://trmnl.com/api/devices` every 5
  minutes with the user's own API token — the first exercise of the per-module network
  renegotiation reserved in the 2026-08-15 entry. Scope is tight: the module is inert
  without a token (resolved via `TRMNL_API_KEY` or the age/secret decrypt helper the
  Sketchybar module used); no token → no cell, no request. Token present but API down →
  visible error state, never silent. Launcher core and every other bar module remain
  zero-network.
- **Why.** Parity with the retired Sketchybar setup; the module only exists because the
  user provisioned a credential for exactly this purpose — that provisioning is the
  consent. Vercel/GitHub/uptime modules (deliberately saved for later) will follow the
  same shape: credentialed, cadenced, fail-visible.

### 2026-08-15 · v0.5 direction: launcharr grows a menubar replacement — own bar, wrapped Aerospace, TUI kit

- **Decision (scope).** The next major version (jumping to 0.5) adds a **menubar
  replacement** and a **nicely wrapped Aerospace integration** to launcharr. This is
  launcharr evolving, not a new product and explicitly **not a distro**: menubar
  replacement + app launcher + config, wearing an Omarchy-inspired TUI-styled look.
  Anything distro-shaped (managing terminals, editors, dotfiles at large) is a non-goal.
- **Decision (build vs wrap the bar).** We build our own bar; we do **not** wrap
  Sketchybar. Rationale from the pressure test: launcharr already owns the hard window
  layer (tauri-nspanel, status-level non-activating windows, M0 focus discipline); we'd
  bypass Sketchybar's layout engine anyway (React on a character grid is the product);
  its popups can't render our rich TUI panels; and our Rust core has to gather all module
  data either way — the wrapper reduces to serializing our own data into `--set` calls
  against a vendored GPL binary, plus a permanent visual seam between an AppKit bar and
  webview popups. **Gate:** a memory spike must show acceptable resident cost for an
  always-visible webview bar before the bar milestone proceeds past spike stage.
- **Decision (Aerospace).** Wrapped, never rebuilt — it is irreplaceable behavior, not
  replaceable rendering. Ship an opinionated generated config, vendor a pinned release
  binary under launcharr's own directory (not via the user's Homebrew), supervise the
  process, integrate via CLI + `exec-on-workspace-change`. Aerospace's Unix socket stays
  off-limits (unofficial/unstable). Users never see Aerospace config; launcharr's config
  is the only surface. Existing-install coexistence needs an adopt-or-stop migration in
  the installer (not in this slice).
- **Decision (modularity).** Install-time and settings-time choice of any combination of:
  app launcher, menubar replacement, Aerospace integration. Launcher-only launcharr keeps
  working exactly as today.
- **Decision (TUI kit).** A complete TUI-like component library (`packages/tui`,
  Omarchy-inspired: charcoal panels, thin light borders, monospace two-column menus,
  keyboard-first) becomes the shared UI substrate for the bar, its panels, menus, and
  future mini-apps. Own components in the webview; never wrap a real terminal for chrome.
- **Invariants.** Zero-network and zero-permissions **hold for the core and for this
  slice** (bar spike needs only IOKit battery, the clock, and the Aerospace CLI). They
  will be renegotiated per-module when a module demands it (wifi SSID → Location Services,
  calendar → EventKit), as visible opt-ins — recorded then, not now.

### 2026-08-12 · One shared Homebrew tap for all projects — homebrew-launcharr retired

- **Decision.** launcharr's cask moves into `mitchmalone/homebrew-tap` (beside beeptui's
  formula); `mitchmalone/homebrew-launcharr` is archived. Install command becomes
  `brew install mitchmalone/tap/launcharr`. One tap per person scales to N projects with
  one satellite repo and one push credential (`HOMEBREW_TAP_TOKEN`, shared value, stored
  per app repo); per-project taps were an accident of history. Historical docs/release
  notes keep the old command — they record what was true at the time.

### 2026-08-11 · One monorepo per product (jig reconciliation) — supersedes the two-repo layout

- **Decision (topology).** The 2026-08-10 two-repo layout is dissolved: `launcharr-web` is
  absorbed as `apps/www` (snapshot import; history stays in the archived repo), the app
  lives at `apps/desktop`, and the shared engine is a workspace package `packages/core`.
  Per the jig standard: the sibling-repo arrangement duplicated tooling and forced
  hand-synced ports that a workspace package dissolves. The only external repo is the
  generated satellite tap. The umbrella dir and its CLAUDE.md are gone.
- **Decision (engine).** `@launcharr/core` (matcher, grammar, ranking, rows, emoji, math,
  url, types) is imported by both apps. The app's implementations are canonical — the web
  forks and the "port, don't fork" invariant are deleted. The website contains zero engine
  logic; its demo maps core rows to presentation only.
- **Decision (release split).** "The release IS a script" becomes "the release is the
  script + the tag workflow": local script keeps what physics demands (keychain signing,
  notarization, interactive smoke tests), pushes main, and `gh release create` mints the
  tag remotely — so the fan-out workflow (tap Cask bump, Notion version, mitchmalone.com
  deploy hook; each no-oping without its token) fires with the release already published.
  The release commit now carries `apps/www/src/lib/release.json`; CI fails the release if
  it disagrees with the tag rather than pushing corrections.
- **Absorbed from launcharr-web's DECISIONS.md** (dates preserved, file deleted with the
  repo): 2026-08-10 site consumes generated release.json (now invariant 9 in AGENTS.md);
  2026-08-09 CTA uses GitHub's button greens, not the design's accent green; 2026-08-09
  demo logic as tested pure modules (now subsumed by `packages/core`); 2026-08-09 static
  export, no server (now invariant 7); 2026-08-09 dark is the default theme; 2026-08-09
  Tailwind v4 utilities over inline styles.

### 2026-08-10 · Two-repo project layout + the release IS a script

- **Decision (layout).** The product is a parent dir (`~/Developer/mitch/launcharr`, not a
  repo) holding two sibling repos: `launcharr/` (this app — upstream for all release
  facts) and `launcharr-web/` (the site — consumes `src/lib/release.json`, generated,
  never hand-edited). Cross-repo rules live in the parent CLAUDE.md; one commit never
  spans repos.
- **Decision (determinism).** `scripts/release.sh` is the only way to release; if a step
  isn't in the script it isn't part of the release. Fail-fast preflight (clean trees both
  repos, notes-file-first, cert + notary profile present), all gates, bump, build
  (app + dmg targets), spctl-verified, checksummed, interactive gates for the two manual
  smoke tests (fresh-profile, upgrade-path), tag + GitHub Release, website data push
  (Vercel deploys), cask bump. Mitch's requirement: releasing must not be agent
  improvisation or memory — nothing forgettable.
- **Decision (install methods).** dmg (humans), zip (cask feed), Homebrew (advertised
  install + only update channel), build from source. No curl|sh installer — CLI idiom,
  second script to trust, brew already serves that crowd.

### 2026-08-10 · Release channel: sign with the personal Developer ID now; Homebrew tap is the installer and the updater

- **Decision (signing).** Releases are signed + notarized with Mitch's existing paid
  personal Apple Developer enrollment, starting with v0.3.0. The business account can come
  whenever; for direct-distributed macOS apps there's no signing continuity requirement —
  switching identity later costs one re-prompt of the single Automation consent (launcharr
  holds zero other permissions) and nothing else. Old releases stay notarized forever.
  Waiting for the business account would block releases for a purely cosmetic gain (the
  name on the ticket).
- **Decision (distribution + updates).** Install channel is a personal Homebrew tap
  (`mitchmalone/homebrew-launcharr`) pointing at the GitHub Release zip; build-from-source
  is the alternative. The advertised path is brew (curl'd artifacts carry no quarantine
  attribute, so even pre-signing builds run clean). **No in-app updater, ever, in this
  design**: tauri-plugin-updater phones home on a schedule, which violates the zero-network
  invariant; `brew upgrade` is the update story, on-brand for the audience. Never instruct
  users to strip quarantine (`xattr`/`--no-quarantine`).
- **Changelog.** Human-written release notes in the GitHub Release body ("what this
  version is"), `git log` as appendix. No CHANGELOG.md file until someone asks.

### 2026-08-10 · Reversal: home stays ~/.config/launcharr (XDG)

- **Decision.** The home-move below is reversed same-day, pre-release: launcharr's home is
  `~/.config/launcharr` after all. `migrate_home` now points the other way, so a dir at
  `~/.launcharr` (only Mitch's machine ever had one) moves back automatically. Everything
  else from that entry — settings Hackables buttons, `open_path`, slimmed tray, themes —
  stands.
- **Why.** Mitch's call on reflection: less clutter for the user. XDG is where this
  audience's dotfile tooling already looks; top-level home dirs are for platform tools
  with toolchains/caches (cargo, oh-my-zsh), and our scripts are user config in spirit,
  which `~/.config/launcharr/scripts` expresses fine.

### 2026-08-10 · Home moves to ~/.launcharr; config/scripts access lives in settings; themes land

- **Decision (home).** launcharr's home is `~/.launcharr` (config.json + scripts/), migrated
  from `~/.config/launcharr` by a one-shot tested `fs::rename` at startup (no-op when already
  moved or fresh). Data caches stay in Application Support. Tray drops "Open config"/"Open
  scripts folder"; settings ▸ General ▸ Hackables gains "edit config.json" and "open scripts
  folder" buttons via one new validated-enum IPC command, `open_path` (config|scripts) —
  recorded here per the tiny-IPC invariant.
- **Decision (themes).** A theme is a flat map of the CSS tokens both windows already use
  (bg, surface, glass, border, fg, dim, accent, sigil, bang, selected, danger). Built-ins
  `launcharr` (brand blue/pink — now the panel's look too), `dracula`, `terminal`
  (matrix black/green) live in `src/lib/themes.ts`; `config.theme` selects; `config.themes`
  holds user themes as partial overrides (may also override a built-in by name). No new IPC:
  themes ride the existing config watcher and hot-apply everywhere. Unknown names fall back
  to `launcharr` so a hand-edit can't blank the UI.
- **Why.** Mitch wants config at `~/.launcharr` and settings as the single gateway (tray
  stays lean); themes were the natural next step after the brand-color pass, and doing them
  as config-resident JSON keeps the hackable value — your theme is a text edit, not a plugin.

### 2026-08-10 · Settings goes native-structured: autosave, toolbar tabs, hidden titlebar, hotkey recorder

- **Decision.** The settings window keeps the terminal skin but adopts native macOS settings
  structure (Raycast as the reference): no Save button — every edit autosaves debounced
  (~400ms) and hot-applies via the existing watcher; toolbar-style tabs with Lucide icons
  (new dep `lucide-react`, tree-shaken); `TitleBarStyle::Overlay` + hidden title, tab strip
  is the drag region; hotkeys and custom shortcuts are recorded by keypress
  (`HotkeyRecorder` over pure `acceleratorFromEvent`), not typed as strings. Green is
  reserved for the sigil glyph; interactive accents are the blue.
- **Why.** The v0.2.0 form read as a web page: stacked labels, bordered cards, fixed footer
  with a green Save button, free-text accelerator fields. The web-page tells were structural
  (Save button, full-width inputs, top-labels), not the terminal identity — so we fixed the
  structure and kept the skin. Autosave was nearly free: the config watcher already
  hot-applied everything.
- **Mechanics.** Echo guard: our own `write_config` fires `config-changed`; the window skips
  events matching the last-written JSON so a stale round-trip can't clobber in-flight edits.
  Recorder derives tokens from `event.code` (layout-independent); global-hotkey's
  `parse_key` accepts friendly aliases ("S", "3", "Space", "Up") — verified against crate
  source, format unchanged from hand-written configs.

### 2026-08-09 · Network carve-out: user-initiated favicon fetch at quicklink-add time

- **Decision.** The add-quicklink flow fetches the site's favicon (apple-touch-icon and
  sized icons preferred; favicon.ico as explicit last resort, per Mitch). This is the only
  network launcharr core may touch: one-shot, user-initiated, at add time. No background
  fetches, no refresh jobs, no telemetry — the zero-network invariant otherwise stands.
- **Why.** Quicklinks without icons look broken next to apps; Mitch asked for detection with
  quality preference. A user pressing "Add quicklink" is consenting to exactly one fetch of
  exactly that site.
- **Mechanics.** ureq (4s/6s timeouts, 512KB HTML / 2MB icon caps), pure tested `<link rel>`
  scanner, cached as `link-<hash>.png` beside app icons. Browser choice stored per link
  (`open -a`).

### 2026-08-09 · launcharr gets a menubar icon (accessory policy stays)

- **Decision.** A single NSStatusItem with a template pirate-flag icon (⌘ cut-out) and a
  minimal menu: summon, open config, open scripts folder, reindex, quit. Requested by Mitch
  as the gateway for settings and future surface area. The original "menu-bar-less" PRD line
  is revised; accessory policy (no Dock icon) is unchanged.
- **Why.** Discoverability and a mouse-reachable escape hatch (if the hotkey ever breaks,
  the app is otherwise invisible). Guardrail: the tray must never grow features the prompt
  can't reach — the panel stays the product.
- **Mechanics.** Icon generated from `design/menubar-icon-source.png` by
  `cargo run --example make_tray_icon` (threshold → crop → 44×44 template PNG).

### 2026-08-08 · v1.1: scripts-first Sol parity; invariants hold; three features deferred

- **Decision.** Sol feature-matching lands as v1.1 by pulling the v2 script protocol forward:
  bundled, user-editable scripts (lorem, JSON-format, local IP) + built-ins only where scripts
  can't reach (inline math on the hot path, clipboard watcher, custom links/shortcuts from
  config). **Zero-network and zero-permissions stand** (Mitch, 2026-08-08): Google Translate,
  public IP, and Calendar (EventKit consent) are deferred, not built; clipboard is
  copy-on-Enter only — auto-paste would need Accessibility, which stays banned.
- **Why scripts-first.** Hackability is the differentiator; every feature built as a script is
  both a feature and living documentation of the plugin surface. Built-ins would Raycast-ify
  the codebase and make the v2 protocol a second-class retrofit.
- **Deferred triggers.** Translate/public-IP: if zero-network is ever relaxed, as opt-in
  config. Calendar: if the permission stance softens to "consent-gated, Accessibility still
  banned."

### 2026-08-08 · Repo conventions: pnpm + Lefthook (and a global AGENTS.md change)

- **Decision.** launcharr uses pnpm and Lefthook (pre-commit format/lint on staged files,
  commit-msg commitlint, pre-push tests incl. `cargo test`). This settled PRD open question
  §11.4 and updated the _global_ AGENTS.md at the same time — npm→pnpm and Husky→Lefthook are
  now the standard everywhere, matching emberstash in practice.
- **Why.** The global file said npm+Husky while real projects had moved to pnpm+lefthook; docs
  that disagree with practice are worse than either choice. pnpm's speed/strictness and
  Lefthook's single-binary, YAML-config model won on merits and on incumbency.

### 2026-08-08 · Docs system: adopt the emberstash structure wholesale

- **Decision.** `CLAUDE.md` (stable rules) + `docs/` (STATUS/ROADMAP/JOURNAL/DECISIONS/plans
  with `_TEMPLATE.md → active/ → done/`), docs shipping in the same commit as code. Plus the
  globally-required `AGENTS.md` (project deltas, incl. Rust standards) and `LEARNINGS.md`.
- **Why.** Proven on emberstash; session continuity for agent-driven development depends on it.
  JOURNAL/LEARNINGS overlap resolved by role: JOURNAL is the dated raw log, LEARNINGS the
  pruned per-topic reference — single source of truth per fact, promote don't duplicate.

### 2026-08-08 · Stack: Tauri 2 + tauri-nspanel + TS/React UI, matching in TypeScript

- **Decision.** Tauri 2 (Rust) shell with the community tauri-nspanel plugin for the
  non-activating floating panel; React/TS in the system WKWebView for all UI; fuzzy matching
  and frecency ranking in pure TypeScript in the frontend; Rust owns indexing, FSEvents, icon
  cache, launch, and the AppleScript hand-off; SQLite via rusqlite. (PRD §6.)
- **Why.** The panel/focus problem is the hard native part and tauri-nspanel exists precisely
  for it (Sol/SuperCmd as references). TS matching keeps the product-opinion layer hackable —
  the long-term differentiator — and the index is a few hundred items, so Rust-speed matching
  is premature. The architecture isolates the matcher so it _can_ move to Rust if the 16 ms
  keystroke budget fails (risk R2).
- **Alternatives.** Pure AppKit/Swift (fastest, least hackable, slowest to build); Electron
  (weight budget dead on arrival). Revisit only if M0's exit criterion fails.

### 2026-08-08 · System Settings panes: static curated table, not enumeration

- **Decision.** A versioned, hand-curated table of pane names → `x-apple.systempreferences:`
  deep-link IDs for the current macOS version. (PRD §5.1, risk R4.)
- **Why.** Programmatic enumeration of panes is unreliable and the IDs are undocumented. A
  broken pane link is low-severity; a curated table is greppable and fixable in one line.
