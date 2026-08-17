---
title: Screenshots panel — `ss` grid of latest captures, Enter copies the file
status: done
created: 2026-08-17
updated: 2026-08-17
links:
  - docs/DECISIONS.md (2026-08-17 · screenshots commands + first grid panel)
  - Origin: @the_mewc's tweet — "the only feature I use, purely as a means to get visual feedback into <insert agent surface here>"
---

# Screenshots panel

## Goal

`⌘Space ss ↵ ⌘V`: summon, open a grid of the newest screenshots, pick one, paste it
into Claude/Cursor/a browser. The one Raycast feature a "better Spotlight" user keeps
Raycast for, done launcharr-style — no OCR, no query DSL, no type dropdown.

## Context

- Full-panel modes already exist (`clip`, `wifi`, `agents`…): fixed 480px window, own
  keyboard nav, `Panel`/`TextPrompt`/`KeyHints` from `@launcharr/tui`. Screenshots is a
  new tenant in `panels/registry.ts` + `App.tsx`.
- Screenshot folder is `defaults read com.apple.screencapture location` (fallback
  `~/Desktop`). Filenames are `Screenshot 2026-08-17 at 11.53.23.png` — recency, not
  name, is how you find one. So the grid is newest-first and **scrolls / loads more**
  (Mitch, 2026-08-17: "if a user can't search back it's a bit clunky") — the first
  grid and the first scrolling list in the app, deliberately.
- Icons precedent: PNGs cached under `$APPDATA/icons`, served via the asset protocol
  with `convertFileSrc`. Thumbnails do the same under `$APPDATA/thumbs`.

## Approach

**Rust owns three boring things** (`screenshots.rs`, 3 new commands — DECISIONS):

- `list_screenshots()` → every image in the folder, newest first, capped at 2000:
  `{ path, name, mtimeMs }`. Listing is ~ms; TypeScript filters and pages.
- `screenshot_thumb(path)` → path of a 320px-wide JPEG thumbnail, generated with the
  `image` crate (already a dep) on a blocking thread, serialised behind a mutex so a
  cold first page never spikes memory. Cache key = hash(path + mtime); cache dir
  `$APPDATA/thumbs`, added to the asset-protocol scope.
- `screenshot_action(path, action)` — `copy` (hide panel; put the file URL, the
  filenames property list **and** the image bytes on the pasteboard so both file
  targets and image targets paste), `reveal` (`open -R`), `open` (`open`).

**TypeScript owns the experience**: `ScreenshotsPanel` (presentational, stories) +
container (invokes, 2s refresh while open, like clip). 4-column grid, thumbnail +
name + relative time, fuzzy filter on name via the core matcher, ↑↓←→ moves (new pure
`nav/grid.ts` + `useGridNav` in tui), Enter copy, ⌘Enter reveal, ⌘⇧Enter open, Esc
back. Page size 24; reaching the last row (or scrolling to the sentinel) shows 24
more. Only mounted cells request thumbnails — lazy by construction.

Trigger: panel id `screenshots`, trigger aliases `ss` / `shots` (new `triggers?` on
`PanelInfo`, resolved to the panel id in `App.tsx`).

## Steps

- [x] `screenshots.rs`: dir resolution, listing, thumb cache, pasteboard copy, actions + tests
- [x] Register commands; asset scope `$APPDATA/thumbs/**`
- [x] `nav/grid.ts` + tests; `useGridNav`; `.tui-thumbgrid` styles + `ThumbCell`
- [x] `ScreenshotsPanel` + container + stories; registry entry, icon, trigger aliases
- [x] DECISIONS entry (commands + first grid/scrolling panel); STATUS; help panel lists it
- [x] Verify green, build, relaunch, use it

## Acceptance criteria

- [x] `ss ↵` opens the grid, newest first, thumbnails fill progressively (verified 2026-08-17 by
      driving it with System Events: 22 thumbs ~8 KB each landed in `$APPDATA/thumbs`; folder
      resolved to `~/Downloads` from the screencapture default)
- [x] Enter → panel hides, pasteboard holds `furl` + `PNGf` (checked via `clipboard info`); ⌘V into
      claude.ai / Claude Code left for Mitch's hands-check
- [x] ⌘Enter reveals in Finder; ⌘⇧Enter opens (reuses `reveal_item` / `open`)
- [x] Typing filters by name; arrows move in 2D; reaching the bottom loads more, all the way back
- [x] Zero permissions, zero network; thumbs are files, not resident
- [x] `pnpm verify` green; grid nav + relativeAge/filter tests written first

## Out of scope

OCR / text search, screen recordings, a date query language, drag-out from the panel,
deleting screenshots, a "load into agent" action (that's ⌘V).

## Risks / open questions

- Retina PNG decode via `image` is ~100 ms each; first cold page ≈ 2 s serialised. If it
  feels slow, switch to CGImageSource thumbnails (`objc2-image-io`) — same cache contract.
- Browsers vary in what they take from a mixed file+image pasteboard; we set both.
