#!/usr/bin/env bash
# Adds the /recipes/ caching rule to the LIVE site file, keeping the TLS lines certbot wrote into it.
# Safe to run twice. Restores the backup if nginx rejects the result.
#   sudo bash deploy/patch-nginx-photos.sh
set -euo pipefail
SITE=/etc/nginx/sites-available/dinner.bassamailab.xyz
[ "$(id -u)" -eq 0 ] || { echo "شغّل السكربت بـ sudo."; exit 1; }
[ -f "$SITE" ] || { echo "لم يُعثر على $SITE"; exit 1; }
if grep -q 'location /recipes/' "$SITE"; then echo "القاعدة موجودة مسبقًا؛ لا تغيير."; exit 0; fi
grep -q '# The service worker' "$SITE" || { echo "لم يُعثر على موضع الإدراج في $SITE"; exit 1; }

BACKUP="$SITE.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$SITE" "$BACKUP"
python3 - "$SITE" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
s = p.read_text()
block = """    # Recipe photos: every reference carries ?v=<hash of the file>, so a replaced photo gets a new URL.
    location /recipes/ {
        include snippets/dinner-security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

"""
i = s.index('    # The service worker')
p.write_text(s[:i] + block + s[i:])
PY
if nginx -t; then
  systemctl reload nginx
  sleep 2
  mv "$BACKUP" "/root/$(basename "$BACKUP")"
  echo "تمت إضافة قاعدة الصور. النسخة السابقة من الملف في /root/$(basename "$BACKUP")"
else
  cp -a "$BACKUP" "$SITE"
  echo "رفض nginx الإعداد؛ أُعيد الملف كما كان."
  exit 1
fi
