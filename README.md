# launcharr 🏴‍☠️

> _An app launcher for pirates._

launcharr is a macOS launcher for terminal nerds. Where Alfred and Raycast dress up as
polished macOS utility apps, launcharr dresses up as a shell prompt: summon it with a
hotkey, type into something that looks and feels like a REPL, and either launch an app or
fling a command at your terminal without breaking flow.

Two values govern every decision:

1. **Lightweight.** Idles invisibly (~90MB), summons instantly (<100ms budget, measured in
   single-digit ms). When a feature and the weight budget conflict, the feature loses.
2. **Hackable.** Extending launcharr feels like scripting, not app development. Drop an
   executable in a folder; its trigger word is live before you switch back to the panel.

## What it does

- **⌥Space** — non-activating floating panel; Esc returns focus exactly where it was
- **Launch** apps and System Settings panes, fuzzy-matched (fzf-family scoring),
  frecency-ranked from your actual usage
- **`!git status ⏎`** — bang mode hands the command to iTerm2 (or Terminal.app), verbatim
- **[Scripts](docs/SCRIPTS.md)** — executables in `~/.config/launcharr/scripts/` join the
  grammar with their own trigger words; bundled: `lorem`, `json`, `ip`
- **`clip`** — clipboard history (text, 200 items, concealed types never recorded);
  Enter copies — no Accessibility permission, ever
- **`2*(14.5+3)`** — inline math, Enter copies; **`:fire`** — emoji picker
- **URLs** — type one to open it, or add it as a quicklink (name, browser, favicon)
  in-panel; `{query}` templates make Raycast-style quicklinks (`yt cute otters ⏎`; a bare trigger opens the site itself)
- **Search fallback** — dead-end queries offer "Search Google for …" (engine configurable)
- **System commands** — sleep displays, lock, empty trash, dark mode, caffeinate…
- **⌥⏎** — secondary actions: reveal app in Finder, copy URL, delete clip
- **Bookmarks** _(opt-in)_ — index Chrome-family/Safari bookmarks as results
- **Settings** — a real settings window _and_ a hand-editable
  `~/.config/launcharr/config.json` (watched, hot-applied); both stay in sync

## Principles

- **Zero granted permissions.** No Accessibility, no Full Disk Access. The only prompts
  you'll ever see are macOS's standard Automation consents (first terminal hand-off,
  first Finder/System Events command).
- **Zero network.** Core makes no requests, with one user-initiated exception: fetching a
  site's favicon at the moment you add it as a quicklink. No telemetry, no phoning home.
- **The prompt is the product.** The menubar icon is a courtesy; everything it does, the
  panel does too (type `launcharr`).

## Install

Build from source (Apple Silicon; requires Rust stable + pnpm):

```sh
git clone git@github.com:mitchmalone/launcharr.git
cd launcharr
pnpm install
pnpm --filter @launcharr/desktop tauri build
cp -R apps/desktop/src-tauri/target/release/bundle/macos/launcharr.app /Applications/
open /Applications/launcharr.app
```

Or via Homebrew: `brew install mitchmalone/launcharr/launcharr`.

First run: the panel appears once with the hint line, a default config is written to
`~/.config/launcharr/config.json`, and launcharr registers as a login item (toggle in
settings). Signed releases: see [docs/RELEASING.md](docs/RELEASING.md).

## Hacking

`docs/SCRIPTS.md` is the plugin API. The repo is a pnpm monorepo — `apps/desktop` (the
app), `apps/www` ([launcharr.com](https://launcharr.com)), `packages/core` (the shared
matcher/grammar/ranking engine). The repo docs (`docs/`) carry the full decision log,
architecture (`AGENTS.md`), and per-task plans. Performance budgets are requirements, not
aspirations — instrumentation logs `[launcharr perf]` lines to stderr and the webview
console.

## Uninstall

```sh
rm -rf /Applications/launcharr.app \
       ~/.config/launcharr \
       ~/Library/Application\ Support/com.mitchmalone.launcharr \
       ~/Library/LaunchAgents/launcharr.plist
```

---

_launcharr: because the apps won't launch themselves. Yarr._
