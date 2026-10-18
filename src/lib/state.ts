import { z } from 'zod';
import { AllergenEnum, DEFAULT_ORDER, ING, RECIPE, Sold } from './data';
import { addDays, todayISO } from './format';
import { migrateAny } from './migrate';
import type { PriceRecord } from './prices';

export const STORAGE_KEY = 'sdg.state.v3';
export const LEGACY_KEYS = { reactV2: 'sdg.state.v2', htmlV2: 'smartDinnerApp_v2', v1: 'smartDinnerShoppingList_v1', v1Size: 'smartDinnerHouseholdSize_v1' } as const;
export const MAX_NIGHTS = 21;

/** The family's day: lunch ends, the «what's for dinner?» moment, dinner, and the evening kitchen session for tomorrow's lunch. */
export const DEFAULT_TIMES = { lunchEnd: '15:30', ask: '16:15', dinner: '20:00', prep: '21:30' };

/** Planning weights per age group (portion relative to an adult). Assumptions, not dietary guidance. */
export const AGE_WEIGHTS = { adults: 1, teens: 1.2, kids: 0.6 } as const;
export const APPETITES = [0.85, 1, 1.15] as const;

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)));
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const SafeText = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim());
const IdText = z.string().regex(/^[a-z0-9]{4,32}$/);

export const CustomItemSchema = z.object({
  id: z.string().regex(/^c[a-z0-9]{4,24}$/),
  name: SafeText(90).pipe(z.string().min(1)),
  qty: SafeText(60),
  batch: z.number().int().min(0).max(10),
  checked: z.boolean(),
});
export type CustomItem = z.infer<typeof CustomItemSchema>;

export const PriceRecordSchema = z.object({
  id: IdText,
  ing: z.string().regex(/^[a-z0-9_]{1,40}$/),
  store: z.enum(['lulu', 'nesto', 'hypermax', 'other']),
  product: SafeText(120),
  sold: Sold,
  value: z.number().min(0).max(200),
  type: z.enum(['verified', 'manual', 'promo', 'estimate']),
  checkedAt: ISO,
  validTo: ISO.optional(),
  url: z.string().max(500).regex(/^https:\/\/[^\s"'<>]+$/).optional(),
  region: SafeText(80).optional(),
});

export const StateSchema = z.object({
  schemaVersion: z.literal(3),
  household: z.object({
    adults: z.number().int().min(0).max(20),
    teens: z.number().int().min(0).max(20),
    kids: z.number().int().min(0).max(20),
  }).refine((h) => h.adults + h.teens + h.kids >= 1 && h.adults + h.teens + h.kids <= 20),
  appetite: z.union([z.literal(0.85), z.literal(1), z.literal(1.15)]),
  startDate: ISO,
  nights: z.array(z.string()).min(1).max(MAX_NIGHTS),
  optionalOff: z.array(z.string().regex(/^[a-z0-9_]+:[a-z0-9_]+$/)).max(200),
  shopTime: HHMM,
  times: z.object({ lunchEnd: HHMM, ask: HHMM, dinner: HHMM, prep: HHMM }).default(DEFAULT_TIMES),
  prepDone: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}:[a-z0-9_:-]{1,80}$/), z.boolean()).default({}),
  seenIntro: z.boolean().default(false),
  checked: z.record(z.string(), z.boolean()),
  have: z.record(z.string(), z.boolean()),
  stock: z.record(z.string(), z.number().min(0).max(100000)),
  priceBook: z.array(PriceRecordSchema).max(1000),
  storeMode: z.enum(['auto', 'cheapest', 'lulu', 'nesto', 'hypermax', 'other']),
  favorites: z.array(z.string()).max(50),
  avoidAllergens: z.array(AllergenEnum).max(14),
  avoidIngredients: z.array(z.string()).max(100),
  custom: z.array(CustomItemSchema).max(200),
});
export type AppState = z.infer<typeof StateSchema>;

export function members(s: Pick<AppState, 'household'>): number {
  return s.household.adults + s.household.teens + s.household.kids;
}

export function servings(s: Pick<AppState, 'household' | 'appetite'>): number {
  const h = s.household;
  return (h.adults * AGE_WEIGHTS.adults + h.teens * AGE_WEIGHTS.teens + h.kids * AGE_WEIGHTS.kids) * s.appetite;
}

