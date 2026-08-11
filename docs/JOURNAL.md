# JOURNAL

> Append-only dated log of learnings and gotchas, **newest first** — short and factual, written
> as they happen. Durable facts get promoted to `../LEARNINGS.md` (per-topic) and removed from
> active relevance here; decisions go to `DECISIONS.md`, not here.

---

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
