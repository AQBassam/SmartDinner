import { BASE_SERVINGS, CATEGORY_ORDER, ING, RECIPE, type Category, type Ingredient, type StoreId } from './data';
import { planNights, SEPARATE_DISH, type DietMember, type NightPlan } from './diet';
import { addDays, arCount } from './format';
import { resolvePrice, unitCost, type PriceRecord, type PriceSource, type ResolvedPrice, type StoreMode } from './prices';

export const BATCH_SPAN = 5; // one shopping trip covers up to 5 nights of fresh produce
const EPS = 1e-9;
const FROZEN_LEFTOVER_DAYS = 60;

export type { PriceSource } from './prices';
export type Storage = 'pantry' | 'fridge' | 'freezer' | 'freeze' | 'tight';

export interface PlanInput {
  /** effective servings: Σ(age-group weights) × appetite factor */
  servings: number;
  /** people at the table, for per-person figures */
  members: number;
  /** members on a restricted eating pattern (their servings are part of `servings`) */
  special?: DietMember[];
  /** what the family avoids: a substitute never brings it back */
  avoidAllergens?: string[];
  avoidIngredients?: string[];
  startDate: string; // date of night 1
  nights: string[]; // recipe ids, index 0 = night 1
  /** `${recipeId}:${ingId}` of optional items the family switched off */
  optionalOff: string[];
  have: Record<string, boolean>;
  /** quantity already at home, in the ingredient's unit */
  stock: Record<string, number>;
  priceBook: PriceRecord[];
  storeMode: StoreMode;
  today: string;
}

export interface Need {
  night: number;
  recipeId: string;
  ingId: string;
  qty: number;
  batch: number;
  storage: Storage;
}

export interface PurchaseLine {
  key: string; // `${batch}:${ingId}`
  batch: number;
  ing: Ingredient;
  cat: Category;
  need: number; // quantity the recipes served by this trip consume
  fromStock: number; // part of `need` covered by what is already at home
  buy: number; // quantity actually bought (packs rounded)
  packs: number | null;
  cost: number; // 0 when the household already has it
  price: ResolvedPrice;
  unitPrice: number | null;
  priceSource: PriceSource;
  have: boolean;
  portions: { night: number; qty: number; storage: Storage }[];
  leftover: number;
  frozenProduct: boolean;
  freezeNights: number[];
  tightNights: number[];
}

export interface Batch {
  index: number;
  date: string;
  firstNight: number;
  lastNight: number;
  lines: PurchaseLine[];
  total: number;
}

export interface StapleUse {
  ing: Ingredient;
  nights: number[];
  qty: number | null;
  have: boolean;
}

export interface Reminder {
  id: string;
  kind: 'shop' | 'thaw';
  date: string;
  title: string;
  body: string;
  night?: number;
  batch?: number;
}

export interface Budget {
  purchase: number;
  consumption: number;
  perDinner: number;
  perPersonDinner: number;
  byCategory: Record<Category, number>;
  bySource: Record<PriceSource, number>;
  unpriced: string[];
  stale: string[];
}

export interface Generated {
  needs: Need[];
  batches: Batch[];
  staples: StapleUse[];
  reminders: Reminder[];
  budget: Budget;
  nightDates: string[];
  /** per night: who shares the dish, the set-aside portion and its substitutes, or a separate dish */
  nightPlans: NightPlan[];
}

// ---------------------------------------------------------------------------

export function scaleFactor(ing: Ingredient, servings: number): number {
  const linear = servings / BASE_SERVINGS;
  if (ing.scale === 'fixed') return 1;
  if (ing.scale === 'partial') return 0.5 + 0.5 * linear;
  return linear;
}

export function scaledQty(ing: Ingredient, q5: number, servings: number): number {
  return q5 * scaleFactor(ing, servings);
}

export function batchDate(startDate: string, batch: number): string {
  return addDays(startDate, BATCH_SPAN * batch - 1);
}

export function nightDate(startDate: string, night: number): string {
  return addDays(startDate, night - 1);
}

export function isHave(ing: Ingredient, have: Record<string, boolean>): boolean {
  return have[ing.id] ?? !!ing.staple;
}

/** Day index: night n happens on day n; trip k happens on day 5k (the day before night 5k+1). */
function assignBatch(ing: Ingredient, night: number): { batch: number; storage: Storage } {
  const maxK = Math.floor((night - 1) / BATCH_SPAN);
  if (ing.cat === 'staples') return { batch: 0, storage: 'pantry' };
  if (ing.frozen) return { batch: 0, storage: 'freezer' };
  if (ing.bulk) return { batch: 0, storage: night <= ing.keepDays ? 'fridge' : 'freeze' };
  for (let k = 0; k <= maxK; k++) {
    if (night - BATCH_SPAN * k <= ing.keepDays) {
      return { batch: k, storage: ing.cat === 'pantry' ? 'pantry' : 'fridge' };
    }
  }
  return { batch: maxK, storage: ing.freezable ? 'freeze' : 'tight' };
}

