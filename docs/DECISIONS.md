# DECISIONS

> Append-only log of decisions with reasoning so choices aren't relitigated. Dated entries,
> **newest at the top.** Lightweight ADR format. The standing stack lives in `CLAUDE.md`.

---

### 2026-08-17 · The launcharr loupe (2×, Screen Recording opt-in) fronts the color picker; the system sampler stays as fallback

- **Decision.** Same-day feedback: Apple's sampler zooms too hard to aim ("decrease
  intensity… try a zoom of 2") and exposes no magnification knob, so `colorpicker` now
  opens **our own loupe** (`loupe.rs` + `src/loupe/`): a transparent non-activating key
  panel over the mouse's screen; the webview draws a 264pt magnifier (default **8×**, 2–8 in
  Settings) from pixels Rust captures with `CGDisplayCreateImageForRect` — the loupe
  window's `sharingType = None` keeps it out of the frame (JOURNAL 2026-08-17 for the
  window-list attempt that skipped Notion), shows the centre pixel's hex, click picks / Esc cancels / losing key cancels.
  Two IPC commands: `loupe_capture(x, y, size)` (binary `Response`: `[w][h][RGBA…]`) and
  `loupe_done(hex?)`. It needs **Screen Recording**: not granted → `CGRequestScreenCapture
Access` once and Apple's `NSColorSampler` handles that pick, so nothing is lost by
  refusing. Invariant 1 reworded to "zero _required_ permissions" with this one opt-in.
  Zoom/diameter are constants in `src/loupe/main.tsx` (hackable), not config — yet.
- **Why.** The magnification is the whole complaint and only a loupe we draw can change it;
  drawing it in the webview keeps the opinion (zoom, ring, label) in TypeScript and Rust to
  byte-moving. The window is created once and hidden after (destroying nspanel-converted
  windows aborts, JOURNAL 2026-08-16), so idle memory only grows after the first pick.

### 2026-08-17 · Color picker = Apple's `NSColorSampler`; confirmations are an in-panel toast, never a notification

- **Decision.** `colorpicker` (a `launcharr:` index item, fuzzy-matchable) runs
  `NSColorSampler` — the system loupe — on the main thread; the pick lands as uppercase
  sRGB `#RRGGBB` on the pasteboard, Esc copies nothing. No new IPC command: it rides the
  existing `execute` arm (`colorpicker.rs`, block2 callback). Confirmation is a **toast**:
  a one-row "✓ Copied …" the panel shows for ~1.1 s and then hides itself. Two feeders:
  the frontend (`copy_text` gained an optional `keep_open` so the row can show first) and
  Rust `panel::flash(text)` (`toast` event + `show()` _without_ key, for actions that
  finish after the panel dismissed — the sampler).
- **Why.** The sampler needs zero permissions and zero pixels of our own (invariant 1 and
  the weight budget); a hand-rolled loupe would need Screen Recording. macOS notifications
  need a granted permission, so the toast primitive is the only confirmation channel that
  keeps invariant 1 — and it's reusable for every "copied" action. HEX only for now (the
  ticket's open questions: format + history stay open until real use asks).

### 2026-08-17 · `lorem` is a built-in (five volumes, semi-random); the bundled script retires

- **Decision.** `@launcharr/core/lorem`: rng-injectable generator (Title / 1 sentence /
  2 sentences / Paragraph / 2 paragraphs; the classic opening survives as a paragraph's
  first sentence, everything else is drawn from the vocabulary). Two steps: `lorem`
  shows one row, **Enter opens the volume menu** (Mitch's feedback the same day — the
  keyword confirms first), Enter again copies; generation happens at that Enter so every
  copy is a fresh draw, toast confirms. `lorem.py`
  leaves the bundle (`json-format.py`, `ip.py` remain the reference scripts).
- **Why.** The ticket wants a picker of volumes and non-repeating text; the built-in
  trigger wins precedence over scripts (like `clip`), so keeping the script would only
  shadow it. Site copy and docs examples that used `lorem` as _the_ script example now
  use a `uuid` example.

### 2026-08-17 · Agent mode surface lives in `@launcharr/tui` (`AskSurface`); markdown-lite in core

