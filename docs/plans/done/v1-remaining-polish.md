---
title: v1 remaining — instrumentation, launch-at-login, first-run hint
status: done
created: 2026-08-08
updated: 2026-08-08
links:
  - PRD.md §7 (budgets), §4.5 (first run), §5.4 (settings)
  - ../../ROADMAP.md (M2 exit, M4)
---

# v1 remaining — instrumentation, launch-at-login, first-run hint

## Goal

Close out every buildable item left in the roadmap so v1 enters the M4 holdout ("no new
features, only fixes") with nothing owed: the §7 budgets become measured facts, launcharr
survives a reboot, and first run greets with the hint panel.

## Context

M0–M3 shipped and Mitch verified the focus dance manually (2026-08-08), including full-screen
and second-display cases. Remaining from ROADMAP: M2's "performance instrumentation against
§7" and M4's launch-at-login + first-run hint. The two-week holdout itself is Mitch's, not
buildable.

## Approach

- **Instrumentation, not benchmarks:** cheap timestamps on the two hot paths — Rust logs
  summon (toggle→shown) to stderr; TS logs keystroke→results-painted via performance.now in a
  dedicated perf module. Visible when run from a terminal; zero cost worth caring about.
- **Launch-at-login:** official tauri-plugin-autostart (LaunchAgent flavor), driven by a new
  `launchAtLogin` config key (default true — it's a launcher), applied at startup and on
  config change.
- **First-run hint:** `load_or_create` already knows when it wrote a fresh config; on first
  run, summon the panel once after setup. The standing input placeholder is the hint line.

## Steps

- [x] Move the verified M0 plan to `done/`
- [x] Rust: summon latency log; cold-start→hotkey-registered log
- [x] TS: `perf.ts` + keystroke→results timing in App
- [x] `launchAtLogin` config key + autostart plugin, startup + config-watch wiring
- [x] First-run: show panel once when the config file was just created
- [x] Gates green, rebuild, reinstall to /Applications, docs updated, plan → done

## Acceptance criteria

- [x] Summon and keystroke latencies observable in logs; numbers recorded in STATUS
- [x] `launchAtLogin: false` in config.json disables the LaunchAgent without a restart
- [x] Fresh config (delete `~/.config/launcharr`) → panel appears once on next launch

## Out of scope

The holdout itself; empty-query top-3 frecent (open question §11.3 — decide during holdout);
any new launcher features.

## Risks / open questions

- Autostart plugin's LaunchAgent points at the current binary path; fine for a local build
  installed at /Applications.

## Outcome (2026-08-08)

All delivered and verified live: cold start 163ms (budget <1s), native summon path 3.7ms
(budget <100ms), keystroke→results instrumented in the webview console. LaunchAgent verified
pointing at /Applications and toggling live via config.json watch (disable removes the plist,
enable restores it). First-run flow verified end-to-end: fresh config → panel auto-shows once
with the hint line. v1 is feature-complete; the M4 holdout begins.
