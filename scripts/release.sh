#!/usr/bin/env bash
# Builds dist/ and packs a self-verifying release: release/dinner-release-<version>.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
NAME="dinner-release-$VERSION"
OUT="release/$NAME"
rm -rf "$OUT" "release/$NAME.tar.gz"
mkdir -p "$OUT"
cp -a dist "$OUT/site"
cp -a deploy "$OUT/deploy"
chmod +x "$OUT"/deploy/*.sh
( cd "$OUT/site" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum ) > "$OUT/SHA256SUMS"
tar -C release -czf "release/$NAME.tar.gz" --owner=0 --group=0 "$NAME"
( cd release && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256" )
echo "release/$NAME.tar.gz"; cat "release/$NAME.tar.gz.sha256"
