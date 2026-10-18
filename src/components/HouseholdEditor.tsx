import { arCount, num, PERSON, PORTION } from '../lib/format';
import { AGE_WEIGHTS, APPETITES, members, servings, type AppState } from '../lib/state';
import type { Store } from '../store';
import { IconButton } from './ui';

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
  const bump = (key: keyof AppState['household'], d: 1 | -1) =>
    set((s) => ({ household: { ...s.household, [key]: Math.max(0, s.household[key] + d) } }));

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
              className={`min-h-9 flex-1 rounded-full text-[13.5px] font-bold transition ${state.appetite === a ? 'bg-paper text-teal shadow-sm' : 'text-muted'}`}>
              {APPETITE_LABEL[a]} <span className="num text-[11px] font-medium">×{num(a, 2)}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">أوزان الحصص تقديرات للتخطيط لا توصيات غذائية؛ طفل دون 4 سنوات يمكن عدّه صفرًا أو طفلًا.</p>
    </div>
  );
}
