import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/html-v2-backup.json';
import { ALLERGENS, DEFAULT_ORDER, ING, RECIPE, RECIPES, recipeAllergens, validateData } from './data';
import { commonBasket, compareStores, generate, scaledQty, type PlanInput } from './engine';
import { arCount, fmtQty, omr } from './format';
import { buildIcs, fold } from './ics';
import { applyEmergency, buildSchedule, emergencyOptions, minutesOf, scheduleEvents, startCooking, togglePrep } from './schedule';
import { migrateHtmlV2 } from './migrate';
import { resolvePrice, type PriceRecord } from './prices';
import { buyLabel, shoppingCsv } from './purchase';
import { DEFAULT_TIMES, defaultState, exportBackup, importBackup, loadState, servings, STORAGE_KEY } from './state';

const TODAY = '2026-10-18';
const plan = (over: Partial<PlanInput> = {}): PlanInput => ({
  servings: 5, members: 5, startDate: '2026-10-20', nights: [...DEFAULT_ORDER], optionalOff: [], have: {}, stock: {},
  priceBook: [], storeMode: 'auto', today: TODAY, ...over,
});
const allLines = (g: ReturnType<typeof generate>, id: string) => g.batches.flatMap((b) => b.lines.filter((l) => l.ing.id === id));
const line = (g: ReturnType<typeof generate>, batch: number, id: string) => g.batches[batch].lines.find((l) => l.ing.id === id);
const rec = (over: Partial<PriceRecord>): PriceRecord => ({
  id: 'p' + Math.random().toString(36).slice(2, 8), ing: 'tuna', store: 'nesto', product: 'x', sold: { type: 'pack', size: 1, label: 'علبة' },
  value: 0.5, type: 'manual', checkedAt: TODAY, ...over,
});

