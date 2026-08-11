#!/usr/bin/env bash
# The local half of releasing launcharr. Deterministic: every step either passes or
# the script dies telling you exactly what's missing. If a release step isn't in here
# or in .github/workflows/release.yml, it isn't part of the release — add it first.
# See docs/RELEASING.md.
#
# Split (jig standard): signing, notarization, and the manual smoke gates stay local —
# the Developer ID identity and notary profile live in the keychain, no secrets in env.
# This script ends at the GitHub Release; `gh release create` mints the tag remotely,
# which triggers the tag workflow's fan-out (tap Cask, Notion, deploy hook).
#
# Usage:
#   scripts/release.sh 0.3.0              # full signed release
#   scripts/release.sh 0.3.0 --unsigned   # skip signing/notarization (pre-cert only)
#   scripts/release.sh 0.3.0 --dry-run    # preflight + gates, then print the plan
#   scripts/release.sh --log              # print commit log since the last tag (for notes)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP="$ROOT/apps/desktop"
WWW="$ROOT/apps/www"
REPO="mitchmalone/launcharr"
NOTARY_PROFILE="launcharr-notary"

die() { echo "✗ $*" >&2; exit 1; }
step() { echo; echo "── $*"; }
confirm() {
  local reply
  read -r -p "$1 [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || die "aborted: $1"
}

command -v cargo >/dev/null 2>&1 || PATH="$(dirname "$(rustup which cargo)"):$PATH"

if [[ "${1:-}" == "--log" ]]; then
  cd "$ROOT"
  last=$(git describe --tags --abbrev=0 2>/dev/null) || die "no previous tag"
  git log --oneline "$last"..HEAD
  exit 0
fi

VERSION="${1:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "usage: release.sh X.Y.Z [--unsigned|--dry-run]"
SIGNED=1; DRY=0
for arg in "${@:2}"; do
  case "$arg" in
    --unsigned) SIGNED=0 ;;
    --dry-run)  DRY=1 ;;
    *) die "unknown flag: $arg" ;;
  esac
done
TAG="v$VERSION"
NOTES="$ROOT/docs/releases/$TAG.md"
DIST="$ROOT/dist/$TAG"
ZIP="launcharr-$VERSION.zip"
DMG="launcharr-$VERSION.dmg"
DL="https://github.com/$REPO/releases/download/$TAG"

step "1/8 preflight"
for tool in pnpm cargo gh shasum ditto jq; do
  command -v "$tool" >/dev/null 2>&1 || die "missing tool: $tool"
done
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || die "dirty tree: $ROOT"
[[ "$(git -C "$ROOT" branch --show-current)" == "main" ]] || die "not on main"
gh auth status >/dev/null 2>&1 || die "gh not authenticated"
visibility=$(gh repo view "$REPO" --json visibility --jq .visibility)
[[ "$visibility" == "PUBLIC" ]] || die "repo $REPO is $visibility — release assets would 404 for brew and the website"
git -C "$ROOT" rev-parse "$TAG" >/dev/null 2>&1 && die "tag $TAG already exists locally"
git -C "$ROOT" ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1 \
  && die "tag $TAG already exists on origin"
[[ -f "$NOTES" ]] || die "release notes missing: docs/releases/$TAG.md (copy _TEMPLATE.md; notes are written BEFORE releasing)"
if [[ "$DRY" == 0 ]] && grep -qE '\| _ (ms|MB)' "$NOTES"; then
  die "release notes still contain placeholder perf numbers"
fi
if [[ "$SIGNED" == 1 ]]; then
  # NB: never `cmd | grep -q` under pipefail — grep's early exit SIGPIPEs the writer
  # and fails the pipeline. Capture first, grep the variable.
  identities=$(security find-identity -v -p codesigning)
  IDENTITY=$(grep -o '"Developer ID Application:[^"]*"' <<<"$identities" | head -1 | tr -d '"') \
    || die "no Developer ID Application identity in keychain (or pass --unsigned)"
  xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 \
    || die "notary profile '$NOTARY_PROFILE' not stored (xcrun notarytool store-credentials $NOTARY_PROFILE)"
fi

step "2/8 gates"
cd "$ROOT"
pnpm verify

if [[ "$DRY" == 1 ]]; then
  step "dry run — remaining plan"
  cat <<EOF
  3. bump $VERSION into apps/desktop/{package.json,src-tauri/tauri.conf.json,src-tauri/Cargo.toml}
  4. pnpm --filter @launcharr/desktop tauri build  (signed: $SIGNED; targets: app + dmg)
  5. verify (spctl), package $ZIP + $DMG + SHA256SUMS into dist/$TAG/;
     write apps/www/src/lib/release.json (ships in the release commit)
  6. manual smoke tests (fresh-profile + upgrade-path) — interactive gates
  7. commit bump + notes + release.json, push main (no local tag)
  8. gh release create $TAG with artifacts — the remote tag triggers the fan-out
     workflow (tap Cask bump, Notion version, mitchmalone.com deploy hook)
EOF
  exit 0
fi

step "3/8 version bump → $VERSION"
cd "$DESKTOP"
jq ".version = \"$VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
jq ".version = \"$VERSION\"" src-tauri/tauri.conf.json > t.tmp && mv t.tmp src-tauri/tauri.conf.json
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
(cd src-tauri && cargo check -q 2>/dev/null || cargo check)   # refresh Cargo.lock
for v in $(jq -r .version package.json) $(jq -r .version src-tauri/tauri.conf.json); do
  [[ "$v" == "$VERSION" ]] || die "version bump mismatch"