- **Decision.** The `?` conversation is turns (`AskTurn[]`); the **first question is
  pinned in the header** (`AskPinned`, spinner while busy), the transcript scrolls
  below (`AskSurface`), the follow-up prompt row sits at the bottom — moved there by
  flex `order`, so the `<input>` never re-mounts and keeps focus. Thinking state is a
  Claude-style breathing asterisk cycle + a shimmering rotating verb; streaming shows a
  pulsing block cursor. `parseMarkdownLite` moved from apps/desktop to
  `@launcharr/core/markdown`; the www demo imports the same components (invariant 10 —
  the demo's hand-rolled ask block is gone). Brand icons (GitHub, X) moved to
  `@launcharr/tui/icons` (own entry point: RSC-safe) for the same reason.
- **Why.** Notion "Agent Mode Feedback". Images in answers were **declined**: rendering
  remote images means the desktop app fetching over the network (invariant 2), and the
  caged CLI has no fetch tools anyway — needs an invariant discussion, not a ticket.

### 2026-08-17 · Settings: Agents split into sub-tabs; Shortcuts tab removed; About fleshed out

- **Decision.** Settings → Agents = SubTabs (Agent mode / Local monitoring / Usage
  monitoring). The Shortcuts tab is gone — `config.shortcuts` and its hot-apply are
  untouched (hand-edit config.json; may return as a panel). About: byline, links to
  launcharr.com / docs / GitHub / releases / X, the zero-permissions line.
- **Why.** Notion tickets ×3 (Mitch, 2026-08-17): the Agents tab had grown three
  features deep; per-item global hotkeys aren't earning their tab yet.

### 2026-08-17 · Unmanaged aerospace.toml: `desktop_toml` (use my own / save a copy), file dialogs via osascript

- **Decision.** Settings → Desktop → "Let launcharr manage AeroSpace". Checked: knobs, no
  file talk. Unchecked: a Config-file row with **edit**, **use my own config…** (pick any
  toml; the canonical `~/.config/aerospace/aerospace.toml` becomes a symlink to it, anything
  there first is `.bak-launcharr`'d) and **save a copy to edit…** (launcharr's rendered
  config written where you choose behind an "exported — yours now" first line, then linked
  to). One new command, `desktop_toml(action)`, returning the chosen path or null on
  cancel. Pickers are `osascript 'choose file' / 'choose file name'` — no dialog plugin
  crate. Re-managing renames a fresh file over the symlink; a user's target is never
  written through. `open_path` gained the `aerospace-toml` target for **edit**.
- **Why.** Mitch (0.4 feedback): the managed/unmanaged switch should be one plain sentence,
  and unchecking should hand you real options rather than prose about a path. Symlinking
  is how dotfiles users already work; the copy-out is the honest way to "start from
  launcharr's and make it mine". Also this round: borders ride on tiling (tiling off →
  borders off, section hidden), Always-float hidden, settings 760px wide, HTML DnD fixed
  (JOURNAL 2026-08-17).

### 2026-08-17 · Screenshots panel: three commands; the first grid + scrolling panel

- **Decision.** `ss ⏎` / `screenshots ⏎` opens a newest-first thumbnail grid of the
  macOS screenshot folder (`defaults read com.apple.screencapture location`, else
  `~/Desktop`); Enter puts the **file** (file URL + image bytes) on the pasteboard and
  hides — ⌘V into Claude/Cursor/a browser is the whole feature. ⌘⏎ reveals, ⌘⇧⏎ opens.
  Three new commands: `list_screenshots` (full listing, TS pages/filters),
  `screenshot_thumb` (320px JPEG cached under `$APPDATA/thumbs`, asset-protocol
  served, decodes serialised), `screenshot_action` (copy | open; reveal reuses
  `reveal_item`). Plan: plans/done/screenshots-panel.md.
