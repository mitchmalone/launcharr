# Omarchy panels and polish (colors, icons, clipboard/audio/help panels, wifi scan, fuzzy keywords, 5-day ranking)

> One AFK session, 2026-08-16. Eight asks from Mitch, Omarchy screenshots as inspiration
> (~/Downloads, 2026-08-15 10:22–10:25).

## Scope

1. **Colors** — launcharr theme: bg `#1C1D2A`, accent `#FF176C`, fg/icon `#B5B9D9`,
   dim/unhighlighted `#73747C`. Touches `packages/tui/themes.ts`, desktop CSS fallbacks,
   www demo mirror. ✅
2. **Lucide icons** — battery + wifi cells in the bar switch from text glyphs (`↯▮◠`) to
   `lucide-react` icons (already a dependency). Structure leaves room for custom
   Lucide-style brand SVGs later.
3. **Clipboard history panel** — `clipboard` keyword opens a panel: search input feel via
   list filter, entries left, preview right (TwoPane). Reuses the existing `clips`
   backend (poller, 200 cap, `get_clips`/`copy_clip`/`delete_clip`). Text clips only —
   image capture is a separate decision (storage weight), noted as follow-up.
4. **Audio panel** — `audio` keyword: OUTPUT volume + device list, INPUT volume + device
   list (screenshot 10.24.21). Volumes via `osascript` get/set (zero permissions);
   device enumeration + default switching via CoreAudio (`objc2-core-audio`), unsafe
   confined to `audio.rs` with safety comments.
5. **Wifi panel extras** — power toggle exists (`p`); add **scan**: `s` /
   "Scan for networks…" row runs `system_profiler SPAirPortDataType -json` async
   (no Location Services needed), lists other networks, Enter connects.
6. **Help panel** — `help` keyword: sectioned reference of prefixes (`!` `:` `?`),
   panel keywords, system commands, scripts (their reserved `description` finally
   rendered), launcher keybindings (screenshot 10.22.56).
7. **Fuzzy keyword matching** — panel keywords (+ `clip`) become rankable items so
   `usag`, `clipb` etc. match like apps; exact-token trigger path in the grammar stays.
8. **5-day launch ordering** — frecency weight becomes a 5-day window (1.0 within,
   0.1 residual beyond); multiplier cap relaxes 1.5×→2.0× so a few days of launching
   VS Code beats Codex on `code`. Rust signal + core multiplier + tests.

## Invariant checks

- Zero network: untouched. Zero permissions: audio via osascript+CoreAudio property API
  and wifi scan via system_profiler require no TCC prompts. No Accessibility.
- New Tauri commands (architectural, record in DECISIONS): `audio_status`,
  `audio_set_volume`, `audio_set_default_device`, `wifi_scan`.
- Matcher stays pure; keyword items flow through the same `rank()`.

## Manual checklist (native behavior)

- [ ] `clipboard ⏎` panel: filter, Enter copies + dismisses, preview pane renders.
- [ ] `audio ⏎`: volumes move in ≤5% steps, device switch audible, panel survives device unplug.
- [ ] `wifi ⏎` → `s`: scan completes, join open + known networks.
- [ ] Bar icons legible at 30px strip in all themes.
- [ ] `code` learns VS Code after repeated launches.

## Status

- [x] 1 colors
- [x] 8 five-day ranking
- [x] 7 fuzzy keywords
- [x] 2 lucide bar icons
- [x] 6 help panel
- [x] 5 wifi scan/power (+ masked password join)
- [x] 4 audio panel (osascript volumes + coreaudio.rs FFI devices)
- [x] 3 clipboard panel (TwoPane over existing clips backend)
- [x] pnpm verify green + app relaunched

Manual checklist above stays for Mitch's hands (STATUS → Blocked/waiting).

(ticked as they land; numbers = task list order, execution order differs)
