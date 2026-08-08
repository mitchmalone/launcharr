---
title: URLs, Google fallback, Raycast-style quicklinks
status: done
created: 2026-08-09
updated: 2026-08-09
links:
  - PRD.md §4.4 (grammar), §3 (zero-network — browser opens don't count)
---

# URLs, Google fallback, Raycast-style quicklinks

## Goal

Type a URL → open it. Type a dead-end query → Alfred-style "Search Google" fallback.
Define Raycast-style quicklinks with `{query}` placeholders in config.

## Approach

- `url.ts`: URL-ish detection (scheme, localhost, or dot + TLD allowlist), pure + tested.
- Launch mode rows: URL row on top when the query is URL-ish; search-fallback row **only
  when nothing else matches** (Alfred behaviour). `searchFallback` URL in config
  (default Google, `{query}` placeholder).
- Quicklinks: `links` entries get optional `trigger`; with `{query}` in the URL they join
  the first-token trigger table (precedence: clip > scripts > quicklinks). Enter opens the
  URL with the encoded args. Plain links unchanged.
- Rust: `Link.trigger` field, `search_fallback` config key, `open_url` command (hide + open).

## Steps

- [x] url.ts + tests; rows.ts launch/quicklink rows + tests
- [x] grammar triggers from quicklinks; App wiring
- [x] Rust config + open_url; gates; build; install; docs; plan → done

## Acceptance criteria

- [x] `github.com ⏎` opens the browser; `no-such-app-xyz ⏎` offers Google and opens it
- [x] A `yt` quicklink in config: `yt cute otters ⏎` opens the YouTube search
- [x] Plain links and all existing modes unaffected; tests green

## Out of scope

Multiple simultaneous search engines (one fallback), inline result previews, per-quicklink
icons.

## Outcome (2026-08-09)

Shipped: URL detection (scheme/localhost/TLD-allowlist, 56 TS tests total across the suite),
Alfred-style search fallback only on dead-end queries (engine configurable via
`searchFallback`), Raycast-style quicklinks via `links[].trigger` + `{query}` (a YouTube
example is seeded in Mitch's config). `open_url` command refuses non-http(s) targets.
Needs hands: `github.com ⏎`, a dead-end query ⏎, `yt something ⏎`.