- **Why.** @the_mewc: the one Raycast feature a "better Spotlight" user keeps it for —
  "purely as a means to get visual feedback into <insert agent surface here>". A
  screenshot is found by recency, not by name (`Screenshot 2026-08-17 at 11.53.23.png`),
  so the 8-row narrow-by-typing list is the wrong shape: this is deliberately the
  first **grid** and the first **scrolling** surface (24 per page, ↓ past the bottom or
  scrolling to the sentinel loads more). Panels already left the 8-row list behind
  (`clip`, `wifi`); this is a new tenant, not a list exception. Grid nav is a pure
  `nav/grid.ts` in `packages/tui` (+ `useGridNav`, `ThumbGrid`/`ThumbCell`), so the
  site can import it under invariant 10.
- **Rejected.** OCR/text search, a date query language, a recordings tab, drag-out —
  Raycast's surface area, not the need. `NSFilenamesPboardType` (deprecated; file URL
  - image data covers Finder, browsers and terminals).

### 2026-08-17 · v0.4 desktop layer: AeroSpace as a Homebrew dependency, JankyBorders opt-in, never vendored; corner radius via hidden default; CornerFix rejected

- **Decision (delivery).** AeroSpace ships as a **cask dependency** (`depends_on cask:
"nikitabobko/tap/aerospace"`), not a vendored binary — this supersedes the "vendor a
  pinned release binary under launcharr's own directory" clause of 2026-08-15. Zip installs
  get the same via a one-click `brew install` from Settings (or the command shown when
  Homebrew is absent). launcharr downloads nothing itself: zero-network holds.
- **Decision (borders).** JankyBorders is **GPL-3.0** (verified); AeroSpace MIT; launcharr
  MIT. Distributing the `borders` binary inside `launcharr.app` is GPL distribution (grey
  at best); porting its code makes launcharr a derivative (GPL — dealbreaker). Installing
  via Homebrew and spawning it as a process triggers neither. So: borders is an **opt-in
  Homebrew install from Settings → Desktop**, supervised by launcharr, never vendored,
  never ported. Its config is CLI flags rendered from launcharr's theme, no `bordersrc`.
  No MIT alternative exists that is maintained (yabai's pre-v6 border code is the only
  fork candidate; not worth owning a SkyLight hack).
- **Decision (config ownership).** launcharr's `config.json` is the only surface;
  `aerospace.toml` is generated from a pure renderer in `packages/core` and reloaded live.
  Few knobs (modifier, gaps, workspace count, float rules, border width, corner radius).
  `desktop.tiling.managed = false` is the escape hatch **and** the adopt-or-stop
  migration answer for existing installs (adopt = backup + overwrite).
- **Decision (corner radius).** System window corner radius is a look-and-feel knob via
  the hidden AppKit global `defaults write -g NSConvolutionOverride1 -float N` (no SIP,
  no injection; verified 2026-08-17 on 27.0 — `0` reads as unset, min 1; per-app on
  relaunch; Finder/Quick Look exceptions). Undocumented → the UI says so and fails
  visibly. **CornerFix** (makalin, MIT) and macos-corner-fix (m4rkw) are dylib-injection /
  SIP-off tools — rejected outright; incompatible with zero-permissions and with asking
  users to weaken system security for cosmetics.
