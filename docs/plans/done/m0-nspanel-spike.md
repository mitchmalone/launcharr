---
title: M0 — tauri-nspanel spike (the focus dance)
status: done
created: 2026-08-08
updated: 2026-08-08
links:
  - PRD.md §6, §9 (M0), risks R1/R2
  - ../../ROADMAP.md (M0)
  - ../../DECISIONS.md (2026-08-08 stack decision)
---

# M0 — tauri-nspanel spike

## Goal

Prove the one thing the whole stack decision hangs on: a Tauri 2 + tauri-nspanel panel that
summons on a global hotkey without stealing focus, accepts keystrokes, and dismisses with
perfect focus restore — including over a full-screen app. If this fails, the stack gets
revisited _before_ any product code exists.

## Context

The non-activating-panel/focus-restore problem is the hardest native part of launcharr (PRD
risk R1). tauri-nspanel exists precisely for this; Sol and SuperCmd are open-source references
using the same approach. Everything else in v1 is ordinary code.

## Approach

Scaffold the real repo (this isn't a throwaway — the spike becomes the app skeleton), add the
plugins, and drive the panel to the exit checklist manually. Instrument summon latency from day
one since the < 100 ms budget is also stack-validation (risk R2).

## Steps

- [x] Scaffold Tauri 2 + React-TS + Vite via `create-tauri-app` (pnpm), merged into this repo
- [x] Tooling: strict tsconfig, ESLint 9 flat, Prettier, Vitest, Lefthook (+commitlint),
      `rust-toolchain.toml`, clippy config; fill in CLAUDE.md "Local dev"
- [x] `LSUIElement`/accessory activation policy — no Dock icon, no menu bar
- [x] Global shortcut plugin: ⌥Space toggles the window
- [x] tauri-nspanel: convert the window to a non-activating floating NSPanel, centered,
      ~30% screen height, on the screen with the mouse pointer
- [x] Panel shows a monospace text input that receives keystrokes while frontmost app keeps focus
- [x] Esc / hotkey-again / click-outside dismisses and restores focus exactly
- [x] Instrument hotkey→visible latency (log to console is fine for now)

## Acceptance criteria (the exit checklist — verify each manually)

- [x] Summon over a normal app: panel appears, typing goes to panel, frontmost app unchanged
- [x] Esc: panel gone, focus (incl. text-field cursor position) back where it was
- [x] Summon over a **full-screen** app (Space): panel appears on that Space, dismiss restores
- [x] Works on a second display / screen-with-mouse heuristic behaves
- [x] Hotkey→visible < 100 ms measured
- [x] `pnpm typecheck && pnpm lint && pnpm test && cargo clippy -- -D warnings` green

## Out of scope

App indexing, matching, results list, frecency, bang mode, any visual polish beyond a
monospace input. M0 is the focus dance and nothing else.

## Risks / open questions

- tauri-nspanel is a community plugin — pin the version; note API quirks in JOURNAL.
- Stage Manager & multi-display edge cases: note behavior, don't chase perfection in M0.
- If focus restore can't be made reliable → stop, write it up in DECISIONS, revisit stack
  (AppKit/Swift fallback) per the M0 exit rule.

## Outcome (2026-08-08)

The focus dance works. Built in one pass alongside M1–M3; Mitch manually verified the full
checklist — summon over normal and full-screen apps, Esc/click-outside dismiss with exact
focus restore, second display, sub-100ms feel. The stack decision (Tauri 2 + tauri-nspanel)
stands. One real native bug surfaced during smoke testing (AppKit icon leak) — see JOURNAL.
