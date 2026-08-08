# Learnings

Distilled, per-topic project knowledge — the pruned reference promoted from `docs/JOURNAL.md`
once a gotcha proves durable. One or two lines per entry; link a DECISIONS entry or plan file
if it needs more. Never duplicate global AGENTS.md rules here.

## macOS / AppKit

- Bulk `NSWorkspace.iconForFile` + rasterization leaks ~20–30MB/icon that autoreleasepool and
  `recache()` cannot release — icon extraction MUST run in the `--extract-icons` subprocess.
- `open Foo.app` re-activates a running instance; always `pkill` before relaunching a rebuild.

## Tauri / tauri-nspanel

- tauri-nspanel branch is `v2.1`; `tauri_panel!`/`panel_event!` macros; keep event handlers
  alive (`std::mem::forget`) — NSWindow delegates are weak.
- The macro's mandatory `-> ()` trips clippy `unused_unit`; allowed crate-wide in lib.rs.
- `tauri.conf.json` assetProtocol requires the `protocol-asset` cargo feature on `tauri`.

## Toolchain

- brew's rustup puts cargo proxies in `/opt/homebrew/opt/rustup/bin`, not `~/.cargo/bin`;
  `.lefthookrc` exports it for hooks. `rustup run stable cargo fmt` does NOT work here.
- pnpm 11 hard-fails on unapproved postinstall scripts; approve via `allowBuilds:` in
  `pnpm-workspace.yaml`.
