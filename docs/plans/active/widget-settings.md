---
title: Widget settings — declared in the manifest, collected in Settings, delivered as env (+ OAuth `auth`)
status: active
created: 2026-08-19
updated: 2026-08-19
links:
  - docs/WIDGETS.md
  - docs/plans/done/widgets.md
  - DECISIONS 2026-08-16 (credentials the provider CLIs already store)
---

# Widget settings + auth

## Goal

A widget can say what it needs (`manifest.settings[]`), the user fills it in from
Settings → Menubar → Custom widgets (secrets masked, stored in the macOS Keychain; plain
values in `config.json`), and every `tick` gets them as environment variables. A widget
can also own an OAuth flow (`<widget> auth`) whose result lands in the same store.
Try-out scope (Mitch, 2026-08-19): **vercel** exercises a stored token, **github-actions**
exercises OAuth (device flow). Judged on use; not a commitment to the final shape.

## Context

Today the reference widgets read credentials the provider CLIs already hold. That
broke for Vercel 2026-08-19: CLI 58's OAuth login stores a short-lived access token the
widget can't refresh (JOURNAL 2026-08-19). A user installing a widget expects to paste a
token or sign in — not to have the right CLI logged in. Widgets are data, never code;
launcharr stays a store + env injector and never talks to a provider itself.

## Approach

- **Manifest:** `settings: [{ key, label, hint?, secret?, required? }]` (`key` is an
  env-var name, `[A-Z][A-Z0-9_]*`, ≤ 40); `auth: { label }` opts into the `auth`
  command. Both ride `WidgetState` → `BarWidget` so the settings UI can render them.
- **Store:** secret → Keychain generic password (service `launcharr`, account
  `widget/<id>/<KEY>`) via `security-framework`; plain → `config.widgets[id][KEY]` in
  config.json (hackable, hot-reloaded like everything else). Secrets never go to the
  webview — only "is set".
- **Delivery:** `run_widget` sets each declared key as env on `tick` (and `auth`).
  A widget with unset `required` settings isn't ticked; it shows a muted "needs setup"
  cell and the settings row says which keys.
- **Auth protocol:** launcharr runs `<widget> auth` (15 min cap, killable); the widget
  prints one JSON object per stdout line: `{"url","code"}` → shown with an open button;
  `{"message"}` → progress; `{"settings": {KEY: value}}` → stored (must be declared
  `secret` settings — auth results are secrets by definition); exit 0 = done → tick.
  Events `widget-auth` `{id, phase, url?, code?, message?, error?}` to the settings window.
- **IPC:** `widget_secret_set {id,key,value|null}`, `widget_secret_keys {id}`,
  `widget_auth {id}`, `widget_auth_cancel {id}` — four commands, recorded in DECISIONS.
- **Widgets:** `vercel.ts` declares `VERCEL_TOKEN` (secret) + `VERCEL_TEAM_ID` (plain),
  falls back to the CLI store, and turns 401/403 into a readable hint. `github-actions.ts`
  is rewritten onto the GitHub API: `GITHUB_CLIENT_ID` (plain; the user registers an
  OAuth App with device flow on), `GITHUB_TOKEN` (secret, required), `GITHUB_REPOS`
  (plain, optional `owner/repo,…`, default = 10 most recently pushed); `auth` runs the
  device flow.

## Steps

- [ ] Rust: manifest `settings`/`auth` parse + validation (tests); `widget_secrets.rs`
      (Keychain); env injection; required-gate → `needs` on state; `auth` runner + events;
      four commands; `Config.widgets`.
- [ ] tui: `WidgetSetting`/`BarWidget.settings/auth/needs` types; needs-setup cell.
- [ ] Settings UI: per-widget settings fields (secret: set/clear, plain: bound to config);
      Sign in button + code/url panel; needs-setup line.
- [ ] Widgets: vercel.ts settings + 401/403 hint; github-actions.ts rewrite + device
      flow; Vitest on the pure halves.
- [ ] docs/WIDGETS.md (settings + auth sections), DECISIONS, STATUS; copy widgets into
      `~/.config/launcharr/widgets/`.

## Acceptance criteria

- [ ] Vercel: paste a token in Settings → cell goes green without the CLI logged in;
      clear it → falls back to CLI store / hidden.
- [ ] GitHub: set client id → Sign in → code shown → approve in browser → token stored →
      cell shows runs. Token never appears in the webview or config.json.
- [ ] `pnpm verify` green; Rust unit tests for manifest/settings parsing and the
      required-gate; Vitest for both widgets' `view()`.

## Out of scope

A curated widget index, shared/cross-widget secrets, launcharr-hosted OAuth, refresh
tokens (the widget owns re-auth: an expired token → "Sign in again" hint).

## Risks / open questions

- GitHub OAuth App `client_id` belongs to an account (Mitch's, for the reference widget);
  it's a plain setting so no code edit, but it's the first external-account tie.
- `security-framework` is one more crate (+ -sys); the alternative (`/usr/bin/security`
  on argv) leaks secrets to `ps`. Chosen crate; revisit if the tree bites.
