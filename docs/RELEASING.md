# Releasing launcharr

## Version bump

`version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json` (keep
them identical). Tag `v<version>` after the release build is verified.

## Build

```sh
pnpm install
pnpm tauri build            # unsigned/ad-hoc local build
```

## Signing + notarization

Signed with Mitch's **paid personal** Apple Developer enrollment (decision 2026-08-10):
no continuity requirement for direct distribution, so a later switch to a business
account costs only one re-prompt of the iTerm2 Automation consent. Don't wait on the
business account.

One-time setup (enrollment already done):

1. Create a **Developer ID Application** certificate — Xcode ▸ Settings ▸ Accounts ▸
   Manage Certificates ▸ + — and confirm with `security find-identity -v -p codesigning`.
2. Create an app-specific password at appleid.apple.com (or an App Store Connect API
   key) and store it: `xcrun notarytool store-credentials launcharr-notary`.

Per release:

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: Mitch Malone (TEAMID)"
export APPLE_ID="mitch@mitchmalone.com"
export APPLE_PASSWORD="app-specific-password"   # or APPLE_API_KEY/ISSUER for notarytool keys
export APPLE_TEAM_ID="TEAMID"

pnpm tauri build             # tauri signs when APPLE_SIGNING_IDENTITY is set,
                             # and notarizes when the APPLE_* notary vars are set
```

Verify before shipping:

```sh
codesign -dv --verbose=2 src-tauri/target/release/bundle/macos/launcharr.app
spctl -a -vv src-tauri/target/release/bundle/macos/launcharr.app   # should say "accepted"
```

## Distribute

- Zip the .app (`ditto -c -k --keepParent launcharr.app launcharr-<version>.zip`) and
  attach it to a GitHub Release on `mitchmalone/launcharr`.
- **Homebrew tap is the advertised install + update channel** (decision 2026-08-10):
  `mitchmalone/homebrew-launcharr` with a cask pointing at the release zip. Updates are
  `brew upgrade` — no in-app updater, ever (zero-network invariant). Never instruct users
  to strip quarantine.
- Release notes: human-written "what this version is" in the GitHub Release body,
  `git log --oneline` since the last tag as appendix. No CHANGELOG.md file.

## Release checklist

- [ ] All gates green (`pnpm typecheck && pnpm lint && pnpm test`, `cargo test`, clippy)
- [ ] Version bumped in all three files, `docs/STATUS.md` current
- [ ] Fresh-profile smoke test: delete `~/.config/launcharr` + Application Support, launch,
      first-run hint appears, budgets logged within range
- [ ] Signed + notarized + `spctl` accepted
- [ ] GitHub Release with zip + changelog from `git log`
