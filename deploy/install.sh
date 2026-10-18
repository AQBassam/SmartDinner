#!/usr/bin/env bash
# Installs this release on the server. Run from inside the extracted release folder:
#   sudo ./deploy/install.sh
# Options (environment): SITE_ROOT=/var/www/dinner  KEEP=5  SKIP_NGINX=1 (testing only)
set -euo pipefail

SITE_ROOT="${SITE_ROOT:-/var/www/dinner}"
KEEP="${KEEP:-5}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$HERE/site"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mتوقف: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || [ "${SKIP_NGINX:-0}" = 1 ] || fail "شغّل السكربت بـ sudo."
[ -f "$SRC/index.html" ] && [ -f "$SRC/version.json" ] || fail "مجلد site ناقص؛ هل فُكّ الأرشيف كاملًا؟"

say "1/5 التحقق من سلامة الملفات (SHA-256)"
( cd "$SRC" && sha256sum --check --quiet ../SHA256SUMS ) || fail "ملف واحد على الأقل تغيّر أو تلف أثناء النقل."
COUNT=$(wc -l < "$HERE/SHA256SUMS")
echo "سليمة: $COUNT ملفًا"

VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$SRC/version.json")
STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$SITE_ROOT/releases/$STAMP-v$VERSION"

say "2/5 نسخ الإصدار $VERSION إلى $DEST"
mkdir -p "$SITE_ROOT/releases"
cp -a "$SRC" "$DEST"
find "$DEST" -type d -exec chmod 755 {} +
find "$DEST" -type f -exec chmod 644 {} +
[ "${SKIP_NGINX:-0}" = 1 ] || chown -R root:root "$DEST"

say "3/5 تبديل الرابط current (لحظي، دون انقطاع)"
PREV=""
[ -L "$SITE_ROOT/current" ] && PREV="$(readlink -f "$SITE_ROOT/current")"
[ -e "$SITE_ROOT/current" ] && [ ! -L "$SITE_ROOT/current" ] && fail "$SITE_ROOT/current موجود كمجلد عادي لا كرابط؛ انقله يدويًا أولًا."
ln -sfn "$DEST" "$SITE_ROOT/current.tmp"
mv -Tf "$SITE_ROOT/current.tmp" "$SITE_ROOT/current"
[ -n "$PREV" ] && [ "$PREV" != "$DEST" ] && echo "$PREV" > "$SITE_ROOT/.previous"
echo "current → $(readlink "$SITE_ROOT/current")"
[ -n "$PREV" ] && echo "السابق (للتراجع): $PREV"

say "4/5 الإبقاء على آخر $KEEP إصدارات"
ls -1dt "$SITE_ROOT"/releases/*/ | tail -n +$((KEEP + 1)) | while read -r d; do
  d="${d%/}"
  if [ "$d" != "$DEST" ] && [ "$d" != "$PREV" ]; then rm -rf -- "$d"; echo "حُذف: $d"; fi
done

say "5/5 فحص إعداد nginx وإعادة تحميله"
if [ "${SKIP_NGINX:-0}" = 1 ]; then
  echo "(تخطٍّ: وضع الاختبار)"
else
  nginx -t || fail "nginx -t رفض الإعداد؛ الموقع السابق ما زال يعمل. للتراجع: sudo ./deploy/rollback.sh"
  systemctl reload nginx
  sleep 2  # reload is asynchronous: give the new workers a moment before anyone tests
fi
printf '\n\033[1;32mتم. الإصدار %s يعمل الآن.\033[0m\n' "$VERSION"
