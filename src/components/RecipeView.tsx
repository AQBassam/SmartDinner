import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ALLERGENS, ING, RECIPE, recipeAllergens, TAGS, type Recipe } from '../lib/data';
import { dishCost, scaledQty } from '../lib/engine';
import { arCount, diffDays, fmtDateShort, fmtQty, num, omr, PERSON, PORTION, todayISO } from '../lib/format';
import { members, servings } from '../lib/state';
import type { Store } from '../store';
import { hasConflict, recipeConflicts } from './shared';
import { applyEmergency } from '../lib/schedule';
import { MAX_NIGHTS } from '../lib/state';
import { HouseholdEditor } from './HouseholdEditor';
import { RecipeImage } from './RecipeImage';
import { Badge, Button, Checkbox, Icon, IconButton, Sheet, Switch, useToast } from './ui';
import { DietFitLine, nightPlan, SpecialPortion, stepsWithSplit, cleanName } from './Diet';
import type { NightPlan } from '../lib/diet';

/** Quantities for the shared dish; with special members, an animal item is only for those who eat it. */
export function ingredientRows(r: Recipe, sv: number, optionalOff: string[] = [], np?: NightPlan) {
  const off = new Set(optionalOff);
  return r.items.map((it) => {
    const ing = ING[it.i];
    const who = np ? (np.eaters[it.i] ?? np.base) : sv;
    return {
      ing, opt: !!it.opt, off: !!it.opt && off.has(`${r.id}:${it.i}`), note: it.note,
      text: who <= 0 ? '—' : fmtQty(ing, it.q === undefined ? undefined : scaledQty(ing, it.q, who)),
    };
  });
}

const shortName = (n: string) => n.replace(/\s*\((مجمدة?|صدور مجمدة|أفخاذ مجمدة|طازج|معلب[^)]*|علبة[^)]*|متبل|حسب الاختيار)\)$/, '');

