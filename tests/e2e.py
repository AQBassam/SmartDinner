"""End-to-end smoke test against the production build, under the production CSP.
Usage: python3 tests/e2e.py <dist-dir> <screenshot-dir>"""
import json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright, expect

DIST, SHOTS = sys.argv[1], pathlib.Path(sys.argv[2]); SHOTS.mkdir(parents=True, exist_ok=True)
import socket
_s = socket.socket(); _s.bind(('127.0.0.1', 0)); PORT = _s.getsockname()[1]; _s.close()
srv = subprocess.Popen([sys.executable, str(pathlib.Path(__file__).with_name('serve.py')), DIST, str(PORT)])
time.sleep(0.8)
URL = f'http://127.0.0.1:{PORT}/'
results, errors = [], []
def ok(name, cond=True):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ar-OM',
                            timezone_id='Asia/Muscat', accept_downloads=True, has_touch=True, is_mobile=True)
        page = ctx.new_page()
        page.on('console', lambda m: m.type in ('error', 'warning') and errors.append(m.text))
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.set_fixed_time('2026-10-18T21:40:00+04:00')  # evening: «tonight tasks» block is current
        page.goto(URL); page.wait_for_selector('text=سؤال العشاء محسوم مسبقًا')
        ok('first visit shows the 3-step intro', True)
        page.screenshot(path=SHOTS / '00a-intro.png')
        for _ in range(3): page.get_by_role('button', exact=True, name='التالي').click()
        ok('intro ends with the family size', page.get_by_text('كم شخصًا على العشاء؟').count() == 1)
        page.get_by_role('button', exact=True, name='ابدأ').click()
        page.wait_for_selector('text=جهّز الليلة لعشاء الغد')
        ok('app loads under strict CSP on the Today tab', True)
        main = page.inner_text('main')
        ok('today = shopping day + evening session for night 1', 'التسوق اليوم' in main and 'شاورما' in main and '9:30 م' in main)
        ok('shopping tasks name the dishes they prepare', 'لـكفتة اللحم بصلصة الطماطم' in main)
        ok('current block highlighted', page.locator('li[aria-current=step]').count() == 1
           and 'جهّز الليلة' in page.locator('li[aria-current=step]').inner_text())
        page.screenshot(path=SHOTS / '00-today-eve.png')
        page.screenshot(path=SHOTS / '00b-today-eve-full.png', full_page=True)
        task = page.locator('li[aria-current=step]').get_by_role('checkbox').first
        task.click()
        page.reload(); page.wait_for_selector('text=جهّز الليلة لعشاء الغد')
        ok('prep tick persists', page.locator('li[aria-current=step]').get_by_role('checkbox').first.get_attribute('aria-checked') == 'true')

        # next day 16:20 — the «what's for dinner?» moment, answered; then the emergency swap
        page.clock.set_fixed_time('2026-10-19T16:20:00+04:00')
        st = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')"))
        st['startDate'] = '2026-10-19'
        page.evaluate("s => localStorage.setItem('sdg.state.v3', s)", json.dumps(st, ensure_ascii=False))
        page.reload(); page.wait_for_selector('text=ابدأ الطهي')
        hero = page.locator('main section').first.inner_text()
        ok('emergency button visible on a dinner night', page.get_by_role('button', name='ما عندي طاقة الليلة').count() == 1)
        ok('tonight hero: recipe + start time from dinner 8:00', 'شاورما' in hero and '7:30 م' in hero and '8:00 م' in hero)
        ok('after-lunch block is current', 'بعد الغداء' in page.locator('li[aria-current=step]').inner_text())
        page.screenshot(path=SHOTS / '00c-today-afternoon.png', full_page=True)
        page.get_by_role('button', name='ما عندي طاقة الليلة').click()
        page.get_by_role('dialog').locator('button', has_text='سلطة التونة').first.click()
        page.wait_for_timeout(200)
        st = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')"))
        ok('emergency: tuna tonight, shawarma tomorrow, 15 nights', st['nights'][:2] == ['tuna_chickpea', 'shawarma'] and len(st['nights']) == 15)
        page.goto(URL + '#plan'); page.wait_for_selector('text=ليالي الخطة')
        ok('15 nights listed', page.locator('ol > li').count() == 15)
        ok('western digits only', not any(ch in page.inner_text('body') for ch in '٠١٢٣٤٥٦٧٨٩'))
        page.screenshot(path=SHOTS / '01-plan.png', full_page=False)
        page.screenshot(path=SHOTS / '01b-plan-full.png', full_page=True)

        # people stepper
        page.get_by_text('الأسرة ومدة الخطة').click()
        page.get_by_role('button', exact=True, name='زيادة مراهقون').click()
        expect(page.locator('header')).to_contain_text('6')
        ok('age-group stepper updates header', '6.2' in page.inner_text('main'))
        page.get_by_role('radio', name='كبيرة').click()
        ok('appetite changes servings', '7.13' in page.inner_text('main'))

        # swap night 1
        page.get_by_role('button', exact=True, name='تبديل وجبة الليلة 1').click()
        page.get_by_role('dialog').get_by_text('صالونة الخضراوات بالحمص').first.click()
        expect(page.locator('ol > li').first).to_contain_text('صالونة الخضراوات')
        ok('swap night 1 → veg saloona')

        # ics download
        with page.expect_download() as d:
            page.get_by_role('button', exact=True, name='تنزيل التذكيرات (.ics)').click()
        ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
        ok('ics: shop/ask/tonight-tasks events at family times', ics.count('BEGIN:VEVENT') >= 30 and 'T161500' in ics and 'T213000' in ics and 'BEGIN:VALARM' in ics)

        # shop
        page.get_by_role('button', exact=True, name='التسوق').click()
        page.wait_for_selector('text=تسوق الليالي')
        page.screenshot(path=SHOTS / '02-shop.png')
        first = page.get_by_role('checkbox').first
        name = first.get_attribute('aria-label'); first.click()
        ok('checkbox toggles', first.get_attribute('aria-checked') == 'true')
        page.locator('button[aria-expanded]', has_text='أرز بسمتي').first.click()
        page.wait_for_timeout(200)
        page.get_by_label('عندي منه الآن').first.fill('2000'); page.keyboard.press('Tab'); page.wait_for_timeout(200)
        ok('stock covers rice', 'مغطّى' in page.locator('button[aria-expanded]', has_text='أرز بسمتي').first.inner_text())
        page.locator('button[aria-expanded]', has_text='قطع دجاج بالعظم').first.click(); page.wait_for_timeout(200)
        page.screenshot(path=SHOTS / '03-shop-expanded.png')
        with page.expect_download() as d:
            page.get_by_role('button', exact=True, name='تنزيل القائمة كاملة (CSV لـ Excel)').click()
        csv = pathlib.Path(d.value.path()).read_bytes()
        ok('csv download with BOM', csv[:3] == b'\xef\xbb\xbf' and 'الدفعة'.encode() in csv)
        page.get_by_placeholder('اسم الصنف').fill('مناديل المطبخ'); page.get_by_placeholder('الكمية').fill('عبوتان')
        page.get_by_role('button', exact=True, name='إضافة').click()
        ok('custom item added', page.get_by_text('مناديل المطبخ').count() == 1)
        page.reload(); page.get_by_role('button', exact=True, name='التسوق').click(); page.wait_for_selector('text=تسوق الليالي')
        ok('state persists after reload', page.get_by_role('checkbox', name=name).first.get_attribute('aria-checked') == 'true'
           and page.get_by_text('مناديل المطبخ').count() == 1)
        page.locator('button[aria-pressed]', has_text='الدفعة 2').first.click()
        page.screenshot(path=SHOTS / '04-shop-trip2.png')

        # recipes + kitchen mode
        page.get_by_role('button', exact=True, name='الوصفات').click()
        page.get_by_placeholder('ابحث باسم وجبة أو مكوّن (دجاج، عدس…)').fill('عدس')
        ok('ingredient search', page.locator('main article').count() >= 1)
        page.get_by_placeholder('ابحث باسم وجبة أو مكوّن (دجاج، عدس…)').fill('')
        page.screenshot(path=SHOTS / '05-recipes.png')
        page.get_by_text('لفائف الفلافل بالطحينة والزبادي').first.click()
        page.wait_for_selector('text=ابدأ التحضير خطوة بخطوة'); page.wait_for_timeout(400)
        page.get_by_role('dialog').get_by_text('الأدوات', exact=True).click()
        ok('recipe shows its prep-ahead tasks', 'التجهيز المسبق' in page.inner_text('[role=dialog]') and 'الليلة السابقة' in page.inner_text('[role=dialog]'))
        ok('recipe shows allergens and tools', 'السمسم' in page.inner_text('[role=dialog]') and 'قلاية هوائية' in page.inner_text('[role=dialog]'))
        page.get_by_role('dialog').get_by_role('button', name='☆ مفضلة').click()
        page.screenshot(path=SHOTS / '06-recipe.png')
        page.get_by_role('button', exact=True, name='ابدأ التحضير خطوة بخطوة').click()
        page.get_by_role('button', exact=True, name='ابدأ الطهي').click()
        page.get_by_role('button', exact=True, name='التالي').click()
        page.screenshot(path=SHOTS / '07-kitchen.png')
        page.get_by_role('button', exact=True, name='خروج من وضع المطبخ').click()
        page.keyboard.press('Escape')

        # budget
        page.get_by_role('button', exact=True, name='المزيد').click()
        page.get_by_role('button', name='الميزانية وأسعار المتاجر').click()
        page.wait_for_selector('canvas')
        page.wait_for_timeout(300)
        ok('budget chart renders', page.locator('canvas').bounding_box()['height'] > 100)
        # add a Nesto price for chicken breast (1 kg pack) and price the plan at Nesto
        page.locator('main button', has_text='دجاج منزوع العظم').first.click()
        dlg = page.get_by_role('dialog')
        dlg.locator('select[name=store]').select_option('nesto')
        dlg.locator('input[name=size]').fill('1'); dlg.locator('select[name=unit]').select_option('kg')
        dlg.locator('input[name=value]').fill('1.950')
        dlg.get_by_role('button', name='حفظ السعر').click(); page.wait_for_timeout(200)
        ok('price record saved', 'نستو' in dlg.inner_text())
        page.screenshot(path=SHOTS / '08c-price-sheet.png')
        page.keyboard.press('Escape')
        page.get_by_role('radio', name='نستو').click(); page.wait_for_timeout(200)
        main = page.inner_text('main')
        ok('store comparison: nesto own price counted, fair basket shown', 'لـ1 من' in main and 'مقارنة عادلة على 1 من' in main)
        ok('hypermax without prices shows no fake total', 'لا توجد أسعار مسجلة لهذا المتجر بعد' in main)
        page.get_by_role('button', exact=True, name='تسجيل أسعار').first.click()
        qd = page.get_by_role('dialog')
        qd.locator('input[name^=v_]').nth(0).fill('3.500')
        qd.locator('input[name^=v_]').nth(1).fill('1.200')
        qd.get_by_role('button', name='حفظ الأسعار').click(); page.wait_for_timeout(200)
        ok('quick price entry saves records', len(json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')"))['priceBook']) == 3)
        page.evaluate('window.scrollTo(0, 700)'); page.wait_for_timeout(200)
        ok('budget page uses western digits (chart axis included)', not any(ch in page.inner_text('main') for ch in '٠١٢٣٤٥٦٧٨٩'))
        page.screenshot(path=SHOTS / '08-budget.png')
        page.screenshot(path=SHOTS / '08b-budget-full.png', full_page=True)

        # more: imports
        page.get_by_role('button', exact=True, name='المزيد').click()
        page.get_by_text('الحساسية والمكونات المستبعدة').click()
        page.get_by_role('button', exact=True, name='السمسم').click()
        ok('allergy conflicts listed', 'في الخطة الحالية' in page.inner_text('main') and 'لفائف الفلافل' in page.inner_text('main'))
        page.get_by_text('النسخ الاحتياطي والنقل بين الأجهزة').click()
        evil = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')"))
        evil['custom'] = [{'id': '"><img src=x onerror=window.__pwned=1>', 'name': 'x', 'qty': '', 'batch': 0, 'checked': False}]
        page.locator('input[type=file]').set_input_files({'name': 'evil.json', 'mimeType': 'application/json', 'buffer': json.dumps(evil).encode()})
        page.wait_for_timeout(300)
        ok('malicious backup rejected', page.evaluate('window.__pwned') is None and 'غير صحيحة' in page.inner_text('[role=status]'))
        v1 = {'version': 1, 'startDate': '2026-11-01', 'items': [{'name': 'بيض', 'qty': '18', 'batch': 'first'}, {'name': 'حفاضات', 'qty': 'كيس', 'batch': 'second'}]}
        page.once('dialog', lambda dlg: dlg.accept())
        page.locator('input[type=file]').set_input_files({'name': 'v1.json', 'mimeType': 'application/json', 'buffer': json.dumps(v1, ensure_ascii=False).encode()})
        page.wait_for_timeout(300)
        ok('v1 backup migrated', page.evaluate("JSON.parse(localStorage.getItem('sdg.state.v3')).custom[0].name") == 'حفاضات')
        fx = pathlib.Path(__file__).resolve().parent.parent / 'src/lib/__fixtures__/html-v2-backup.json'
        page.once('dialog', lambda dlg: dlg.accept())
        page.locator('input[type=file]').set_input_files(str(fx))
        page.wait_for_timeout(300)
        st = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')"))
        ok('Smart_Shopping_List_v2 backup migrated', st['household']['adults'] == 6 and st['nights'][0] == 'falafel_wraps' and len(st['priceBook']) == 3)
        page.screenshot(path=SHOTS / '09-more.png')

        # corrupt storage must not brick
        page.evaluate("localStorage.setItem('sdg.state.v3', '{\"schemaVersion\":3,\"household\":null')")
        page.goto(URL + '#plan'); page.reload(); page.wait_for_selector('text=ليالي الخطة')
        ok('corrupt storage recovers to defaults', page.locator('ol > li').count() == 15)

        # offline (service worker)
        page.wait_for_timeout(1500)
        page.reload(); page.wait_for_timeout(800)
        ctx.set_offline(True)
        page.reload(); 
        try:
            page.wait_for_selector('text=ليالي الخطة', timeout=5000); ok('works offline after first visit')
        except Exception:
            ok('works offline after first visit', False)
        ctx.set_offline(False)

        # responsive: no sideways scroll at any common width; top navigation on wide screens
        w = b.new_page(viewport={'width': 1280, 'height': 900})
        w.goto(URL); w.get_by_role('button', exact=True, name='تخطٍّ').click(); w.wait_for_timeout(300)
        widths_ok = True
        for width in (360, 390, 430, 768, 1024, 1280, 1440):
            w.set_viewport_size({'width': width, 'height': 900})
            for tab in ('today', 'recipes', 'plan', 'shop'):
                w.goto(URL + '#' + tab); w.wait_for_timeout(250)
                over = w.evaluate('document.scrollingElement.scrollWidth - window.innerWidth')
                if over > 1: widths_ok = False; print(f'  overflow {over}px at {width} #{tab}')
                if tab in ('today', 'recipes') and width in (360, 768, 1280, 1440):
                    w.screenshot(path=SHOTS / f'w{width}-{tab}.png', full_page=True)
        ok('no horizontal scroll at 360–1440px', widths_ok)
        w.set_viewport_size({'width': 1280, 'height': 900}); w.goto(URL + '#today'); w.wait_for_timeout(250)
        ok('wide screens: top navigation, no bottom bar', w.locator('header nav').is_visible() and not w.locator('body > div nav.fixed, nav.fixed').first.is_visible())
        ok('wide screens use the space (content wider than 672px)', w.evaluate("document.querySelector('main').getBoundingClientRect().width") > 1000)
        w.goto(URL + '#recipes'); w.wait_for_timeout(250)
        cols = w.evaluate("getComputedStyle(document.querySelector('main ul.grid')).gridTemplateColumns.split(' ').length")
        ok('recipe grid: 4 columns at 1280px', cols == 4)
        w.close()

        # desktop + print
        d = b.new_page(viewport={'width': 1280, 'height': 900})
        d.goto(URL); d.get_by_role('button', exact=True, name='تخطٍّ').click(); d.wait_for_selector('text=جهّز الليلة لعشاء الغد')
        d.screenshot(path=SHOTS / '10a-desktop-today.png')
        d.goto(URL + '#shop'); d.wait_for_selector('text=تسوق الليالي')
        d.screenshot(path=SHOTS / '10-desktop-shop.png')
        d.emulate_media(media='print'); d.pdf(path=str(SHOTS / '11-print.pdf')) if False else None
        b.close()
finally:
    srv.terminate()

csp = [e for e in errors if 'Content Security Policy' in e]
ok('no CSP violations', not csp)
other = [e for e in errors if 'Content Security Policy' not in e and 'net::ERR_INTERNET_DISCONNECTED' not in e]
ok('no console errors', not other)
for e in errors[:10]: print('  console:', e[:200])
print(f"\n{sum(r for _, r in results)}/{len(results)} passed")
sys.exit(0 if all(r for _, r in results) else 1)
