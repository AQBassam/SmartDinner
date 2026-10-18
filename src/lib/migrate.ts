import { z } from 'zod';
import { ING, RECIPE, type SoldT } from './data';
import { todayISO } from './format';
import {
  CustomItemSchema, PriceRecordSchema, StateSchema, defaultState, newId, sanitize, soldFits,
  type AppState, type CustomItem, type ImportResult, type PriceRecord,
} from './state';

// ---------------------------------------------------------------- id maps
/** Smart_Shopping_List_v2.html recipe ids → current ids */
export const HTML_V2_RECIPES: Record<string, string> = {
  R01: 'shawarma', R02: 'tuna_chickpea', R03: 'shakshuka', R04: 'quesadilla', R05: 'lentil_soup',
  R06: 'chicken_rice', R07: 'pita_pizza', R08: 'kofta', R09: 'labneh_table', R10: 'chicken_tray',
  R11: 'pasta_beef', R12: 'fish_lemon_garlic', R13: 'veg_saloona', R14: 'stuffed_potato', R15: 'falafel_wraps',
};

/** Smart_Shopping_List_v2.html ingredient ids → current ids, with a factor from their unit to ours */
export const HTML_V2_INGREDIENTS: Record<string, { id: string; factor?: number }> = {
  chicken_boneless: { id: 'chicken_breast' }, chicken_bonein: { id: 'chicken_thighs' }, ground_beef: { id: 'minced_beef' },
  fish_fillet: { id: 'fish_fillet' }, tuna_can: { id: 'tuna' }, egg: { id: 'eggs' }, red_lentil: { id: 'red_lentils' },
  chickpeas_can: { id: 'chickpeas_can' }, hummus_dip: { id: 'hummus_dip' }, yogurt: { id: 'yogurt' }, labneh: { id: 'labneh' },
  shredded_cheese: { id: 'cheese_grated' }, mozzarella: { id: 'mozzarella' }, pasta_cheese: { id: 'cheese_grated' },
  arabic_bread: { id: 'pita' }, tortilla: { id: 'tortilla' }, rice: { id: 'rice' }, pasta: { id: 'pasta' }, potato: { id: 'potato' },
  tomato: { id: 'tomato' }, cucumber: { id: 'cucumber' }, lettuce: { id: 'lettuce' }, pepper: { id: 'bell_pepper' },
  onion: { id: 'onion' }, garlic: { id: 'garlic' }, lemon: { id: 'lemon' }, carrot: { id: 'carrot' }, parsley: { id: 'parsley' },
  cabbage: { id: 'cabbage' }, mushroom: { id: 'mushroom' }, peas: { id: 'frozen_peas' }, sweetcorn_can: { id: 'corn_can' },
  pizza_sauce: { id: 'pizza_sauce' }, tomato_sauce_kofta: { id: 'passata_can', factor: 1 / 400 }, pasta_sauce: { id: 'pasta_sauce' },
  olives: { id: 'olives' }, olive_oil: { id: 'olive_oil' }, cornmeal_tahini: { id: 'tahini' }, falafel: { id: 'falafel' },
  cumin: { id: 'cumin' }, paprika: { id: 'paprika' }, coriander: { id: 'coriander_ground' }, black_pepper: { id: 'black_pepper' },
  salt: { id: 'salt' }, rice_spice: { id: 'rice_spice' }, zaatar: { id: 'zaatar' }, oregano: { id: 'oregano' }, turmeric: { id: 'turmeric' },
};

/** Recipe ids used by the React build of this morning that changed or were dropped */
const REACT_V2_RECIPES: Record<string, string> = { fish_lemon_rice: 'fish_lemon_garlic', pasta_bolognese: 'pasta_beef', saloona: 'chicken_saloona' };