export function RecipeSheet({ store, recipeId, kitchenFirst = false, onClose }: { store: Store; recipeId: string | null; kitchenFirst?: boolean; onClose: () => void }) {
  const r = recipeId ? RECIPE[recipeId] : null;
  const toast = useToast();
  const [kitchen, setKitchen] = useState(false);
  const [got, setGot] = useState<Record<string, boolean>>({});
  useEffect(() => { setGot({}); setKitchen(kitchenFirst && !!recipeId); }, [recipeId, kitchenFirst]);
  if (!r) return null;
  const { state, set } = store;
  const sv = servings(state);
  const np = nightPlan(state, r.id);
  const rows = ingredientRows(r, sv, state.optionalOff, np);
  const steps = stepsWithSplit(r, np);
  const nights = state.nights.map((id, i) => (id === r.id ? i : -1)).filter((i) => i >= 0);
  const allergens = recipeAllergens(r, new Set(state.optionalOff));
  const conflict = recipeConflicts(r, state);
  const fav = state.favorites.includes(r.id);
  const dc = dishCost(r.id, { servings: sv, optionalOff: state.optionalOff, priceBook: state.priceBook, storeMode: state.storeMode, today: todayISO() });
  const costKnown = dc.items > 0 && dc.priced / dc.items >= 0.8;
  const hands = r.total - r.active;
  const toggleOpt = (ingId: string, on: boolean) => set((s) => {
    const key = `${r.id}:${ingId}`;
    const rest = s.optionalOff.filter((k) => k !== key);
    return { optionalOff: on ? rest : [...rest, key] };
  });

  return (
    <>
      <Sheet open={!!r && !kitchen} onClose={onClose} title={r.title} wide>
        <RecipeImage recipe={r} variant="hero" priority sizes="(min-width: 640px) 680px, 100vw" className="aspect-[4/3] rounded-2xl sm:aspect-[16/9]" />
        <div className="mt-3 flex items-start gap-3">
          <p className="flex-1 text-[15px] leading-relaxed text-ink/80">{r.subtitle}</p>
          <button onClick={() => { set((s) => ({ favorites: fav ? s.favorites.filter((x) => x !== r.id) : [...s.favorites, r.id] })); toast(fav ? 'أُزيلت من المفضلة.' : 'أُضيفت إلى المفضلة.'); }}
            aria-pressed={fav} className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border px-3 text-[14px] font-bold ${fav ? 'border-copper/40 bg-copper-soft text-copper' : 'border-line bg-paper text-muted'}`}>
            {fav ? '★' : '☆'} مفضلة
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Fact label="عمل فعلي" value={`${r.active} د`} />
          <Fact label="الوقت الإجمالي" value={`${r.total} د`} />
          <Fact label="الحصص" value={num(sv, 1)} />
          <Fact label="تكلفة تقديرية" value={costKnown ? omr(dc.cost) : 'غير متاحة'} />
        </dl>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {hands > 0 ? <>منها <span className="num">{hands}</span> د طهي أو انتظار دون وقوف في المطبخ. </> : 'كل وقتها عمل باليد. '}
          {costKnown
            ? <>التكلفة لعشاء واحد بحصص أسرتك، بأسعار الخطة{dc.priced < dc.items ? ` (${dc.priced} من ${dc.items} مكوّنًا مسعّرة)` : ''}؛ دون التوابل والزيت.</>
            : 'التكلفة غير متاحة لأن أسعار بعض المكونات غير مسجلة.'}
        </p>

        {hasConflict(conflict) ? (
          <div className="mt-3 flex gap-2 rounded-2xl bg-danger-soft p-3 text-[14px] leading-relaxed text-danger">
            <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
            <span>تحتوي هذه الوجبة ما استبعدته الأسرة: <b>{[...conflict.allergens.map((a) => ALLERGENS[a]), ...conflict.ingredients].join('، ')}</b>. يُراجَع كل مكوّن وملصقه قبل الطهي.</span>
          </div>
        ) : allergens.contains.length > 0 || allergens.may.length > 0 ? (
          <p className="mt-3 flex gap-2 rounded-2xl bg-warn-soft p-3 text-[13.5px] leading-relaxed text-warn">
            <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
            <span>
              {allergens.contains.length > 0 && <>يحتوي: <b>{allergens.contains.map((a) => ALLERGENS[a]).join('، ')}</b>. </>}
              {allergens.may.length > 0 && <>قد يحتوي حسب المنتج: {allergens.may.map((a) => ALLERGENS[a]).join('، ')}.</>}
            </span>
          </p>
        ) : (
          <p className="mt-3 flex gap-2 rounded-2xl bg-teal-soft p-3 text-[13.5px] leading-relaxed text-teal-deep">
            <Icon name="check" className="mt-0.5 size-5 shrink-0" />
            <span>لا تحتوي مكوناتها مسببات الحساسية الشائعة المسجلة في الدليل.</span>
          </p>
        )}

        <DietFitLine recipe={r} state={state} />

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" icon="chef" className="min-w-[60%] flex-1" onClick={() => setKitchen(true)}>ابدأ التحضير خطوة بخطوة</Button>
          <PlanAction store={store} recipeId={r.id} />
        </div>
        {nights.length > 0 && (
          <p className="mt-2 text-[13.5px] text-teal-deep">
            في خطتك: {nights.map((i) => fmtDateShort(store.gen.nightDates[i])).join('، ')}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.tags.map((t) => <Badge key={t}>{TAGS[t]}</Badge>)}
        </div>

        <h4 className="mt-6 mb-2 flex items-baseline justify-between text-[16px] font-extrabold">
          المقادير <span className="text-[13px] font-medium text-muted"><span className="num">{arCount(members(state), PERSON)}</span> · <span className="num">{arCount(sv, PORTION)}</span></span>
        </h4>
        <details className="group mb-2 rounded-2xl border border-line bg-paper">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 text-[14px] font-bold text-teal">
            <Icon name="users" className="size-[18px]" />
            <span className="flex-1">تعديل الحصص</span>
            <Icon name="down" className="size-4 text-muted transition group-open:rotate-180" />
          </summary>
          <div className="px-3.5 pb-3.5">
            <p className="mb-2 text-[12.5px] leading-relaxed text-muted">الحصص تتبع أفراد الأسرة وشهيتهم، فتتغير معها المقادير هنا وكميات قائمة التسوق للخطة كلها.</p>
            <HouseholdEditor store={store} />
          </div>
        </details>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-paper">
          {rows.map(({ ing, opt, off, note, text }) => (
            <li key={ing.id} className={`flex items-center gap-3 px-3 py-2.5 ${off ? 'opacity-50' : ''}`}>
              <Checkbox checked={!!got[ing.id]} label={ing.name} onChange={(v) => setGot((g) => ({ ...g, [ing.id]: v }))} />
              <span className={`min-w-0 flex-1 text-[15px] ${got[ing.id] ? 'text-muted line-through' : ''}`}>
                {shortName(ing.name)}
                {opt && <span className="ms-1 text-[12px] text-muted">(اختياري)</span>}
                {note && <span className="block text-[12.5px] text-muted">{note}</span>}
              </span>
              <span className="shrink-0 text-[14px] font-bold text-teal-deep">{text}</span>
            </li>
          ))}
        </ul>
        <SpecialPortion recipe={r} np={np} />
        {rows.some((x) => x.opt) && (
          <div className="mt-2 rounded-2xl border border-line bg-paper px-3 py-1">
            {rows.filter((x) => x.opt).map((x) => (
              <Switch key={x.ing.id} checked={!x.off} onChange={(v) => toggleOpt(x.ing.id, v)} label={`إضافة ${shortName(x.ing.name)} إلى قائمة التسوق`} />
            ))}
          </div>
        )}

        <h4 className="mt-6 mb-2 text-[16px] font-extrabold">الطريقة</h4>
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className={`flex gap-3 rounded-2xl border p-3 ${s.special ? 'border-saffron/70 bg-saffron-soft/50' : 'border-line bg-paper'}`}>
              <span className={`num grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${s.special ? 'bg-saffron text-ink' : 'bg-teal-soft text-teal-deep'}`}>{i + 1}</span>
              <div className="flex-1 text-[15px] leading-relaxed">
                {s.special && <b className="block text-[13px] text-copper">الحصة الخاصة</b>}
                {s.t}
                {s.min && <span className="ms-2 inline-flex"><Badge icon="timer"><span className="num">{s.min}</span> د</Badge></span>}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 space-y-2">
          {r.prep.length > 0 && (
            <More title={`التجهيز المسبق: ${r.prep.reduce((x, p) => x + p.min, 0)} دقيقة خارج وقت العشاء`} icon="snow" open>
              <ul className="space-y-2">
                {np.splitMembers > 0 && r.split?.prep && (
                  <li><span className="me-1.5 rounded-full bg-saffron-soft px-2 py-0.5 text-[12px] font-bold text-copper">للحصة الخاصة</span>{r.split.prep}</li>
                )}
                {r.prep.map((p, i) => (
                  <li key={i}>
                    <span className="me-1.5 rounded-full bg-ice-soft px-2 py-0.5 text-[12px] font-bold text-ice">{PREP_WHEN[p.when]}، <span className="num">{p.min}</span> د</span>
                    {p.t}
                    {p.note && <span className="block text-[12.5px] text-muted">{p.note}</span>}
                  </li>
                ))}
              </ul>
            </More>
          )}
          {r.tips.length > 0 && <More title="لتوفير الوقت" icon="info">{r.tips.length === 1 ? r.tips[0] : <ul className="list-disc space-y-1 ps-5">{r.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}</More>}
          {r.safety && <More title="سلامة الغذاء" icon="alert" open>{r.safety}</More>}
          <More title="الأدوات" icon="chef">{r.tools.join('، ')}</More>
        </div>
        <p className="mt-4 text-[12px] text-muted">المكونات المصنّعة تختلف بين العلامات؛ الملصق هو المرجع عند وجود حساسية.</p>
      </Sheet>
      {kitchen && <KitchenMode recipe={r} sv={sv} optionalOff={state.optionalOff} np={np} onClose={() => setKitchen(false)} />}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-sand-2/70 px-2 py-2">
      <dt className="text-[12px] font-bold text-muted">{label}</dt>
      <dd className="num text-[16px] font-extrabold">{value}</dd>
    </div>
  );
}

function More({ title, icon, open = false, children }: { title: string; icon: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-paper">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3.5 text-[14.5px] font-extrabold">
        <Icon name={icon} className="size-5 text-teal" />
        <span className="flex-1">{title}</span>
        <Icon name="down" className="size-4 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="px-3.5 pb-3.5 text-[14px] leading-relaxed">{children}</div>
    </details>
  );
}

/** Put this dish on the plan: tonight (tonight's dish moves to tomorrow) or at the end. */
function PlanAction({ store, recipeId }: { store: Store; recipeId: string }) {
  const toast = useToast();
  const { state, set } = store;
  const idx = diffDays(todayISO(), state.startDate);
  const tonight = idx >= 0 && idx < state.nights.length ? idx : null;
  if (tonight !== null && state.nights[tonight] === recipeId) return null;
  if (tonight !== null) {
    return (
      <Button variant="outline" onClick={() => {
        const moved = RECIPE[state.nights[tonight]].title;
        const before = state.nights;
        set((s) => ({ nights: applyEmergency(s.nights, tonight, recipeId, MAX_NIGHTS) }));
        toast(`صارت عشاء الليلة. ${moved} غدًا.`, { label: 'تراجع', run: () => set({ nights: before }) });
      }}>اجعلها عشاء الليلة</Button>
    );
  }
  if (state.nights.length >= MAX_NIGHTS) {
    return <p className="self-center text-[13px] text-muted">الخطة في حدها الأقصى ({MAX_NIGHTS} ليلة)؛ تُبدَّل بها وجبة من تبويب الخطة.</p>;
  }
  return (
    <Button variant="outline" onClick={() => {
      const before = state.nights;
      set((s) => ({ nights: [...s.nights, recipeId] }));
      toast('أُضيفت إلى آخر الخطة.', { label: 'تراجع', run: () => set({ nights: before }) });
    }}>أضف إلى الخطة</Button>
  );
}


const PREP_WHEN = { shopDay: 'يوم التسوق', evening: 'الليلة السابقة', afternoon: 'بعد الغداء' } as const;


// ---------------------------------------------------------------- kitchen mode
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* no audio */ }
  navigator.vibrate?.([300, 150, 300]);
}

function KitchenMode({ recipe, sv, optionalOff, np, onClose }: { recipe: Recipe; sv: number; optionalOff: string[]; np: NightPlan; onClose: () => void }) {
  const [i, setI] = useState(-1); // -1 = ingredients screen
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [wake, setWake] = useState<'on' | 'off' | 'na'>('off');
  const lock = useRef<WakeLockSentinel | null>(null);
  const rows = ingredientRows(recipe, sv, optionalOff, np).filter((x) => !x.off);
  const steps = stepsWithSplit(recipe, np);
  const subs = np.subs.filter((x) => x.to);
  const step = i >= 0 ? steps[i] : null;

  useEffect(() => {
    const req = async () => {
      if (!('wakeLock' in navigator)) { setWake('na'); return; }
      try { lock.current = await navigator.wakeLock.request('screen'); setWake('on'); } catch { setWake('off'); }
    };
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setI((x) => Math.min(steps.length - 1, x + 1));
      if (e.key === 'ArrowRight') setI((x) => Math.max(-1, x - 1));
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lock.current?.release().catch(() => {});
    };
  }, [onClose, steps.length]);

  useEffect(() => {
    if (endsAt === null) return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= endsAt) { beep(); setEndsAt(null); }
    }, 250);
    return () => window.clearInterval(t);
  }, [endsAt]);

  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className="on-dark no-print fixed inset-0 z-[70] flex flex-col bg-teal-deep text-white" role="dialog" aria-modal="true" aria-label={`وضع المطبخ: ${recipe.title}`}>
      <div className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <IconButton icon="x" label="خروج من وضع المطبخ" onClick={onClose} className="text-white hover:bg-white/10 hover:text-white" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{recipe.title}</p>
          <p className="text-[12px] text-white/70">{wake === 'on' ? 'الشاشة ستبقى مضاءة' : wake === 'na' ? 'المتصفح لا يدعم إبقاء الشاشة مضاءة' : ''}</p>
        </div>
        <span className="num text-[14px] text-white/80">{i < 0 ? 'المقادير' : `${i + 1}/${steps.length}`}</span>
      </div>
      <div className="mx-4 mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full bg-teal-bright transition-all" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {i < 0 ? (
          <>
            <h2 className="mb-4 text-[22px] font-extrabold">المقادير لـ<span className="num">{arCount(sv, PORTION)}</span></h2>
            <ul className="space-y-2 text-[20px] leading-snug">
              {rows.map(({ ing, text, opt }) => (
                <li key={ing.id} className="flex justify-between gap-3 border-b border-white/10 pb-2">
                  <span>{ing.name.replace(/\s*\(.*\)$/, '')}{opt ? ' (اختياري)' : ''}</span>
                  <span className="shrink-0 font-bold text-[#9fe3ef]">{text}</span>
                </li>
              ))}
            </ul>
            {subs.length > 0 && (
              <>
                <h3 className="mt-6 mb-3 text-[18px] font-extrabold text-[#f3d27f]">للحصة الخاصة</h3>
                <ul className="space-y-2 text-[19px] leading-snug">
                  {subs.map((x) => (
                    <li key={`${x.from}:${x.to!.i}`} className="flex justify-between gap-3 border-b border-white/10 pb-2">
                      <span>{cleanName(ING[x.to!.i].name)}</span>
                      <span className="shrink-0 font-bold text-[#9fe3ef]">{fmtQty(ING[x.to!.i], x.to!.q * x.servings / 5)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <>
            {step!.special && <p className="mb-2 text-[16px] font-extrabold text-[#f3d27f]">الحصة الخاصة</p>}
            <p className="text-[26px] font-bold leading-[1.7] sm:text-[30px]">{step!.t}</p>
          </>
        )}
      </div>

      {(endsAt !== null || step?.min) && (
        <div className="px-5 pb-3">
          {endsAt ? (
            <button onClick={() => setEndsAt(null)} className="flex w-full items-center justify-between rounded-2xl bg-white/10 px-5 py-4">
              <span className="text-[15px]">إيقاف المؤقت</span>
              <span className="num text-[34px] font-extrabold">{mm}:{ss}</span>
            </button>
          ) : (
            <button onClick={() => { setNow(Date.now()); setEndsAt(Date.now() + step!.min! * 60_000); }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-copper px-5 py-4 text-[18px] font-extrabold">
              <Icon name="timer" /> مؤقت <span className="num">{step!.min}</span> دقيقة
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button disabled={i < 0} onClick={() => setI(i - 1)} className="min-h-16 rounded-2xl bg-white/10 text-[18px] font-bold disabled:opacity-30">السابق</button>
        {i < steps.length - 1
          ? <button onClick={() => setI(i + 1)} className="min-h-16 rounded-2xl bg-white text-[18px] font-extrabold text-teal-deep">{i < 0 ? 'ابدأ الطهي' : 'التالي'}</button>
          : <button onClick={onClose} className="min-h-16 rounded-2xl bg-white text-[18px] font-extrabold text-teal-deep">بالهناء والعافية ✓</button>}
      </div>
    </div>
  );
}
