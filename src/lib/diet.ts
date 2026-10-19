import { ING, RECIPE, type Ingredient, type Recipe } from './data';

/**
 * Eating patterns of individual family members. One tired cook makes one dinner: a member who does not eat
 * part of it gets their portion set aside before the animal item goes in (a "split"), with a substitute where
 * one exists. Only when a dish cannot be split does that member get a separate quick dish.
 */
export type AnimalClass = NonNullable<Ingredient['animal']>;
export type DietId = 'pescoDairy' | 'vegan';
export type AgeGroup = 'adults' | 'teens' | 'kids';

export const DIETS: Record<DietId, { label: string; short: string; avoids: AnimalClass[] }> = {
  pescoDairy: { label: 'سمك وألبان دون بيض', short: 'سمك وألبان', avoids: ['meat', 'poultry', 'egg'] },
  vegan: { label: 'نباتي صرف', short: 'نباتي صرف', avoids: ['meat', 'poultry', 'fish', 'seafood', 'egg', 'dairy'] },
};
export const DIET_ORDER: DietId[] = ['pescoDairy', 'vegan'];

/** The quick dish for a member whose dinner cannot be split off. Vegan, so it suits every pattern. */
export const SEPARATE_DISH = 'foul';
/** A separate dish at most once in any 7 consecutive nights, per member. */
export const SEPARATE_WINDOW = 7;

export const ANIMAL_LABEL: Record<AnimalClass, string> = {
  meat: 'اللحم', poultry: 'الدجاج', fish: 'السمك', seafood: 'المأكولات البحرية', egg: 'البيض', dairy: 'الألبان',
};
/** allergen label on a product that varies by brand → the animal class it would bring in */
const MAY_ANIMAL: Record<string, AnimalClass> = { milk: 'dairy', egg: 'egg', fish: 'fish', crustaceans: 'seafood', molluscs: 'seafood' };

export interface DietMember { diet: DietId; servings: number }

export const allows = (diet: DietId, ing: Ingredient): boolean => !ing.animal || !DIETS[diet].avoids.includes(ing.animal);

export type Fit = 'all' | 'split' | 'separate';

export interface DietFit {
  fit: Fit;
  /** animal items this pattern does not eat, with their allowed options (empty = left out) */
  replace: { from: string; options: { i: string; q: number; t: string }[] }[];
  /** products that may contain a class this pattern avoids, depending on the brand */
  mayContain: { ing: string; cls: AnimalClass }[];
}

function offSet(optionalOff: string[] | Set<string>): Set<string> {
  return optionalOff instanceof Set ? optionalOff : new Set(optionalOff);
}

/** How one eating pattern relates to one recipe. Optional items the member does not eat are simply left out. */
export function dietFit(r: Recipe, diet: DietId, optionalOff: string[] | Set<string> = []): DietFit {
  const off = offSet(optionalOff);
  const replace: DietFit['replace'] = [];
  const mayContain: DietFit['mayContain'] = [];
  let separate = false;
  for (const it of r.items) {
    const ing = ING[it.i];
    if (!ing || (it.opt && off.has(`${r.id}:${it.i}`))) continue;
    if (allows(diet, ing)) {
      for (const a of ing.mayContain ?? []) {
        const cls = MAY_ANIMAL[a];
        if (cls && DIETS[diet].avoids.includes(cls)) mayContain.push({ ing: ing.id, cls });
      }
      continue;
    }
    if (it.opt) { replace.push({ from: ing.id, options: [] }); continue; }
    const opts = r.split?.alt[ing.id];
    if (!opts) { separate = true; continue; }
    replace.push({ from: ing.id, options: opts.filter((o) => allows(diet, ING[o.i])) });
  }
  const fit: Fit = separate ? 'separate' : replace.length ? 'split' : 'all';
  return { fit, replace, mayContain };
}

export interface Substitution {
  from: string;
  /** null = this member's portion simply goes without */
  to: { i: string; q: number; t: string } | null;
  servings: number;
  members: number;
  diets: DietId[];
}

