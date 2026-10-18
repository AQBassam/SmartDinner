import type { Ingredient, SoldT, StoreId } from './data';
import { diffDays } from './format';

export type PriceType = 'verified' | 'manual' | 'promo' | 'estimate';
export type PriceSource = 'verified' | 'recorded' | 'estimate' | 'user' | 'promo' | 'none';
export type StoreMode = 'auto' | 'cheapest' | StoreId;

/** A price the family recorded for one store. Pack sizes are stored in the ingredient's own unit. */
export interface PriceRecord {
  id: string;
  ing: string;
  store: StoreId;
  product: string;
  sold: SoldT;
  value: number;
  type: PriceType;
  checkedAt: string;
  validTo?: string;
  url?: string;
  region?: string;
}

export interface ResolvedPrice {
  value: number | null;
  sold: SoldT | undefined;
  source: PriceSource;
  store?: StoreId;
  date?: string;
  url?: string;
  stale: boolean;
  /** true when a specific store was requested but its own price was missing */
  fallback: boolean;
  recordId?: string;
}

export const STALE_DAYS = 30;

/** Cost of one ingredient unit (g, ml or piece) under a given way of selling. */
export function unitCost(ing: Ingredient, sold: SoldT | undefined, price: number): number {
  if (!sold) return 0;
  if (sold.type === 'pack') return price / sold.size;
  if (sold.type === 'perPiece') return price;
  if (ing.unit === 'pcs') return (price * (ing.pieceG ?? 0)) / 1000;
  return price / 1000;
}

export function isExpired(r: PriceRecord, today: string): boolean {
  return !!r.validTo && r.validTo < today;
}

export function isStale(date: string | undefined, today: string): boolean {
  return !!date && diffDays(today, date) > STALE_DAYS;
}

const typeToSource: Record<PriceType, PriceSource> = { verified: 'user', manual: 'user', promo: 'promo', estimate: 'estimate' };

function fromRecord(r: PriceRecord, today: string, fallback = false): ResolvedPrice {
  return {
    value: r.value, sold: r.sold, source: typeToSource[r.type], store: r.store, date: r.checkedAt, url: r.url,
    stale: r.type !== 'promo' && isStale(r.checkedAt, today), fallback, recordId: r.id,
  };
}

function builtin(ing: Ingredient, today: string, fallback: boolean): ResolvedPrice {
  if (!ing.price) return { value: null, sold: ing.sold, source: 'none', stale: false, fallback };
  return {
    value: ing.price.value, sold: ing.sold, source: ing.price.source, store: ing.price.store, date: ing.price.date,
    url: ing.price.url, stale: ing.price.source === 'verified' && isStale(ing.price.date, today), fallback,
  };
}

/** Records usable today for one ingredient, newest first. Expired promotions are never used. */
export function usableRecords(ingId: string, book: PriceRecord[], today: string): PriceRecord[] {
  return book
    .filter((r) => r.ing === ingId && !isExpired(r, today) && r.checkedAt <= today && r.value >= 0)
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

export function resolvePrice(ing: Ingredient, book: PriceRecord[], mode: StoreMode, today: string): ResolvedPrice {
  const recs = usableRecords(ing.id, book, today);
  if (mode === 'auto') return recs[0] ? fromRecord(recs[0], today) : builtin(ing, today, false);
  if (mode === 'cheapest') {
    const options: ResolvedPrice[] = [...recs.map((r) => fromRecord(r, today)), builtin(ing, today, false)].filter((o) => o.value !== null);
    if (!options.length) return builtin(ing, today, false);
    return options.reduce((best, o) => (unitCost(ing, o.sold, o.value!) < unitCost(ing, best.sold, best.value!) ? o : best));
  }
  const own = recs.find((r) => r.store === mode);
  if (own) return fromRecord(own, today);
  const b = builtin(ing, today, true);
  if (b.store === mode) b.fallback = false;
  return b;
}
