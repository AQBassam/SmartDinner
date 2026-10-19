"""Real-use checks that the layout and unit tests do not cover.

  python3 tests/realuse.py <dist> <dist-next> <out-dir>

<dist-next> is a second build of the next version (one photo with a new hash) used to simulate a
site update on a phone that already has the old version installed.

  1. Load on a mid-range phone: 1.6 Mbit/s, 150 ms RTT, CPU ×4. Time to tonight's card and to the
     hero photo, first visit and repeat visit (service worker).
  2. Keyboard: every focusable control on Today shows a focus ring with 3:1 contrast against what is
     behind it; Escape closes a sheet and returns focus to the button that opened it.
  3. axe-core (WCAG 2.1 AA rules) on every tab and on the recipe sheet.
  4. Calendar file: parsed with the icalendar library; times in Asia/Muscat, alarms, unique UIDs,
     lines folded at 75 octets, CRLF endings.
  5. Backup: a family with real changes exports a backup, wipes the browser, restores it: same state.
  6. Update: the next build is deployed under the same origin; after reloads the new photo hash is
     served (not the cached old one) and the family's plan, stock and prices are untouched.
Writes <out-dir>/realuse.json and prints a report; exit 1 on any failure."""
import json, os, pathlib, shutil, socket, subprocess, sys, time
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

DIST, NEXT, OUT = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
SITE = OUT / 'site'
def deploy(src):
    if SITE.exists(): shutil.rmtree(SITE)
    shutil.copytree(src, SITE)
deploy(DIST)
_s = socket.socket(); _s.bind(('127.0.0.1', 0)); PORT = _s.getsockname()[1]; _s.close()
srv = subprocess.Popen([sys.executable, str(pathlib.Path(__file__).with_name('serve.py')), str(SITE), str(PORT)])
time.sleep(0.8)
URL = f'http://127.0.0.1:{PORT}/'
AXE = (pathlib.Path(__file__).resolve().parent.parent / 'node_modules/axe-core/axe.min.js').read_text()
NOW = '2026-10-20T16:20:00+04:00'

results, report = [], {}
def ok(name, cond, detail='', advisory=False):
    # load times on a shared CI runner say more about the runner than the site: reported, not gating
    if advisory and os.environ.get('CI'):
        print(('PASS ' if cond else 'NOTE ') + name + (f'  [{detail}]' if detail else '')); return
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

def start(page, start_date='2026-10-20'):
    page.goto(URL); page.wait_for_selector('text=سؤال العشاء محسوم مسبقًا')
    for _ in range(3): page.get_by_role('button', exact=True, name='التالي').click()
    page.get_by_role('button', exact=True, name='ابدأ').click()
    st = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')")); st['startDate'] = start_date
    page.evaluate("s => localStorage.setItem('sdg.state.v3', s)", json.dumps(st, ensure_ascii=False)); page.reload()
    page.wait_for_selector('text=ابدأ التحضير')
    return st

