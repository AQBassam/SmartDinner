import { useMemo, useState } from 'react';
import { DEFAULT_ORDER, ING, RECIPES, TAGS, type Recipe } from '../lib/data';
import type { AppState } from '../lib/state';
import type { Store } from '../store';
import { Chip } from './PlanTab';
import { RecipeImage } from './RecipeImage';
import { ConflictBadge, hasConflict, recipeConflicts } from './shared';
import { Icon, useToast } from './ui';

export interface RecipePreset { tag?: string; max?: number }

/** Visual entry points used on the home page and as the library's first row. */
export const MOODS: { id: string; label: string; emoji: string; preset: RecipePreset }[] = [
  { id: 'q15', label: '15 دقيقة', emoji: '⏱️', preset: { max: 15 } },
  { id: 'q30', label: 'نصف ساعة أو أقل', emoji: '🍳', preset: { max: 30 } },
  { id: 'oven', label: 'الفرن يتولى العمل', emoji: '🔥', preset: { tag: 'oven' } },
  { id: 'eco', label: 'اقتصادية', emoji: '🪙', preset: { tag: 'economical' } },
  { id: 'veg', label: 'دون لحوم', emoji: '🥕', preset: { tag: 'vegetarian' } },
  { id: 'kids', label: 'يحبها الأطفال', emoji: '🧒', preset: { tag: 'kids' } },
  { id: 'omani', label: 'مطبخ عُماني', emoji: '🫖', preset: { tag: 'omani' } },
];

export function RecipesTab({ store, openRecipe, preset }: { store: Store; openRecipe: (id: string) => void; preset?: RecipePreset }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(preset?.tag ?? null);
  const [max, setMax] = useState<number | null>(preset?.max ?? null);
  const [favOnly, setFavOnly] = useState(false);
  const [safeOnly, setSafeOnly] = useState(false);
  const { state } = store;
  const hasAvoid = state.avoidAllergens.length + state.avoidIngredients.length > 0;
  const list = useMemo(() => {
    const term = q.trim();
    return RECIPES.filter((r) =>
      (!tag || r.tags.includes(tag)) &&
      (!max || r.total <= max) &&
      (!favOnly || state.favorites.includes(r.id)) &&
      (!safeOnly || !hasConflict(recipeConflicts(r, state))) &&
      (!term || r.title.includes(term) || r.subtitle.includes(term) || r.items.some((it) => ING[it.i]?.name.includes(term))));
  }, [q, tag, max, favOnly, safeOnly, state]);
  const inPlan = new Set(state.nights);
  const outside = RECIPES.filter((r) => !inPlan.has(r.id)).length;
  const clear = () => { setTag(null); setMax(null); setFavOnly(false); setSafeOnly(false); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[22px] font-extrabold">الوصفات</h2>
          <p className="text-[13.5px] text-muted">
            {RECIPES.length} وصفة في المكتبة، {inPlan.size} منها في خطتك الحالية{outside > 0 ? `، و${outside} للتبديل أو لخطة أطول` : ''}.
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Icon name="search" className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-muted" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم وجبة أو مكوّن (دجاج، عدس…)"
            aria-label="البحث في الوصفات" className="min-h-12 w-full rounded-2xl border border-line bg-paper pe-3 ps-11 text-[15px]" />
        </div>
      </div>
      <div className="scroll-x -mx-4 flex gap-2 px-4 md:mx-0 md:flex-wrap md:px-0">
        <Chip active={!tag && !max && !favOnly && !safeOnly} onClick={clear}>الكل</Chip>
        <Chip active={favOnly} onClick={() => setFavOnly(!favOnly)}>★ المفضلة <span className="num">({state.favorites.length})</span></Chip>
        {hasAvoid && <Chip active={safeOnly} onClick={() => setSafeOnly(!safeOnly)}>خالية مما استبعدته الأسرة</Chip>}
        {MOODS.map((m) => {
          const on = (m.preset.max ?? null) === max && (m.preset.tag ?? null) === tag && (m.preset.max !== undefined || m.preset.tag !== undefined);
          return <Chip key={m.id} active={on} onClick={() => { if (on) { setTag(null); setMax(null); } else { setTag(m.preset.tag ?? null); setMax(m.preset.max ?? null); } }}>{m.label}</Chip>;
        })}
        {Object.entries(TAGS).filter(([k]) => !['quick', 'oven', 'economical', 'vegetarian', 'kids', 'omani'].includes(k)).map(([k, v]) => <Chip key={k} active={tag === k} onClick={() => setTag(tag === k ? null : k)}>{v}</Chip>)}
      </div>
      <p className="px-1 text-[13px] text-muted"><span className="num">{list.length}</span> من <span className="num">{RECIPES.length}</span></p>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-paper px-4 py-8 text-center">
          <p className="text-[15px] font-bold">لا وصفة تطابق هذا الاختيار</p>
          <button className="mt-2 text-[14px] font-bold text-teal underline" onClick={() => { clear(); setQ(''); }}>عرض كل الوصفات</button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
          {list.map((r) => <li key={r.id}><RecipeCard r={r} state={state} store={store} open={() => openRecipe(r.id)} /></li>)}
        </ul>
      )}
    </div>
  );
}

export function RecipeCard({ r, state, store, open, compact = false }: { r: Recipe; state: AppState; store: Store; open: () => void; compact?: boolean }) {
  const toast = useToast();
  const fav = state.favorites.includes(r.id);
  const planned = state.nights.includes(r.id);
  const conflict = recipeConflicts(r, state);
  const tag = r.tags.find((t) => t !== 'quick');
  return (
    <article className="dish-card group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-line bg-paper shadow-[var(--shadow-card)]">
      <button onClick={open} className="flex flex-1 flex-col text-start" aria-label={`${r.title}، ${r.total} دقيقة`}>
        <RecipeImage recipe={r} className="aspect-[4/3]" plateSize={compact ? 64 : 76} />
        <span className="flex flex-1 flex-col p-3">
          <span className="line-clamp-2 text-[15px] font-extrabold leading-snug">{r.title}</span>
          <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-[12.5px] text-muted">
            <span className="inline-flex items-center gap-1"><Icon name="clock" className="size-3.5" /><span className="num">{r.total}</span> د</span>
            {tag && !compact && <span>{TAGS[tag]}</span>}
            {planned && <span className="font-bold text-teal">في الخطة</span>}
          </span>
          {hasConflict(conflict) && <span className="mt-1.5"><ConflictBadge c={conflict} /></span>}
        </span>
      </button>
      <button onClick={() => { store.set((s) => ({ favorites: fav ? s.favorites.filter((x) => x !== r.id) : [...s.favorites, r.id] })); toast(fav ? 'أُزيلت من المفضلة.' : 'أُضيفت إلى المفضلة.'); }}
        aria-pressed={fav} aria-label={fav ? `إزالة ${r.title} من المفضلة` : `إضافة ${r.title} إلى المفضلة`}
        className={`absolute top-2 end-2 grid size-9 place-items-center rounded-full text-[17px] shadow-sm backdrop-blur ${fav ? 'bg-paper text-copper' : 'bg-paper/80 text-muted'}`}>
        {fav ? '★' : '☆'}
      </button>
      {!DEFAULT_ORDER.includes(r.id) && !planned && !compact && (
        <span className="absolute top-2 start-2 rounded-full bg-danger px-2 py-0.5 text-[11.5px] font-bold text-white">جديدة</span>
      )}
    </article>
  );
}
