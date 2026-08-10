#!/usr/bin/env bash
# The only way to release launcharr. Deterministic: every step either passes or the
# script dies telling you exactly what's missing. If a release step isn't in here,
# it isn't part of the release — add it here first. See docs/RELEASING.md.
#
# Usage:
#   scripts/release.sh 0.3.0              # full signed release
#   scripts/release.sh 0.3.0 --unsigned   # skip signing/notarization (pre-cert only)
#   scripts/release.sh 0.3.0 --dry-run    # preflight + gates, then print the plan
#   scripts/release.sh --log              # print commit log since the last tag (for notes)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_DIR="$(dirname "$APP_DIR")"
WEB_DIR="$PARENT_DIR/launcharr-web"
TAP_DIR="$PARENT_DIR/homebrew-launcharr"
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
  cd "$APP_DIR"
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
NOTES="$APP_DIR/docs/releases/$TAG.md"
DIST="$APP_DIR/dist/$TAG"
ZIP="launcharr-$VERSION.zip"
DMG="launcharr-$VERSION.dmg"
DL="https://github.com/$REPO/releases/download/$TAG"

step "1/9 preflight"
for tool in pnpm cargo gh shasum ditto jq; do
  command -v "$tool" >/dev/null 2>&1 || die "missing tool: $tool"
done
[[ -d "$WEB_DIR/.git" ]] || die "web repo not found at $WEB_DIR (see parent CLAUDE.md layout)"
for repo_dir in "$APP_DIR" "$WEB_DIR"; do
  [[ -z "$(git -C "$repo_dir" status --porcelain)" ]] || die "dirty tree: $repo_dir"
  [[ "$(git -C "$repo_dir" branch --show-current)" == "main" ]] || die "not on main: $repo_dir"
done
gh auth status >/dev/null 2>&1 || die "gh not authenticated"
git -C "$APP_DIR" rev-parse "$TAG" >/dev/null 2>&1 && die "tag $TAG already exists"
[[ -f "$NOTES" ]] || die "release notes missing: docs/releases/$TAG.md (copy _TEMPLATE.md; notes are written BEFORE releasing)"
if [[ "$DRY" == 0 ]] && grep -qE '\| _ (ms|MB)' "$NOTES"; then
  die "release notes still contain placeholder perf numbers"
fi
[[ -f "$APP_DIR/LICENSE" ]] || echo "⚠ no LICENSE file — fine for now, blocks nothing, but fix it"
if [[ "$SIGNED" == 1 ]]; then
  IDENTITY=$(security find-identity -v -p codesigning | grep -o '"Developer ID Application:[^"]*"' | head -1 | tr -d '"') \
    || die "no Developer ID Application identity in keychain (or pass --unsigned)"
  xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 \
    || die "notary profile '$NOTARY_PROFILE' not stored (xcrun notarytool store-credentials $NOTARY_PROFILE)"
fi

step "2/9 gates"
cd "$APP_DIR"
pnpm typecheck && pnpm lint && pnpm test
(cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings)

if [[ "$DRY" == 1 ]]; then
  step "dry run — remaining plan"
  cat <<EOF
  3. bump $VERSION into package.json, tauri.conf.json, Cargo.toml
  4. pnpm tauri build  (signed: $SIGNED; targets: app + dmg)
  5. verify (spctl), package $ZIP + $DMG + SHA256SUMS into dist/$TAG/
  6. manual smoke tests (fresh-profile + upgrade-path) — interactive gates
  7. commit bump + notes, tag $TAG, push
  8. gh release create $TAG with artifacts + docs/releases/$TAG.md
  9. write $WEB_DIR/src/lib/release.json, verify web gates, push (Vercel deploys);
     update tap at $TAP_DIR if present
EOF
  exit 0
fi

step "3/9 version bump → $VERSION"
jq ".version = \"$VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
jq ".version = \"$VERSION\"" src-tauri/tauri.conf.json > t.tmp && mv t.tmp src-tauri/tauri.conf.json
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
(cd src-tauri && cargo check -q 2>/dev/null || cargo check)   # refresh Cargo.lock
for v in $(jq -r .version package.json) $(jq -r .version src-tauri/tauri.conf.json); do
  [[ "$v" == "$VERSION" ]] || die "version bump mismatch"
