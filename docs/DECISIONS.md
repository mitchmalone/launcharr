# DECISIONS

> Append-only log of decisions with reasoning so choices aren't relitigated. Dated entries,
> **newest at the top.** Lightweight ADR format. The standing stack lives in `CLAUDE.md`.

---

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
