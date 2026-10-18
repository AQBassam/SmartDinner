#!/usr/bin/env bash
# Returns "current" to the previous release (or to the one you name):
#   sudo ./deploy/rollback.sh                       # previous
#   sudo ./deploy/rollback.sh 20261018-150000-v3.0.0 # specific
set -euo pipefail
SITE_ROOT="${SITE_ROOT:-/var/www/dinner}"
if [ $# -ge 1 ]; then TARGET="$SITE_ROOT/releases/$1"; else TARGET="$(cat "$SITE_ROOT/.previous" 2>/dev/null || true)"; fi
[ -n "$TARGET" ] && [ -f "$TARGET/index.html" ] || { echo "لا يوجد إصدار سابق صالح. المتاح:"; ls -1t "$SITE_ROOT/releases"; exit 1; }
NOW="$(readlink -f "$SITE_ROOT/current")"
ln -sfn "$TARGET" "$SITE_ROOT/current.tmp"
mv -Tf "$SITE_ROOT/current.tmp" "$SITE_ROOT/current"
echo "$NOW" > "$SITE_ROOT/.previous"
[ "${SKIP_NGINX:-0}" = 1 ] || systemctl reload nginx
echo "current → $TARGET"
grep -o '"version": *"[^"]*"' "$TARGET/version.json"
