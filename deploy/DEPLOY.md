# نشر دليل العشاء المنزلي على VPS

**الخادم:** Contabo، يعمل بنظام Ubuntu 24.04. يستقبل الزيارات nginx على المضيف نفسه، والشهادة من certbot.
**النطاق:** `dinner.bassamailab.xyz`، بسجل من نوع A في Namecheap (IPv4 فقط).

## البنية

```
الإنترنت ─443→ nginx (المضيف) ─→ /var/www/dinner/current → releases/<تاريخ>-v<إصدار>/
```

- **موقع ثابت:** لا خادم تطبيق ولا قاعدة بيانات ولا Docker. بيانات كل أسرة تبقى في متصفحها (localStorage).
- **لا يمس المواقع الأخرى:** إعدادات atlas وfiles وfursan وn8n تبقى كما هي.
- **الإصدار الجاري:** الرابط `current` يشير إليه. ويحتفظ الخادم بآخر 5 إصدارات للتراجع.

## مسار الإصدار

1. **رفع رقم الإصدار:** يُعدَّل `version` في `package.json`، ثم يُرسل التعديل إلى `main`.
2. **الإنشاء الآلي:** يشغّل GitHub Actions الاختبارات (الوحدة والمتصفح). فإن نجحت، وكان رقم الإصدار جديدًا لم يُنشر من قبل، يبني حزمة `dinner-release-<إصدار>.tar.gz` وبصمتها، وينشئ الوسم `v<إصدار>` وصفحة الإصدار في **Releases** ويرفق بها الملفين.
3. **رفع دون تغيير رقم الإصدار:** يشغّل الاختبارات فقط، ولا ينشئ إصدارًا.

## التثبيت على الخادم

```bash
V=3.6.1
cd /root
curl -fLO https://github.com/AQBassam/SmartDinner/releases/download/v$V/dinner-release-$V.tar.gz
curl -fLO https://github.com/AQBassam/SmartDinner/releases/download/v$V/dinner-release-$V.tar.gz.sha256
sha256sum -c dinner-release-$V.tar.gz.sha256          # المتوقع: OK
tar -xzf dinner-release-$V.tar.gz && cd dinner-release-$V
bash deploy/install.sh                                  # تحقق الملفات، ثم تبديل current، ثم nginx -t وإعادة التحميل
bash deploy/verify.sh                                   # المتوقع: 14 ناجح
```

**التراجع:** `bash deploy/rollback.sh` يعيد الرابط `current` إلى الإصدار السابق في ثانية.

## الإعداد لأول مرة (تم في 18 أكتوبر 2026)

```bash
cp deploy/nginx/dinner-security-headers.conf /etc/nginx/snippets/
cp deploy/nginx/dinner.bassamailab.xyz.conf /etc/nginx/sites-available/dinner.bassamailab.xyz
ln -s /etc/nginx/sites-available/dinner.bassamailab.xyz /etc/nginx/sites-enabled/
bash deploy/install.sh
certbot --nginx -d dinner.bassamailab.xyz --redirect
```

- **بعد certbot لا يُنسخ ملف الموقع من جديد.** certbot كتب أسطر الشهادة في الملف الحي، والنسخ فوقه يمحوها.
- **تغيير لاحق في إعداد nginx** يُطبَّق بسكربت تعديل يضيف ما يلزم إلى الملف الحي، مثل `deploy/patch-nginx-photos.sh` لقاعدة صور الوصفات.

## صور الوصفات

الموجّه والمواصفات في `docs/Recipe_Photo_Brief.md`. تُوضع الصور في مجلد `photos/`، وهو مستثنى من المستودع، بأسماء الوصفات ومعها ملف المصادر `credits.json`. ثم يُشغَّل:

```bash
python3 scripts/images.py photos/
```

يكتب السكربت الصور المضغوطة في `public/recipes/`، ويسجّلها في `src/data/images.json`. وكلاهما يُرفع إلى المستودع.
