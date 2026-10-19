import { ING, RECIPE, type Recipe } from '../lib/data';
import { ANIMAL_LABEL, DIET_ORDER, DIETS, dietFit, resolveNight, SEPARATE_DISH, type DietId, type Fit, type NightPlan } from '../lib/diet';
import { arCount, fmtQty, PERSON, todayISO } from '../lib/format';
import type { Store } from '../store';
import { dietMembers, servings, type AppState } from '../lib/state';
import { Icon } from './ui';

export const cleanName = (n: string) => n.replace(/\s*\(.*\)$/, '');
const dietList = (ds: DietId[]) => ds.map((d) => DIETS[d].short).join('، ');
/** «for N members» after the preposition لـ: the dual takes its genitive form. */
const forPeople = (n: number) => (n === 1 ? 'فرد واحد' : n === 2 ? 'فردين' : arCount(n, PERSON));

/**
 * The dish for this table. On a planned night the plan's own resolution is used, so the recipe page, kitchen
 * mode and shopping list agree on the substitute; off the plan, the first fitting substitute.
 */
export function nightPlan(store: Store, recipeId: string, night?: number): NightPlan {
  const { state, gen } = store;
  const today = todayISO();
  const idx = night !== undefined ? night - 1
    : state.nights.findIndex((id, i) => id === recipeId && (gen.nightDates[i] ?? '') >= today);
  const np = idx >= 0 ? gen.nightPlans[idx] : undefined;
  if (np && np.recipeId === recipeId) return np;
  return resolveNight(recipeId, servings(state), dietMembers(state), state.optionalOff,
    { avoidAllergens: state.avoidAllergens, avoidIngredients: state.avoidIngredients });
}

const FIT_TEXT: Record<Fit, string> = { all: 'كما هي', split: 'تفترق', separate: 'طبق منفصل' };
const FIT_TONE: Record<Fit, string> = { all: 'bg-teal-soft text-teal-deep', split: 'bg-saffron-soft text-copper', separate: 'bg-danger-soft text-danger' };

/** One line per eating pattern: does this dish suit it as it is, split off, or not at all. */
export function DietFitLine({ recipe, state }: { recipe: Recipe; state: AppState }) {
  const present = new Set(state.special.map((m) => m.diet));
  const diets = present.size ? DIET_ORDER.filter((d) => present.has(d)) : DIET_ORDER;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
      {diets.map((d) => {
        const f = dietFit(recipe, d, state.optionalOff).fit;
        return (
          <span key={d} className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 font-bold ${FIT_TONE[f]}`}>
            {DIETS[d].short}: {FIT_TEXT[f]}
          </span>
        );
      })}
    </p>
  );
}

function subQty(i: string, q: number, sv: number): string {
  return fmtQty(ING[i], q * sv / 5);
}

/** The set-aside portion for members who do not eat everything, as shown on the recipe page. */
export function SpecialPortion({ recipe, np, openRecipe }: { recipe: Recipe; np: NightPlan; openRecipe?: (id: string) => void }) {
  if (!np.splitMembers && !np.separate && !np.mayContain.length) return null;
  return (
    <section aria-labelledby="special-portion" className="mt-4 rounded-2xl border border-saffron/60 bg-saffron-soft/50 p-3.5">
      <h4 id="special-portion" className="flex items-center gap-2 text-[15px] font-extrabold">
        <Icon name="users" className="size-5 text-copper" /> الحصة الخاصة
      </h4>
      {np.splitMembers > 0 && recipe.split && (
        <>
          <p className="mt-1.5 text-[14px] leading-relaxed">
            في الخطوة <span className="num font-bold">{recipe.split.at + 1}</span> من الطريقة: {recipe.split.t}
            {(recipe.split.min > 0 || recipe.split.tool) && (
              <span className="block text-[12.5px] text-muted">
                {recipe.split.min > 0 && <>نحو <span className="num">{recipe.split.min}</span> د إضافية</>}
                {recipe.split.min > 0 && recipe.split.tool && '، '}
                {recipe.split.tool && <>و{recipe.split.tool}</>}
              </span>
            )}
          </p>
          <ul className="mt-2 space-y-1.5">
            {np.subs.map((s) => (
              <li key={`${s.from}:${s.to?.i ?? ''}`} className="rounded-xl bg-paper px-3 py-2 text-[14px] leading-relaxed">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <b>{s.to ? <>{cleanName(ING[s.to.i].name)} بدل {cleanName(ING[s.from].name)}</> : <>دون {cleanName(ING[s.from].name)}</>}</b>
                  {s.to && <span className="font-bold text-teal-deep">{subQty(s.to.i, s.to.q, s.servings)}</span>}
                </span>
                <span className="block text-[12.5px] text-muted">{arCount(s.members, PERSON)}: {dietList(s.diets)}</span>
                {s.to && <span className="mt-0.5 block text-[13.5px]">{s.to.t}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {np.separate && (
        <p className="mt-2 rounded-xl bg-paper px-3 py-2 text-[14px] leading-relaxed">
          لا تفترق هذه الوجبة لـ{forPeople(np.separate.members)} ({dietList(np.separate.diets)})، فيُقدَّم {np.separate.members > 1 ? 'لهم' : 'له'}{' '}
          {openRecipe
            ? <button className="link-inline font-bold" onClick={() => openRecipe(SEPARATE_DISH)}>{RECIPE[SEPARATE_DISH].title}</button>
            : <b>{RECIPE[SEPARATE_DISH].title}</b>}
          {' '}في <span className="num">{RECIPE[SEPARATE_DISH].total}</span> دقيقة، ومكوناته في قائمة التسوق.
        </p>
      )}
      {np.mayContain.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          {np.mayContain.map((m) => `${cleanName(ING[m.ing].name)} قد يحتوي ${ANIMAL_LABEL[m.cls]} حسب المنتج`).join('، ')}؛ يُقرأ الملصق للحصة الخاصة.
        </p>
      )}
    </section>
  );
}

/** One line for compact places (tonight card, plan list). */
export function specialLine(np: NightPlan): string | null {
  const parts: string[] = [];
  const subs = np.subs.filter((s) => s.to);
  const per = new Map<string, number>();
  for (const s of subs) per.set(s.to!.i, Math.max(per.get(s.to!.i) ?? 0, s.members));
  if (subs.length) parts.push(...[...per].map(([i, n]) => `${cleanName(ING[i].name)} لـ${forPeople(n)}`));
  else if (np.splitMembers) parts.push(`تُفصل حصة ${forPeople(np.splitMembers)}`);
  if (np.separate) parts.push(`${RECIPE[SEPARATE_DISH].title} لـ${forPeople(np.separate.members)}`);
  return parts.length ? `الحصة الخاصة: ${parts.join('، و')}` : null;
}

/** The recipe's steps with the set-aside step slotted in where it belongs. */
export function stepsWithSplit(recipe: Recipe, np: NightPlan): { t: string; min?: number; special?: boolean }[] {
  const steps: { t: string; min?: number; special?: boolean }[] = recipe.steps.map((s) => ({ ...s }));
  if (!np.splitMembers || !recipe.split) return steps;
  const how = np.subs.filter((s) => s.to).map((s) => s.to!.t);
  const t = [recipe.split.t, ...how].join(' ');
  steps.splice(recipe.split.at, 0, { t, special: true });
  return steps;
}