export function nightPlansOf(plan: Pick<PlanInput, 'nights' | 'optionalOff' | 'servings' | 'special' | 'avoidAllergens' | 'avoidIngredients'>): NightPlan[] {
  return planNights({ nights: plan.nights, total: plan.servings, special: plan.special ?? [], optionalOff: plan.optionalOff,
    avoidAllergens: plan.avoidAllergens, avoidIngredients: plan.avoidIngredients });
}

export function collectNeeds(plan: Pick<PlanInput, 'nights' | 'optionalOff' | 'servings' | 'special' | 'avoidAllergens' | 'avoidIngredients'>, nightPlans = nightPlansOf(plan)): Need[] {
  const off = new Set(plan.optionalOff);
  const needs: Need[] = [];
  const push = (night: number, recipeId: string, ingId: string, q: number | undefined, sv: number, linear = false) => {
    const ing = ING[ingId];
    if (!ing || ing.nobuy || sv <= EPS) return;
    const qty = q === undefined ? 0 : linear ? q * sv / BASE_SERVINGS : scaledQty(ing, q, sv);
    const { batch, storage } = assignBatch(ing, night);
    needs.push({ night, recipeId, ingId: ing.id, qty, batch, storage });
  };
  plan.nights.forEach((rid, idx) => {
    const recipe = RECIPE[rid];
    if (!recipe) return;
    const night = idx + 1;
    const np = nightPlans[idx];
    for (const it of recipe.items) {
      if (it.opt && off.has(`${rid}:${it.i}`)) continue;
      push(night, rid, it.i, it.q, np.eaters[it.i] ?? np.base);
    }
    // a substitute portion is cooked for exactly these people, so it scales linearly
    for (const sub of np.subs) if (sub.to) push(night, rid, sub.to.i, sub.to.q, sub.servings, true);
    if (np.separate) for (const it of RECIPE[SEPARATE_DISH].items) push(night, SEPARATE_DISH, it.i, it.q, np.separate.servings);
  });
  return needs;
}

interface Lot { qty: number; expires: number; line: PurchaseLine | null }

