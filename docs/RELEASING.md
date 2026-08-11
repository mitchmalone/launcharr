# Releasing launcharr

**The release is `scripts/release.sh` + `.github/workflows/release.yml`. If a step isn't in
one of those two, it isn't part of the release** — add it there first (decisions 2026-08-10,
2026-08-11). The split follows the jig standard: local steps survive only where physics
demands it (signing, notarization, hands-on smoke tests); everything after the GitHub
Release is CI fan-out.

## The flow

```sh
# 1. Write the notes FIRST — the script refuses to run without them:
cp docs/releases/_TEMPLATE.md docs/releases/v0.4.0.md
scripts/release.sh --log          # commit log since last tag, for the appendix
$EDITOR docs/releases/v0.4.0.md   # breaking / highlights / perf receipts / log

# 2. Rehearse:
scripts/release.sh 0.4.0 --dry-run

# 3. Release:
scripts/release.sh 0.4.0          # or --unsigned while the cert is pending
```

### Local half (`scripts/release.sh`) — every step fail-fast, nothing optional

1. **Preflight** — tools present; repo clean and on `main`; `gh` authed; repo public; tag
   free locally **and** on origin; notes file exists with real perf numbers; Developer ID +
   notary profile in the keychain (unless `--unsigned`).
2. **Gates** — `pnpm verify` (typecheck, lint, format, Vitest, `cargo test`, clippy
   `-D warnings`).
3. **Bump** — version into `apps/desktop/{package.json,src-tauri/tauri.conf.json,src-tauri/Cargo.toml}`
   (+ lockfile), verified consistent.
4. **Build** — `pnpm --filter @launcharr/desktop tauri build`, app + dmg targets, signed &
   notarized via the stored keychain profile when signing is on.
5. **Verify + package** — `spctl` must accept; `dist/vX.Y.Z/` gets zip (cask feed), dmg
   (human download), `SHA256SUMS`; writes `apps/www/src/lib/release.json` (generated, never
   hand-edited — it ships in the release commit).
6. **Manual smoke tests** — interactive gates for the two things a script can't feel:
   fresh-profile first run (hint appears, budgets in range) and upgrade-path (existing
   config/themes/frecency/scripts intact).
7. **Commit + push** — `chore: release vX.Y.Z`. **No local tag.**
8. **GitHub Release** — `gh release create` uploads artifacts + checksums + notes and mints
   the tag remotely, so the fan-out workflow fires with the release already published (no
   race).

### CI half (`.github/workflows/release.yml`, on tag `v*`)

- **check** — notes exist without placeholders; `release.json` version matches the tag
  (fails the release rather than pushing corrections — branch-protection-safe); release
  assets all present.
- **homebrew** — bumps `Casks/launcharr.rb` version + zip sha in the tap repo. Gated on
  `vars.HOMEBREW_TAP_REPO` + `secrets.TAP_TOKEN`.
- **notion** — sets `Version` on the Launcharr row. Gated on `vars.NOTION_RELEASE_PAGE` +
  `secrets.NOTION_API_KEY`.
- **deploy-mmcom** — POSTs the mitchmalone.com Vercel deploy hook. Gated on
  `secrets.MMCOM_DEPLOY_HOOK`.

Each fan-out job no-ops with a `::notice` when its variable/secret isn't configured —
honest skips, never silent failures. The website needs no fan-out job: Vercel deploys
`apps/www` on the release commit's push to main.

Post-release (human): watch the fan-out run (`gh run watch`), update `docs/STATUS.md`;
announcing anywhere is a deliberate, separate decision.

## Install methods (decision 2026-08-10)

| Method                    | Artifact                                                   | Audience                                           |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| **Homebrew** (advertised) | tap `mitchmalone/homebrew-launcharr` → release zip         | everyone; also the update channel (`brew upgrade`) |
| dmg                       | GitHub Release                                             | browser downloads, drag-to-Applications            |
| zip                       | GitHub Release                                             | what the cask consumes; direct download            |
| source                    | git clone + `pnpm --filter @launcharr/desktop tauri build` | the committed                                      |

No in-app updater, ever (zero-network invariant). Never instruct users to strip
quarantine.

## One-time setup

- [x] **Developer ID cert** — in the keychain (`security find-identity -v -p codesigning`).
      Signed with Mitch's paid personal enrollment (decision 2026-08-10).
- [x] **Notary profile** — `xcrun notarytool store-credentials launcharr-notary`.
- [x] **Tap repo** — `mitchmalone/homebrew-launcharr` exists; CI owns updates now (no local
      clone needed).
- [x] **LICENSE** — MIT.
- [ ] **Fan-out config** — repo variables `HOMEBREW_TAP_REPO`, `NOTION_RELEASE_PAGE`;
      secrets `TAP_TOKEN` (fine-grained PAT, contents:write on the tap), `NOTION_API_KEY`,
      `MMCOM_DEPLOY_HOOK`. Unset ⇒ that job skips with a notice.

## Versioning

Semver-ish while 0.x: minor per feature batch, patch for fixes. Breaking changes lead the
release notes even when the answer is "none".
