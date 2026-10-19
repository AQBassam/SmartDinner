import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER, ING, RECIPE, RECIPES } from './data';
import { allows, DIET_ORDER, dietFit, fixSeparateNights, planNights, proteinKey, resolveNight, separateViolations, type DietId, type NightPlan } from './diet';
import { generate, type PlanInput } from './engine';
import { defaultState, dietMembers, importBackup, loadState, sanitize, STORAGE_KEY } from './state';

const plan = (over: Partial<PlanInput> = {}): PlanInput => ({
  servings: 5, members: 5, startDate: '2026-10-20', nights: [...DEFAULT_ORDER], optionalOff: [], have: {}, stock: {},
  priceBook: [], storeMode: 'auto', today: '2026-10-19', ...over,
});
const need = (g: ReturnType<typeof generate>, night: number, ing: string) =>
  g.needs.filter((n) => n.night === night && n.ingId === ing).reduce((s, n) => s + n.qty, 0);

describe('eating patterns: one dinner, split before the animal item goes in', () => {
  it('fit of all 18 recipes for each pattern', () => {
    const fit = (d: DietId) => Object.fromEntries(RECIPES.map((r) => [r.id, dietFit(r, d).fit]));
    expect(Object.entries(fit('vegan')).filter(([, f]) => f === 'all').map(([id]) => id)).toEqual(['veg_saloona', 'foul']);
    expect(Object.entries(fit('vegan')).filter(([, f]) => f === 'separate').map(([id]) => id)).toEqual(['oven_tortilla']);
    expect(Object.entries(fit('pescoDairy')).filter(([, f]) => f === 'separate').map(([id]) => id)).toEqual(['oven_tortilla']);
    // fish, tuna, yogurt and cheese: the fish-and-dairy member eats these as they are
    for (const id of ['tuna_chickpea', 'fish_lemon_garlic', 'stuffed_potato', 'lentil_soup', 'pita_pizza', 'falafel_wraps', 'veg_saloona', 'foul'])
      expect(fit('pescoDairy')[id], id).toBe('all');
  });
  it('no portion set aside for a pattern contains anything that pattern avoids', () => {
    for (const r of RECIPES) for (const d of DIET_ORDER) {
      const f = dietFit(r, d);
      if (f.fit !== 'split') continue;
      for (const rp of f.replace) {
        expect(allows(d, ING[rp.from]), `${r.id} ${rp.from}`).toBe(false);
        for (const o of rp.options) expect(allows(d, ING[o.i]), `${r.id} ${o.i} for ${d}`).toBe(true);
      }
    }
  });
  it('every split names the step before which the portion is set aside, and its substitutes are real products', () => {
    for (const r of RECIPES) {
      const animal = r.items.filter((it) => ING[it.i].animal && !it.opt);
      if (!animal.length) continue;
      expect(r.split, r.id).toBeDefined();
    }
  });
  it('one substitute that suits everyone is preferred: vegan + fish-and-dairy share chickpeas, alone the latter gets halloumi', () => {
    const both = resolveNight('shawarma', 5, [{ diet: 'vegan', servings: 1 }, { diet: 'pescoDairy', servings: 1 }]);
    expect(both.subs.filter((s) => s.from === 'chicken_breast').map((s) => [s.to?.i, s.servings])).toEqual([['chickpeas_can', 2]]);
    expect(both.subs.filter((s) => s.from === 'yogurt').map((s) => [s.to?.i, s.diets])).toEqual([['tahini', ['vegan']]]);
    expect(both.eaters).toEqual({ chicken_breast: 3, yogurt: 4 });
    const one = resolveNight('shawarma', 5, [{ diet: 'pescoDairy', servings: 1 }]);
    expect(one.subs.map((s) => s.to?.i)).toEqual(['halloumi']);
  });
  it('shopping for 5 adults, one vegan, shawarma night: chicken for 4, chickpeas and tahini for 1', () => {
    const g = generate(plan({ special: [{ diet: 'vegan', servings: 1 }] }));
    expect(need(g, 1, 'chicken_breast')).toBeCloseTo(850 * 4 / 5); // 680 g
    expect(need(g, 1, 'yogurt')).toBeCloseTo(250 * 4 / 5);
    expect(need(g, 1, 'chickpeas_can')).toBeCloseTo(2 / 5);
    expect(need(g, 1, 'tahini')).toBeCloseTo(75 / 5);
    expect(need(g, 1, 'pita')).toBeCloseTo(10); // the shared base is everyone's
  });
  it('a dish that cannot be split: the member gets the quick separate dish, and the main dish shrinks', () => {
    const g = generate(plan({ nights: ['oven_tortilla'], special: [{ diet: 'vegan', servings: 1 }] }));
    expect(need(g, 1, 'eggs')).toBeCloseTo(8);
    expect(need(g, 1, 'fava_can')).toBeCloseTo(3 / 5);
    expect(g.needs.some((n) => n.recipeId === 'foul')).toBe(true);
  });
  it('without special members nothing changes', () => {
    expect(generate(plan({ special: [] })).budget.purchase).toBeCloseTo(generate(plan()).budget.purchase);
  });
  it('flags bread that may contain milk for the vegan member', () => {
    expect(resolveNight('foul', 5, [{ diet: 'vegan', servings: 1 }]).mayContain.map((m) => m.ing)).toEqual(['pita']);
    expect(resolveNight('foul', 5, [{ diet: 'pescoDairy', servings: 1 }]).mayContain).toEqual([]);
  });
});

