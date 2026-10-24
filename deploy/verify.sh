#!/usr/bin/env bash
# Checks a deployed site from any machine with curl (server, Mac, Linux, Git Bash on Windows):
#   ./deploy/verify.sh                    # https://dinner.bassamailab.xyz
#   ./deploy/verify.sh http://127.0.0.1 dinner.bassamailab.xyz   # before DNS/TLS, on the server
set -uo pipefail
BASE="${1:-https://dinner.bassamailab.xyz}"
HOSTH="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECT="$(sed -n 's/.*"contentHash": *"\([^"]*\)".*/\1/p' "$HERE/site/version.json" 2>/dev/null)"
pass=0; failn=0
H=(); [ -n "$HOSTH" ] && H=(-H "Host: $HOSTH")
ok()  { printf '  \033[32mناجح\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  \033[31mفاشل\033[0m  %s — %s\n' "$1" "$2"; failn=$((failn+1)); }
hdr() { curl -sS -o /dev/null -D - --max-time 15 "${H[@]}" "$BASE$1" | tr -d '\r'; }
has() { grep -qi "$2" <<<"$1"; }

echo "فحص $BASE"
h=$(hdr /);                      has "$h" '^HTTP/[0-9.]* 200' && ok "الصفحة الرئيسية 200" || bad "الصفحة الرئيسية" "$(head -1 <<<"$h")"
has "$h" 'content-type: text/html' && ok "نوع المحتوى HTML" || bad "نوع المحتوى" "$(grep -i content-type <<<"$h")"
has "$h" "content-security-policy: default-src 'self'" && ok "سياسة CSP موجودة" || bad "CSP" "مفقودة"
has "$h" "connect-src 'self' https://luban.bassamailab.xyz;" && ok "CSP تسمح بخادم لُبان وحده (الربط بالشاشة)" || bad "CSP connect-src" "$(grep -io "connect-src[^;]*" <<<"$h")"
has "$h" 'x-content-type-options: nosniff' && ok "nosniff" || bad "nosniff" "مفقود"
has "$h" 'cache-control: no-cache' && ok "الصفحة لا تُخزَّن قديمة" || bad "Cache-Control للصفحة" "$(grep -i cache-control <<<"$h")"

page=$(curl -sS --max-time 15 "${H[@]}" "$BASE/")
asset=$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' <<<"$page" | head -1)
if [ -n "$asset" ]; then
  a=$(hdr "$asset")
  has "$a" 'content-type: application/javascript\|content-type: text/javascript' && ok "ملف JS بنوع صحيح ($asset)" || bad "نوع ملف JS" "$(grep -i content-type <<<"$a")"
  has "$a" 'immutable' && ok "ملفات assets مخزنة سنة" || bad "Cache-Control للـ assets" "$(grep -i cache-control <<<"$a")"
else bad "ملف JS" "لم يُعثر على /assets/index-*.js في الصفحة"; fi

s=$(hdr /sw.js);  has "$s" '^HTTP/[0-9.]* 200' && has "$s" 'cache-control: no-cache' && ok "sw.js بلا تخزين" || bad "sw.js" "$(head -1 <<<"$s") $(grep -i cache-control <<<"$s")"
o=$(hdr /og-image.jpg); has "$o" '^HTTP/[0-9.]* 200' && has "$o" 'content-type: image/jpeg' && ok "صورة المشاركة og-image.jpg" || bad "صورة المشاركة" "$(head -1 <<<"$o") $(grep -i content-type <<<"$o")"
m=$(hdr /manifest.webmanifest); has "$m" 'content-type: application/manifest+json' && ok "نوع manifest صحيح" || bad "manifest" "$(grep -i content-type <<<"$m")"
d=$(hdr /.previous); has "$d" '^HTTP/[0-9.]* 40[34]' && ok "الملفات المخفية محجوبة" || bad "الملفات المخفية" "$(head -1 <<<"$d")"

v=$(curl -sS --max-time 15 "${H[@]}" "$BASE/version.json")
got=$(sed -n 's/.*"contentHash": *"\([^"]*\)".*/\1/p' <<<"$v")
ver=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' <<<"$v")
if [ -n "$EXPECT" ]; then [ "$got" = "$EXPECT" ] && ok "الإصدار المنشور ${ver:-؟} يطابق الحزمة ($got)" || bad "مطابقة الإصدار" "المنشور: ${got:-لا شيء} / المتوقع: $EXPECT"
else [ -n "$got" ] && ok "version.json: ${ver:-؟} ($got)" || bad "version.json" "غير موجود"; fi

if [[ "$BASE" == https://* ]]; then
  r=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 "http://${BASE#https://}/")
  [[ "$r" == 301\ https://* || "$r" == 308\ https://* ]] && ok "HTTP يحوّل إلى HTTPS" || bad "التحويل إلى HTTPS" "$r"
  host="${BASE#https://}"; host="${host%%/*}"
  exp=$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -enddate -issuer 2>/dev/null | tr '\n' ' ')
  [ -n "$exp" ] && ok "شهادة TLS: $exp" || bad "شهادة TLS" "تعذرت قراءتها"
fi
echo; echo "النتيجة: $pass ناجح، $failn فاشل"
[ "$failn" -eq 0 ]