export function generate(plan: PlanInput): Generated {
  const nightsCount = plan.nights.length;
  const nightDates = plan.nights.map((_, i) => nightDate(plan.startDate, i + 1));
  const nightPlans = nightPlansOf(plan);
  const needs = collectNeeds(plan, nightPlans);
  const batchCount = Math.max(1, Math.ceil(nightsCount / BATCH_SPAN));

  const byIng = new Map<string, Need[]>();
  for (const n of needs) {
    const list = byIng.get(n.ingId) ?? [];
    list.push(n);
    byIng.set(n.ingId, list);
  }

  const lines = new Map<string, PurchaseLine>();
  const staples: StapleUse[] = [];
  let consumption = 0;
  const unpriced: string[] = [];
  const stale: string[] = [];

  for (const [ingId, list] of byIng) {
    const ing = ING[ingId];
    const have = isHave(ing, plan.have);
    const price = resolvePrice(ing, plan.priceBook, plan.storeMode, plan.today);
    const sold = price.sold;
    list.sort((a, b) => a.night - b.night);

    if (ing.cat === 'staples') {
      const total = list.reduce((s, n) => s + n.qty, 0);
      staples.push({ ing, nights: [...new Set(list.map((n) => n.night))], qty: ing.unit === 'none' ? null : total, have });
      if (have) continue; // a staple the household lacks becomes a normal batch-0 purchase line
    }

    const stockQty = Math.max(0, plan.stock[ingId] ?? 0);
    const lots: Lot[] = stockQty > EPS ? [{ qty: stockQty, expires: Infinity, line: null }] : [];
    let consumedFromShop = 0;

    for (const need of list) {
      let remaining = need.qty;
      let fromStock = 0;
      for (const lot of lots) {
        if (remaining <= EPS) break;
        if (lot.qty <= EPS || lot.expires < need.night) continue;
        const take = Math.min(lot.qty, remaining);
        lot.qty -= take;
        remaining -= take;
        if (!lot.line) fromStock += take;
      }
      consumedFromShop += need.qty - fromStock;
      const key = `${need.batch}:${ingId}`;
      let line = lines.get(key);
      if (!line) {
        line = {
          key, batch: need.batch, ing, cat: ing.cat, need: 0, fromStock: 0, buy: 0, packs: sold?.type === 'pack' ? 0 : null,
          cost: 0, price, unitPrice: price.value, priceSource: price.source, have, portions: [], leftover: 0,
          frozenProduct: !!ing.frozen, freezeNights: [], tightNights: [],
        };
        lines.set(key, line);
      }
      line.portions.push({ night: need.night, qty: need.qty, storage: need.storage });
      line.need += need.qty;
      line.fromStock += fromStock;
      if (need.storage === 'freeze') line.freezeNights.push(need.night);
      if (need.storage === 'tight') line.tightNights.push(need.night);
      if (remaining <= EPS || have) continue;

      let bought: number;
      if (!sold || ing.unit === 'none') {
        bought = remaining;
      } else if (sold.type === 'pack') {
        const packs = Math.ceil(remaining / sold.size - EPS);
        line.packs = (line.packs ?? 0) + packs;
        bought = packs * sold.size;
        if (price.value !== null) line.cost += packs * price.value;
      } else {
        bought = ing.unit === 'pcs' ? Math.ceil(remaining - EPS) : remaining;
        if (price.value !== null) line.cost += bought * unitCost(ing, sold, price.value);
      }
      line.buy += bought;
      const leftover = bought - remaining;
      if (leftover > EPS) {
        const tripDay = BATCH_SPAN * need.batch;
        const frozenish = need.storage === 'freezer' || need.storage === 'freeze';
        const expires = frozenish ? tripDay + Math.max(ing.keepDays, FROZEN_LEFTOVER_DAYS) : tripDay + ing.keepDays;
        lots.push({ qty: leftover, expires, line });
      }
    }
    // whatever is still in a lot at the end of the plan is the real surplus of the trip that bought it
    for (const lot of lots) if (lot.line && lot.qty > EPS) lot.line.leftover += lot.qty;

    if (!have && price.value !== null) consumption += consumedFromShop * unitCost(ing, sold, price.value);
    const boughtSomething = [...lines.values()].some((l) => l.ing.id === ingId && l.buy > EPS);
    if (!have && boughtSomething && price.value === null && ing.unit !== 'none') unpriced.push(ing.name);
    if (!have && boughtSomething && price.stale) stale.push(ing.name);
  }

  const catRank = (c: Category) => CATEGORY_ORDER.indexOf(c);
  const batches: Batch[] = Array.from({ length: batchCount }, (_, k) => {
    const bl = [...lines.values()]
      .filter((l) => l.batch === k)
      .sort((a, b) => catRank(a.cat) - catRank(b.cat) || a.ing.name.localeCompare(b.ing.name, 'ar'));
    return {
      index: k,
      date: batchDate(plan.startDate, k),
      firstNight: k * BATCH_SPAN + 1,
      lastNight: Math.min(nightsCount, (k + 1) * BATCH_SPAN),
      lines: bl,
      total: bl.reduce((s, l) => s + l.cost, 0),
    };
  });

  const purchase = batches.reduce((s, b) => s + b.total, 0);
  const byCategory = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<Category, number>;
  const bySource = { verified: 0, recorded: 0, estimate: 0, user: 0, promo: 0, none: 0 } as Record<PriceSource, number>;
  for (const l of lines.values()) {
    byCategory[l.cat] += l.cost;
    bySource[l.priceSource] += l.cost;
  }

  const reminders = buildReminders(plan, batches, needs);
  const n = Math.max(1, nightsCount);
  return {
    needs, nightPlans, batches, staples: staples.sort((a, b) => a.ing.name.localeCompare(b.ing.name, 'ar')), reminders, nightDates,
    budget: {
      purchase, consumption, perDinner: consumption / n, perPersonDinner: consumption / n / Math.max(1, plan.members),
      byCategory, bySource, unpriced, stale,
    },
  };
}

/** A line still needs action at the shop when the household has to buy something for it. */
export function needsBuying(l: PurchaseLine): boolean {
  return !l.have && l.buy > EPS;
}