done

step "4/9 build"
if [[ "$SIGNED" == 1 ]]; then
  export APPLE_SIGNING_IDENTITY="$IDENTITY"
  export APPLE_KEYCHAIN_PROFILE="$NOTARY_PROFILE"   # tauri notarizes via stored profile
else
  unset APPLE_SIGNING_IDENTITY APPLE_KEYCHAIN_PROFILE 2>/dev/null || true
fi
pnpm tauri build
APP_BUNDLE="src-tauri/target/release/bundle/macos/launcharr.app"
DMG_SRC=$(ls src-tauri/target/release/bundle/dmg/*.dmg | head -1)

step "5/9 verify + package"
if [[ "$SIGNED" == 1 ]]; then
  codesign -dv "$APP_BUNDLE" 2>&1 | grep -q "Developer ID" || die "app not Developer ID signed"
  spctl -a -vv "$APP_BUNDLE" 2>&1 | grep -q "accepted" || die "Gatekeeper rejected the app (notarization missing?)"
else
  echo "⚠ UNSIGNED build — brew/source install only; do not advertise the dmg/zip"
fi
rm -rf "$DIST" && mkdir -p "$DIST"
ditto -c -k --keepParent "$APP_BUNDLE" "$DIST/$ZIP"
cp "$DMG_SRC" "$DIST/$DMG"
(cd "$DIST" && shasum -a 256 "$ZIP" "$DMG" > SHA256SUMS)
cat "$DIST/SHA256SUMS"

step "6/9 manual smoke tests (the two things a script can't feel)"
echo "  fresh-profile: mv ~/.config/launcharr{,.bak}; open $DIST-extracted app; first-run hint, budgets in range; restore."
confirm "fresh-profile smoke test passed?"
echo "  upgrade-path: install this build over the running version; config/themes/frecency/scripts all intact."
confirm "upgrade-path smoke test passed?"

step "7/9 commit, tag, push"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock "docs/releases/$TAG.md"
git commit -m "chore: release $TAG"
git tag "$TAG"
git push origin main --tags

step "8/9 GitHub release"
gh release create "$TAG" "$DIST/$ZIP" "$DIST/$DMG" "$DIST/SHA256SUMS" \
  --repo "$REPO" --title "launcharr $TAG" --notes-file "$NOTES"

step "9/9 website + tap"
ZIP_SHA=$(awk -v f="$ZIP" '$2==f{print $1}' "$DIST/SHA256SUMS")
DMG_SHA=$(awk -v f="$DMG" '$2==f{print $1}' "$DIST/SHA256SUMS")
jq -n --arg v "$VERSION" --arg d "$(date +%Y-%m-%d)" \
      --arg zip "$DL/$ZIP" --arg dmg "$DL/$DMG" \
      --arg zs "$ZIP_SHA" --arg ds "$DMG_SHA" --argjson signed "$SIGNED" \
      '{version:$v, date:$d, signed:($signed==1),
        artifacts:{zip:{url:$zip, sha256:$zs}, dmg:{url:$dmg, sha256:$ds}}}' \
  > "$WEB_DIR/src/lib/release.json"
(cd "$WEB_DIR" && pnpm typecheck && pnpm lint && pnpm test \
  && git add src/lib/release.json && git commit -m "chore: release data for launcharr $TAG" \
  && git push)
echo "  website: pushed — Vercel deploys from main."
if [[ -d "$TAP_DIR" ]]; then
  CASK="$TAP_DIR/Casks/launcharr.rb"
  sed -i '' -e "s/version \".*\"/version \"$VERSION\"/" -e "s/sha256 \".*\"/sha256 \"$ZIP_SHA\"/" "$CASK"
  (cd "$TAP_DIR" && git add -A && git commit -m "launcharr $TAG" && git push)
  echo "  tap: bumped."
else
  echo "⚠ no tap at $TAP_DIR — create mitchmalone/homebrew-launcharr and re-run step 9 by hand (docs/RELEASING.md)"
fi

echo
echo "✔ launcharr $TAG released. Post-release: update docs/STATUS.md; announce (deliberate, optional)."
