import { ALLERGENS, ING, recipeAllergens, STORES, type Allergen, type Recipe } from '../lib/data';
import type { PriceSource } from '../lib/prices';
import type { AppState } from '../lib/state';
import { Badge } from './ui';

export const SOURCE_LABEL: Record<PriceSource, string> = {
  verified: 'موثّق من المتجر', recorded: 'مسجّل سابقًا', estimate: 'تقدير', user: 'سعر الأسرة', promo: 'عرض', none: 'دون سعر',
};
export const SOURCE_TONE: Record<PriceSource, 'ok' | 'muted' | 'warn' | 'teal' | 'copper'> = {
  verified: 'ok', recorded: 'muted', estimate: 'warn', user: 'teal', promo: 'copper', none: 'muted',
};
export const SOURCE_COLOR: Record<PriceSource, string> = {
  verified: '#2e7a57', user: '#2e6a4a', promo: '#9a5f00', recorded: '#8a8f86', estimate: '#d79b2e', none: '#c9c2b5',
};
export const STORE_LABEL = STORES;

export interface Conflicts {
  allergens: Allergen[]; // contained and avoided
  mayAllergens: Allergen[]; // possibly contained and avoided
  ingredients: string[]; // avoided ingredient names
}

export function recipeConflicts(r: Recipe, s: Pick<AppState, 'avoidAllergens' | 'avoidIngredients' | 'optionalOff'>): Conflicts {
  const a = recipeAllergens(r, new Set(s.optionalOff));
  const avoid = new Set(s.avoidAllergens);
  const off = new Set(s.optionalOff);
  return {
    allergens: a.contains.filter((x) => avoid.has(x)),
    mayAllergens: a.may.filter((x) => avoid.has(x)),
    ingredients: [...new Set(r.items.filter((it) => s.avoidIngredients.includes(it.i) && !(it.opt && off.has(`${r.id}:${it.i}`))).map((it) => ING[it.i].name.replace(/\s*\(.*\)$/, '')))],
  };
}

export const hasConflict = (c: Conflicts) => c.allergens.length + c.ingredients.length > 0;

export function ConflictBadge({ c }: { c: Conflicts }) {
  if (hasConflict(c)) {
    const names = [...c.allergens.map((a) => ALLERGENS[a]), ...c.ingredients];
    return <Badge tone="danger" icon="alert">يحتوي: {names.join('، ')}</Badge>;
  }
  if (c.mayAllergens.length) return <Badge tone="warn" icon="alert">قد يحتوي: {c.mayAllergens.map((a) => ALLERGENS[a]).join('، ')}</Badge>;
  return null;
}