export interface NightPlan {
  recipeId: string;
  /** servings eating the shared dish (everyone except members on a separate dish) */
  base: number;
  /** servings eating each animal item that someone at the table does not eat */
  eaters: Record<string, number>;
  subs: Substitution[];
  /** members who need their portion set aside before split.at */
  splitMembers: number;
  separate: { servings: number; members: number; diets: DietId[] } | null;
  mayContain: { ing: string; cls: AnimalClass; diets: DietId[] }[];
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/**
 * Resolve one dinner for a table where `total` servings include `special` members. A substitute that suits
 * every member who needs one is preferred, so the cook prepares one extra portion, not one per pattern.
 */
/** What the substitute choice may take into account: recent use (for variety) and what the family avoids. */
export interface ChoiceContext {
  /** substitute or protein → last night index it was eaten by a special member */
  lastUse?: Map<string, number>;
  /** how many nights so far each protein was eaten by a special member */
  uses?: Map<string, number>;
  avoidAllergens?: string[];
  avoidIngredients?: string[];
}

/** Products that count as the same protein when rotating (hummus is chickpeas). */
const SAME_AS: Record<string, string> = { hummus_dip: 'chickpeas_can' };
export const proteinKey = (id: string) => SAME_AS[id] ?? id;
/** Protein sources whose repetition a special member would notice. */
const PROTEINS = new Set(['chickpeas_can', 'hummus_dip', 'fava_can', 'red_lentils', 'falafel', 'halloumi', 'tuna', 'fish_fillet', 'eggs', 'labneh']);

export function resolveNight(recipeId: string, total: number, special: DietMember[], optionalOff: string[] | Set<string> = [], ctx: ChoiceContext = {}): NightPlan {
  const r = RECIPE[recipeId];
  const plan: NightPlan = { recipeId, base: total, eaters: {}, subs: [], splitMembers: 0, separate: null, mayContain: [] };
  if (!r || !special.length) return plan;
  const off = offSet(optionalOff);
  const fits = special.map((m) => ({ m, f: dietFit(r, m.diet, off) }));

  const sep = fits.filter((x) => x.f.fit === 'separate');
  if (sep.length) {
    plan.separate = { servings: sep.reduce((s, x) => s + x.m.servings, 0), members: sep.length, diets: uniq(sep.map((x) => x.m.diet)) };
    plan.base = Math.max(0, total - plan.separate.servings);
  }
  const split = fits.filter((x) => x.f.fit === 'split');
  plan.splitMembers = split.length;

  const froms = uniq(split.flatMap((x) => x.f.replace.map((rp) => rp.from)));
  for (const from of froms) {
    const who = split.filter((x) => x.f.replace.some((rp) => rp.from === from));
    plan.eaters[from] = Math.max(0, plan.base - who.reduce((s, x) => s + x.m.servings, 0));
    const avoidA = new Set(ctx.avoidAllergens ?? []);
    const avoidI = new Set(ctx.avoidIngredients ?? []);
    // a substitute must not bring back what the whole family avoids
    const safe = (o: { i: string }) => !avoidI.has(o.i) && ![...(ING[o.i].allergens ?? []), ...(ING[o.i].mayContain ?? [])].some((a) => avoidA.has(a));
    const optsOf = (x: (typeof who)[number]) => x.f.replace.find((rp) => rp.from === from)!.options.filter(safe);
    // least eaten so far first, then least recently; ties keep the recipe's order
    const uses = (o: { i: string }) => ctx.uses?.get(proteinKey(o.i)) ?? 0;
    const last = (o: { i: string }) => ctx.lastUse?.get(proteinKey(o.i)) ?? -Infinity;
    const freshest = <T extends { i: string }>(os: T[]) => os.map((o, k) => ({ o, k }))
      .sort((a, b) => uses(a.o) - uses(b.o) || last(a.o) - last(b.o) || a.k - b.k).map((x) => x.o);
    const shared = freshest(optsOf(who[0]).filter((o) => who.every((x) => optsOf(x).some((p) => p.i === o.i))))[0];
    const byChoice = new Map<string, Substitution>();
    for (const x of who) {
      const to = shared ?? freshest(optsOf(x))[0] ?? null;
      const key = to?.i ?? '';
      const s = byChoice.get(key) ?? { from, to, servings: 0, members: 0, diets: [] };
      s.servings += x.m.servings;
      s.members += 1;
      s.diets = uniq([...s.diets, x.m.diet]);
      byChoice.set(key, s);
    }
    plan.subs.push(...byChoice.values());
  }

  const may = new Map<string, NightPlan['mayContain'][number]>();
  for (const x of fits) {
    if (x.f.fit === 'separate') continue;
    for (const mc of x.f.mayContain) {
      const k = `${mc.ing}:${mc.cls}`;
      const e = may.get(k) ?? { ...mc, diets: [] };
      e.diets = uniq([...e.diets, x.m.diet]);
      may.set(k, e);
    }
  }
  plan.mayContain = [...may.values()];
  return plan;
}

/** Nights (0-based) whose separate dish comes within 7 nights of an earlier one for the same pattern. */
export function separateViolations(nights: string[], diets: DietId[]): number[] {
  const out = new Set<number>();
  for (const diet of uniq(diets)) {
    let last = -Infinity;
    nights.forEach((id, i) => {
      const r = RECIPE[id];
      if (!r || dietFit(r, diet).fit !== 'separate') return;
      if (i - last < SEPARATE_WINDOW) out.add(i);
      else last = i;
    });
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Replace each violating night with a dish everyone can share or split, preferring one not yet in the plan.
 * Returns the plan unchanged when it already follows the rule.
 */
export function fixSeparateNights(nights: string[], diets: DietId[], pool: string[]): string[] {
  const out = [...nights];
  for (let guard = 0; guard < out.length; guard++) {
    const bad = separateViolations(out, diets)[0];
    if (bad === undefined) break;
    const ok = (id: string) => diets.every((d) => dietFit(RECIPE[id], d).fit !== 'separate');
    const candidates = pool.filter((id) => RECIPE[id] && ok(id) && id !== out[bad - 1] && id !== out[bad + 1]);
    const fresh = candidates.find((id) => !out.includes(id));
    // least used so far, so the plan stays varied
    const pick = fresh ?? candidates.sort((a, b) => out.filter((x) => x === a).length - out.filter((x) => x === b).length)[0];
    if (!pick) break;
    out[bad] = pick;
  }
  return out;
}

export interface PlanDietInput {
  nights: string[];
  total: number;
  special: DietMember[];
  optionalOff?: string[];
  avoidAllergens?: string[];
  avoidIngredients?: string[];
}

/**
 * Resolve every night of the plan in order, so a substitute the special members had recently is not
 * picked again while another one fits: the same chickpeas twelve nights out of fifteen is dull.
 */
export function planNights(input: PlanDietInput): NightPlan[] {
  const off = new Set(input.optionalOff ?? []);
  const lastUse = new Map<string, number>();
  const uses = new Map<string, number>();
  const diets = input.special.map((m) => m.diet);
  return input.nights.map((rid, idx) => {
    const np = resolveNight(rid, input.total, input.special, off, { lastUse, uses, avoidAllergens: input.avoidAllergens, avoidIngredients: input.avoidIngredients });
    if (!input.special.length || !RECIPE[rid]) return np;
    const eaten = new Set<string>();
    for (const s of np.subs) if (s.to && PROTEINS.has(s.to.i)) eaten.add(proteinKey(s.to.i));
    // proteins in the shared dish that a special member eats count too (chickpeas in the saloona)
    for (const it of RECIPE[rid].items) {
      if (!PROTEINS.has(it.i) || (it.opt && off.has(`${rid}:${it.i}`))) continue;
      if (np.subs.some((s) => s.from === it.i) && !diets.some((d) => allows(d, ING[it.i]) && !np.subs.some((s) => s.from === it.i && s.diets.includes(d)))) continue;
      if (diets.some((d) => allows(d, ING[it.i]))) eaten.add(proteinKey(it.i));
    }
    if (np.separate) for (const it of RECIPE[SEPARATE_DISH].items) if (PROTEINS.has(it.i)) eaten.add(proteinKey(it.i));
    for (const k of eaten) { lastUse.set(k, idx); uses.set(k, (uses.get(k) ?? 0) + 1); }
    return np;
  });
}
