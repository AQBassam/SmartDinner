"""Renders public/og-image.jpg (1200×630) — the preview shown when the site link is shared on WhatsApp,
X, Facebook or Telegram. Chromium draws it, so the Arabic is shaped by the same engine as the site.
Usage: python3 scripts/og-image.py [recipe-id]   (default: chicken_saloona)"""
import pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
dish = sys.argv[1] if len(sys.argv) > 1 else 'chicken_saloona'
photo = ROOT / 'public/recipes' / f'{dish}-hero.webp'
fonts = ROOT / 'node_modules/@fontsource/tajawal/files'
html = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face {{ font-family: T; font-weight: 500; src: url('{(fonts / 'tajawal-arabic-500-normal.woff2').as_uri()}'); }}
@font-face {{ font-family: T; font-weight: 800; src: url('{(fonts / 'tajawal-arabic-800-normal.woff2').as_uri()}'); }}
@font-face {{ font-family: T; font-weight: 500; src: url('{(fonts / 'tajawal-latin-500-normal.woff2').as_uri()}'); unicode-range: U+0000-00FF; }}
* {{ margin: 0; box-sizing: border-box; }}
body {{ width: 1200px; height: 630px; font-family: T; background: #fff8ef; color: #2b2824; display: flex; overflow: hidden; }}
.text {{ width: 610px; padding: 64px 64px 56px 40px; display: flex; flex-direction: column; }}
.brand {{ display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 800; color: #2e6a4a; }}
.mark {{ width: 64px; height: 64px; border-radius: 18px; background: #2e6a4a; display: grid; place-items: center; }}
h1 {{ margin-top: 54px; font-size: 76px; line-height: 1.18; font-weight: 800; }}
h1 span {{ color: #8a5a00; }}
p {{ margin-top: 22px; font-size: 29px; line-height: 1.5; font-weight: 500; color: #5c554d; }}
.url {{ margin-top: auto; font-size: 25px; font-weight: 500; color: #2e6a4a; direction: ltr; text-align: right; }}
.photo {{ flex: 1; position: relative; }}
.photo img {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}
.photo::after {{ content: ''; position: absolute; inset: 0; background: linear-gradient(to right, rgba(255,248,239,0) 84%, #fff8ef); }}
</style></head><body>
<div class="text">
  <div class="brand"><div class="mark"><svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M3 12h18a9 9 0 0 1-18 0Z" fill="#e6b247"/><path d="M2.5 12h19" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M9 4.5c0 1.2 1 1.6 1 2.8M12.5 4c0 1.2 1 1.6 1 2.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg></div>دليل العشاء المنزلي</div>
  <h1>وش نسوي<br><span>عشا الليلة؟</span></h1>
  <p>خطة عشاء للأسرة، تجهيز مسبق في دقائق، وقائمة تسوق تتولد من الوصفات.</p>
  <div class="url">dinner.bassamailab.xyz</div>
</div>
<div class="photo"><img src="{photo.as_uri()}" alt=""></div>
</body></html>"""
tmp = ROOT / 'node_modules/.og.html'; tmp.write_text(html, encoding='utf-8')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 630})
    pg.goto(tmp.as_uri()); pg.wait_for_function("document.fonts.ready.then(() => [...document.images].every(i => i.complete))")
    pg.wait_for_timeout(200)
    out = ROOT / 'public/og-image.jpg'
    pg.screenshot(path=str(out), type='jpeg', quality=82)
    b.close()
tmp.unlink()
print(out, out.stat().st_size // 1024, 'KB')
