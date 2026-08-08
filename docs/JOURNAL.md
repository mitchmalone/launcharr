# JOURNAL

> Append-only dated log of learnings and gotchas, **newest first** — short and factual, written
> as they happen. Durable facts get promoted to `../LEARNINGS.md` (per-topic) and removed from
> active relevance here; decisions go to `DECISIONS.md`, not here.

---

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