try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ------------------------------------------------------------------ 1. load on a mid-range phone
        seed = None
        with b.new_context(viewport={'width': 390, 'height': 844}, locale='ar-OM', timezone_id='Asia/Muscat') as c0:
            pg = c0.new_page(); pg.clock.set_fixed_time(NOW); seed = start(pg)
        timing = {}
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                            locale='ar-OM', timezone_id='Asia/Muscat')
        ctx.add_init_script(f"if (!localStorage.getItem('sdg.state.v3')) localStorage.setItem('sdg.state.v3', {json.dumps(json.dumps(seed, ensure_ascii=False))});")
        page = ctx.new_page(); page.clock.set_fixed_time(NOW)
        page.on('dialog', lambda d: d.accept())
        cdp = ctx.new_cdp_session(page)
        cdp.send('Network.enable')
        cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6e6 / 8, 'uploadThroughput': 750e3 / 8})
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        HERO = "() => { const i = document.querySelector('main section img'); return !!i && i.complete && i.naturalWidth > 0; }"
        for visit in ('first', 'repeat'):
            t0 = time.perf_counter()
            page.goto(URL, wait_until='commit')
            page.wait_for_selector('main h2', state='visible', timeout=60000); t_card = time.perf_counter() - t0
            page.wait_for_function(HERO, timeout=60000); t_img = time.perf_counter() - t0
            kb = page.evaluate("performance.getEntriesByType('resource').reduce((s, e) => s + (e.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0)") / 1024
            timing[visit] = {'card_s': round(t_card, 2), 'hero_s': round(t_img, 2), 'transfer_kb': round(kb)}
            page.wait_for_timeout(2500)  # let the service worker install and cache
        report['load_mid_phone'] = timing
        ok('first visit: tonight card under 3.5 s', timing['first']['card_s'] < 3.5, f"{timing['first']['card_s']} s", advisory=True)
        ok('first visit: hero photo under 4 s', timing['first']['hero_s'] < 4, f"{timing['first']['hero_s']} s", advisory=True)
        ok('repeat visit: card and photo under 1.5 s', timing['repeat']['hero_s'] < 1.5, f"{timing['repeat']['card_s']} / {timing['repeat']['hero_s']} s", advisory=True)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 0, 'downloadThroughput': -1, 'uploadThroughput': -1})

        # ------------------------------------------------------------------ 2. keyboard
        page.goto(URL); page.wait_for_selector('text=ابدأ التحضير')
        FOCUS = r"""() => {
          const el = document.activeElement; if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const lum = (c) => { const m = c.match(/-?[\d.]+/g); if (!m) return null;
            if (c.startsWith('oklab') || c.startsWith('oklch')) return Math.min(1, Math.max(0, +m[0])) ** 3; // Y ≈ L³
            const k = c.startsWith('color(') ? 1 : 255; const [r, g, b] = m.slice(0, 3).map((v) => { v = v / k; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          let bgEl = el.parentElement, bg = 'rgb(255,248,239)';
          while (bgEl) { const c = getComputedStyle(bgEl).backgroundColor; if (c && !/(, 0\)|\/ 0\))$/.test(c) && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') { bg = c; break; } bgEl = bgEl.parentElement; }
          const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 ? cs.outlineColor : null;
          const L1 = ring ? lum(ring) : null, L2 = lum(bg);
          const ratio = L1 === null ? 0 : (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const r = el.getBoundingClientRect();
          return { ringColor: ring, bg, label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40), ring: !!ring, ratio: Math.round(ratio * 100) / 100, onScreen: r.bottom > 0 && r.top < innerHeight };
        }"""
        seen, weak = [], []
        page.locator('body').click(position={'x': 5, 'y': 5})
        for _ in range(60):
            page.keyboard.press('Tab'); page.wait_for_timeout(220); f = page.evaluate(FOCUS)  # let the 150 ms outline-colour transition finish
            if not f: continue
            if f['label'] in [x['label'] for x in seen]: break
            seen.append(f)
            if not f['ring'] or f['ratio'] < 3: weak.append(f"{f['label']} ({f['ratio']}:1 {f['ringColor']} on {f['bg']})")
        report['keyboard'] = {'tab_stops': len(seen), 'weak_focus': weak}
        ok('keyboard: every Tab stop shows a focus ring ≥ 3:1', not weak and len(seen) > 10, f"{len(seen)} stops; weak: {weak[:4]}")
        btn = page.get_by_role('button', exact=True, name='عرض الوصفة').first
        btn.focus(); page.keyboard.press('Enter'); page.wait_for_selector('[role=dialog]')
        inside = page.evaluate("document.activeElement?.closest('[role=dialog]') !== null")
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        back = page.evaluate("document.activeElement?.textContent?.trim()")
        ok('sheet: focus moves inside, Escape returns it to the opener', inside and back == 'عرض الوصفة', f'inside={inside}, back={back!r}')

        # ------------------------------------------------------------------ 3. axe-core
        def axe(scope=None):
            page.evaluate('() => { if (!window.axe) { (0, eval)(' + json.dumps(AXE) + '); } }')
            res = page.evaluate("""async (scope) => { const r = await axe.run(scope ? document.querySelector(scope) : document,
              { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
              return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].target.join(' '), why: v.nodes[0].failureSummary.slice(30, 260), html: v.nodes[0].html.slice(0, 120) })); }""", scope)
            return res
        ax = {}
        for tab in ('today', 'plan', 'shop', 'recipes', 'more', 'budget'):
            page.goto(URL + '#' + tab); page.wait_for_timeout(500)
            ax[tab] = axe()
        page.goto(URL + '#recipes'); page.wait_for_timeout(300)
        page.locator('main article button').first.click(); page.wait_for_selector('[role=dialog]'); page.wait_for_timeout(600)
        ax['recipe-sheet'] = axe('[role=dialog]')
        # the same screens with members on both eating patterns: set-aside portion, badges, family editor
        page.keyboard.press('Escape')
        page.evaluate("() => { const s = JSON.parse(localStorage.getItem('sdg.state.v3')); s.special = [{group:'adults',diet:'vegan'},{group:'adults',diet:'pescoDairy'}]; localStorage.setItem('sdg.state.v3', JSON.stringify(s)); }")
        page.goto(URL + '#today'); page.reload(); page.wait_for_timeout(500)
        ax['diet-today'] = axe()
        page.goto(URL + '#plan'); page.wait_for_timeout(400)
        page.evaluate("document.querySelectorAll('main details').forEach(d => d.open = true)")
        ax['diet-plan'] = axe()
        page.goto(URL + '#recipes'); page.wait_for_timeout(300)
        page.locator('main article button').first.click(); page.wait_for_selector('[role=dialog]'); page.wait_for_timeout(600)
        ax['diet-recipe-sheet'] = axe('[role=dialog]')
        report['axe'] = ax
        for k, v in ax.items():
            ok(f'axe {k}: no WCAG A/AA violations', not v, '; '.join(f"{x['id']}×{x['n']} {x['html']} — {x['why']}" for x in v[:3]))
        page.keyboard.press('Escape')

        # ------------------------------------------------------------------ 4. calendar file
        from icalendar import Calendar
        page.goto(URL + '#plan'); page.wait_for_timeout(300)
        with page.expect_download() as d:
            page.get_by_role('button', exact=True, name='تنزيل التذكيرات (.ics)').click()
        raw = pathlib.Path(d.value.path()).read_bytes()
        cal = Calendar.from_ical(raw)
        evs = [e for e in cal.walk('VEVENT')]
        uids = [str(e['UID']) for e in evs]
        starts = [e.decoded('DTSTART') for e in evs]
        ask = [e for e in evs if 'عشاء الليلة' in str(e['SUMMARY'])]
        first_ask = ask[0].decoded('DTSTART') if ask else None
        lines = raw.split(b'\r\n')
        ok('ics: CRLF line endings, lines folded at 75 octets', b'\n' not in raw.replace(b'\r\n', b'') and max(len(l) for l in lines) <= 75, f'longest {max(len(l) for l in lines)}')
        ok('ics: unique UIDs, every event has an alarm', len(set(uids)) == len(uids) and all(e.walk('VALARM') for e in evs), f'{len(evs)} events')
        ok('ics: "عشاء الليلة" at 4:15 pm Muscat time', first_ask is not None and first_ask.utcoffset() == timedelta(hours=4) and (first_ask.hour, first_ask.minute) == (16, 15),
           f'{first_ask}')
        ok('ics: every event has a time zone (no floating times)', all(getattr(s, 'tzinfo', None) is not None for s in starts if isinstance(s, datetime)))
        report['ics'] = {'events': len(evs), 'first_ask': str(first_ask), 'calendar_tz': [str(t.get('TZID')) for t in cal.walk('VTIMEZONE')]}

        # ------------------------------------------------------------------ 5. backup with real data
        page.evaluate("""() => { const s = JSON.parse(localStorage.getItem('sdg.state.v3'));
          s.household.adults = 3; s.household.kids = 2; s.nights[3] = 'chicken_saloona'; s.checked = { [Object.keys(s.checked)[0] || '0:onion']: true };
          s.stock = { rice: 1500 }; s.favorites = ['foul'];
          s.priceBook.push({ id: 'prtest01', ing: 'eggs', store: 'nesto', product: 'بيض 30', sold: { type: 'pack', size: 30, label: 'طبق' }, value: 1.9, type: 'manual', checkedAt: '2026-10-19' });
          localStorage.setItem('sdg.state.v3', JSON.stringify(s)); }""")
        page.reload(); page.wait_for_timeout(400)
        before = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')"))
        page.screenshot(path=OUT / 'debug-before-backup.png')
        ok('family changes accepted by the app', before['household']['adults'] == 3 and before['stock'].get('rice') == 1500 and any(r['id'] == 'prtest01' for r in before['priceBook']))
        page.goto(URL + '#more'); page.wait_for_timeout(300)
        page.evaluate("document.querySelectorAll('main details').forEach(d => d.open = true)")
        with page.expect_download() as d:
            page.get_by_role('button', exact=True, name='حفظ نسخة').click()
        backup = pathlib.Path(d.value.path()).read_bytes()
        page.evaluate("localStorage.clear()"); page.reload(); page.wait_for_timeout(300)
        if page.get_by_role('button', exact=True, name='التالي').count():
            for _ in range(3): page.get_by_role('button', exact=True, name='التالي').click()
            page.get_by_role('button', exact=True, name='ابدأ').click()
        page.goto(URL + '#more'); page.wait_for_timeout(300)
        page.evaluate("document.querySelectorAll('main details').forEach(d => d.open = true)")
        page.locator('input[type=file]').set_input_files({'name': 'backup.json', 'mimeType': 'application/json', 'buffer': backup})
        page.get_by_role('button', exact=True, name='استعادة النسخة').click()
        page.wait_for_timeout(600)
        after = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')"))
        keys = ['household', 'nights', 'startDate', 'checked', 'stock', 'favorites', 'priceBook', 'times', 'optionalOff', 'custom']
        diff = [k for k in keys if before.get(k) != after.get(k)]
        ok('backup → wipe → restore: family state identical', not diff, f'differs: {diff}')

        # ------------------------------------------------------------------ 6. site update on an installed phone
        page.goto(URL); page.wait_for_timeout(1500)
        old_v = page.evaluate("document.querySelector('main section img')?.getAttribute('src')")
        deploy(NEXT)
        new_v = None
        tries = 0
        for _ in range(5):
            tries += 1
            page.reload(); page.wait_for_timeout(1500)
            srcs = page.evaluate("[...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src).filter((s) => s.includes('/recipes/'))")
            nv = json.loads((NEXT / 'version.json').read_text())['version']
            hero = page.evaluate("document.querySelector('main section img')?.getAttribute('src')")
            if hero and hero != old_v:
                new_v = hero; break
        cached = page.evaluate("""async () => { const c = await caches.open('recipe-photos'); return (await c.keys()).map((r) => r.url); }""")
        hero_loaded = page.evaluate(HERO)
        after_update = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')"))
        ok('update: the open page moves to the new release and shows the new photo', new_v is not None and hero_loaded, f'{old_v} → {new_v} after {tries} reload(s)')
        ok('update: family plan, stock and prices untouched', all(after_update.get(k) == after.get(k) for k in keys))
        report['update'] = {'old': old_v, 'new': new_v, 'photo_cache_entries': len(cached)}
        b.close()
finally:
    srv.terminate()

(OUT / 'realuse.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(f"\n{sum(r for _, r in results)}/{len(results)} passed")
sys.exit(0 if all(r for _, r in results) else 1)
