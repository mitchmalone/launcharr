# JOURNAL

> Append-only dated log of learnings and gotchas, **newest first** — short and factual, written
> as they happen. Durable facts get promoted to `../LEARNINGS.md` (per-topic) and removed from
> active relevance here; decisions go to `DECISIONS.md`, not here.

---

### 2026-08-17 · Loupe capture v2: `CGDisplayCreateImageForRect` + `sharingType = None` — window-list capture skipped Notion

`CGWindowListCreateImage(… OnScreenBelowWindow …)` came back without some apps' windows
(Notion, an Electron app, was the reported one — likely a window-list/level quirk, not
worth chasing). Capturing the **display framebuffer** instead
(`CGDisplayCreateImageForRect(displayID, rectInDisplayPoints)`) returns what is actually
on screen, every app; the loupe keeps itself out of the picture with
`[NSWindow setSharingType:NSWindowSharingNone]` (content-protection flag: excluded from
all screen captures, including our own). Display id = `NSScreen.deviceDescription
["NSScreenNumber"]`; the rect is display-local points, and the loupe window covers
exactly that screen, so the webview's `clientX/Y` are already the right coordinates.
The v1 notes below stay for the coordinate conventions.

### 2026-08-17 · Loupe capture: `CGWindowListCreateImage` below our own window; points, not pixels

For a magnifier drawn _at_ the cursor, plain display capture sees the loupe itself
(feedback loop). `CGWindowListCreateImage(rect, kCGWindowListOptionOnScreenBelowWindow,
ourWindowNumber, kCGWindowImageBestResolution)` captures everything beneath the loupe
panel and returns native pixels for a rect given in CG global _points_ (top-left origin
of the main display) — Tauri's `LogicalPosition` on macOS is the same space, so the
webview's `clientX/Y` + the panel's origin is the rect, no scale math. AppKit's
`NSEvent.mouseLocation` / `NSScreen.frame` are bottom-left; flip with the main screen's
height. Bytes come out via a `CGBitmapContextCreate(RGBA8, ByteOrder32Big)` draw into a
Vec — `tauri::ipc::Response` ships them binary (~80 KB/frame at 2×, fine at 60 Hz).
Deprecated-in-14 API, still present in 26; ScreenCaptureKit is the eventual replacement.
Screen Recording (TCC) is required; without it the call returns an image of nothing.

### 2026-08-17 · Driving the panel from an agent shell: tray "Summon panel" works, keystrokes don't land