const BATCH_FROM_LABEL = (b: unknown) => (b === 'second' ? 1 : 0);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const isoOr = (v: unknown, fallback: string) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : fallback);
const isoOrUndef = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NaN);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function custom(name: string, qty: string, batch: number, checked = false): CustomItem | null {
  const r = CustomItemSchema.safeParse({ id: newId(), name, qty, batch, checked });
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------- v1 (single HTML, this morning's attachment)
const V1_DEFAULT_NAMES = new Set([
  'دجاج منزوع العظم', 'قطع دجاج بالعظم', 'لحم مفروم قليل الدهن', 'تونة', 'بيض', 'عدس أحمر جاف', 'زبادي طبيعي غير محلى', 'لبنة',
  'جبن مبشور', 'حمص مهروس جاهز', 'خبز عربي', 'تورتيلا متوسطة', 'أرز جاف', 'صلصة بيتزا', 'طماطم مطحونة أو صلصة سادة للكفتة',
  'ذرة حلوة', 'بازلاء مجمدة', 'طماطم', 'خيار', 'فلفل حلو', 'جزر', 'بصل', 'بطاطس', 'خس', 'ملفوف', 'فطر', 'بقدونس', 'ثوم', 'ليمون',
  'زيت زيتون', 'زيتون', 'كمون', 'بابريكا', 'فلفل أسود', 'كزبرة مطحونة', 'بهارات دجاج وأرز', 'زعتر', 'ملح', 'فواكه موسمية',
  'لبن للشرب أو حليب',
]);

export function migrateV1(data: unknown, now = new Date(), sizeRaw: string | null = null): AppState {
  const d = rec(data);
  const base = defaultState(now);
  const size = Math.round(num(sizeRaw));
  const items = arr(d.items).slice(0, 500);
  const customs = items
    .map((x) => rec(x))
    .filter((x) => { const n = str(x.name, 90); return n && !V1_DEFAULT_NAMES.has(n); })
    .map((x) => custom(str(x.name, 90), str(x.qty, 60), BATCH_FROM_LABEL(x.batch), x.checked === true))
    .filter((x): x is CustomItem => !!x);
  return sanitize({
    ...base,
    startDate: isoOr(d.startDate, base.startDate),
    household: size >= 1 && size <= 20 ? { adults: size, teens: 0, kids: 0 } : base.household,
    custom: customs.slice(0, 200),
  });
}

// ---------------------------------------------------------------- Smart_Shopping_List_v2.html
const UNIT_FACTOR: Record<string, number> = { kg: 1000, g: 1, l: 1000, ml: 1 };

function htmlV2Price(p: Record<string, unknown>, today: string): PriceRecord | null {
  const map = HTML_V2_INGREDIENTS[str(p.ingredientId, 60)];
  if (!map) return null;
  const ing = ING[map.id];
  const qty = num(p.packageQuantity);
  const value = num(p.priceOMR);
  if (!ing || !(qty > 0) || !(value >= 0)) return null;
  const unit = str(p.packageUnit, 20);
  let size = qty * (UNIT_FACTOR[unit] ?? 1);
  if (map.factor && (unit === 'g' || unit === 'kg' || unit === '')) size *= map.factor;
  const sold: SoldT = { type: 'pack', size, label: `${str(p.productName, 60) || 'عبوة'} (${qty} ${unit})` };
  if (!soldFits(map.id, sold)) return null;
  const types: Record<string, PriceRecord['type']> = { verified_online: 'verified', manual: 'manual', estimate: 'estimate' };
  const stores: Record<string, PriceRecord['store']> = { lulu: 'lulu', nesto: 'nesto', hypermax: 'hypermax' };
  const url = str(p.sourceUrl, 500);
  const r = PriceRecordSchema.safeParse({
    id: newId('p'), ing: map.id, store: stores[str(p.storeId, 20)] ?? 'other', product: str(p.productName, 120) || ing.name,
    sold, value, type: types[str(p.priceType, 20)] ?? 'manual', checkedAt: isoOr(p.checkedAt, today),
    validTo: isoOrUndef(p.validTo),
    url: /^https:\/\//.test(url) ? url : undefined, region: str(p.region, 80) || undefined,
  });
  return r.success ? r.data : null;
}

export function migrateHtmlV2(data: unknown, now = new Date()): { state: AppState; notes: string[] } {
  const d = rec(data);
  const s = rec(d.settings);
  const base = defaultState(now);
  const today = todayISO(now);
  const notes: string[] = [];

  const plan = arr(d.plan).map((p) => HTML_V2_RECIPES[str(rec(p).recipeId, 10)]).filter(Boolean).slice(0, 21);
  const size = Math.round(num(s.householdSize));
  const appetite = num(s.appetiteFactor);

  const stock: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec(d.inventory))) {
    const map = HTML_V2_INGREDIENTS[k];
    const q = num(rec(v).qty);
    if (map && q > 0) stock[map.id] = (stock[map.id] ?? 0) + q * (map.factor ?? 1);
  }

  const customs: CustomItem[] = [];
  for (const m of arr(d.manualItems).slice(0, 200)) {
    const x = rec(m);
    const name = str(x.name, 90) || (HTML_V2_INGREDIENTS[str(x.ingredientId, 60)] ? ING[HTML_V2_INGREDIENTS[str(x.ingredientId, 60)].id].name : '');
    const q = num(x.qty);
    const c = custom(name, Number.isFinite(q) ? `${q} ${str(x.unit, 20)}`.trim() : '', BATCH_FROM_LABEL(x.batch));
    if (c) customs.push(c);
  }
  for (const l of arr(d.legacyItems).slice(0, 200)) {
    const x = rec(l);
    const c = custom(str(x.name, 90), str(x.qtyText, 60), BATCH_FROM_LABEL(x.batch), x.checked === true);
    if (c) customs.push(c);
  }

  const priceBook = arr(d.prices).slice(0, 1000).map((p) => htmlV2Price(rec(p), today)).filter((p): p is PriceRecord => !!p);
  const droppedPrices = arr(d.prices).length - priceBook.length;
  if (droppedPrices > 0) notes.push(`تعذر تحويل ${droppedPrices} من الأسعار المسجلة (وحدة عبوة غير متوافقة أو مكوّن غير معروف).`);

  const optionalOff: string[] = [];
  for (const [k, v] of Object.entries(rec(d.optionalSelections))) {
    if (v !== false) continue;
    const [r, i] = k.split(':');
    const rid = HTML_V2_RECIPES[r];
    const iid = HTML_V2_INGREDIENTS[i]?.id;
    if (rid && iid) optionalOff.push(`${rid}:${iid}`);
  }
  if (Object.keys(rec(d.purchased)).length) notes.push('كميات «اشتريته» السابقة لم تُنقل؛ قائمة التسوق تبدأ دون علامات.');

  const state: AppState = {
    ...base,
    household: size >= 1 && size <= 20 ? { adults: size, teens: 0, kids: 0 } : base.household,
    appetite: appetite === 0.85 || appetite === 1.15 ? appetite : 1,
    startDate: isoOr(s.startDate, base.startDate),
    nights: plan.length ? plan : base.nights,
    optionalOff,
    stock,
    priceBook,
    favorites: arr(d.favorites).map((f) => HTML_V2_RECIPES[str(f, 10)]).filter(Boolean),
    avoidIngredients: arr(s.excludedIngredients).map((f) => HTML_V2_INGREDIENTS[str(f, 60)]?.id).filter((x): x is string => !!x),
    custom: customs.slice(0, 200),
  };
  return { state: sanitize(StateSchema.parse(state)), notes };
}

