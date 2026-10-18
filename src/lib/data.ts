import { z } from 'zod';
import catalogJson from '../data/catalog.json';
import recipesJson from '../data/recipes.json';
import imagesJson from '../data/images.json';

export const STORES = { lulu: 'لولو', nesto: 'نستو', hypermax: 'هايبرماكس', other: 'متجر آخر' } as const;
export type StoreId = keyof typeof STORES;
const StoreEnum = z.enum(['lulu', 'nesto', 'hypermax', 'other']);

const ALLERGEN_IDS = ['gluten', 'milk', 'egg', 'fish', 'sesame', 'soy', 'peanut', 'nuts', 'crustaceans', 'molluscs', 'celery', 'mustard', 'sulphites', 'lupin'] as const;
export const AllergenEnum = z.enum(ALLERGEN_IDS);
export type Allergen = z.infer<typeof AllergenEnum>;

const Price = z.object({
  value: z.number().nonnegative(),
  source: z.enum(['verified', 'recorded', 'estimate']),
  date: z.string().optional(),
  store: StoreEnum.optional(),
  url: z.string().url().optional(),
  note: z.string().optional(),
});

export const Sold = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pack'), size: z.number().positive(), label: z.string() }),
  z.object({ type: z.literal('perKg') }),
  z.object({ type: z.literal('perPiece'), label: z.string() }),
]);

export const IngredientSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  cat: z.enum(['protein', 'dairy', 'bakery', 'produce', 'pantry', 'staples']),
  unit: z.enum(['g', 'ml', 'pcs', 'none']),
  forms: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  round: z.enum(['int', 'half']).optional(),
  pieceG: z.number().positive().optional(),
  scale: z.enum(['linear', 'partial', 'fixed']),
  keepDays: z.number().positive(),
  frozen: z.boolean().optional(),
  freezable: z.boolean().optional(),
  thaw: z.boolean().optional(),
  bulk: z.boolean().optional(),
  staple: z.boolean().optional(),
  nobuy: z.boolean().optional(),
  sold: Sold.optional(),
  price: Price.optional(),
  allergens: z.array(AllergenEnum).optional(),
  mayContain: z.array(AllergenEnum).optional(),
});
export type SoldT = z.infer<typeof Sold>;

export const RecipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  ref: z.string().optional(),
  title: z.string(),
  subtitle: z.string(),
  emoji: z.string().default('🍽️'),
  tint: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#EFE6C9'),
  photoAlt: z.string().default(''),
  active: z.number().positive(),
  total: z.number().positive(),
  tags: z.array(z.string()),
  tools: z.array(z.string()).default([]),
  items: z.array(z.object({ i: z.string(), q: z.number().positive().optional(), opt: z.boolean().optional(), note: z.string().optional() })),
  steps: z.array(z.object({ t: z.string(), min: z.number().positive().optional() })),
  tips: z.array(z.string()).default([]),
  safety: z.string().optional(),
  prep: z.array(z.object({
    when: z.enum(['evening', 'afternoon', 'shopDay']),
    t: z.string(),
    min: z.number().int().positive().max(60),
    note: z.string().optional(),
  })).default([]),
});

export type Ingredient = z.infer<typeof IngredientSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type PrepWhen = Recipe['prep'][number]['when'];
export type Category = Ingredient['cat'];

const CatalogFile = z.object({
  categories: z.record(z.string(), z.string()),
  allergens: z.record(AllergenEnum, z.string()),
  ingredients: z.array(IngredientSchema),
});
const RecipesFile = z.object({
  _meta: z.object({ baseServings: z.literal(5), defaultOrder: z.array(z.string()) }).passthrough(),
  tags: z.record(z.string(), z.string()),
  recipes: z.array(RecipeSchema),
});

const catalogFile = CatalogFile.parse(catalogJson);
const recipesFile = RecipesFile.parse(recipesJson);

export const CATEGORIES = catalogFile.categories as Record<Category, string>;
export const ALLERGENS = catalogFile.allergens as Record<Allergen, string>;
export const ALLERGEN_ORDER: Allergen[] = [...ALLERGEN_IDS];
export const CATEGORY_ORDER: Category[] = ['produce', 'protein', 'dairy', 'bakery', 'pantry', 'staples'];
export const INGREDIENTS: Ingredient[] = catalogFile.ingredients;
export const ING: Record<string, Ingredient> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
export const RECIPES: Recipe[] = recipesFile.recipes;
export const RECIPE: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const TAGS: Record<string, string> = recipesFile.tags;
export const DEFAULT_ORDER: string[] = recipesFile._meta.defaultOrder;
export const BASE_SERVINGS = 5;

