# Releasing launcharr

## Version bump

`version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json` (keep
them identical). Tag `v<version>` after the release build is verified.

## Build

```sh
pnpm install
pnpm tauri build            # unsigned/ad-hoc local build
```

## Signing + notarization (requires Mitch's Apple Developer account)

One-time setup:

1. Enroll in the Apple Developer Program (developer.apple.com, USD 99/yr).
2. In Xcode (or the developer portal), create a **Developer ID Application** certificate
   and install it in the login keychain.
3. Create an App Store Connect API key (or use notarytool with Apple ID + app-specific
   password) for notarization.

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
- Homebrew cask (once releases exist): a `homebrew-launcharr` tap with a cask pointing at
  the release zip. Unsigned builds need `--no-quarantine`; don't ship that — sign first.
- Auto-update (later): tauri-plugin-updater needs a signing keypair and a hosted
  `latest.json`; blocked on signing being in place.

## Release checklist

- [ ] All gates green (`pnpm typecheck && pnpm lint && pnpm test`, `cargo test`, clippy)
- [ ] Version bumped in all three files, `docs/STATUS.md` current
- [ ] Fresh-profile smoke test: delete `~/.config/launcharr` + Application Support, launch,
      first-run hint appears, budgets logged within range
- [ ] Signed + notarized + `spctl` accepted
- [ ] GitHub Release with zip + changelog from `git log`
