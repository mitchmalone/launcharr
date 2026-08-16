# JOURNAL

> Append-only dated log of learnings and gotchas, **newest first** — short and factual, written
> as they happen. Durable facts get promoted to `../LEARNINGS.md` (per-topic) and removed from
> active relevance here; decisions go to `DECISIONS.md`, not here.

---

### 2026-08-16 · Hover never reaches an accessory app's panel until you click it

The agent dropdown "opened on click, not hover, and never closed": WKWebView's own
mouse-tracking area is active-in-active-app, and launcharr (accessory policy) is only
active after a first-mouse click on the panel — so mouseenter arrived with the click and
mouseleave never arrived at all. Fix: `bar_constrain::enable_hover_events` attaches an
NSTrackingArea (ActiveAlways | InVisibleRect | enter/exit/move, owner = the webview) and
sets `acceptsMouseMovedEvents` on the window. Belt-and-braces in JS: a card with no mouse
activity for 10s closes itself, so lost leave events can't strand it again.

### 2026-08-16 · Concurrent socket handlers tore agents.json on the first live test

The agents monitor spawns a handler thread per socket connection, and Claude hook events
arrive in bursts (PostToolUse + PreToolUse land together). Two threads doing plain
`fs::write` to `agents.json` interleaved and left "valid JSON + trailing garbage" — caught
minutes after shipping because the very first live read choked. Fix: saves are serialized
behind a static mutex and go write-temp-then-rename, so readers only ever see a complete
document. `load()` additionally treats unparseable state as empty rather than erroring —
a status cache is never worth a startup failure. Regression test hammers 4 writer threads
against a reader.

### 2026-08-16 · The vanishing focus indicator was CSS specificity — hover masked it for hours

The active-workspace indicator "not working" survived three real plumbing fixes because
the visible bug was `.bar button { background: none }` (0,1,1) silently beating
`.bar-ws-focused { background: … }` (0,1,0) — the block NEVER painted except while
hovered, where `.bar-ws-focused:hover` (0,2,0) outranks the reset. Clicking a cell
parks the mouse on it → "clicks work, hotkeys don't," and "hotkey back to 4 shows it
again" because the mouse still sat on cell 4. Diagnosed by instrumenting every layer
(Rust snapshots ✓, eval delivery ✓, absorb ✓, DOM class ✓) until only CSS remained.
Lessons: (1) element-qualified resets like `.bar button` out-rank single-class state
selectors — scope state rules under the root (`.bar .bar-ws-focused`); (2) when
"clicks work but keys don't," suspect :hover masking before plumbing; (3) instrument
layer by layer and trust each ✓ — the bug lives in the first unverified layer. The
timer-throttling and emit-delivery fixes below were real and stay.

### 2026-08-16 · WKWebView throttles JS timers in never-focused windows — push, don't poll

The bar's `setInterval` polling silently died minutes after launch: WebKit throttles or
suspends timers in a window that never becomes key, in a background accessory app. Result:
stale clock, stale front-app, and the focus indicator missing entirely (the CLI data was
verified perfect the whole time). Every earlier fix attempt looked good in testing because
tests ran seconds after a relaunch, before throttling kicked in. Architecture fix: the
webview owns ZERO timers — a Rust thread snapshots and emits `bar-snapshot` at 1 Hz (and
instantly on trigger-file events); event delivery executes in the page unthrottled; the
clock rides the same push. `background_throttling: Disabled` set on the bar window as
belt-and-braces. **Rule: bar/panel webviews are pure listeners; cadence lives in Rust.**

### 2026-08-16 · Bar performance: sync commands were self-DDoSing the aerospace server

Mitch: workspace clicks took seconds. Cause: `bar_snapshot` was a **sync** Tauri command
— it ran on the main thread, spawning 5 subprocesses per 1s tick, serially. The queued
aerospace CLI calls backed up aerospace's server: `list-workspaces` measured **6.0s**
wall (0.01s CPU) while the bar polled, **14ms** once it stopped. Fixes: commands are
`async` (worker pool — any command that spawns processes must be), one aerospace call
per tick via `--format '%{workspace}%{tab}%{workspace-is-focused}'`, battery cached 30s,
optimistic focused-workspace update on click. Rule of thumb recorded: **never spawn a
subprocess in a sync Tauri command.**

