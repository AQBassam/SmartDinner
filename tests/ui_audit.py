"""Layout audit: opens every screen and sheet at phone and desktop widths and reports
  - text covered by a form control (input/select/textarea),
  - text cut off without an intended ellipsis/line clamp,
  - sideways overflow inside the page or a sheet,
  - tap targets under 36px,
plus console errors. Usage: python3 tests/ui_audit.py <dist-dir> <screenshot-dir>  (exit 1 on findings)."""
import json, pathlib, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

DIST, SHOTS = sys.argv[1], pathlib.Path(sys.argv[2]); SHOTS.mkdir(parents=True, exist_ok=True)
_s = socket.socket(); _s.bind(('127.0.0.1', 0)); PORT = _s.getsockname()[1]; _s.close()
srv = subprocess.Popen([sys.executable, str(pathlib.Path(__file__).with_name('serve.py')), DIST, str(PORT)])
time.sleep(0.8)
URL = f'http://127.0.0.1:{PORT}/'

PROBE = r"""
(scope) => {
  const root = scope ? document.querySelector(scope) : document.body;
  const out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && !(el.closest('details:not([open])') && !el.closest('summary')); };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.placeholder || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
  const controls = [...root.querySelectorAll('input:not([type=checkbox]):not([type=hidden]):not([type=file]), select, textarea')].filter(vis);
  const texts = [...root.querySelectorAll('*')].filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  for (const c of controls) {
    const a = c.getBoundingClientRect();
    for (const t of texts) {
      if (t === c || c.contains(t) || t.contains(c)) continue;
      const b = t.getBoundingClientRect();
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 3 && iy > 3) out.push({ kind: 'covered', text: label(t), by: label(c) });
    }
  }
  for (const t of texts) {
    const cs = getComputedStyle(t);
    const intended = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '' || t.closest('.scroll-x');
    if (!intended && (cs.overflowX !== 'visible' || cs.overflow === 'hidden') && t.scrollWidth > t.clientWidth + 2) out.push({ kind: 'clipped', text: label(t) });
  }
  const box = scope ? root.querySelector('.overflow-y-auto') || root : document.scrollingElement;
  if (box.scrollWidth > box.clientWidth + 1) out.push({ kind: 'sideways', text: `${box.scrollWidth - box.clientWidth}px` });
  for (const b of [...root.querySelectorAll('button, a, [role=checkbox], [role=switch], [role=radio]')].filter(vis)) {
    const r = b.getBoundingClientRect();
    if (r.height < 36 && r.width < 200 && !b.closest('nav') && !b.matches('summary *')) out.push({ kind: 'small-target', text: `${label(b)} (${Math.round(r.width)}×${Math.round(r.height)})` });
  }
  return out;
}
"""

ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
findings, errors = {}, []
def audit(page, name, scope=None):
    page.wait_for_timeout(250)
    res = page.evaluate(PROBE, scope)
    key = name
    uniq = []
    for r in res:
        s = f"{r['kind']}: {r['text']}" + (f"  ← {r['by']}" if 'by' in r else '')
        if s not in uniq: uniq.append(s)
    if uniq: findings[key] = uniq
    page.screenshot(path=SHOTS / f'{name}.png', full_page=scope is None)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for width in (360, 1280):
            ctx = b.new_context(viewport={'width': width, 'height': 860}, locale='ar-OM', timezone_id='Asia/Muscat',
                                is_mobile=width < 800, has_touch=width < 800,
                                user_agent=ANDROID if width < 800 else None)
            page = ctx.new_page()
            page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.clock.set_fixed_time('2026-10-20T16:20:00+04:00')
            page.goto(URL); page.wait_for_selector('text=سؤال العشاء محسوم مسبقًا')
            for step in range(3):
                audit(page, f'{width}-intro-{step}', '[role=dialog]')
                page.get_by_role('button', exact=True, name='التالي').click()
            audit(page, f'{width}-intro-family', '[role=dialog]')
            if width < 800:  # phones get one more step: installing the guide as an app
                page.get_by_role('button', exact=True, name='التالي').click()
                page.get_by_role('button', name='عرض الخطوات على آيفون').click()
                audit(page, f'{width}-intro-install', '[role=dialog]')
            page.get_by_role('button', exact=True, name='ابدأ').click()
            # make "today" a dinner night so every block exists
            st = json.loads(page.evaluate("localStorage.getItem('sdg.state.v3')")); st['startDate'] = '2026-10-20'
            page.evaluate("s => localStorage.setItem('sdg.state.v3', s)", json.dumps(st, ensure_ascii=False)); page.reload()
            page.wait_for_selector('text=ابدأ التحضير')
            audit(page, f'{width}-today')
            page.get_by_role('button', name='ما عندي طاقة الليلة').click(); audit(page, f'{width}-sos', '[role=dialog]'); page.keyboard.press('Escape')

            for tab in ('plan', 'shop', 'recipes', 'more', 'budget'):
                page.goto(URL + '#' + tab); page.wait_for_timeout(400)
                if tab == 'plan':
                    page.get_by_text('الأسرة ومدة الخطة').click()
                if tab == 'more':
                    page.evaluate("document.querySelectorAll('main details').forEach(d => d.open = true)")
                if tab == 'shop':
                    page.locator('button[aria-expanded]').first.click()
                audit(page, f'{width}-{tab}')
                if tab == 'plan':
                    page.get_by_role('button', name='تبديل وجبة الليلة 2').click(); audit(page, f'{width}-swap', '[role=dialog]'); page.keyboard.press('Escape')
                if tab == 'recipes':
                    page.locator('main article button').first.click(); page.wait_for_selector('text=ابدأ التحضير خطوة بخطوة')
                    page.evaluate("document.querySelectorAll('[role=dialog] details').forEach(d => d.open = true)")
                    audit(page, f'{width}-recipe', '[role=dialog]')
                    page.get_by_role('button', exact=True, name='ابدأ التحضير خطوة بخطوة').click(); page.wait_for_timeout(300)
                    audit(page, f'{width}-kitchen', '[aria-label^="وضع المطبخ"]')
                    page.get_by_role('button', exact=True, name='خروج من وضع المطبخ').click(); page.keyboard.press('Escape')
                if tab == 'budget':
                    page.wait_for_selector('canvas')
                    page.get_by_role('button', exact=True, name='تسجيل أسعار').first.click(); audit(page, f'{width}-quickprices', '[role=dialog]'); page.keyboard.press('Escape')
                    page.locator('main button', has_text='دجاج منزوع العظم').first.click(); audit(page, f'{width}-pricesheet', '[role=dialog]'); page.keyboard.press('Escape')
            ctx.close()
        b.close()
finally:
    srv.terminate()

for k, v in findings.items():
    print(f'\n[{k}]'); [print('  ' + x) for x in v[:25]]
for e in errors[:10]: print('console:', e[:200])
total = sum(len(v) for v in findings.values()) + len(errors)
print(f'\n{total} finding(s)')
sys.exit(1 if total else 0)