// ---------------------------------------------------------------- React build of this morning (sdg.state.v2)
const ReactV2 = z.object({
  schemaVersion: z.literal(2),
  people: z.number().int().min(1).max(20),
  startDate: z.string(),
  nights: z.array(z.string()).max(21),
  includeOptional: z.boolean().optional(),
  shopTime: z.string().optional(),
  thawTime: z.string().optional(),
  checked: z.record(z.string(), z.boolean()).optional(),
  have: z.record(z.string(), z.boolean()).optional(),
  prices: z.record(z.string(), z.object({ value: z.number(), date: z.string() })).optional(),
  custom: z.array(z.unknown()).optional(),
}).passthrough();

export function migrateReactV2(data: unknown, now = new Date()): AppState {
  const d = ReactV2.parse(data);
  const base = defaultState(now);
  const nights = d.nights.map((id) => REACT_V2_RECIPES[id] ?? id);
  const priceBook: PriceRecord[] = [];
  for (const [ingId, p] of Object.entries(d.prices ?? {})) {
    const ing = ING[ingId];
    if (!ing?.sold || !(p.value >= 0)) continue;
    const r = PriceRecordSchema.safeParse({ id: newId('p'), ing: ingId, store: 'other', product: ing.name, sold: ing.sold, value: p.value, type: 'manual', checkedAt: isoOr(p.date, todayISO(now)) });
    if (r.success) priceBook.push(r.data);
  }
  const optionalOff = d.includeOptional === false
    ? Object.values(RECIPE).flatMap((r) => r.items.filter((it) => it.opt).map((it) => `${r.id}:${it.i}`))
    : [];
  const customs = arr(d.custom).map((c) => CustomItemSchema.safeParse(c)).filter((r) => r.success).map((r) => r.data!);
  const hhmm = (v: unknown, f: string) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : f);
  return sanitize(StateSchema.parse({
    ...base,
    household: { adults: d.people, teens: 0, kids: 0 },
    startDate: isoOr(d.startDate, base.startDate),
    nights: nights.length ? nights : base.nights,
    optionalOff,
    shopTime: hhmm(d.shopTime, base.shopTime),
    checked: Object.fromEntries(Object.entries(d.checked ?? {}).filter(([k, v]) => v === true && /^\d{1,2}:[a-z0-9_]{1,40}$/.test(k))),
    have: Object.fromEntries(Object.entries(d.have ?? {}).filter(([k, v]) => typeof v === 'boolean' && /^[a-z0-9_]{1,40}$/.test(k))),
    priceBook,
    custom: customs,
  }));
}

// ---------------------------------------------------------------- dispatcher
export function migrateAny(data: unknown, now = new Date(), v1Size: string | null = null): ImportResult {
  const d = rec(data);
  try {
    if (d.schemaVersion === 2 && Array.isArray(d.plan) && d.settings) {
      const { state, notes } = migrateHtmlV2(d, now);
      return { state, from: 'html-v2', notes };
    }
    if (d.schemaVersion === 2 && Array.isArray(d.nights)) return { state: migrateReactV2(d, now), from: 'react-v2', notes: [] };
    if (Array.isArray(d.items)) return { state: migrateV1(d, now, v1Size), from: 'v1', notes: [] };
  } catch {
    throw new Error('تعذر قراءة النسخة القديمة: بنيتها تالفة.');
  }
  throw new Error('هذا الملف ليس نسخة احتياطية من دليل العشاء.');
}
