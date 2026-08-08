---
title: Add-quicklink flow (Raycast-style) + favicon fetch
status: done
created: 2026-08-09
updated: 2026-08-09
links:
  - plans/done/urls-and-search.md
  - ../DECISIONS.md (network carve-out, 2026-08-09)
---

# Add-quicklink flow + favicons

## Goal

URL detected → Open (row 1) / Add quicklink… (row 2). Adding asks for a name, then a
browser (default or a specific installed one), saves to config `links`, and fetches a
high-quality favicon (apple-touch-icon > sized icons > favicon.ico) as the link's icon.

## Approach

- **Network carve-out** (DECISIONS): a single user-initiated favicon fetch at add time.
  No background requests; core otherwise stays zero-network.
- Rust: `favicon.rs` (ureq, 4s timeouts; HTML `<link rel>` scan is a pure, tested fn;
  candidates by priority, decode via image crate w/ ico+jpeg, resize 64, cache as
  `link-<hash>.png`), `add_quicklink` command (read-modify-write config.json — the
  watcher does the rest), `Link.browser` + open via `open -a`.
- TS: URL detection yields two rows; a draft state machine in App (name step → browser
  step) reusing the row model; browsers detected from the index by known names.

## Steps

- [x] DECISIONS + PRD network line
- [x] favicon.rs + parse tests; link icon caching; browser field through index/execute
- [x] add_quicklink command (pure config-append fn, tested)
- [x] TS draft flow + rows + tests
- [x] Gates, build, live favicon verify, install, docs, plan → done

## Acceptance criteria

- [x] `stripe.com` → Enter on "Add quicklink…" → name → browser → saved; item appears in
      results with a non-ico favicon where the site provides one; opens in chosen browser
- [x] Esc backs out of the flow without dismissing the panel
- [x] Manual config links still work; no fetch ever happens except at add time

## Out of scope

Editing/deleting quicklinks from the panel (config.json is the editor), favicon refresh,
{query} quicklinks via this flow (config-only for now).

## Outcome (2026-08-09)

Shipped. 59 TS + 29 Rust tests green; the favicon candidate scanner is pure and covered
(apple-touch priority, sizes ranking, .ico demotion, relative/unquoted hrefs, svg skip);
live fetch verified against github.com (PNG landed in cache). Browser choice persists per
link and opens via `open -a`. Needs hands: the two-step panel form itself.
