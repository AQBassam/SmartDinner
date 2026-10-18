import { useMemo, useState, type ReactNode } from 'react';
import { RECIPE, RECIPES, TAGS } from '../lib/data';
import { addDays, arCount, diffDays, fmtDate, fmtDateShort, fmtTime, fromMinutes, toMinutes } from '../lib/format';
import { buildIcs } from '../lib/ics';
import { minutesOf } from '../lib/schedule';
import { DEFAULT_TIMES, MAX_NIGHTS, members } from '../lib/state';
import type { AppState } from '../lib/state';
import { resizeNights, type Store } from '../store';
import { HouseholdEditor } from './HouseholdEditor';
import { ConflictBadge, hasConflict, recipeConflicts } from './shared';
import { RecipeImage } from './RecipeImage';
import { Badge, Button, Card, Icon, IconButton, SectionTitle, Sheet, download, useToast } from './ui';

interface Props { store: Store; today: string; openRecipe: (id: string) => void }

export function PlanTab({ store, today, openRecipe }: Props) {
  const { state, gen, set, days, events } = store;
  const toast = useToast();
  const [swapNight, setSwapNight] = useState<number | null>(null);
  const N = state.nights.length;
  const dayIdx = diffDays(today, state.startDate);
  const tonight = dayIdx >= 0 && dayIdx < N ? dayIdx : null;

  const move = (i: number, d: -1 | 1) => set((s) => {
    const n = [...s.nights];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return { nights: n };
  });

  const exportIcs = () => {
    const upcoming = events.filter((e) => e.date >= today);
    download('تذكيرات-العشاء.ics', buildIcs(upcoming), 'text/calendar;charset=utf-8');
    toast(`جُهّز ملف التقويم: ${arCount(upcoming.length, ['تذكير', 'تذكيران', 'تذكيرات', 'تذكيرًا'])}.`);
  };
  const setTime = (k: keyof typeof DEFAULT_TIMES, v: string) => v && set((s) => ({ times: { ...s.times, [k]: v } }));
  const count = (prefix: string) => events.filter((e) => e.date >= today && e.id.startsWith(prefix)).length;
  const t = state.times;
  const timeWarn = toMinutes(t.ask) < toMinutes(t.lunchEnd)
    ? 'تنبيه السؤال قبل انتهاء الغداء.'
    : toMinutes(t.prep) <= toMinutes(t.dinner)
      ? 'مهام الليلة يُفضّل أن تكون بعد العشاء.'
      : null;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ settings (folded: daily use starts at the nights) */}
      <details className="card group rounded-2xl border border-line bg-paper shadow-[var(--shadow-card)]">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4">
          <Icon name="users" className="size-5 text-teal" />
          <span className="flex-1">
            <span className="block text-[15px] font-extrabold">الأسرة ومدة الخطة</span>
            <span className="block text-[13px] text-muted">{arCount(members(state), ['فرد', 'فردان', 'أفراد', 'فردًا'])}، {arCount(N, ['ليلة', 'ليلتان', 'ليالٍ', 'ليلة'])} تبدأ {fmtDateShort(state.startDate)}</span>
          </span>
          <Icon name="down" className="size-4 text-muted transition group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4">
        <HouseholdEditor store={store} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="start" className="mb-1.5 block text-[13px] font-bold text-muted">تاريخ الليلة الأولى</label>
            <input id="start" type="date" value={state.startDate}
              onChange={(e) => e.target.value && set({ startDate: e.target.value })}
              className="w-full rounded-xl border border-line bg-paper px-3 text-[15px]" />
          </div>
        </div>
        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-bold text-muted">مدة الخطة</p>
          <div className="flex flex-wrap items-center gap-2">
            {[5, 7, 10, 15].map((n) => (
              <button key={n} onClick={() => set((s) => ({ nights: resizeNights(s.nights, n) }))}
                className={`min-h-10 rounded-full border px-4 text-[14px] font-bold ${N === n ? 'border-teal bg-teal text-white' : 'border-line bg-paper'}`}>
                <span className="num">{n}</span> ليالٍ
              </button>
            ))}
            <span className="ms-auto flex items-center gap-1">
              <IconButton icon="minus" label="ليلة أقل" disabled={N <= 1} onClick={() => set((s) => ({ nights: resizeNights(s.nights, N - 1) }))} />
              <span className="num w-6 text-center font-bold">{N}</span>
              <IconButton icon="plus" label="ليلة أكثر" disabled={N >= MAX_NIGHTS} onClick={() => set((s) => ({ nights: resizeNights(s.nights, N + 1) }))} />
            </span>
          </div>
        </div>
        </div>
      </details>

      {/* ------------------------------------------------ nights */}
      <div>
        <SectionTitle title="ليالي الخطة" hint="الترتيب يحدد مواعيد الشراء والإذابة. أي تبديل يعيد بناء قائمة التسوق تلقائيًا." />
        {state.nights.some((id) => hasConflict(recipeConflicts(RECIPE[id], state))) && (
          <p className="mb-3 flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-[13.5px] leading-relaxed text-danger">
            <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
            بعض ليالي الخطة تحتوي مسببات حساسية أو مكونات استبعدتها الأسرة. زر التبديل يقترح وصفات خالية منها أولًا.
          </p>
        )}
        <ol className="space-y-2.5">
          {state.nights.map((rid, i) => {
            const r = RECIPE[rid];
            const date = gen.nightDates[i];
            const isTonight = tonight === i;
            const past = dayIdx > i;
            const batchStart = i % 5 === 0;
            const tight = gen.needs.some((n) => n.night === i + 1 && n.storage === 'tight');
            const conflict = recipeConflicts(r, state);
            const eve = days.get(addDays(date, -1))?.evening.filter((x) => x.night === i + 1) ?? [];
            const ahead = minutesOf(eve.filter((x) => x.kind === 'prep'));
            const thaw = eve.some((x) => x.kind === 'thaw');
            return (
              <li key={`${i}-${rid}`}>
                {batchStart && (
                  <div className="mb-2 mt-5 flex items-center gap-2 px-1 text-[13px] font-bold text-copper first:mt-0">
                    <span className="emoji" aria-hidden="true">🛒</span> تسوق {fmtDate(addDays(state.startDate, i - 1))}
                    <span className="h-px flex-1 bg-copper/25" />
                  </div>
                )}
                <Card className={`flex items-center gap-3 p-3 ${isTonight ? 'border-saffron ring-2 ring-saffron/60' : ''} ${past ? 'opacity-60' : ''}`}>
                  <button className="dish-card shrink-0" onClick={() => openRecipe(rid)} tabIndex={-1} aria-hidden="true">
                    <RecipeImage recipe={r} className="h-16 w-20 rounded-xl" plateSize={46} />
                  </button>
                  <button className="min-w-0 flex-1 text-start" onClick={() => openRecipe(rid)}>
                    <div className={`text-[12.5px] font-bold ${isTonight ? 'text-copper' : 'text-muted'}`}>{isTonight ? 'الليلة' : fmtDateShort(date)}</div>
                    <div className="truncate text-[15.5px] font-bold">{r.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge icon="clock"><span className="num">{r.total}</span> د</Badge>
                      {ahead > 0 && <Badge tone="ice" icon="snow">تجهيز مسبق <span className="num">{ahead}</span> د</Badge>}
                      {!ahead && thaw && <Badge tone="ice" icon="snow">إذابة مسبقة</Badge>}
                      {r.tags.slice(0, 1).map((tg) => <Badge key={tg} tone={tg === 'emergency' ? 'copper' : 'teal'}>{TAGS[tg]}</Badge>)}
                      {tight && <Badge tone="warn" icon="alert">مكوّن قد يذبل</Badge>}
                      <ConflictBadge c={conflict} />
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col items-center sm:flex-row">
                    <IconButton icon="swap" label={`تبديل وجبة الليلة ${i + 1}`} onClick={() => setSwapNight(i)} />
                    <div className="flex">
                      <IconButton icon="up" label="تقديم" disabled={i === 0} onClick={() => move(i, -1)} className="size-8" />
                      <IconButton icon="down" label="تأخير" disabled={i === N - 1} onClick={() => move(i, 1)} className="size-8" />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ------------------------------------------------ family times + calendar */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ice-soft text-ice"><Icon name="clock" /></span>
          <div className="flex-1">
            <h3 className="text-[16px] font-extrabold">أوقات الأسرة</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">منها يُحسب موعد بدء الطهي لكل وصفة، وتوقيت التذكيرات.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TimeField id="t-lunch" label="ينتهي الغداء" value={t.lunchEnd} onChange={(v) => setTime('lunchEnd', v)} />
          <TimeField id="t-ask" label="تذكير عشاء الليلة" value={t.ask} onChange={(v) => setTime('ask', v)} />
          <TimeField id="t-dinner" label="موعد العشاء" value={t.dinner} onChange={(v) => setTime('dinner', v)} />
          <TimeField id="t-prep" label="مهام الليلة (تجهيز الغد)" value={t.prep} onChange={(v) => setTime('prep', v)} />
          <TimeField id="t-shop" label="موعد التسوق" value={state.shopTime} onChange={(v) => v && set({ shopTime: v })} />
        </div>
        {timeWarn && <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">{timeWarn}</p>}
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          مثال: صينية الدجاج (<span className="num">{RECIPE.chicken_tray.total}</span> د) يبدأ طهيها <span className="num">{fmtTime(fromMinutes(toMinutes(t.dinner) - RECIPE.chicken_tray.total))}</span>، والفول (<span className="num">{RECIPE.foul.total}</span> د) <span className="num">{fmtTime(fromMinutes(toMinutes(t.dinner) - RECIPE.foul.total))}</span>.
        </p>
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[14px] font-bold">التذكيرات في تقويم الهاتف</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            ملف واحد يضيف {arCount(count('tonight-'), ['تذكير عشاء', 'تذكيري عشاء', 'تذكيرات عشاء', 'تذكير عشاء'])} و{arCount(count('prep-'), ['تذكير مهام ليلية', 'تذكيري مهام ليلية', 'تذكيرات مهام ليلية', 'تذكير مهام ليلية'])} و{arCount(count('shop-'), ['موعد تسوق', 'موعدي تسوق', 'مواعيد تسوق', 'موعد تسوق'])}، كلٌّ بتنبيه ونص المهام كاملًا. يعمل والموقع مغلق.
          </p>
          <Button variant="primary" icon="download" className="mt-3 w-full" onClick={exportIcs}>تنزيل التذكيرات (.ics)</Button>
          <p className="mt-2 text-[12.5px] text-muted">عند تغيير الخطة أو الأوقات يُنزَّل الملف من جديد؛ الأحداث القديمة تُستبدل لأنها تحمل المعرّفات نفسها.</p>
        </div>
      </Card>

      <RecipePicker
        open={swapNight !== null}
        title={swapNight !== null ? `وجبة الليلة ${swapNight + 1} · ${fmtDate(gen.nightDates[swapNight] ?? state.startDate)}` : ''}
        current={swapNight !== null ? state.nights[swapNight] : undefined}
        used={state.nights}
        state={state}
        onClose={() => setSwapNight(null)}
        onPick={(id) => {
          const i = swapNight!;
          set((s) => { const n = [...s.nights]; n[i] = id; return { nights: n }; });
          setSwapNight(null);
          toast(`الليلة ${i + 1}: ${RECIPE[id].title}. حُدّثت قائمة التسوق.`);
        }}
      />
    </div>
  );
}

export function RecipePicker({ open, title, current, used, state, onPick, onClose }:
  { open: boolean; title: string; current?: string; used: string[]; state: AppState; onPick: (id: string) => void; onClose: () => void }) {
  const [tag, setTag] = useState<string | null>(null);
  const list = useMemo(() => {
    const score = (id: string) => (hasConflict(recipeConflicts(RECIPE[id], state)) ? 2 : 0) - (state.favorites.includes(id) ? 1 : 0);
    return RECIPES.filter((r) => !tag || r.tags.includes(tag)).sort((a, b) => score(a.id) - score(b.id));
  }, [tag, state]);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="scroll-x -mx-4 mb-3 flex gap-2 px-4">
        <Chip active={!tag} onClick={() => setTag(null)}>الكل</Chip>
        {Object.entries(TAGS).map(([k, v]) => <Chip key={k} active={tag === k} onClick={() => setTag(k)}>{v}</Chip>)}
      </div>
      <ul className="space-y-2">
        {list.map((r) => {
          const count = used.filter((u) => u === r.id).length;
          return (
            <li key={r.id}>
              <button onClick={() => onPick(r.id)} disabled={r.id === current}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-paper p-3 text-start disabled:border-teal disabled:bg-teal-soft">
                <RecipeImage recipe={r} className="h-14 w-[72px] shrink-0 rounded-xl" plateSize={42} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{state.favorites.includes(r.id) && <span className="text-copper" aria-label="مفضلة">★ </span>}{r.title}</div>
                  <div className="truncate text-[13px] text-muted">{r.subtitle}</div>
                  <div className="mt-1"><ConflictBadge c={recipeConflicts(r, state)} /></div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge icon="clock"><span className="num">{r.total}</span> د</Badge>
                  {r.id === current ? <Badge tone="teal">الحالية</Badge> : count > 0 && <Badge tone="copper">في الخطة ×<span className="num">{count}</span></Badge>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-bold transition ${active ? 'border-teal bg-teal text-white' : 'border-line bg-paper text-ink'}`}>
      {children}
    </button>
  );
}


function TimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-bold text-muted">{label}</label>
      <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)}
        className="num block min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-[15px]" />
    </div>
  );
}
