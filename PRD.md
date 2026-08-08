# launcharr — v1 Product Requirements Document

> *An app launcher for pirates.*

| | |
|---|---|
| **Project** | launcharr (always lowercase) |
| **Version** | v1 (personal-use milestone) |
| **Owner** | Mitch Malone |
| **Status** | Draft — 8 Aug 2026 |
| **Platform** | macOS (Apple Silicon first; Intel if free) |

---

## 1. Vision

launcharr is a macOS app launcher for terminal nerds. Where Alfred and Raycast dress up as polished macOS utility apps, launcharr dresses up as a shell prompt: summon it with a hotkey, type into something that looks and feels like a REPL, and either launch an app or fling a command at your terminal without breaking flow.

Two values govern every decision:

1. **Lightweight.** launcharr should idle invisibly and summon instantly. When a feature and the weight budget conflict, the feature loses.
2. **Hackable.** The long-term differentiator is that extending launcharr feels like scripting, not like app development. v1 lays the input-grammar and architecture groundwork for that; the full script/plugin protocol is deliberately v2.

v1's definition of success is simple: **launcharr replaces whatever Mitch currently uses to launch apps, every day, and stays out of the way.**

## 2. Target user

- Primary (v1): Mitch. A JS/TS developer who lives in the terminal (iTerm2), values speed and minimalism, and wants a launcher that feels like a tool he owns rather than a product he rents.
- Secondary (post-v1, if released): developers and terminal-first users who find Raycast heavy and Alfred dated, and who would rather write a shell script than browse an extension store.

## 3. v1 scope

### In scope

1. Global hotkey summon/dismiss of a floating prompt panel
2. Launching applications
3. Opening System Settings panes
4. Fuzzy matching over the above
5. Frecency-based ranking that learns from usage
6. Bang mode: `!command` hands the command to iTerm2
7. Terminal-prompt visual identity

### Out of scope (v1 non-goals)