- **Decision (Mitch's machine).** Hand-installed AeroSpace/borders/aerospace-swipe come
  off before installing 0.4; only launcharr-managed versions from then on. Dotfiles keep
  the toml/bordersrc as historical templates but stop deploying them.
- **Decision (AeroSpace's menu bar item).** Goal: fewer menu bar items, so hide it by
  default. **Not possible from outside**: it's a SwiftUI `MenuBarExtra` without
  `isInserted`, so AppKit forces `NSStatusItem VisibleCC Item-0 = 1` back on every launch
  (tried 2026-08-17, both `Visible` and `VisibleCC` keys) and no config key exists. Instead
  the menu's _contents_ move into the launcher — **`aerospace ⏎` panel** (fuzzy `aero`,
  `tiling`, `workspace`): workspaces (Enter/digit focuses), pause/resume, reload config,
  open config, sponsor — so the icon is redundant and a menu-bar manager (Ice/Bartender)
  or launcharr's own bar covering the strip can hide it. Hiding it for real needs an
  upstream AeroSpace option (MIT — a small PR; not started).
- **New IPC** (thin, plain-function-backed): `desktop_status`, `desktop_apply`,
  `desktop_adopt`, `desktop_install`, `desktop_corner_radius`, plus `aerospace_workspaces`
  / `aerospace_action` (validated enum) for the panel. Plan:
  `plans/done/v0.4-desktop-aerospace-borders.md`.

### 2026-08-16 · awake B–D: sessions split Rust-mechanical / TS-opinionated; one readings command

- **Decision.** A keep-awake session's _semantics_ live in TypeScript: `@launcharr/core/awake`
  owns the spec type, grammar, every user-facing string, and the pure trigger reducer
  `(reading, prev) -> verdict`. Rust stores the spec **verbatim** (never interprets it) and
  enforces only the two mechanical rails — the absolute deadline and the battery floor — in a
  watchdog thread, so they fire with every webview asleep. One further IPC command joins the
  surface: `awake_readings(apps, display, net)` — a single sample (AC, battery, SSID, agent
  states, plus optionally running apps / external display / net bytes, each gathered only when
  the _caller_ asks). The caller decides the flags from the spec, keeping Rust opinion-free.
  `BarSnapshot` gains the cheap `awake` state.
- **Watcher placement.** The bar window evaluates triggers on each Rust-pushed snapshot while a
  conditional session is armed (zero cost idle); the launcher window runs a 10 s fallback
  interval only when the bar is off. Both may run — release is idempotent. Known degradation:
  with the bar off, the fallback rides WebKit timers, which throttle in hidden windows; the
  grace windows and Rust rails bound the damage.
- **Readings sources.** Load via libc `getloadavg`, displays via CGGetOnlineDisplayList /
  CGDisplayIsBuiltin, apps via NSWorkspace on the main thread (all in-process, permission-free);
  network via `netstat -ib` behind a 30 s cache, paid only while a busy session is armed. The
  busy trigger watches **processor and network** — disk I/O has no cheap permission-free
  cumulative counter, so the panel copy says exactly that (plan deviation, recorded there).

### 2026-08-16 · awake: in-process power assertions; three IPC commands; caffeinate slugs deleted

- **Decision.** Keep-awake (`awake ⏎`, plan `plans/active/awake.md`) holds
  `IOPMAssertionCreateWithName` assertions **in-process** in `power.rs` — never by spawning
  `caffeinate`. Three Tauri commands join the surface (tiny-IPC rule): `awake_arm` /
  `awake_release` (sync, two IOKit calls) and `awake_status` (async; spawns
  `pmset -g assertions` for the "also keeping this Mac awake" list — panel/card open only,
  never the bar tick). The `caffeinate` and `decaffeinate` system-command slugs are deleted.
- **Why.** In-process assertions carry launcharr's name in `pmset -g assertions`, are
  introspectable, and release on drop/quit/crash (per-process kernel state — the OS reaps
  them with us). The deleted `decaffeinate` ran `pkill -x caffeinate`, killing **every**
  caffeinate on the machine including ones held by build scripts and agent sessions — a
  footgun, not a feature. Arming always pairs `PreventUserIdleSystemSleep` with
  `PreventSystemSleep`: the latter is what survives lid-close on AC and costs nothing on
  battery (macOS ignores it there by policy).
- **Grammar continuity.** The deleted slugs' aliases (`caffeine`, `caffeinate`,
  `keep-awake`) must resolve to the `awake` grammar when slice B lands, so muscle memory
  still works. `sleep` stays what it is — the existing sleep-now system command.

### 2026-08-16 · Invariant 10 hardened: imported, never ported — and the bar moves to the kit

- **Decision.** Mitch's call: **the website may never hold a second copy of any launcharr
  UI.** Invariant 10's original wording allowed "ported from the app source with the source
  named in a comment" — that escape hatch is closed. Every pixel `apps/www` renders of the
  app is imported from a shared package; if a surface lives only in `apps/desktop`, it gets
  extracted into a package _first_, then imported. Copying is not a shortcut to be
  justified; it is the failure.
- **Why.** The comment-and-port compromise was tested within hours and lost: the ported bar
  shipped four wrong facts (entry below). The deeper reason is scale — every new surface
  doubles the copies, and each one drifts silently. A rule that permits copying with
  paperwork is a rule that gets worse as the app grows.
