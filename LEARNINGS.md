# Learnings

Distilled, per-topic project knowledge — the pruned reference promoted from `docs/JOURNAL.md`
once a gotcha proves durable. One or two lines per entry; link a DECISIONS entry or plan file
if it needs more. Never duplicate global AGENTS.md rules here.

## macOS / AppKit

- Bulk `NSWorkspace.iconForFile` + rasterization leaks ~20–30MB/icon that autoreleasepool and
  `recache()` cannot release — icon extraction MUST run in the `--extract-icons` subprocess.
- `open Foo.app` re-activates a running instance; always `pkill` before relaunching a rebuild.

## TUI kit (`packages/tui`)

- **Keyboard selection must always be scrolled into view — at both ends.** Every selectable
  kit component passes `revealSelected` as the selected element's ref (`ListRow`,
  `SegmentedControl` cursor); it does `scrollIntoView(nearest)` and snaps the panel body to
  the top when the selection is the first thing, so wrap-around from the bottom shows the
  section header too. Bitten twice (wifi 2026-08-16, aerospace strip 2026-08-17): any new
  selectable component that skips this ships the same bug.
- `.tui button` resets are `(0,1,1)`; kit component rules must be at least two classes deep
  (`.tui-segmented .tui-segment…`) or the reset silently wins (2026-08-17).

## Tauri / tauri-nspanel

- tauri-nspanel branch is `v2.1`; `tauri_panel!`/`panel_event!` macros; keep event handlers
  alive (`std::mem::forget`) — NSWindow delegates are weak.
- The macro's mandatory `-> ()` trips clippy `unused_unit`; allowed crate-wide in lib.rs.
- `tauri.conf.json` assetProtocol requires the `protocol-asset` cargo feature on `tauri`.

## Scripts / Python

- Never name a script after a python stdlib module — the scripts dir is `sys.path[0]` and it
  shadows the real module for every script there. Bundled scripts `del sys.path[0]` first.

## www (Next.js site)

- `lucide-react` v1 removed brand icons (Github, Twitter) — brand marks are inline SVGs in
  `apps/www/src/components/brand-icons.tsx`.
- eslint-config-next 16's `react-hooks/set-state-in-effect` rejects the classic
  `useEffect(() => setMounted(true), [])` hydration guard — use the `useSyncExternalStore`
  mounted pattern (see `theme-switch.tsx`).
- The Claude Design MCP cannot serve binary files; the site logo is a `sips` downscale of
  `apps/desktop/design/menubar-icon-source.png` (the repo copy is the source of truth).
  Favicons in `apps/www/src/app/` use the ⌘-on-black artwork Mitch supplied verbatim.

## Toolchain

- brew's rustup puts cargo proxies in `/opt/homebrew/opt/rustup/bin`, not `~/.cargo/bin`;
  `.lefthookrc` exports it for hooks. `rustup run stable cargo fmt` does NOT work here.
- pnpm 11 hard-fails on unapproved postinstall scripts; approve via `allowBuilds:` in
  `pnpm-workspace.yaml`.