done
cd "$ROOT"

step "4/8 build"
if [[ "$SIGNED" == 1 ]]; then
  export APPLE_SIGNING_IDENTITY="$IDENTITY"
else
  unset APPLE_SIGNING_IDENTITY 2>/dev/null || true
fi
pnpm --filter @launcharr/desktop tauri build
APP_BUNDLE="$DESKTOP/src-tauri/target/release/bundle/macos/launcharr.app"
DMG_SRC=$(ls "$DESKTOP"/src-tauri/target/release/bundle/dmg/*.dmg | head -1)

step "5/8 verify, notarize, package"
# The tauri bundler only auto-notarizes via raw APPLE_ID/APPLE_PASSWORD env vars; we
# notarize explicitly with the stored keychain profile instead — no secrets in env.
notarize() { # $1: file to submit
  local out
  out=$(xcrun notarytool submit "$1" --keychain-profile "$NOTARY_PROFILE" --wait 2>&1) \
    || { echo "$out" | tail -5; die "notarytool submit failed for $1"; }
  echo "$out" | grep -q "status: Accepted" \
    || { echo "$out" | tail -8; die "notarization not accepted for $1"; }
}
rm -rf "$DIST" && mkdir -p "$DIST"
if [[ "$SIGNED" == 1 ]]; then
  # codesign only prints the cert chain at -dvv; -dv shows no Authority lines.
  sig=$(codesign -dvv "$APP_BUNDLE" 2>&1)
  grep -q "Authority=Developer ID Application" <<<"$sig" || die "app not Developer ID signed"
  ditto -c -k --keepParent "$APP_BUNDLE" "$DIST/$ZIP"
  echo "  notarizing app (zip)…"
  notarize "$DIST/$ZIP"
  xcrun stapler staple "$APP_BUNDLE"
  rm "$DIST/$ZIP" && ditto -c -k --keepParent "$APP_BUNDLE" "$DIST/$ZIP"   # re-zip stapled app
  echo "  notarizing dmg…"
  notarize "$DMG_SRC"
  xcrun stapler staple "$DMG_SRC"
  gatekeeper=$(spctl -a -vv "$APP_BUNDLE" 2>&1 || true)
  grep -q "accepted" <<<"$gatekeeper" || { echo "$gatekeeper"; die "Gatekeeper rejected the app"; }
else
  echo "⚠ UNSIGNED build — brew/source install only; do not advertise the dmg/zip"
  ditto -c -k --keepParent "$APP_BUNDLE" "$DIST/$ZIP"
fi
cp "$DMG_SRC" "$DIST/$DMG"
(cd "$DIST" && shasum -a 256 "$ZIP" "$DMG" > SHA256SUMS)
cat "$DIST/SHA256SUMS"

# Release facts ship in the release commit — the site and the fan-out workflow both
# read this file; the workflow refuses to release if it disagrees with the tag.
ZIP_SHA=$(awk -v f="$ZIP" '$2==f{print $1}' "$DIST/SHA256SUMS")
DMG_SHA=$(awk -v f="$DMG" '$2==f{print $1}' "$DIST/SHA256SUMS")
jq -n --arg v "$VERSION" --arg d "$(date +%Y-%m-%d)" \
      --arg zip "$DL/$ZIP" --arg dmg "$DL/$DMG" \
      --arg zs "$ZIP_SHA" --arg ds "$DMG_SHA" --argjson signed "$SIGNED" \
      '{version:$v, date:$d, signed:($signed==1),
        artifacts:{zip:{url:$zip, sha256:$zs}, dmg:{url:$dmg, sha256:$ds}}}' \
  > "$WWW/src/lib/release.json"
pnpm prettier --write "$WWW/src/lib/release.json" >/dev/null

step "6/8 manual smoke tests (the two things a script can't feel)"
echo "  fresh-profile: mv ~/.config/launcharr{,.bak}; open $DIST-extracted app; first-run hint, budgets in range; restore."
confirm "fresh-profile smoke test passed?"
echo "  upgrade-path: install this build over the running version; config/themes/frecency/scripts all intact."
confirm "upgrade-path smoke test passed?"

step "7/8 commit + push (no local tag — gh release create mints it)"
git add apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json \
        apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock \
        apps/www/src/lib/release.json "docs/releases/$TAG.md"
# Rerun-safe: a prior attempt may have already committed the bump.
git diff --cached --quiet || git commit -m "chore: release $TAG"
git push origin main

step "8/8 GitHub release (creates the tag → triggers the fan-out workflow)"
gh release create "$TAG" "$DIST/$ZIP" "$DIST/$DMG" "$DIST/SHA256SUMS" \
  --repo "$REPO" --title "launcharr $TAG" --notes-file "$NOTES" \
  --target "$(git rev-parse HEAD)"

echo
echo "✔ launcharr $TAG released. Fan-out (tap, Notion, deploy hook) is CI's job now:"
echo "  gh run watch --repo $REPO \$(gh run list --repo $REPO --workflow release --limit 1 --json databaseId --jq '.[0].databaseId')"
echo "  Post-release: update docs/STATUS.md; announce (deliberate, optional)."