- **Consequence, done same day.** The bar's presentational layer moved into
  `packages/tui/src/bar/` — `bar.css` from `.bar` down, the strip/workspace/agent/battery
  components, the pure formatters, and the data types. `apps/desktop/src/bar/main.tsx` is
  now a container (Rust snapshots in, `invoke` out) and `apps/www` imports the same
  components. Plan: `plans/done/bar-extraction.md`.
- **What deliberately did NOT move.** Zone resolution (`normalizeBarZones`/`notchedZones`
  encode config semantics including legacy migration — they belong beside `Config`),
  `window.__notched`, every `invoke`, and the bar _window's_ own CSS resets: a web page
  importing `height: 100%; overflow: hidden` on `<body>` would break. `BarModule`/`BarZones`
  _types_ did move, so there is one definition.
- **Hover stayed split, on purpose.** The app polls the cursor from Rust because WebKit
  won't deliver hover to a never-active accessory window; a browser has real pointer events.
  The kit defines `BarHoverApi` and each consumer owns its feed. A hook with an injected
  feed would be abstraction nobody needs yet.
- **Lucide became a kit dependency** rather than icons-as-props, and the battery icon-tier
  logic moved with it — otherwise both consumers would re-derive which glyph a percentage
  gets, which is the duplication being deleted.
- **Also.** `./bar` joins `./themes` as an entry point, for the same reason: server
  components must reach pure modules without pulling the React barrel.

### 2026-08-16 · Invariant 10: the site demos the real thing, never a replica

- **Decision.** Anything in `apps/www` depicting the app is **imported** from the shipping
  code (`packages/tui`, `packages/core`), or **ported from the app source with that source
  named in a comment**. Inventing a component, or building one from a design mockup, is now
  an invariant violation. Only genuinely absent data stays fictional — a fake index, fake OS
  readings — and it's shaped like the real payload. Full text in `AGENTS.md`.
- **Why (the incident).** The www redesign built its bar strip, agent cells and hover card
  from the Claude Design export's hardcoded values instead of `bar/bar.css` and
  `bar/main.tsx`. Mitch caught three errors on sight: the front app and right-side cells
  rendered `--dim` when `.bar-cell` says **"fg, not dim — the dim tone read too dark against
  the strip"**; the `working` cell used the site's pink `--cta` instead of the theme accent,
  so it didn't retint with the theme picker; and the hover card dropped the glyph and
  relative age, used the wrong tmux line, and sat at the wrong offset. The state key was
  `blocked` — that's only the display label; the wire name is `attention`.
- **The sharp edge.** All three facts were decided _that same day_. A design export is a
  snapshot of a proposal, and this app moves faster than any mockup can track — so a mockup
  is input to page layout and copy only, never to app-depicting components.
- **Why it's an invariant, not a preference.** The demo's entire value is that it _is_ the
  app: the matcher, the panels and the keyboard nav are really running. A replica that
  drifts is worse than no demo, because it ships a confident lie about the product and the
  drift stays invisible until someone who knows the app looks at it. This generalises
  invariant 5 (the matcher is never forked or hand-copied) from the engine to every surface.
- **Consequence.** A port is a debt, not a resting state: when a ported surface gains a
  second consumer, extract it into a package. The bar chrome is the live case — it sits in
  `apps/desktop/src/bar/` with the website now a second consumer, so extracting it into
  `packages/tui` is queued for Mitch's call.
