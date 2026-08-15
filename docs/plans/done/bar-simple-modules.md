---
title: Bar simple modules — wifi, TRMNL, battery/clock parity
status: done
created: 2026-08-16
updated: 2026-08-16
links:
  - docs/ROADMAP.md v0.5 B2/B4
  - dotfiles sketchybar plugins (reference behavior)
---

# Bar simple modules — wifi, TRMNL, battery/clock parity

## Goal

Port the remaining "simple" Sketchybar modules into the launcharr bar: wifi
(SSID/offline), TRMNL device battery, and battery/clock feature parity. Vercel,
GitHub Actions, uptime, and agent status are explicitly saved for later.

## Approach

- New `bar_modules.rs`: data gathering + pure tested parsers. Wifi ports the
  sketchybar SSID chain verbatim (ipconfig getsummary → networksetup →
  WiFiAgent plist heuristic with `WIFI_HOME_SSID`, default RamenAmok). TRMNL
  ports the decrypt-helper token flow (`TRMNL_API_KEY` env overrides) + ureq
  GET, fail-soft: hidden without token, red with token but API down.
- Slow sources refresh on their own threads (wifi 20s, TRMNL 300s) into
  statics; the 1 Hz push loop only reads — an 8s HTTP timeout must never
  stall the bar heartbeat.
- Battery gains charging detection + color states (red <20, amber <50, AC on
  desktops); clock adopts the sketchybar format (`Sat 16 Aug 07:45`).
- First bar-module network carve-out (TRMNL) recorded in DECISIONS.

## Steps

- [x] Parser tests + impls: hardware-ports iface, getsummary SSID/link,
      getairportnetwork, WiFiAgent heuristic, TRMNL device JSON, charging
- [x] Refresh threads + snapshot fields (wifi, trmnl, charging)
- [x] Frontend cells + color classes + clock format
- [x] DECISIONS entry; verify; build + relaunch; STATUS; plan → done

## Out of scope

Vercel/GitHub/uptime modules, agent bar, module placement config, popups.
