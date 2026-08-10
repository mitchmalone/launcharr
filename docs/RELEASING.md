# Releasing launcharr

**The release is `scripts/release.sh`. If a step isn't in the script, it isn't part of the
release** — add it to the script first (decision 2026-08-10). The script covers both repos:
this one and `../launcharr-web` (layout in the parent dir's CLAUDE.md).

## The flow

```sh
# 1. Write the notes FIRST — the script refuses to run without them:
cp docs/releases/_TEMPLATE.md docs/releases/v0.3.0.md
scripts/release.sh --log          # commit log since last tag, for the appendix
$EDITOR docs/releases/v0.3.0.md   # breaking / highlights / perf receipts / log

# 2. Rehearse:
scripts/release.sh 0.3.0 --dry-run

# 3. Release:
scripts/release.sh 0.3.0          # or --unsigned while the cert is pending
```

What the script does, in order — every step fail-fast, nothing optional:

1. **Preflight** — tools present; both repos clean and on `main`; `gh` authed; tag free;
   notes file exists with real perf numbers; Developer ID + notary profile in the keychain
   (unless `--unsigned`).
2. **Gates** — `pnpm typecheck/lint/test`, `cargo test`, clippy `-D warnings`.
3. **Bump** — version into `package.json`, `tauri.conf.json`, `Cargo.toml` (+ lockfile),
   verified consistent.
4. **Build** — `pnpm tauri build`, app + dmg targets, signed & notarized via the stored
   keychain profile when signing is on.
5. **Verify + package** — `spctl` must accept; `dist/vX.Y.Z/` gets zip (cask feed), dmg
   (human download), `SHA256SUMS`.
6. **Manual smoke tests** — interactive gates for the two things a script can't feel:
   fresh-profile first run (hint appears, budgets in range) and upgrade-path (existing
   config/themes/frecency/scripts intact).
7. **Commit, tag, push** — `chore: release vX.Y.Z` + tag.
8. **GitHub Release** — artifacts + checksums + the notes file.
9. **Website + tap** — writes `../launcharr-web/src/lib/release.json` (generated, never
   hand-edited), runs the web gates, pushes (Vercel deploys); bumps the Homebrew cask if
   `../homebrew-launcharr` exists.
10. **Notion + mitchmalone.com** — sets `Version` on the Launcharr row of the projects
    database (via `NOTION_API_KEY` in this repo's `.env`, gitignored) and POSTs the
    mitchmalone.com Vercel deploy hook.

Post-release (human): update `docs/STATUS.md`; announcing anywhere is a deliberate,
separate decision.

## Install methods (decision 2026-08-10)

| Method                    | Artifact                                           | Audience                                           |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **Homebrew** (advertised) | tap `mitchmalone/homebrew-launcharr` → release zip | everyone; also the update channel (`brew upgrade`) |
| dmg                       | GitHub Release                                     | browser downloads, drag-to-Applications            |
| zip                       | GitHub Release                                     | what the cask consumes; direct download            |
| source                    | git clone + `pnpm tauri build`                     | the committed                                      |

No in-app updater, ever (zero-network invariant). Never instruct users to strip
quarantine.

## One-time setup (state: cert pending)

- [ ] **Developer ID cert** — Xcode ▸ Settings ▸ Accounts ▸ Manage Certificates ▸ + ▸
      _Developer ID Application_. Verify: `security find-identity -v -p codesigning`.
      Signed with Mitch's paid personal enrollment (decision 2026-08-10): no continuity
      requirement for direct distribution; a later business-account switch costs one
      Automation-consent re-prompt.
- [ ] **Notary profile** — app-specific password at appleid.apple.com, then
      `xcrun notarytool store-credentials launcharr-notary`.
- [ ] **Tap repo** — create `mitchmalone/homebrew-launcharr` with `Casks/launcharr.rb`;
      clone it to `../homebrew-launcharr` so step 9 finds it.
- [ ] **LICENSE** — repo has none; pick one (blocks nothing, embarrasses quietly).

## Versioning

Semver-ish while 0.x: minor per feature batch, patch for fixes. Breaking changes lead the
release notes even when the answer is "none".