- **Also.** `packages/tui` gains a `./themes` entry point (themes are pure data; server
  components can't import the barrel, which re-exports hook-using components), with the
  reason recorded in the package's exports map so a tidy-up doesn't fold it back in.

### 2026-08-16 · Zone board v2: full-width, and retirement replaces show/hide

- **Decision (layout).** The Menubar tab's zone boards deliberately break the settings
  window's 160px-label/control grid — three drag columns need the whole content column
  (`.row-full`). One-tab exception, not a new pattern.
- **Decision (retirement).** The per-module checkbox is gone: ✕ on a widget row retires
  it to a "Retired" tray under the board; tray chips drag back into any zone (or drag a
  widget straight onto the tray). Persistence is the existing `enabled: false` flag left
  in place — no schema change, and the bar renderer already skips disabled modules, so
  the concurrently-edited bar code needed no touches (coordinated with the battery
  session; boundaries held: this change is SettingsApp.tsx + settings.css only).

### 2026-08-16 · Battery hover card: one lazy command, and power mode stays read-only

- **Decision.** The bar's battery cell gets a hover card (capacity, time left, cycles, draw,
  health, active power mode), fed by a new `bar_battery_detail` command that spawns
  `ioreg -rn AppleSmartBattery` + `pmset -g custom` **on hover only**, never on the 1 Hz
  snapshot. The power-profile row is **read-only** — clicking the cell opens System
  Settings → Battery (a validated `open_path` target, not a new command).
- **Why.** The snapshot is pushed to every bar every second; hanging an `ioreg` spawn off it
  would buy a cost nobody sees most of the time — hence the fifth bar command, weighed
  against invariant 3 and taken. Setting power mode needs `pmset` as root, i.e. an admin
  prompt on every switch: invariant 1 (zero granted permissions) says macOS keeps that
  switch and we only report its position.
- **Also.** `bar_set_dropdown` now takes the height the open card needs (cards measure
  themselves), and the `window.__barMouse` hover machinery moved from `AgentCluster` into a
  shared `src/bar/hover.ts` — two hovering cells can't share one global by accident.

### 2026-08-16 · apps/www adopts shadcn/ui, and the site consumes `@launcharr/tui`

- **Decision (shadcn).** `apps/www` gains the shadcn/ui foundation — `components.json`,
  `cn()`, `clsx` + `tailwind-merge` + CVA — and copies components in under
  `src/components/ui/`. Its tokens are **mapped onto the existing launcharr CSS vars**,
  never imported: shadcn's oklch palette would fork the design tokens that invariant 8
  makes single-source. Radix is admitted only where it buys real keyboard a11y (Tabs);
  Button/Badge/Table are CVA-and-markup only, and the agent hover card stays hand-rolled
  because a Radix tooltip fights the fake-menubar aesthetic it lives inside.
- **Why.** The redesign adds a comparison table, tabbed install, and a docs route — the
  ordinary UI vocabulary the site has so far hand-rolled. shadcn is copy-in, so the
  components become repo code we own rather than a dependency that owns us, which is what
  keeps this compatible with "every dependency is a liability."
- **Decision (tui).** The site takes `@launcharr/tui` as a workspace dependency and renders
  the demo's wifi/dns/usage panels from the real kit. `src/lib/demo-themes.ts` — a
  hand-copied theme fork — is deleted in favour of the kit's `BUILTIN_THEMES`.
- **Why.** The fork had already drifted: it carried the retired `#ff176c` accent after the
  app reverted to `#ff6b8c`. The kit is pure presentation with React as its only peer dep,
  so there was never a reason for the website to own a second copy. Same spirit as
  invariant 5 — the site demos the real thing or it isn't a demo.
- **Cost.** The website now breaks if `@launcharr/tui` changes shape. Accepted: that break
  is a typecheck failure in `pnpm verify`, which is exactly the signal a drifted hand-copy
  never gave us.

### 2026-08-16 · Bar layout becomes explicit zones (left / center / right)

- **Decision.** The clock-anchored flat module list (same day, below) lasted hours:
  Mitch's verdict was that ordering alone can't express alignment. `bar.layout` is now
  `BarZones { left, center, right }` — every module lives in a zone, ordered within
  it, and the clock is an ordinary module. `bar.notchedLayout` is the same shape;
  notched displays render no center zone (camera housing), and when the field is
  absent the arrangement derives from `layout` with center folded into the head of
  right. Legacy `modules`/`notchedModules` migrate at load (split at the clock,
  exactly the old renderer's behavior) and stop being written.
- **UI.** Settings → Menubar is a zone board: one column per zone (three main, two
  notched), drag between and within columns, per-module show/hide. Missing modules
  normalize into their default zone; on notched boards center-homed modules fold
  into right so nothing becomes unreachable.

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
