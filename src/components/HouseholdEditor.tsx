import { arCount, num, PERSON, PORTION } from '../lib/format';
import { DIET_ORDER, DIETS, type AgeGroup } from '../lib/diet';
import { AGE_WEIGHTS, APPETITES, fitSpecial, members, servings, type AppState } from '../lib/state';
import type { Store } from '../store';
import { IconButton, useToast } from './ui';

const GROUPS: { key: keyof AppState['household']; label: string; hint: string }[] = [
  { key: 'adults', label: 'بالغون', hint: 'حصة كاملة' },
  { key: 'teens', label: 'مراهقون', hint: `${num(AGE_WEIGHTS.teens, 2)} حصة` },
  { key: 'kids', label: 'أطفال (4–12)', hint: `${num(AGE_WEIGHTS.kids, 2)} حصة` },
];
const APPETITE_LABEL: Record<(typeof APPETITES)[number], string> = { 0.85: 'خفيفة', 1: 'عادية', 1.15: 'كبيرة' };

export function HouseholdEditor({ store }: { store: Store }) {
  const { state, set } = store;
  const total = members(state);
  const sv = servings(state);
  const bump = (key: keyof AppState['household'], d: 1 | -1) => set((s) => {
    const household = { ...s.household, [key]: Math.max(0, s.household[key] + d) };
    return { household, special: fitSpecial(s.special, household) };
  });

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-bold text-muted">أفراد الأسرة</p>
        <p className="text-[12.5px] text-muted">
          <span className="num font-bold text-ink">{arCount(total, PERSON)}</span> = <span className="num font-bold text-teal">{arCount(Math.round(sv * 100) / 100, PORTION)}</span>
        </p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {GROUPS.map((g) => (
          <div key={g.key} className="rounded-2xl border border-line bg-sand/50 p-2 text-center">
            <p className="text-[13px] font-bold">{g.label}</p>
            <p className="text-[11px] text-muted">{g.hint}</p>
            <div className="mt-1 flex items-center justify-center gap-0.5">
              <IconButton icon="minus" label={`إنقاص ${g.label}`} className="size-9"
                disabled={state.household[g.key] <= 0 || total <= 1} onClick={() => bump(g.key, -1)} />
              <output className="num w-7 text-[20px] font-extrabold" aria-live="polite">{state.household[g.key]}</output>
              <IconButton icon="plus" label={`زيادة ${g.label}`} className="size-9" disabled={total >= 20} onClick={() => bump(g.key, 1)} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[13px] font-bold text-muted">الشهية</span>
        <div className="flex flex-1 gap-1 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="حجم الحصة">
          {APPETITES.map((a) => (
            <button key={a} role="radio" aria-checked={state.appetite === a} onClick={() => set({ appetite: a })}
              className={`min-h-9 flex-1 rounded-full text-[13.5px] font-bold transition ${state.appetite === a ? 'bg-paper text-teal shadow-sm' : 'text-[#5c554d]'}`}>
              {APPETITE_LABEL[a]} <span className="num text-[11px] font-medium">×{num(a, 2)}</span>
            </button>
          ))}
        </div>
      </div>
      <SpecialMembers store={store} />
      <p className="mt-2 text-[12px] leading-relaxed text-muted">أوزان الحصص تقديرات للتخطيط لا توصيات غذائية؛ طفل دون 4 سنوات يمكن عدّه صفرًا أو طفلًا.</p>
    </div>
  );
}

const GROUP_LABEL: Record<AgeGroup, string> = { adults: 'بالغ (حصة كاملة)', teens: 'مراهق', kids: 'طفل (4–12)' };

/** Members who do not eat everything. No names: an age group (for the portion) and an eating pattern. */
function SpecialMembers({ store }: { store: Store }) {
  const { state, set } = store;
  const toast = useToast();
  const sp = state.special;
  const used = (g: AgeGroup, except?: number) => sp.filter((m, i) => m.group === g && i !== except).length;
  const freeGroup = (except?: number) => (['adults', 'teens', 'kids'] as AgeGroup[]).find((g) => used(g, except) < state.household[g]);
  const update = (i: number, patch: Partial<AppState['special'][number]>) =>
    set((s) => ({ special: s.special.map((m, k) => (k === i ? { ...m, ...patch } : m)) }));
  const add = () => {
    const g = freeGroup();
    if (g) set((s) => ({ special: [...s.special, { group: g, diet: 'vegan' }] }));
  };
  return (
    <div className="mt-4">
      <p className="text-[13px] font-bold text-muted">أفراد بنظام غذائي خاص</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">العشاء واحد للجميع: تُفصل حصتهم قبل إضافة ما لا يأكلونه، ويُضاف لها بديل.</p>
      {sp.length > 0 && (
        <ul className="mt-2 space-y-2">
          {sp.map((m, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-line bg-sand/50 p-2">
              <select id={`sp-diet-${i}`} aria-label={`النظام الغذائي للفرد ${i + 1}`} value={m.diet} onChange={(e) => update(i, { diet: e.target.value as AppState['special'][number]['diet'] })}
                className="min-h-10 w-full min-w-0 rounded-xl border border-line bg-paper px-2 text-[14px] font-bold">
                {DIET_ORDER.map((d) => <option key={d} value={d}>{DIETS[d].label}</option>)}
              </select>
              <IconButton icon="x" label={`حذف الفرد ${i + 1} من النظام الخاص`} className="size-10 shrink-0"
                onClick={() => {
                  const before = state.special;
                  set((s) => ({ special: s.special.filter((_, k) => k !== i) }));
                  toast('حُذف الفرد من النظام الخاص.', { label: 'تراجع', run: () => set({ special: before }) });
                }} />
              <select id={`sp-group-${i}`} aria-label={`الفئة العمرية للفرد ${i + 1}`} value={m.group} onChange={(e) => update(i, { group: e.target.value as AgeGroup })}
                className="min-h-10 w-full rounded-xl border border-line bg-paper px-2 text-[14px]">
                {(['adults', 'teens', 'kids'] as AgeGroup[]).map((g) => (
                  <option key={g} value={g} disabled={g !== m.group && used(g, i) >= state.household[g]}>{GROUP_LABEL[g]}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      <button onClick={add} disabled={!freeGroup()}
        className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-teal/50 px-3 text-[14px] font-bold text-teal disabled:opacity-40">
        <span aria-hidden="true">+</span> إضافة فرد بنظام خاص
      </button>
    </div>
  );
}