Under tmux/iTerm the shell has no Screen Recording (`screencapture` → "could not create
image from display") and CGEvent keystrokes (`osascript keystroke`, `cliclick t:`) go to
the _frontmost app_ (iTerm2), not to the non-activating panel even while it is key —
one stray `keystroke "a"` landed in an iTerm pane. The tray menu is scriptable
(`click menu item 1 of menu 1 of menu bar item 1 of menu bar 2 of process "launcharr"`
= summon; the perf log shows `summon Nµs`), but there's no way to type into the panel
headlessly, and `set frontmost of process "launcharr"` is refused (accessory app). Net:
panel-typing flows stay a hands-check; observe native paths via the pasteboard
(`pbpaste`) or the stderr log when launching the binary directly.

### 2026-08-17 · `NSColorSampler` binding needs three objc2-app-kit features + block2

`NSColorSampler` (objc2-app-kit 0.3) is gated on `NSColorSampler` + `NSColor` +
`block2`; the RGB component getters additionally need `objc2-core-foundation` (CGFloat).
All were already in the lock as transitives, so enabling them added no crate. The block is
`block2::RcBlock::new(move |c: *mut NSColor| …)` passed as `&block`; AppKit retains the
sampler (and the block) until the session ends, so dropping the local is fine. The
handler fires on the main thread; the pasteboard write and `panel::flash` are safe there.

### 2026-08-17 · Two "shortcuts" gotchas while removing the tab

The bundled config had a stray `"": ""` under `shortcuts` (from the tab's "+ add") that
logs `bad custom shortcut ""` on every start — harmless, still there; delete the key by
hand. And `apps/www/src/lib/launch-index.ts` still lists `shortcuts` as an alias on the
demo's settings item — the demo config, not the app; left as-is.

### 2026-08-17 · HTML5 drag-and-drop is dead in a Tauri window unless the file-drop handler is off

The menubar zone board never worked — not retired→zone, not zone→zone. wry's macOS
webview swizzles `draggingEntered:` / `draggingUpdated:` / `performDragOperation:` for
Tauri's file-drop events and, when the handler is on (the default), returns without
forwarding to WebKit — so the DOM never gets `dragenter`/`dragover`/`drop`, **internal
drags included** (WebKit routes its own drags through the same NSDraggingDestination
path). `dragstart` still fires, which is why it looked half-alive. Fix:
`WebviewWindowBuilder::disable_drag_drop_handler()` on any window that does HTML DnD
(settings_window.rs). Verified with real mouse events (`cliclick dd/dm/du`) + reading
config.json back; AX `click` on a WKWebView checkbox does nothing, `cliclick` at its
AX position does — and only when the process is frontmost, else the click lands on
whatever's on top.

### 2026-08-17 · Wrap-around selection hid the aerospace strip; `.tui button` beat single-class segment rules

Two kit gotchas from the `aerospace ⏎` strip. (1) `SegmentedControl` had no scroll-into-view,
so wrapping ↑ from the last action left the strip (and its header) above the fold — ListRow
had the fix from the wifi panel but nothing shared it. Now `revealSelected` in
primitives.tsx is the one helper every selectable kit component uses (LEARNINGS rule).
(2) `.tui button { background:none; border:none }` is `(0,1,1)` and had been beating every
single-class segment rule since the control was written — segments never had border/fill;
the keyboard cursor only showed on the active segment where a two-class rule applied.
Segment rules are now scoped under `.tui-segmented`.

### 2026-08-17 · Quitting AeroSpace dumps every window onto workspace 1; its tray icon can't be hidden by `defaults`

Two facts from one experiment. (1) `osascript quit` + `open -a AeroSpace` reloads fine but
**every window lands on workspace 1** — assignments are in-memory. Never restart AeroSpace
to test something; `reload-config` is the only safe knob. (2) The status item is a SwiftUI
`MenuBarExtra` (no `isInserted`): writing `NSStatusItem Visible Item-0 = false` or
`VisibleCC Item-0 = false` into `bobko.aerospace` is rewritten to `1` on launch — the item
is not removal-allowed. Hiding needs upstream support or a menu-bar manager. launcharr's
answer is the `aerospace ⏎` panel carrying the menu's contents.

### 2026-08-17 · Retiring a dotfiles config dir deletes the live one — `~/.config/aerospace` was a dir symlink

`link_config_dir` in dotfiles symlinks the _directory_, so `ls -la ~/.config/aerospace/
aerospace.toml` shows a plain file while the parent is the link. `git rm -r macos/desktop/
aerospace` therefore emptied `~/.config/aerospace` from under a running AeroSpace (which
kept its in-memory config; only the file was gone). Recovered by unlinking the dangling
symlink, restoring the pre-0.4 copy as `aerospace.toml.bak-launcharr`, and letting
`desktop_apply` write the managed toml. Check `readlink` on the parent before retiring
anything dotfiles-managed.

### 2026-08-17 · Window corner radius: `NSConvolutionOverride1` works, `0` doesn't, Finder needs a logout

Hidden AppKit global: `defaults write -g NSConvolutionOverride1 -float N`. On 27.0
(`26A5406e`) TextEdit picked up `4` on relaunch — nearly square. Gotchas: **`0` is read as
unset** (nothing changes), so 1 is the floor; `killall Finder` alone showed no change (Finder
wants a logout, or is exempt — unverified); Quick Look ignores it per reports. Undocumented,
so the Desktop tab says so and the setting reads the current value back rather than
trusting config. CornerFix-style dylib injection was the alternative — rejected outright
(DECISIONS 2026-08-17).

### 2026-08-17 · JankyBorders is GPL-3 — a Homebrew dependency, never a sidecar

Checked before designing the desktop layer: AeroSpace MIT, JankyBorders GPL-3.0. Spawning
`borders` as a process and installing it via `brew` carry no obligations; bundling the
binary in `launcharr.app` is distribution (source offer, GPL text, grey area at best) and
porting its SkyLight code would make launcharr a derivative. Hence: `brew install felixkratz/formulae/borders`
from Settings → Desktop, flags rendered from the theme, no `bordersrc`, `killall borders`
before we spawn ours to clear strays from a crash (no PDEATHSIG on macOS; `RunEvent::Exit`
covers orderly quit).

### 2026-08-17 · Agent cells lose their tmux groups after a reboot — until each session speaks again

Field report: three agents across two tmux sessions, bar showed loose ungrouped cells with
no borders, then "came good" minutes later. Not the cold-start `list-panes` race (fixed
2026-08-16) — stale pane ids. tmux pane ids are per-server (`%0, %1…`), so a reboot +
resurrect hands every pane a new id, while `agents.json` still carries the pre-reboot ones;
`list()` looks them up, misses, and every session renders as loose (`tmuxSession: null`).
Hook events fired before launcharr came up are lost (no listener on the socket). It
self-heals per session on the next hook event carrying the fresh `$TMUX_PANE` (here:
08:55:06–08:55:18 for an app launched 08:54:56). tmux can't map a Claude session id back
to a pane after a restart, so this is a known post-reboot transient, not a bug to chase.

### 2026-08-17 · `.bar-card-line` defaults to agent green

`.bar-card-line`'s base color is the agent-idle green (`#00c853`) with a comment saying
"state classes above override" — true for the agent card, a trap for every new hover card:
plain lines come out green. The awake card scopes an override
(`.bar-awake-card .bar-card-line { color: var(--fg) }`); the next card will need the same,
or the base wants flipping to `--fg` with the agent card opting into green.

### 2026-08-16 · pmset assertions: process lines are stable enough to parse

`pmset -g assertions` "Listed by owning process" rows parse fail-soft
(`pid N(name): [0x…] HH:MM:SS Type named: "…"`); the hours field grows past 24 rather than
wrapping (Amphetamine showed `81:43:11` live), continuation/detail lines don't match the
`pid ` prefix, and coreaudiod holds assertions on other apps' behalf under its own name.
Sleep-preventing types worth listing: PreventUserIdleSystemSleep/DisplaySleep,
PreventSystemSleep, NoIdleSleep/NoDisplaySleepAssertion — `UserIsActive` is noise.

### 2026-08-16 · A React Server Component can't import the `@launcharr/tui` barrel

`apps/www` builds fine importing kit _components_ (they're in `'use client'` files), but
importing `BUILTIN_THEMES` from `@launcharr/tui` into a **server** component fails the
Next build: the barrel re-exports `components/controls.tsx`, whose `useRef` pulls the whole
module graph into a server context. The error names `controls.tsx`/`hooks.ts`, not the
themes module, so it reads like a component problem when it's a barrel problem. Fix: a
`./themes` entry point — themes are pure data, so server components take that path
directly. Same trap waits for any other pure module in the kit (`nav/*`); split an entry
point when a server-side consumer appears, not before — `./bar` became the second instance
within hours, when the bar's pure formatters were needed by a server component.

### 2026-08-16 · The demo bar's colors are in bar.css, and the design export was already stale

Building the website's bar strip from the Claude Design export instead of
`apps/desktop/src/bar/{main.tsx,bar.css}` shipped four wrong facts in one go — front app
and right cells on `--dim` (bar.css: "fg, not dim — the dim tone read too dark against the
strip"), the `working` agent cell on the site's pink instead of the theme accent so it
never retinted, a hover card missing its glyph and relative age, and `blocked` used as a
state key when that's only the display label for wire state `attention`. All four were
decided the same day the export was generated. Now invariant 10 — see DECISIONS. Practical
tell: if a website component contains a hex literal that also appears in the app, it's a
port that should have been an import.

### 2026-08-16 · `ioreg` battery keys: nested-first, flags as digits, negatives printed unsigned

Three traps in `ioreg -rn AppleSmartBattery` text output, all hit while building
the battery card. (1) The first occurrence of a key is often the copy nested in
the `BatteryData` dict, not the top-level one — `DesignCapacity` exists _only_
there. Search for the quoted key (`"DesignCapacity"`) so `"FedDesignCapacity"`
can't answer for it. (2) Flags print as `Yes`/`No` at top level but as `1`/`0`
inside dicts, so a flag reader that only knows Yes/No returns nothing for
`FullyCharged`. (3) `Amperage` is two's-complement but printed unsigned —
`18446744073709551543` is −73 mA; parse as `u64`, then `as i64`. Time estimates
use `65535` for "unknown", which is what `AvgTimeToEmpty` reads whenever the
machine is on AC.

### 2026-08-16 · Bar hover cards: one `__barMouse`, and let the card measure itself

The Rust cursor feed writes a single `window.__barMouse`, so the hover
machinery can't live inside one component — the second hoverable cell silently
wins the global and the first stops opening. It now lives in `src/bar/hover.ts`,
owned by `Bar`, hit-testing `[data-hover]` cells and `.bar-card` regions.
Card height had the same shape of problem: the window grows by a fixed amount,
so a card whose content arrives after the open (the battery detail fetch) gets
clipped by a guess made before it existed. The cell's `data-hover-height` is now
just the opening estimate; a `ResizeObserver` on the card re-sends the real
height (`getBoundingClientRect().bottom`, viewport-relative — the viewport top
_is_ the strip top, so nesting can't skew it).

### 2026-08-16 · Destroying the NSPanel bar aborts the whole process

Toggling `bar.enabled` off called `WebviewWindow::destroy()` on the converted
NSPanel and launcharr died with SIGABRT: an Objective-C exception thrown during
teardown crossed into tao's run-loop observer as a foreign exception
(`__rust_foreign_exception` → abort; crash report 15:18). NSPanels converted by
tauri-nspanel (with the constrainFrameRect override installed on the class)
don't survive tauri's destroy path — hide them instead and skip invisible
windows in the push loop. Same likely applies to any future panel-class window.

### 2026-08-16 · `system_profiler SPAirPortDataType` scans wifi with no Location prompt — slowly, with typos

The blocker that shelved wifi scanning in P0 (CoreWLAN wants Location Services) has a
stock-binary bypass: `system_profiler SPAirPortDataType -json` lists nearby SSIDs,
security mode, and signal/noise, TCC-silent. Two gotchas: it takes ~7 s (async command,
spinner, one-shot per keypress — never on the refresh interval), and the JSON's enum
strings can't be trusted verbatim — this macOS build emits a typo'd
`pairport_security_mode_wpa3_transition` (missing leading `s`), so the parser treats
"anything not none/open" as secured instead of matching known values.

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