### 2026-08-16 · Menubar slide-over needs Floating level + a constrainFrameRect override

To make the auto-hidden native menu bar slide OVER the bar (Sketchybar behavior), the
bar must sit below MainMenu (24) — PanelLevel::Floating (4). But below 24, AppKit's
`constrainFrameRect:toScreen:` pushes windows out of the menu-bar reserve (bar landed at
y=38, and set_position could not force it back). Sketchybar's own trick, ported:
`bar_constrain.rs` installs a `constrainFrameRect:` override returning the rect
unchanged onto the macro-generated BarPanel class via `class_replaceMethod`. Result:
level 4, y=0, menubar hover-slides over.

### 2026-08-16 · Event-driven bar refresh via a triggers directory

Polling caps update latency at the poll interval (Mitch noticed ~hundreds of ms vs
Sketchybar's instant). Now `~/.config/launcharr/triggers/` is FSEvents-watched; any
change emits `bar-refresh` and the bar re-snapshots immediately. aerospace.toml's
`exec-on-workspace-change` touches `triggers/workspace` (dotfiles updated, uncommitted).
Doubles as a hackable poke-the-bar surface for scripts. Front-app changes without a
workspace switch still ride the 1s poll — candidate: NSWorkspace
didActivateApplicationNotification observer.

### 2026-08-16 · Display mode changes strand the bar off-screen

Overnight the display's point width changed (2560 → 2056; scaling/dock change) and the
bar stayed at stale absolute coordinates — parked at y=-111, invisible, while Sketchybar
(which handles this) still drew. Tauri surfaces no "screens changed" event, so bar.rs now
re-asserts the frame on a 15s main-thread heartbeat (no-op comparison when nothing moved
— verified zero churn over 40s idle). A real NSApplicationDidChangeScreenParameters
observer can replace the heartbeat when the objc2 layer grows in B2.

### 2026-08-15 · Bar spike gotchas: monitors, panel frames, capabilities

Building the v0.5 bar window (see `plans/active/v0.5-tui-kit-and-bar-spike.md`):

- **`available_monitors()` returns an empty list** in this accessory app — at setup AND
  500ms later on the main thread. `primary_monitor()` answers correctly. bar.rs falls
  back to primary; multi-display enumeration is an open item for B2 (candidates: NSScreen
  directly via objc2, or enumerate after first window event).
- **Frame an NSPanel-converted window AFTER `to_panel()`, with a fresh handle.**
  `set_position`/`set_size` before the conversion are silently dropped, and the
  pre-conversion `WebviewWindow` handle reports stale geometry afterwards (claimed
  800×600 while CGWindowList showed the true 2560×30). panel.rs always re-fetched via
  `get_webview_window` — that's why it never hit this.
- **New window labels must be added to `capabilities/default.json`** (`bar-*`) or the
  webview's `invoke()` fails silently inside a `.catch()`.
- **`load_or_create` used to swallow config parse errors silently** (`unwrap_or_default`)
  — a typo'd config.json reverted every setting with no trace. It now logs before
  falling back.
- Debug observation: launcharr has had a benign offscreen 500×500 layer-0 window in
  CGWindowList all along (present with bar disabled, pre-dating this work). Unidentified;
  harmless; noting so the next window-debugging session doesn't chase it.
- **Memory (the B1 gate, PASSED):** one display, release build, fresh-launch RSS totals
  across launcharr + its WebKit helpers — bar off: ~187 MB (main 103 + helpers ~84);
  bar on: ~205 MB stable after 60s (main 96 + helpers ~109, bar's WebContent 35 MB).
  **Marginal cost of the bar ≈ 19 MB** — the bar rides the app's existing WebKit process
  pool instead of paying a per-app baseline. Main-process RSS (the metric the 120 MB
  budget has historically tracked) stays ~96 MB.

### 2026-08-12 · `brew untap --force` uninstalls the tap's casks — including the app

Migrating to the shared tap: `brew untap mitchmalone/launcharr --force` didn't just remove
the tap, it uninstalled the launcharr cask and deleted `/Applications/launcharr.app`.
Also: a locally-cloned tap under `/opt/homebrew/Library/Taps` doesn't see new
formulae/casks until `git pull` (or `brew update`). Migration order that works: pull the
new tap, `brew install` from it, THEN untap the old one.

### 2026-08-11 · launcharr-web's JOURNAL folded in (repo merged as apps/www)

Durable items promoted straight to `LEARNINGS.md` (www section): pnpm 11 `allowBuilds`,
lucide v1 brand icons, eslint-config-next's `set-state-in-effect` vs the
`useSyncExternalStore` mounted pattern, Claude Design MCP can't serve binaries. One-off
context kept here: the `launcharr-web` Vercel project (team ramenamok) had
launcharr.com + www.launcharr.com aliased before first deploy; `vercel link`/`deploy`
needed `--scope ramenamok` once.

### 2026-08-10 · bash + pipefail + `grep -q` silently fails healthy pipelines

`codesign -dvv … | grep -q pattern` under `set -euo pipefail` fails EVEN WHEN the pattern
matches: grep -q exits at first match, codesign takes a SIGPIPE mid-write (exit 141),
pipefail surfaces it. Reproducible in /bin/bash 3.2, invisible in zsh (which is why my
manual verification passed). Rule for release.sh: capture command output to a variable
first, grep the variable — never pipe into early-exiting consumers under pipefail.

### 2026-08-10 · Spawned CLIs inherit launcharr's TCC identity — cage them

(From the spike-ask-ai branch, ported to main 2026-08-16.) The `?`-mode spike spawned
`claude -p` and macOS started prompting for network drives and Music access _as
launcharr_: child processes bill all file access to the responsible app, and the CLI's
project-discovery scan ran from an inherited cwd (`/`). Any spawned-CLI feature must
(1) pin `current_dir` to an empty dir we own (Application Support/ask-home) and
(2) disallow filesystem/exec tools (`--disallowedTools Bash,Read,...`) — `?` is Q&A,
not an agent in the launcher. This is what "zero granted permissions" costs when
spawning other people's binaries.

### 2026-08-10 · Two signing gotchas from the first real release run

(1) `codesign -dv` does NOT print the certificate chain — grepping it for "Developer ID"
always fails; the Authority= lines only appear at `-dvv`. (2) The tauri bundler
auto-notarizes only via raw `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` (or API key) env
vars — it ignores notarytool keychain profiles, and skips silently with just a Warn line.
release.sh now notarizes explicitly (`notarytool submit --keychain-profile --wait`, grep
"status: Accepted", staple, re-zip the stapled app) so no secrets sit in env.

### 2026-08-10 · Moving the repo invalidates cargo's build cache with baked absolute paths

After restructuring to `<project>/launcharr`, `cargo` builds failed reading
`.../mitch/launcharr/src-tauri/target/...` (the pre-move path) — tauri's build script
caches absolute OUT_DIR paths. One-time `cargo clean` fixes it. Expect this any time the
repo directory moves.

### 2026-08-10 · Autosaving a config the app also watches needs an echo guard

Settings autosave + the config FSEvents watcher form a loop: `write_config` → watcher fires
`config-changed` → window `setConfig(payload)`. If the user typed during the round-trip, the
event's (older) payload would clobber their edit. Guard: remember the JSON we last wrote and
drop matching events; genuinely-external edits (hand-editing config.json) still flow through.
Also: `global-hotkey`'s `parse_key` accepts friendly aliases ("S", "Space", "Up") _and_ W3C
code names — checked the crate source rather than trusting docs; the recorder emits the
friendly form so hand-written and recorded configs look alike.

### 2026-08-08 · A script named json.py shadows python's stdlib for the whole scripts dir

The bundled-scripts test caught it before prod: python puts the invoked script's directory at
`sys.path[0]`, so `scripts/json.py` made every neighbouring script's `import json` resolve to
itself. Fixed by renaming to `json-format.py` AND `del sys.path[0]` at the top of every
bundled script. Documented in SCRIPTS.md as a user-facing rule.

### 2026-08-08 · v1.1 built overnight: script protocol + Sol parity

Scripts-first per the scope decision (see DECISIONS). Machine-verified: bundled scripts
install + answer manifest/query (lorem/json/ip exercised end-to-end), clipboard watcher
records to SQLite (concealed types skipped by design), config link/shortcut hot-reload
registers cleanly, RSS 92MB steady, cold start 157ms. NOT machine-verifiable, needs Mitch:
panel rendering of script/clip/math rows, ⌘-digit + Enter actions per row type, the
Cmd+Alt+F9-style custom shortcut actually firing, and dropping a new script in live.

### 2026-08-08 · AppKit leaks ~20–30MB per rasterized app icon; subprocess is the fix

First launch hit **10GB RSS**. Bulk `NSWorkspace.iconForFile` + `TIFFRepresentation` retains
the rasterized data inside AppKit: per-icon `autoreleasepool` and `NSImage.recache()` both
measurably do nothing (isolated test: 152 icons → 3.3GB, kept as an `--ignored` diagnostic in
`icons.rs`). Fix: the binary re-invokes itself (`launcharr --extract-icons <dir>`) and the
caches die with the child. Steady-state RSS: **90MB** (budget: <120). Also: TIFF rasters are
1024² — downscale to 128px via the `image` crate before caching (62MB → 7.5MB), and write
zero-byte markers for apps whose icons can't be extracted so they aren't retried forever.

### 2026-08-08 · `open` re-activates a running instance — smoke tests must pkill first

Chased a "still leaking" ghost for two rebuild cycles because `open launcharr.app` had been
re-activating the old process instead of launching the new binary. Kill before relaunch.

### 2026-08-08 · brew rustup keeps cargo off the default PATH

Homebrew's `rustup` puts the proxies in `/opt/homebrew/opt/rustup/bin` (NOT `~/.cargo/bin`),
and `rustup run stable cargo fmt` fails because cargo-fmt can't find `cargo` itself. Fixed via
`.lefthookrc` (`rc:` option) exporting the proxy dir onto PATH for all hooks.

### 2026-08-08 · Matcher tuning: gaps had to get steeper

First constants (fzf-ish: gap −3/−1, consec +8) let "Pixelmator Studio Tools" beat Photoshop
for `ps` — a distant word-boundary match outscored a close mid-word one. Landed on gap −4/−2,
consecutive +12. Also: the frecency multiplier cap moved 1.8 → 1.5, because an acronym-style
match (`saf` → "Sales Aftercare Formatter", all word boundaries) times a big multiplier could
beat Safari's clean prefix run. Near-tie flips still work at 1.5.

### 2026-08-08 · tauri-nspanel v2.1 API notes

- Branch is `v2.1` (not `v2`). `tauri_panel!` macro defines the panel class +
  `panel_event!` handlers; `window.to_panel::<T>()` converts the config window.
- The `-> ()` in `panel_event!` grammar is mandatory and trips clippy's `unused_unit`;
  allowed crate-wide in lib.rs (the lint can't be scoped to a macro invocation).
- NSWindow delegates are weak: the event handler must be kept alive (`std::mem::forget`)
  or resign-key events silently stop after a GC.

### 2026-08-08 · pnpm 11 blocks postinstall scripts

`pnpm install` hard-fails on ignored build scripts (esbuild, lefthook). The fix is
`allowBuilds:` in `pnpm-workspace.yaml` — pnpm 11 writes the stanza template for you on
failure; `onlyBuiltDependencies` in package.json is no longer enough.