export interface RecipeAllergens { contains: Allergen[]; may: Allergen[] }
/** Allergens a recipe contains (required items) or may contain (optional items, or products that vary by brand). */
export function recipeAllergens(r: Recipe, optionalOff: Set<string> = new Set()): RecipeAllergens {
  const contains = new Set<Allergen>();
  const may = new Set<Allergen>();
  for (const it of r.items) {
    const ing = ING[it.i];
    if (!ing) continue;
    if (it.opt && optionalOff.has(`${r.id}:${it.i}`)) continue;
    for (const a of ing.allergens ?? []) (it.opt ? may : contains).add(a);
    for (const a of ing.mayContain ?? []) may.add(a);
  }
  for (const a of contains) may.delete(a);
  return { contains: ALLERGEN_ORDER.filter((a) => contains.has(a)), may: ALLERGEN_ORDER.filter((a) => may.has(a)) };
}

/** Integrity check, used by tests and at dev time. Returns a list of problems. */
export function validateData(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const ing of INGREDIENTS) {
    if (ids.has(ing.id)) problems.push(`duplicate ingredient ${ing.id}`);
    ids.add(ing.id);
    if (ing.unit === 'pcs' && !ing.forms) problems.push(`${ing.id}: pcs without forms`);
    if (!ing.staple && !ing.nobuy && (!ing.sold || !ing.price)) problems.push(`${ing.id}: purchasable without sold/price`);
    if (ing.sold?.type === 'perKg' && ing.unit === 'pcs' && !ing.pieceG) problems.push(`${ing.id}: perKg pcs without pieceG`);
    if (ing.price?.source === 'verified' && (!ing.price.date || !ing.price.url)) problems.push(`${ing.id}: verified price without date/url`);
    if (ing.bulk && !(ing.frozen || ing.freezable)) problems.push(`${ing.id}: bulk but not freezable`);
    if (ing.price?.source === 'verified' && !ing.price.store) problems.push(`${ing.id}: verified price without store`);
  }
  const rids = new Set<string>();
  for (const r of RECIPES) {
    if (rids.has(r.id)) problems.push(`duplicate recipe ${r.id}`);
    rids.add(r.id);
    for (const it of r.items) {
      const ing = ING[it.i];
      if (!ing) { problems.push(`${r.id}: unknown ingredient ${it.i}`); continue; }
      if (ing.unit !== 'none' && it.q === undefined) problems.push(`${r.id}: ${it.i} needs quantity`);
      if (ing.unit === 'none' && it.q !== undefined) problems.push(`${r.id}: ${it.i} is to-taste, no quantity`);
    }
    for (const t of r.tags) if (!TAGS[t]) problems.push(`${r.id}: unknown tag ${t}`);
    if (r.active > r.total) problems.push(`${r.id}: active > total`);
    if (!r.tools.length) problems.push(`${r.id}: no tools listed`);
    if (!r.prep.length) problems.push(`${r.id}: no prep-ahead task`);
    if (r.prep.some((p) => p.when === 'evening' && /الأرز/.test(p.t) && /يُطهى/.test(p.t))) problems.push(`${r.id}: cooked rice must not be prepped ahead`);
    for (const p of r.prep) if (/^(قطّع|اخلط|اغسل|اسلق|ضع|حضّر)/.test(p.t)) problems.push(`${r.id}: gendered imperative in prep`);
    for (const st of r.steps) if (/^(قطّع|اطه|اخلط|سخّن|صفِّ|اغسل|شوّح|أضف|اسلق|حمّر|ضع|قدّم|احشُ|وزّع|اخبز|تبّل|افتح|غطِّ)/.test(st.t)) problems.push(`${r.id}: gendered imperative step «${st.t.slice(0, 20)}»`);
  }
  for (const id of DEFAULT_ORDER) if (!RECIPE[id]) problems.push(`defaultOrder: unknown ${id}`);
  return problems;
}

// ---------------------------------------------------------------- recipe photos
/** Built by scripts/images.py: one entry per recipe that has a photo in public/recipes/. */
export const PhotoSchema = z.object({
  v: z.string().regex(/^[a-f0-9]{8}$/), // content hash, busts caches when a photo is replaced
  credit: z.string(),
  license: z.string(),
  ai: z.boolean(), // illustrative image, not a photo of this recipe actually cooked
  added: z.string(),
});
export type Photo = z.infer<typeof PhotoSchema>;
export const PHOTOS: Record<string, Photo> = z.record(z.string(), PhotoSchema).parse(imagesJson);
export const photoUrl = (id: string, variant: 'card' | 'hero') =>
  PHOTOS[id] ? `./recipes/${id}-${variant}.webp?v=${PHOTOS[id].v}` : null;