export function defaultState(now = new Date()): AppState {
  return {
    schemaVersion: 3,
    household: { adults: 5, teens: 0, kids: 0 },
    appetite: 1,
    startDate: addDays(todayISO(now), 1),
    nights: [...DEFAULT_ORDER],
    optionalOff: [],
    shopTime: '17:00',
    times: { ...DEFAULT_TIMES },
    prepDone: {},
    seenIntro: false,
    checked: {},
    have: {},
    stock: {},
    priceBook: [],
    storeMode: 'auto',
    favorites: [],
    avoidAllergens: [],
    avoidIngredients: [],
    custom: [],
  };
}

/** Replace unknown recipes in place (keeping the night count), drop references to unknown ingredients. */
export function sanitize(s: AppState): AppState {
  const used = new Set(s.nights.filter((id) => RECIPE[id]));
  const spare = DEFAULT_ORDER.filter((id) => !used.has(id));
  let i = 0;
  const nights = s.nights.map((id) => (RECIPE[id] ? id : spare.shift() ?? DEFAULT_ORDER[i++ % DEFAULT_ORDER.length]));
  const keyOk = (k: string) => /^\d{1,2}:[a-z0-9_]{1,40}$/.test(k) && !!ING[k.split(':')[1]];
  const optOk = (k: string) => {
    const [r, ing] = k.split(':');
    return !!RECIPE[r]?.items.some((it) => it.i === ing && it.opt);
  };
  return {
    ...s,
    nights,
    optionalOff: [...new Set(s.optionalOff.filter(optOk))],
    checked: Object.fromEntries(Object.entries(s.checked).filter(([k, v]) => v && keyOk(k))),
    have: Object.fromEntries(Object.entries(s.have).filter(([k]) => !!ING[k])),
    stock: Object.fromEntries(Object.entries(s.stock).filter(([k, v]) => !!ING[k] && v > 0)),
    priceBook: s.priceBook.filter((p) => !!ING[p.ing] && soldFits(p.ing, p.sold)),
    favorites: [...new Set(s.favorites.filter((id) => RECIPE[id]))],
    avoidAllergens: [...new Set(s.avoidAllergens)],
    avoidIngredients: [...new Set(s.avoidIngredients.filter((id) => !!ING[id]))],
  };
}

/** A per-kg price only makes sense for weighed items or pieces with a known weight; per-piece only for counted items. */
export function soldFits(ingId: string, sold: z.infer<typeof Sold>): boolean {
  const ing = ING[ingId];
  if (!ing) return false;
  if (sold.type === 'perKg') return ing.unit === 'g' || (ing.unit === 'pcs' && !!ing.pieceG);
  if (sold.type === 'perPiece') return ing.unit === 'pcs';
  return ing.unit !== 'none';
}

export function parseState(data: unknown): AppState {
  return sanitize(StateSchema.parse(data));
}

export function newId(prefix = 'c'): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export type ImportSource = 'v3' | 'react-v2' | 'html-v2' | 'v1';
export type ImportResult = { state: AppState; from: ImportSource; notes: string[] };

export function importBackup(text: string, now = new Date()): ImportResult {
  if (text.length > 5_000_000) throw new Error('الملف أكبر من المتوقع لنسخة احتياطية.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('الملف ليس JSON صالحًا.'); }
  if (!data || typeof data !== 'object') throw new Error('هذا الملف ليس نسخة احتياطية من دليل العشاء.');
  const d = data as Record<string, unknown>;
  if (d.schemaVersion === 3) {
    const r = StateSchema.safeParse(data);
    if (!r.success) throw new Error('بنية النسخة الاحتياطية غير صحيحة أو تالفة.');
    return { state: sanitize(r.data), from: 'v3', notes: [] };
  }
  return migrateAny(d, now);
}

export function loadState(storage: Pick<Storage, 'getItem'> | null, now = new Date()): { state: AppState; migratedFrom?: ImportSource } {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const r = StateSchema.safeParse(JSON.parse(raw));
      if (r.success) return { state: sanitize(r.data) };
    }
    for (const key of [LEGACY_KEYS.reactV2, LEGACY_KEYS.htmlV2, LEGACY_KEYS.v1] as const) {
      const old = storage?.getItem(key);
      if (!old) continue;
      try {
        const res = migrateAny(JSON.parse(old), now, storage?.getItem(LEGACY_KEYS.v1Size) ?? null);
        return { state: res.state, migratedFrom: res.from };
      } catch { /* try the next one */ }
    }
  } catch { /* a corrupt store must never brick the app */ }
  return { state: defaultState(now) };
}

export function exportBackup(s: AppState): string {
  return JSON.stringify({ ...s, exportedAt: new Date().toISOString() }, null, 2);
}

export type { PriceRecord };