File search, calculator, clipboard history, window management, snippets, web search fallbacks, the script-response plugin protocol (v2 — see §10), theming beyond the built-in look, a preferences UI beyond the essentials, auto-update/signing/notarization (needed only when releasing to the wild), Windows/Linux, and anything requiring Accessibility permissions. v1 must run with **zero granted permissions** (the one exception: sending to iTerm2 triggers macOS's standard Automation consent prompt on first use).

## 4. User experience

### 4.1 Summon and dismiss

- A global hotkey (default **⌥ Space**, configurable) toggles the panel from anywhere, including over full-screen apps.
- The panel is a borderless, non-activating floating window, horizontally centered, vertically at roughly 30% of screen height, on the screen containing the mouse pointer (simple heuristic; revisit if annoying).
- Summoning must not steal focus from the frontmost app in a way that can't be undone: **Esc** (or the hotkey again, or clicking outside) dismisses the panel and returns focus exactly where it was.
- The panel opens with an empty prompt every time. No state is carried over from the previous invocation.

### 4.2 The prompt (visual identity)

The panel is a terminal prompt cosplay, not an Alfred knock-off:

- Monospace type throughout (system SF Mono by default).
- A prompt sigil at the left of the input — `❯` by default. Pirate flavor is welcome but subtle: think a `⚓︎`-style glyph option and flavor text in empty/error states ("nothing on the horizon"), not skull-and-crossbones wallpaper. Fun should never cost keystrokes or milliseconds.
- One input line, then a flat results list below: icon (small), name, and a dimmed hint column (e.g. `app`, `settings`, or the app's path). No cards, no shadows-on-shadows, no preview pane.
- The panel is compact: input line only when empty; grows to fit up to 8 results; never scrolls the screen — more matches than 8 means the query needs another keystroke, and the fuzzy ranking means the right answer should be near the top well before then.
- Dark, terminal-like default palette. Light mode can wait.

### 4.3 Launch mode (default)

- Typing filters apps and System Settings panes with fuzzy matching as of the first keystroke. Results update on every keystroke with no perceptible lag (budget in §7).
- **↑/↓** (and **⌃P/⌃N** — terminal nerds) move the selection; **Enter** launches the selection and dismisses the panel; **⌘1–⌘8** launch by row.
- Launching an app that's already running brings it to front (standard `NSWorkspace` activation behavior).
- System Settings panes appear as first-class results (e.g. typing `blue` surfaces "Bluetooth — settings") and open the pane directly via its deep link.

### 4.4 Bang mode (`!`)

- If the **first character** of the input is `!`, launcharr switches to bang mode for the rest of that invocation. The prompt sigil changes (e.g. `❯` → `$`) and the results list is replaced by a single action line: `run in iTerm2 ▸ <command>` — an unambiguous visual signal that Enter will not launch an app.
- **Enter** hands everything after the `!` to **iTerm2**: launcharr opens a new iTerm2 window (default profile) — or reuses the current session if a setting says so — and runs the command there. Output, interactivity, and lifetime all belong to iTerm2; launcharr dismisses immediately after hand-off.
- Implementation: iTerm2's AppleScript API (`create window with default profile` / `write text`). If iTerm2 isn't installed, fall back to Terminal.app; the target is a setting, but iTerm2 is the blessed default.
- The command string is passed through verbatim — no shell parsing, no quoting games, no environment munging by launcharr. What you typed is what runs.
- `!` alone (empty command) opens a new iTerm2 window and nothing else. Free feature, feels right.
- **Grammar note for the future:** `!` is the first reserved prefix in the input grammar. v1 must implement prefix detection as a general dispatch step (mode = first-char lookup) rather than a special case, because v2 adds script-defined commands to the same grammar (§10).

### 4.5 First run

On first launch: register the default hotkey, build the app index, show the panel once with a one-line hint ("⌥space to summon · `!` to run in terminal"). No onboarding wizard, no account, no network calls. launcharr runs as a menu-bar-less accessory app; quitting/relaunching and the few settings that exist are reachable through the prompt itself (type `launcharr` — it self-indexes).

## 5. Core behaviors (functional requirements)

### 5.1 App indexing

- Sources: `/Applications`, `/Applications/Utilities`, `~/Applications`, `/System/Applications`, plus System Settings panes from a curated built-in table of pane names → `x-apple.systempreferences:` deep-link IDs (enumerating panes programmatically is unreliable; a static table for the current macOS version is the pragmatic v1 answer, refreshed as macOS updates — accepted risk R4).
- Index at launch, then watch the app directories with FSEvents so installs/uninstalls appear without a restart. A manual reindex command exists but should never be needed.
- Icons are extracted via `NSWorkspace`, downscaled once, and cached on disk keyed by bundle ID + version, so the results list never blocks on icon work.

### 5.2 Fuzzy matching

- Subsequence-style fuzzy matching (fzf-family scoring): bonuses for word/camel-hump boundaries, prefix matches, and consecutive runs; `saf` → Safari, `syspre` → System Settings, `ps` → Photoshop before anything with a stray p…s.
- Matching runs over app display names (plus a small alias table — e.g. "Preferences" → System Settings). Matched characters are highlighted in results.
- The matcher is a pure, well-tested TypeScript function with no I/O — the most unit-testable part of the codebase and the part most worth getting right.

### 5.3 Frecency ranking

- Final score = fuzzy match score × frecency multiplier, so a weak textual match can't outrank an obviously better one, but ties and near-ties go to what you actually use.
- Frecency = launch count decayed by recency (bucketed half-life decay à la Firefox/zoxide: launches within the last hour count full weight, this week ~half, this month ~quarter, older ~tenth). Exact constants are implementation detail; tune by feel.
- Every launch records `(item, query, timestamp)` in SQLite. Storing the query enables a v1.x nicety (per-query learned bindings — "he types `st` and always picks Sublime Text") without a schema change.
- Cold start (empty database) must still feel sensible: pure fuzzy order, empty-query panel shows nothing rather than a guess.

### 5.4 Settings (minimal)

A JSON file in `~/.config/launcharr/config.json` — hand-editable, watched for changes, no settings UI in v1 beyond what the prompt itself exposes. Contents: hotkey, terminal target (iTerm2/Terminal.app), new-window-vs-current-session for bang mode, prompt sigil, launch-at-login. A config file you edit in your editor *is* the terminal-nerd settings UI.

## 6. Technical architecture

### 6.1 Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Tauri 2** (Rust) | Window management, global shortcut (official plugin), tray-less accessory app |
| Panel behavior | **tauri-nspanel** (community plugin) | Non-activating `NSPanel`, the Spotlight-style floating window |
| UI | **TypeScript + React** in system WKWebView | Vite dev server, hot reload; virtualized-enough list (8 rows — trivial) |
| Matching/ranking | **TypeScript** (frontend process) | Pure functions; index is small (a few hundred items), no need for Rust here in v1 |
| Indexing & launch | **Rust commands** | Filesystem scan, FSEvents watch, icon extraction, `NSWorkspace`/`open` launch, AppleScript hand-off to iTerm2 |
| Persistence | **SQLite** (via Rust, e.g. rusqlite) | Frecency events + icon cache metadata; config is plain JSON |

Guiding split: **Rust owns the OS, TypeScript owns the experience.** Anything touching AppKit, the filesystem, or process launch is a small, boring, well-named Rust command; everything with product opinion in it (grammar, matching, ranking, rendering) is TypeScript, because that's the layer that must stay fun to hack on — for Mitch in v1 and for plugin authors in v2.

### 6.2 Notable implementation details

- **Focus discipline** is the hardest native problem: non-activating panel that still receives keystrokes, and reliable focus restore on dismiss. Prove this in week one (see §9) before building anything else on top.
- **`LSUIElement` / accessory activation policy**: no Dock icon, no menu bar presence.
- **IPC**: a handful of typed Tauri commands (`get_index`, `record_launch`, `launch(item)`, `run_in_terminal(cmd)`, `read_config`). Keep the surface tiny; every command is a future plugin-API liability.
- **Zero network**: v1 makes no network requests. This is a feature; say so in the README someday.

## 7. Performance budgets (requirements, not aspirations)

| Metric | Budget |
|---|---|
| Hotkey press → panel visible and accepting input | **< 100 ms** (target 50) |
| Keystroke → updated results on screen | **< 16 ms** (one frame) |
| Enter → app launch initiated + panel dismissed | **< 50 ms** launcharr-side |
| Idle memory (resident, panel hidden) | **< 120 MB** (WKWebView floor makes ~sub-100 heroic; 120 is the ceiling, not the goal) |
| Cold app start → hotkey registered | **< 1 s** |
| Full index rebuild | **< 500 ms** for ~300 apps |

If a budget can't be met, the feature causing the miss gets cut or moved behind a flag. These numbers are the "lightweight" value made falsifiable — and the honest scoreboard against Raycast's 350–450 MB.

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Non-activating panel / focus restore edge cases (full-screen Spaces, stage manager, multiple displays) | Spike first (§9 M0); tauri-nspanel exists precisely for this; Sol/SuperCmd source as references |
| R2 | WKWebView keystroke latency spoils the REPL feel | 8-row list, no animation on the hot path, measure with instrumentation from day one; worst case, move matching to Rust (architecture already isolates it) |
| R3 | AppleScript → iTerm2 requires Automation permission; prompt timing is OS-controlled | Trigger it deliberately on first `!` use with a hint line in the panel; fall back gracefully if denied |
| R4 | System Settings pane IDs are undocumented and shift between macOS versions | Static curated table, versioned; a broken pane link is low-severity |
| R5 | Scope creep toward Raycast | This document. Non-goals list is load-bearing. |

## 9. Milestones

- **M0 — Spike (the scary parts first).** Tauri 2 + tauri-nspanel: hotkey summons a non-activating panel with a text field; Esc restores focus correctly over a full-screen app. *Exit: the focus dance works or the stack decision gets revisited.*
- **M1 — Launcher.** Index + fuzzy match + launch + System Settings panes. No frecency, ugly UI. *Exit: Mitch can launch any app.*
- **M2 — Feel.** Frecency, keyboard bindings, the terminal-prompt visual identity, performance instrumentation against §7. *Exit: launcharr replaces the incumbent as Mitch's daily launcher.*
- **M3 — Bang mode.** `!` grammar dispatch, iTerm2 hand-off, Terminal.app fallback, config file. *Exit: `!git status ⏎` feels better than switching to iTerm2 by hand.*
- **M4 — Polish & holdout.** Launch-at-login, first-run hint, two weeks of daily use with a "no new features, only fixes" rule. *Exit: v1 declared done.*

## 10. v2 horizon (recorded now, built later)

The differentiating bet, stated so v1 doesn't accidentally preclude it: **scripts as first-class citizens.** Users drop executables (any language) into `~/.config/launcharr/scripts/`; a script declares a trigger word and, when invoked, can either fire-and-forget or **respond to the launcher** — returning JSON over stdout that launcharr renders as results/output in the panel, Claude-Code style, instead of opening a terminal. Bang mode's inline-output variant, per-query learned bindings, richer bangs (`!!` = repeat last, project-scoped commands), theming, and — if launcharr goes to the wild — signing, notarization, updates, and a real README with a pirate flag on it.

## 11. Open questions

1. ⌥Space collides with some keyboard layouts' non-breaking space and with Raycast's default — fine as default with easy remap, or pick something else out of the gate?
2. Should bang mode's "reuse current iTerm2 session" variant ship in v1 config or wait for real demand?
3. Empty-query panel: strictly blank (current spec) or show top-3 frecent apps after the database warms up?
4. Repo conventions (package manager, linting, tests, CI) — deliberately unspecified pending Mitch's preferences.

---

*launcharr: because the apps won't launch themselves. Yarr.*