describe('data: R01–R15 from Smart_Shopping_List_v2 + R16–R18', () => {
  it('catalog and recipes are internally consistent (no gendered imperatives, tools listed, prices sourced)', () => {
    expect(validateData()).toEqual([]);
  });
  it('exactly R01–R18; the default 15-night plan is R01–R15, each once', () => {
    expect(RECIPES.map((r) => r.ref)).toEqual(Array.from({ length: 18 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`));
    expect(new Set(DEFAULT_ORDER).size).toBe(15);
    expect(DEFAULT_ORDER.map((id) => RECIPE[id].ref).sort()).toEqual(RECIPES.slice(0, 15).map((r) => r.ref));
  });
  it('the 3 added recipes widen allergy-safe choice (milk-free 6→8, gluten-free 4→6)', () => {
    const safe = (a: 'milk' | 'gluten') => RECIPES.filter((r) => !recipeAllergens(r).contains.includes(a)).length;
    expect([safe('milk'), safe('gluten')]).toEqual([8, 6]);
  });
  it('an 18-night plan has no spoiling item and each recipe once', () => {
    const g = generate(plan({ nights: [...DEFAULT_ORDER, 'foul', 'chicken_saloona', 'oven_tortilla'] }));
    expect(g.batches).toHaveLength(4);
    expect(g.needs.filter((n) => n.storage === 'tight')).toEqual([]);
  });
  it('every purchasable ingredient is used by at least one recipe', () => {
    const used = new Set(RECIPES.flatMap((r) => r.items.map((i) => i.i)));
    expect(Object.values(ING).filter((i) => !i.staple && !i.nobuy && !used.has(i.id)).map((i) => i.id)).toEqual([]);
  });
  it('allergens are derived from ingredients, not typed per recipe', () => {
    expect(recipeAllergens(RECIPE.falafel_wraps).contains).toEqual(['gluten', 'milk', 'sesame']);
    expect(recipeAllergens(RECIPE.chicken_rice)).toEqual({ contains: ['milk'], may: ['egg'] }); // eggs are optional
    expect(recipeAllergens(RECIPE.chicken_rice, new Set(['chicken_rice:eggs'])).may).toEqual([]);
    expect(recipeAllergens(RECIPE.labneh_table).contains).toContain('sesame'); // via hummus
    expect(Object.keys(ALLERGENS)).toHaveLength(14);
  });
});

describe('servings: age groups × appetite', () => {
  it('5 adults at normal appetite = 5 servings (the recipe base)', () => {
    expect(servings(defaultState())).toBe(5);
  });
  it('2 adults + 2 teens + 2 kids, large appetite', () => {
    expect(servings({ household: { adults: 2, teens: 2, kids: 2 }, appetite: 1.15 })).toBeCloseTo((2 + 2.4 + 1.2) * 1.15, 9);
  });
  it('scales linear / partial / fixed', () => {
    expect(scaledQty(ING.chicken_breast, 850, 10)).toBe(1700);
    expect(scaledQty(ING.garlic, 2, 10)).toBe(3);
    expect(scaledQty(ING.salt, 1, 20)).toBe(1);
  });
  it('rounds once for the whole plan, not per recipe (v2 file: 9 lemons for 2 people)', () => {
    const g = generate(plan({ servings: 2, members: 2 }));
    const lemons = allLines(g, 'lemon').reduce((s, l) => s + l.buy, 0);
    // partial scale: 0.5 + 0.5×0.4 = 0.7 per lemon; 11 lemons in recipes → 7.7 → bought 8 over 3 trips at most
    expect(lemons).toBeLessThanOrEqual(9);
    const tomatoes = allLines(g, 'tomato').reduce((s, l) => s + l.buy, 0);
    expect(tomatoes).toBeLessThanOrEqual(Math.ceil(36 * 0.4) + 3); // 36 tomatoes ×0.4 = 14.4; ≤ one rounding per trip
  });
  it('Arabic counting and OMR', () => {
    expect(arCount(1, ING.garlic.forms!)).toBe('فص واحد');
    expect(arCount(12, ING.pita.forms!)).toBe('12 رغيفًا');
    expect(fmtQty(ING.eggs, scaledQty(ING.eggs, 18, 8))).toBe('29 بيضة');
    expect(omr(3.79)).toBe('3.790 ر.ع');
  });
});

describe('shopping list (15 nights, 5 servings)', () => {
  const g = generate(plan());

  it('3 trips dated the day before nights 1, 6 and 11', () => {
    expect(g.batches.map((b) => b.date)).toEqual(['2026-10-19', '2026-10-24', '2026-10-29']);
  });
  it('the default order never leaves a fresh item past its shelf life', () => {
    expect(g.needs.filter((n) => n.storage === 'tight')).toEqual([]);
  });
  it('lettuce for the falafel night (14) is bought on trip 3, not 10 days earlier', () => {
    const lettuce = allLines(g, 'lettuce');
    expect(lettuce.map((l) => [l.batch, l.portions.map((p) => p.night)])).toEqual([[0, [1]], [2, [14]]]);
  });
  it('chickpeas: 2 recipes × 2 cans; tuna: 3 + 2 cans', () => {
    expect(allLines(g, 'chickpeas_can').reduce((s, l) => s + l.buy, 0)).toBe(4);
    expect(allLines(g, 'tuna').reduce((s, l) => s + l.buy, 0)).toBe(5);
  });
  it('frozen chicken bought once in whole packs; tray chicken uses the bone-in pack', () => {
    const c = allLines(g, 'chicken_breast');
    expect(c).toHaveLength(1);
    expect(c[0].need).toBe(2150);
    expect(c[0].packs).toBe(2);
    expect(allLines(g, 'chicken_thighs')[0].packs).toBe(2);
  });
  it('fresh minced beef beyond its 2-day life is flagged for freezing', () => {
    const m = line(g, 0, 'minced_beef')!;
    expect(m.need).toBe(1300);
    expect(m.packs).toBe(3);
    expect(m.freezeNights).toEqual([3, 8]);
  });
  it('thaw reminder the evening before every thaw-needing protein (falafel cooks from frozen)', () => {
    expect(g.reminders.filter((r) => r.kind === 'thaw').map((r) => r.night)).toEqual([1, 3, 5, 7, 8, 10, 15]);
  });
  it('spices are not shopping items', () => {
    expect(g.batches.flatMap((b) => b.lines).some((l) => l.cat === 'staples')).toBe(false);
    expect(g.staples.map((s) => s.ing.id)).toContain('turmeric');
  });
  it('purchase ≥ consumption > 0', () => {
    expect(g.budget.purchase).toBeGreaterThan(g.budget.consumption);
    expect(g.budget.consumption).toBeGreaterThan(0);
  });
  it('pack label', () => {
    expect(buyLabel(line(g, 0, 'chicken_breast')!)).toBe('2 × عبوة 2 كغ');
  });
});

describe('stock at home and optional items', () => {
  it('partial stock is used first and reduces the first purchase', () => {
    const g = generate(plan({ stock: { rice: 1500 } }));
    const rice = allLines(g, 'rice');
    expect(rice.reduce((s, l) => s + l.buy, 0)).toBe(0); // 800 g needed (R06 + R12), 1500 at home
    expect(rice[0].fromStock).toBe(800);
  });
  it('stock covering part of a need still buys the rest in whole packs', () => {
    const g = generate(plan({ stock: { eggs: 10 } }));
    const eggs = allLines(g, 'eggs');
    expect(eggs.reduce((s, l) => s + (l.packs ?? 0), 0)).toBe(1); // 18 needed, 10 at home → still 1 tray
    expect(eggs.reduce((s, l) => s + l.fromStock, 0)).toBe(10);
  });
  it('switching off an optional item removes it from shopping', () => {
    const on = generate(plan()).needs.filter((n) => n.ingId === 'eggs').length;
    const off = generate(plan({ optionalOff: ['chicken_rice:eggs'] })).needs.filter((n) => n.ingId === 'eggs').length;
    expect(on - off).toBe(1);
  });
  it('have=true keeps the line but buys nothing', () => {
    const l = allLines(generate(plan({ have: { chicken_breast: true } })), 'chicken_breast')[0];
    expect([l.have, l.buy, l.cost]).toEqual([true, 0, 0]);
  });
});

describe('store prices', () => {
  it('auto uses the newest family record, else the catalog', () => {
    const r = resolvePrice(ING.tuna, [rec({ value: 0.6, checkedAt: '2026-10-01' }), rec({ value: 0.55, checkedAt: '2026-10-10' })], 'auto', TODAY);
    expect(r.value).toBe(0.55);
    expect(resolvePrice(ING.tuna, [], 'auto', TODAY).source).toBe('verified');
  });
  it('expired promotions are ignored; old prices are kept but marked stale', () => {
    expect(resolvePrice(ING.tuna, [rec({ type: 'promo', validTo: '2026-10-10', value: 0.1 })], 'auto', TODAY).value).toBe(0.73);
    const old = resolvePrice(ING.tuna, [rec({ checkedAt: '2026-08-01' })], 'auto', TODAY);
    expect([old.value, old.stale]).toEqual([0.5, true]);
  });
  it('a store mode falls back to the catalog price and says so', () => {
    const r = resolvePrice(ING.labneh, [], 'nesto', TODAY);
    expect(r.fallback).toBe(true);
    expect(resolvePrice(ING.tuna, [], 'lulu', TODAY).fallback).toBe(false); // the catalog price IS a Lulu price
  });
  it('cheapest picks the lowest unit price across pack sizes', () => {
    const book = [rec({ ing: 'chicken_breast', store: 'nesto', sold: { type: 'pack', size: 1000, label: '1 كغ' }, value: 1.95 })];
    const r = resolvePrice(ING.chicken_breast, book, 'cheapest', TODAY); // 1.95/kg vs Lulu 3.79/2kg = 1.895/kg
    expect(r.store).toBe('lulu');
  });
  it("a store's own pack size drives the rounding", () => {
    const book = [rec({ ing: 'chicken_breast', store: 'nesto', sold: { type: 'pack', size: 1000, label: '1 كغ' }, value: 1.95 })];
    const c = allLines(generate(plan({ priceBook: book, storeMode: 'nesto' })), 'chicken_breast')[0];
    expect([c.packs, c.cost]).toEqual([3, 5.85]); // 2150 g → 3 × 1 kg
  });
  it('store comparison counts own-priced lines', () => {
    const book = [rec({ ing: 'tuna', store: 'nesto', value: 0.6 })];
    const cmp = compareStores(plan({ priceBook: book }));
    expect(cmp.find((c) => c.store === 'nesto')!.ownPriced).toBe(1);
    expect(cmp.find((c) => c.store === 'lulu')!.ownPriced).toBeGreaterThan(5);
  });
});

describe('import & migration', () => {
  it('round-trips v3', () => {
    const s = defaultState(new Date('2026-10-18T08:00:00Z'));
    expect(importBackup(JSON.stringify(s)).state).toEqual(s);
  });
  it('rejects the null-reminders file that bricked Smart_Shopping_List_v2', () => {
    const bad = { schemaVersion: 2, settings: {}, plan: [{ recipeId: 'R01' }], reminders: { first: null } };
    const r = importBackup(JSON.stringify(bad)); // migrates safely: reminders are not part of the new state
    expect(r.from).toBe('html-v2');
    expect(r.state.nights).toEqual(['shawarma']);
  });
  it('migrates a real Smart_Shopping_List_v2 backup', () => {
    const { state, notes } = migrateHtmlV2(fixture, new Date('2026-10-18T08:00:00Z'));
    expect(state.household).toEqual({ adults: 6, teens: 0, kids: 0 });
    expect(state.appetite).toBe(1.15);
    expect(state.startDate).toBe('2026-10-20');
    expect(state.nights.slice(0, 2)).toEqual(['falafel_wraps', 'shakshuka']);
    expect(state.nights).toHaveLength(10);
    expect(state.stock).toEqual({ rice: 1500, passata_can: 2, eggs: 6 }); // 800 g of passata = 2 cans
    expect(state.optionalOff).toEqual(['chicken_rice:eggs']);
    expect(state.favorites).toEqual(['falafel_wraps', 'labneh_table']);
    expect(state.avoidIngredients).toEqual(['tahini']);
    expect(state.custom.map((c) => c.name)).toEqual(['مناديل المطبخ', 'زبادي طبيعي غير محلى', 'حفاضات']);
    const nesto = state.priceBook.find((p) => p.store === 'nesto')!;
    expect([nesto.ing, nesto.sold.type === 'pack' && nesto.sold.size, nesto.value]).toEqual(['chicken_breast', 1000, 1.95]);
    const hyper = state.priceBook.find((p) => p.store === 'hypermax')!;
    expect([hyper.ing, hyper.sold.type === 'pack' && hyper.sold.size, hyper.validTo]).toEqual(['passata_can', 1, '2026-10-25']);
    expect(state.priceBook.find((p) => p.store === 'lulu')!.url).toBeUndefined(); // javascript: URL dropped
    expect(notes.some((n) => n.includes('اشتريته'))).toBe(true);
  });
  it('migrates the React build of this morning (v2 React)', () => {
    const old = { schemaVersion: 2, people: 4, startDate: '2026-10-19', nights: ['foul', 'fish_lemon_rice', 'shawarma'], includeOptional: false, checked: { '0:tomato': true }, have: {}, prices: { tuna: { value: 0.6, date: '2026-10-18' } }, custom: [] };
    const r = importBackup(JSON.stringify(old));
    expect(r.from).toBe('react-v2');
    expect(r.state.household.adults).toBe(4);
    expect(r.state.nights[1]).toBe('fish_lemon_garlic');
    expect(r.state.nights).toHaveLength(3); // dropped recipe replaced, not removed
    expect(r.state.optionalOff.length).toBeGreaterThan(0);
    expect(r.state.priceBook[0].value).toBe(0.6);
  });
  it('migrates v1 and keeps only family-added items', () => {
    const v1 = { version: 1, startDate: '2026-11-01', items: [{ name: 'بيض', qty: '18' }, { name: 'مناديل', qty: '2', batch: 'second' }] };
    const r = importBackup(JSON.stringify(v1));
    expect([r.from, r.state.startDate, r.state.custom.map((c) => [c.name, c.batch])]).toEqual(['v1', '2026-11-01', [['مناديل', 1]]]);
  });
  it('rejects malicious v3 and garbage', () => {
    const s = { ...defaultState(), custom: [{ id: '"><img src=x onerror=alert(1)>', name: 'x', qty: '', batch: 0, checked: false }] };
    expect(() => importBackup(JSON.stringify(s))).toThrow();
    const u = { ...defaultState(), priceBook: [{ ...rec({}), url: 'javascript:alert(1)' }] };
    expect(() => importBackup(JSON.stringify(u))).toThrow();
    expect(() => importBackup('{"hello":1}')).toThrow();
    expect(() => importBackup('nope')).toThrow();
  });
  it('a corrupt store never bricks the app; legacy keys are picked up', () => {
    const corrupt = { getItem: (k: string) => (k === STORAGE_KEY ? '{"schemaVersion":3,' : null) };
    expect(loadState(corrupt).state.schemaVersion).toBe(3);
    const legacy = { getItem: (k: string) => (k === 'smartDinnerApp_v2' ? JSON.stringify(fixture) : null) };
    const r = loadState(legacy);
    expect([r.migratedFrom, r.state.household.adults]).toEqual(['html-v2', 6]);
  });
});

describe('exports', () => {
  const g = generate(plan());
  it('ICS: one event + alarm per scheduled moment, at the family times, folded at 75 octets', () => {
    const si = { startDate: '2026-10-20', nights: [...DEFAULT_ORDER], times: DEFAULT_TIMES };
    const ev = scheduleEvents(si, g, buildSchedule(si, g), '17:00');
    const ics = buildIcs(ev, new Date('2026-10-18T05:00:00Z'));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(ev.length);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(ev.length);
    expect(ics).toContain('DTSTART:20261019T170000'); // shopping, day before night 1
    expect(ics).toContain('DTSTART:20261019T213000'); // tonight-tasks for night 1
    expect(ics).toContain('DTSTART:20261020T161500'); // «what's for dinner» answered, night 1
    const enc = new TextEncoder();
    for (const l of ics.split('\r\n')) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    const long = 'SUMMARY:' + 'إذابة صدور الدجاج '.repeat(10);
    expect(fold(long).replace(/\r\n /g, '')).toBe(long);
  });
  it('CSV: BOM, header, one row per line, formula injection neutralised', () => {
    const csv = shoppingCsv(g, [{ id: 'cabcde', name: '=HYPERLINK("x")', qty: '1', batch: 0, checked: false }], {});
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = csv.trim().split('\r\n');
    expect(rows).toHaveLength(1 + g.batches.reduce((s, b) => s + b.lines.length, 0) + 1);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('prep-ahead schedule (lunch ends 3:30, ask 4:15, dinner 8:00, tonight-tasks 9:30)', () => {
  const si = { startDate: '2026-10-20', nights: [...DEFAULT_ORDER], times: DEFAULT_TIMES };
  const g = generate(plan());
  const days = buildSchedule(si, g);
  const nightDay = (n: number) => days.get(g.nightDates[n - 1])!;
  const eveOf = (n: number) => days.get(g.nightDates[n - 2] ?? '2026-10-19')!;

  it('start cooking = dinner − total time', () => {
    expect(startCooking('chicken_tray', '20:00')).toBe('18:55'); // 65 min
    expect(startCooking('foul', '20:00')).toBe('19:45');
    expect(nightDay(1).tonight).toEqual({ night: 1, recipeId: 'shawarma', start: '19:30' });
  });
  it('every night has its evening session the day before, tied to that night', () => {
    for (let n = 1; n <= 15; n++) {
      const eve = n === 1 ? days.get('2026-10-19')! : nightDay(n - 1);
      expect(eve.tomorrow?.night).toBe(n);
      const rid = DEFAULT_ORDER[n - 1];
      const own = eve.evening.filter((t) => t.night === n && t.kind === 'prep');
      expect(own.length).toBe(RECIPE[rid].prep.filter((p) => p.when === 'evening').length);
    }
  });
  it('a frozen protein is moved to the fridge the evening before; bought-yesterday portions go straight to the fridge', () => {
    const kofta = DEFAULT_ORDER.indexOf('kofta') + 1; // night 3: minced beef from the trip on 19 Oct
    const thaw = eveOf(kofta).evening.filter((t) => t.kind === 'thaw');
    expect(thaw.length).toBeGreaterThan(0);
    const night1 = days.get('2026-10-19')!.evening.find((t) => t.kind === 'thaw' && t.night === 1);
    if (night1) expect(night1.text).toContain('مباشرة بعد الشراء');
  });
  it('shopping day: portion bags + kofta shaped and frozen + greens washed, with minutes', () => {
    const shop = days.get('2026-10-19')!;
    expect(shop.shopBatch).toBe(0);
    expect(shop.shop.some((t) => t.kind === 'portion')).toBe(true);
    expect(shop.shop.some((t) => t.text.includes('يُشكَّل كرات'))).toBe(true);
    expect(shop.shop.some((t) => t.kind === 'wash')).toBe(true);
    expect(minutesOf(shop.shop)).toBeGreaterThan(15);
  });
  it('rice is never scheduled to be pre-cooked; fish never marinated in lemon the night before', () => {
    const all = [...days.values()].flatMap((d) => d.evening);
    expect(all.some((t) => /يُطهى الأرز/.test(t.text))).toBe(false);
    const fish = all.filter((t) => t.night === DEFAULT_ORDER.indexOf('fish_lemon_garlic') + 1 && t.kind === 'prep');
    expect(fish.every((t) => !/يُتبَّل السمك/.test(t.text))).toBe(true);
  });
  it('task keys are unique and match the prepDone schema', () => {
    const keys = [...days.values()].flatMap((d) => [...d.shop, ...d.afternoon, ...d.evening].map((t) => t.key));
    expect(new Set(keys).size).toBe(keys.length);
    const s = defaultState(new Date('2026-10-18T08:00:00'));
    const withDone = { ...s, prepDone: Object.fromEntries(keys.slice(0, 5).map((k) => [k, true])) };
    expect(importBackup(exportBackup(withDone)).state.prepDone).toEqual(withDone.prepDone);
  });
  it('togglePrep flips one key and prunes ticks older than 30 days', () => {
    const p = togglePrep({ '2026-08-01:prep-1-0': true, '2026-10-17:prep-2-0': true }, '2026-10-18:prep-3-0', '2026-10-18');
    expect(p).toEqual({ '2026-10-17:prep-2-0': true, '2026-10-18:prep-3-0': true });
    expect(togglePrep(p, '2026-10-18:prep-3-0', '2026-10-18')).toEqual({ '2026-10-17:prep-2-0': true });
  });
  it('emergency: pull a later emergency meal forward, tonight\'s dish moves to tomorrow, length unchanged', () => {
    const nights = [...DEFAULT_ORDER]; // night 1 shawarma; tuna_chickpea is night 4
    const opts = emergencyOptions(nights, 0);
    expect(opts[0]).toEqual({ recipeId: 'tuna_chickpea', laterIndex: 3 });
    const out = applyEmergency(nights, 0, 'tuna_chickpea');
    expect(out.slice(0, 5)).toEqual(['tuna_chickpea', 'shawarma', 'lentil_soup', 'kofta', 'chicken_tray']);
    expect(out).toHaveLength(15);
  });
  it('emergency: a meal not in the plan is inserted (+1 night); none offered when tonight is already an emergency meal', () => {
    const out = applyEmergency(DEFAULT_ORDER, 0, 'foul');
    expect([out[0], out[1], out.length]).toEqual(['foul', 'shawarma', 16]);
    expect(emergencyOptions(DEFAULT_ORDER, DEFAULT_ORDER.indexOf('labneh_table'))).toEqual([]);
  });
  it('an older v3 backup without times/prepDone gets the family defaults', () => {
    const s = defaultState(new Date('2026-10-18T08:00:00')) as Record<string, unknown>;
    delete s.times; delete s.prepDone;
    const r = importBackup(JSON.stringify(s)).state;
    expect([r.times, r.prepDone]).toEqual([DEFAULT_TIMES, {}]);
  });
});

describe('store comparison never shows fallback totals as real', () => {
  it('without Nesto/HyperMax records: no common basket, own totals are zero', () => {
    const cmp = compareStores(plan());
    const by = Object.fromEntries(cmp.map((c) => [c.store, c]));
    expect([by.nesto.ownPriced, by.hypermax.ownPriced, by.nesto.ownTotal]).toEqual([0, 0, 0]);
    expect(by.lulu.ownPriced).toBeGreaterThan(20);
    expect([by.lulu.lastChecked, by.nesto.lastChecked]).toEqual(['2026-10-18', undefined]);
    expect(commonBasket(cmp)).toBeNull();
  });
  it('like-for-like basket: only items priced in both stores, same quantities', () => {
    const book = [
      rec({ ing: 'tomato', store: 'nesto', sold: { type: 'perKg' }, value: 0.6 }),
      rec({ ing: 'eggs', store: 'nesto', sold: { type: 'pack', size: 30, label: 'طبق' }, value: 1.9 }),
    ];
    const cmp = compareStores(plan({ priceBook: book }));
    const b = commonBasket(cmp)!;
    expect(b.stores).toEqual(['lulu', 'nesto']);
    expect(b.ings.sort()).toEqual(['eggs', 'tomato']);
    const lulu = cmp.find((c) => c.store === 'lulu')!;
    expect(b.totals.lulu).toBeCloseTo(lulu.ownCost.eggs + lulu.ownCost.tomato, 6);
    expect(b.totals.nesto).toBeLessThan(b.totals.lulu!); // 0.6 < 0.75 per kg and 1.9 < 2.13 per tray
  });
});

describe('recipe photos', () => {
  it('every recipe has an Arabic alt text; without a registered photo there is no URL (illustration is shown)', async () => {
    const { PHOTOS, photoUrl } = await import('./data');
    for (const r of RECIPES) expect(r.photoAlt.length).toBeGreaterThan(15);
    for (const r of RECIPES) if (!PHOTOS[r.id]) expect(photoUrl(r.id, 'card')).toBeNull();
  });
});