function buildReminders(plan: PlanInput, batches: Batch[], needs: Need[]): Reminder[] {
  const out: Reminder[] = [];
  for (const b of batches) {
    const toBuy = b.lines.filter(needsBuying).length;
    if (!toBuy) continue;
    out.push({
      id: `shop-${b.index}`, kind: 'shop', date: b.date, batch: b.index,
      title: `التسوق: الدفعة ${b.index + 1}`,
      body: `${arCount(toBuy, ['صنف', 'صنفان', 'أصناف', 'صنفًا'])} لليالي ${b.firstNight}–${b.lastNight}. القائمة في تبويب التسوق.`,
    });
  }
  const thawByNight = new Map<number, Need[]>();
  for (const nd of needs) {
    const ing = ING[nd.ingId];
    if (!ing.thaw || (nd.storage !== 'freezer' && nd.storage !== 'freeze')) continue;
    const l = thawByNight.get(nd.night) ?? [];
    l.push(nd);
    thawByNight.set(nd.night, l);
  }
  for (const [night, list] of [...thawByNight.entries()].sort((a, b) => a[0] - b[0])) {
    const recipe = RECIPE[list[0].recipeId];
    const thawDate = addDays(plan.startDate, night - 2); // the evening before the dinner
    const names = list.map((nd) => ING[nd.ingId].name.replace(/\s*\(.*\)$/, '')).join(' و');
    const sameDayAsShop = list.every((nd) => batches[nd.batch]?.date === thawDate);
    out.push({
      id: `thaw-${night}`, kind: 'thaw', date: thawDate, night,
      title: `إذابة: ${names}`,
      body: sameDayAsShop
        ? `لعشاء الغد (${recipe.title}): تُوضع الحصة في الثلاجة مباشرة بعد الشراء، لا في الفريزر.`
        : `لعشاء الغد (${recipe.title}): تُنقل الحصة من الفريزر إلى الثلاجة الليلة.`,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'shop' ? -1 : 1));
}

export interface StoreComparison {
  store: StoreId | 'cheapest';
  total: number; // whole plan: own prices + catalog fallback for the rest
  ownPriced: number; // purchase lines priced from this store's own records
  lines: number;
  ownCost: Record<string, number>; // ingredient id → purchase cost, own-priced lines only
  ownTotal: number;
  lastChecked?: string; // newest price date among own-priced lines
}

/**
 * Same plan priced per store. A store's total only means something for the lines it actually priced:
 * the rest falls back to the catalog price, so two stores without own prices show the same total.
 * The UI therefore compares stores on their own-priced lines and on the basket they share.
 */
export function compareStores(plan: PlanInput): StoreComparison[] {
  const stores: (StoreId | 'cheapest')[] = ['lulu', 'nesto', 'hypermax', 'cheapest'];
  return stores.map((store) => {
    const g = generate({ ...plan, storeMode: store });
    const buy = g.batches.flatMap((b) => b.lines).filter(needsBuying);
    const own = buy.filter((l) => store === 'cheapest' || (!l.price.fallback && l.price.store === store));
    const ownCost: Record<string, number> = {};
    for (const l of own) ownCost[l.ing.id] = (ownCost[l.ing.id] ?? 0) + l.cost;
    return {
      store, total: g.budget.purchase, ownPriced: own.length, lines: buy.length,
      ownCost, ownTotal: own.reduce((sum, l) => sum + l.cost, 0),
      lastChecked: own.map((l) => l.price.date).filter((d): d is string => !!d).sort().at(-1),
    };
  });
}

export interface CommonBasket {
  stores: StoreId[]; // stores with at least one own price
  ings: string[]; // ingredients every one of those stores has priced
  totals: Partial<Record<StoreId, number>>;
}

/** Like-for-like comparison: only ingredients priced by every store that has prices. Needs two stores. */
export function commonBasket(cmp: StoreComparison[]): CommonBasket | null {
  const priced = cmp.filter((c): c is StoreComparison & { store: StoreId } => c.store !== 'cheapest' && c.ownPriced > 0);
  if (priced.length < 2) return null;
  const ings = Object.keys(priced[0].ownCost).filter((id) => priced.every((c) => id in c.ownCost));
  if (!ings.length) return { stores: priced.map((c) => c.store), ings, totals: {} };
  const totals: Partial<Record<StoreId, number>> = {};
  for (const c of priced) totals[c.store] = ings.reduce((sum, id) => sum + c.ownCost[id], 0);
  return { stores: priced.map((c) => c.store), ings, totals };
}

export interface DishCost {
  /** consumption cost of one dinner of this dish: Σ (quantity eaten × unit price), no pack rounding, staples excluded */
  cost: number;
  priced: number;
  items: number;
  /** share of the cost resting on documented (verified) prices */
  verifiedShare: number;
}

/** What one dinner of this dish eats, priced the same way as the budget's consumption figure. */
export function dishCost(recipeId: string, plan: Pick<PlanInput, 'servings' | 'optionalOff' | 'priceBook' | 'storeMode' | 'today'>): DishCost {
  const recipe = RECIPE[recipeId];
  const off = new Set(plan.optionalOff);
  let cost = 0, verified = 0, priced = 0, items = 0;
  for (const it of recipe?.items ?? []) {
    if (it.opt && off.has(`${recipeId}:${it.i}`)) continue;
    const ing = ING[it.i];
    if (!ing || ing.nobuy || ing.cat === 'staples' || ing.unit === 'none' || it.q === undefined) continue;
    items++;
    const price = resolvePrice(ing, plan.priceBook, plan.storeMode, plan.today);
    if (price.value === null) continue;
    priced++;
    const c = scaledQty(ing, it.q, plan.servings) * unitCost(ing, price.sold, price.value);
    cost += c;
    if (price.source === 'verified') verified += c;
  }
  return { cost, priced, items, verifiedShare: cost > 0 ? verified / cost : 0 };
}
