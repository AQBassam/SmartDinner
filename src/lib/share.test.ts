import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER, RECIPE } from './data';
import { generate } from './engine';
import { buildShare, decodeShare, encodeShare, SHARE_PREFIX } from './share';
import { DEFAULT_TIMES } from './state';

const START = '2026-10-20';
const share = (nights: string[] = [...DEFAULT_ORDER]) => {
  const gen = generate({ servings: 5, members: 5, startDate: START, nights, optionalOff: [], have: {}, stock: {}, priceBook: [], storeMode: 'auto', today: '2026-10-18' });
  return buildShare({ startDate: START, nights, times: DEFAULT_TIMES, diets: [] }, gen, '17:00');
};

describe('share: the plan for Luban', () => {
  const s = share();
  it('one cycle: a day per night, dinner and tomorrow in order', () => {
    expect(s.n).toBe(15);
    expect(s.st).toBe(START);
    expect(s.d).toHaveLength(15);
    expect(s.d.map((d) => d.r?.[0])).toEqual(DEFAULT_ORDER.map((id) => RECIPE[id].title));
    expect(s.d[0].m?.[0]).toBe(RECIPE[DEFAULT_ORDER[1]].title);
    expect(s.d[14].m).toBeUndefined();
  });
  it('the day before the first dinner carries the shopping trip and night 1 prep, which the TV also uses at the end of each cycle', () => {
    expect(s.p.b).toBe(1);
    expect(s.p.m?.[0]).toBe(RECIPE[DEFAULT_ORDER[0]].title);
    expect(s.p.s?.length).toBeGreaterThan(0);
    expect(s.p.e?.length).toBeGreaterThan(0);
  });
  it('shopping trips fall every five nights, the first on the p day', () => {
    expect(s.d.map((d, k) => (d.b ? k : -1)).filter((k) => k >= 0)).toEqual([4, 9]);
  });
  it('weekday names are left to the TV: `{n}` placeholders, never a weekday', () => {
    const text = JSON.stringify([s.p, s.d]);
    expect(text).toMatch(/\{\d+\}/);
    expect(text).not.toMatch(/الأحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت/);
  });
  it('round-trips through the code and stays small', async () => {
    const code = await encodeShare(s);
    expect(code.startsWith(SHARE_PREFIX)).toBe(true);
    expect(code).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(await decodeShare(code)).toEqual(s);
    expect(code.length).toBeLessThan(8000);
    console.log('code length', code.length, 'json', JSON.stringify(s).length);
  });
  it('refuses a code that is not Luban\'s', async () => {
    await expect(decodeShare('hello')).rejects.toThrow();
  });
  it('a 21-night plan still produces one cycle', () => {
    const n21 = share([...DEFAULT_ORDER, 'foul', 'chicken_saloona', 'oven_tortilla', ...DEFAULT_ORDER.slice(0, 3)]);
    expect(n21.n).toBe(21);
    expect(n21.d).toHaveLength(21);
  });
});