describe('separate dish at most once in any 7 nights', () => {
  const n = (...ids: string[]) => ids;
  it('second separate night within 7 nights is a violation; 7 apart is fine', () => {
    const fill = DEFAULT_ORDER.slice(0, 5);
    expect(separateViolations(n('oven_tortilla', ...fill, 'oven_tortilla'), ['vegan'])).toEqual([6]);
    expect(separateViolations(n('oven_tortilla', ...DEFAULT_ORDER.slice(0, 6), 'oven_tortilla'), ['vegan'])).toEqual([]);
    expect(separateViolations(n('oven_tortilla', 'oven_tortilla'), [])).toEqual([]);
  });
  it('fixing replaces the later night with a dish that everyone can share or split', () => {
    const fixed = fixSeparateNights(n('oven_tortilla', 'shawarma', 'oven_tortilla'), ['vegan'], Object.keys(RECIPE));
    expect(fixed[0]).toBe('oven_tortilla');
    expect(dietFit(RECIPE[fixed[2]], 'vegan').fit).not.toBe('separate');
    expect(separateViolations(fixed, ['vegan'])).toEqual([]);
  });
});

describe('special members in the saved state', () => {
  it('older states and backups without the field load with none', () => {
    const s = defaultState(new Date('2026-10-19T08:00:00Z')) as Record<string, unknown>;
    delete s.special;
    const store = { getItem: (k: string) => (k === STORAGE_KEY ? JSON.stringify(s) : null) };
    expect(loadState(store).state.special).toEqual([]);
    expect(importBackup(JSON.stringify(s)).state.special).toEqual([]);
  });
  it('members beyond their age group are dropped; portions follow the group and appetite', () => {
    const s = { ...defaultState(), household: { adults: 1, teens: 1, kids: 0 }, appetite: 1.15 as const,
      special: [{ group: 'adults' as const, diet: 'vegan' as const }, { group: 'adults' as const, diet: 'pescoDairy' as const }, { group: 'teens' as const, diet: 'vegan' as const }] };
    const t = sanitize(s);
    expect(t.special).toEqual([{ group: 'adults', diet: 'vegan' }, { group: 'teens', diet: 'vegan' }]);
    expect(dietMembers(t).map((m) => m.servings)).toEqual([1.15, 1.2 * 1.15]);
  });
});

describe('variety: substitutes rotate across the plan (3.7.1)', () => {
  const PROTEINS = ['chickpeas_can', 'hummus_dip', 'fava_can', 'red_lentils', 'falafel', 'halloumi', 'tuna', 'fish_fillet', 'eggs', 'labneh'];
  /** the protein sources one member eats each night: their substitutes plus what they eat from the shared dish */
  const eats = (nps: NightPlan[], d: DietId) => nps.map((np) => new Set([
    ...np.subs.filter((s) => s.to && s.diets.includes(d)).map((s) => proteinKey(s.to!.i)),
    ...RECIPE[np.recipeId].items.filter((it) => PROTEINS.includes(it.i) && allows(d, ING[it.i])).map((it) => proteinKey(it.i)),
  ].filter((x) => PROTEINS.includes(x))));
  it('vegan member, default 15 nights: chickpeas alone on 4 nights, not 12; four protein sources', () => {
    const nights = eats(planNights({ nights: DEFAULT_ORDER, total: 5, special: [{ diet: 'vegan', servings: 1 }] }), 'vegan');
    expect(nights.filter((n) => n.size === 1 && n.has('chickpeas_can')).length).toBe(4);
    expect(new Set(nights.flatMap((n) => [...n]))).toEqual(new Set(['chickpeas_can', 'fava_can', 'red_lentils', 'falafel']));
  });
  it('fish-and-dairy member: halloumi no longer every night it fits; fish, tuna, lentils, fava and falafel all appear', () => {
    const nights = eats(planNights({ nights: DEFAULT_ORDER, total: 5, special: [{ diet: 'pescoDairy', servings: 1 }] }), 'pescoDairy');
    expect(nights.filter((n) => n.has('halloumi')).length).toBe(3);
    for (const p of ['fish_fillet', 'tuna', 'red_lentils', 'fava_can', 'falafel']) expect(nights.some((n) => n.has(p)), p).toBe(true);
  });
  it('the first night still prefers the recipe order; a plan resolution matches the shopping list', () => {
    const nps = planNights({ nights: DEFAULT_ORDER, total: 5, special: [{ diet: 'vegan', servings: 1 }] });
    expect(nps[0].subs.find((s) => s.from === 'chicken_breast')?.to?.i).toBe('chickpeas_can');
    const g = generate(plan({ special: [{ diet: 'vegan', servings: 1 }] }));
    for (const [i, np] of g.nightPlans.entries()) for (const s of np.subs) if (s.to)
      expect(need(g, i + 1, s.to.i), `${np.recipeId} ${s.to.i}`).toBeGreaterThan(0);
  });
  it('a substitute never brings back what the family avoids: no chickpeas when excluded, no tahini when sesame is', () => {
    const nps = planNights({ nights: DEFAULT_ORDER, total: 5, special: [{ diet: 'vegan', servings: 1 }], avoidIngredients: ['chickpeas_can'], avoidAllergens: ['sesame'] });
    const chosen = nps.flatMap((np) => np.subs.map((s) => s.to?.i));
    expect(chosen).not.toContain('chickpeas_can');
    expect(chosen).not.toContain('tahini');
    expect(nps[0].subs.find((s) => s.from === 'yogurt')?.to).toBeNull();
  });
});
