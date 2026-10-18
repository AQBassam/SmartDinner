import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TabId } from '../App';
import { RECIPE, RECIPES } from '../lib/data';
import { needsBuying } from '../lib/engine';
import { addDays, arCount, diffDays, fmtDate, fmtTime, omr, relDay, toMinutes } from '../lib/format';
import { applyEmergency, emergencyOptions, minutesOf, type DayTask } from '../lib/schedule';
import { MAX_NIGHTS } from '../lib/state';
import { togglePrep, type Store } from '../store';
import { RecipeImage } from './RecipeImage';
import { MOODS, RecipeCard, type RecipePreset } from './RecipesTab';
import { Badge, Button, Glyph, Icon, Plate, Sheet, useToast } from './ui';

interface Props { store: Store; today: string; openRecipe: (id: string) => void; cook: (id: string) => void; go: (t: TabId) => void; browse: (p?: RecipePreset) => void }

function useNowMinutes(): number {
  const read = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const t = window.setInterval(() => setNow(read()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const mins = (n: number) => arCount(n, ['دقيقة', 'دقيقتان', 'دقائق', 'دقيقة']);
function duration(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hs = h ? arCount(h, ['ساعة', 'ساعتان', 'ساعات', 'ساعة']) : '';
  return [hs, r ? mins(r) : ''].filter(Boolean).join(' و');
}

const KIND: Record<DayTask['kind'], { emoji: string; bg: string }> = {
  thaw: { emoji: '❄️', bg: 'var(--color-ice-soft)' },
  prep: { emoji: '🔪', bg: 'var(--color-teal-soft)' },
  portion: { emoji: '🛍️', bg: 'var(--color-saffron-soft)' },
  wash: { emoji: '💧', bg: '#e3f0f7' },
};

const weekdayShort = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { weekday: 'long', timeZone: 'UTC' });

export function TodayTab({ store, today, openRecipe, cook, go, browse }: Props) {
  const { state, gen, days, set } = store;
  const toast = useToast();
  const now = useNowMinutes();
  const [sosOpen, setSosOpen] = useState(false);
  const [forgot, setForgot] = useState(false);

  const day = days.get(today);
  const yesterday = addDays(today, -1);
  const N = state.nights.length;
  const dayIdx = diffDays(today, state.startDate);
  const ended = dayIdx >= N;
  const tonight = day?.tonight ?? null;
  const tonightR = tonight ? RECIPE[tonight.recipeId] : null;
  const tomorrowR = day?.tomorrow ? RECIPE[day.tomorrow.recipeId] : null;
  const done = (t: DayTask) => !!state.prepDone[t.key];
  const toggle = (t: DayTask) => set((s) => ({ prepDone: togglePrep(s.prepDone, t.key, today) }));

  const readyTasks = useMemo(
    () => (tonight ? (days.get(yesterday)?.evening ?? []).filter((t) => t.night === tonight.night) : []),
    [days, yesterday, tonight],
  );
  const missedThaw = readyTasks.filter((t) => t.kind === 'thaw' && !done(t));
  const shopBatch = day?.shopBatch !== null && day?.shopBatch !== undefined ? gen.batches[day.shopBatch] : null;
  const nextShop = gen.batches.find((b) => b.date > today);
  const options = tonight ? emergencyOptions(state.nights, tonight.night - 1) : [];

  // ---------------------------------------------------------------- the day's sections, in time order
  type Section = { id: string; time: string; node: ReactNode };
  const sections: Section[] = [];
  if (shopBatch) {
    const toBuy = shopBatch.lines.filter(needsBuying);
    sections.push({
      id: 'shop', time: state.shopTime,
      node: (
        <Group time={state.shopTime} lead={<Glyph emoji="🛒" bg="var(--color-saffron-soft)" size={44} />}
          title="التسوق اليوم" sub={`${arCount(toBuy.length, ['صنف', 'صنفان', 'أصناف', 'صنفًا'])} لعشاءات ${relRange(shopBatch.firstNight, shopBatch.lastNight)}`}>
          <button onClick={() => go('shop')} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-saffron-soft px-4 py-3 text-start">
            <span>
              <span className="block text-[15px] font-bold">قائمة التسوق</span>
              <span className="block text-[13px] text-muted">مرتبة حسب أقسام المتجر</span>
            </span>
            <span className="num text-[17px] font-extrabold text-copper">{omr(shopBatch.total)}</span>
          </button>
          {day!.shop.length > 0 && (
            <>
              <p className="mt-4 mb-2 text-[14px] font-bold">بعد العودة من التسوق <span className="font-medium text-muted">({mins(minutesOf(day!.shop))})</span></p>
              <p className="mb-2 text-[13px] leading-relaxed text-muted">حتى لا تحتاج اللحوم والخضار تقسيمًا أو غسلًا في أيام الطبخ.</p>
              <TaskList tasks={day!.shop} done={done} toggle={toggle} showDishes />
            </>
          )}
        </Group>
      ),
    });
  }
  if (tonightR && day!.afternoon.length > 0) {
    sections.push({
      id: 'ask', time: state.times.ask,
      node: (
        <Group time={state.times.ask} lead={<Plate emoji={tonightR.emoji} tint={tonightR.tint} size={44} />}
          title={`بعد الغداء، لـ${tonightR.title}`} sub={`${mins(minutesOf(day!.afternoon))} الآن تختصر وقت الطهي`}>
          <TaskList tasks={day!.afternoon} done={done} toggle={toggle} />
        </Group>
      ),
    });
  }
  if (day && tomorrowR) {
    const ahead = minutesOf(day.evening.filter((t) => t.kind === 'prep'));
    sections.push({
      id: 'prep', time: state.times.prep,
      node: (
        <Group time={state.times.prep} lead={<Plate emoji={tomorrowR.emoji} tint={tomorrowR.tint} size={44} />}
          title={`جهّز الليلة لعشاء الغد: ${tomorrowR.title}`}
          sub={day.evening.length === 0
            ? 'لا يحتاج تجهيزًا مسبقًا'
            : ahead > 0
              ? `${mins(minutesOf(day.evening))} مع تجهيز غداء الغد، توفّر ${mins(ahead)} وقت العشاء غدًا`
              : `${mins(minutesOf(day.evening))} مع تجهيز غداء الغد`}
          action={<button className="text-[13px] font-bold text-teal underline" onClick={() => openRecipe(tomorrowR.id)}>الوصفة</button>}>
          <TaskList tasks={day.evening} done={done} toggle={toggle} />
        </Group>
      ),
    });
  }
  sections.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  let current = -1;
  sections.forEach((s, i) => { if (toMinutes(s.time) <= now) current = i; });

  const pickEmergency = (rid: string) => {
    if (!tonight) return;
    const idx = tonight.night - 1;
    const moved = state.nights[idx];
    set((s) => {
      const nights = applyEmergency(s.nights, idx, rid, MAX_NIGHTS);
      let prepDone = s.prepDone;
      for (const t of readyTasks) {
        const nextKey = `${today}:${t.id.replace(`-${tonight.night}-`, `-${tonight.night + 1}-`)}`;
        if (s.prepDone[t.key] && !prepDone[nextKey]) prepDone = togglePrep(prepDone, nextKey, today);
      }
      return { nights, prepDone };
    });
    setSosOpen(false);
    setForgot(false);
    toast(`الليلة: ${RECIPE[rid].title}. ${RECIPE[moved].title} غدًا.`);
  };

  // the next dinners after tonight, and dishes worth trying that are not in the plan
  const upcoming = state.nights.map((rid, i) => ({ rid, night: i + 1, date: gen.nightDates[i] })).filter((x) => x.date > today).slice(0, 3);
  const inPlan = new Set(state.nights);
  const suggestions = [
    ...RECIPES.filter((r) => state.favorites.includes(r.id) && !inPlan.has(r.id)),
    ...RECIPES.filter((r) => !inPlan.has(r.id) && !state.favorites.includes(r.id)),
    ...RECIPES.filter((r) => inPlan.has(r.id) && r.id !== tonight?.recipeId && !upcoming.some((u) => u.rid === r.id)),
  ].slice(0, 4);

  // what tonight still needs from the shop
  const missing = tonight ? (() => {
    const ids = new Set(gen.needs.filter((n) => n.night === tonight.night).map((n) => n.ingId));
    const b = gen.batches[Math.floor((tonight.night - 1) / 5)];
    return b ? b.lines.filter((l) => ids.has(l.ing.id) && needsBuying(l) && !state.checked[l.key]).length : 0;
  })() : 0;

  const heroR = tonightR ?? (!ended ? RECIPE[state.nights[0]] : null);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
        {/* ================================================ main column */}
        <div className="space-y-6">
          {/* ------------------------------------------------ tonight */}
          <section key={heroR?.id ?? 'none'} className="rise overflow-hidden rounded-[28px] border border-line bg-paper shadow-[var(--shadow-card)] md:grid md:grid-cols-2">
            {heroR ? (
              <>
                <button onClick={() => openRecipe(heroR.id)} className="dish-card block w-full md:order-2" aria-label={`صورة ${heroR.title}`}>
                  <RecipeImage recipe={heroR} variant="hero" priority className="aspect-[3/2] md:aspect-auto md:h-full md:min-h-[340px]" />
                </button>
                <div className="flex flex-col p-5 md:order-1 md:p-7">
                  <p className="flex items-center gap-2 text-[14px] font-bold text-copper">
                    <span className="size-2 rounded-full bg-saffron" aria-hidden="true" />
                    {tonightR ? 'عشاء الليلة' : `أول عشاء في خطتك ${relDay(state.startDate, today)}`}
                  </p>
                  <h2 className="mt-1.5 text-[26px] font-extrabold leading-[1.25] md:text-[30px]">{heroR.title}</h2>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink/75">{heroR.subtitle}</p>
                  {tonight && tonightR ? (
                    <>
                      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <Fact label="ابدأ الطهي" value={fmtTime(tonight.start)} />
                        <Fact label="العشاء" value={fmtTime(state.times.dinner)} />
                        <Fact label="عمل فعلي" value={`${tonightR.active} د`} />
                      </dl>
                      <p className="mt-3 text-[14px] font-medium">{cookLine(now, tonight.start, state.times.dinner, state.times.prep)}</p>
                      <p className="mt-1 text-[13px] text-muted">
                        {missing > 0
                          ? <>ينقص {arCount(missing, ['مكوّن', 'مكوّنان', 'مكوّنات', 'مكوّنًا'])} في <button className="font-bold text-teal underline" onClick={() => go('shop')}>قائمة التسوق</button>.</>
                          : 'مكوناتها كلها في البيت حسب قائمة التسوق.'}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2 pt-4">
                        <Button variant="primary" icon="chef" className="flex-1" onClick={() => cook(tonightR.id)}>ابدأ التحضير</Button>
                        <Button variant="outline" onClick={() => openRecipe(tonightR.id)}>عرض الوصفة</Button>
                      </div>
                      {options.length > 0 && (
                        <button onClick={() => setSosOpen(true)}
                          className="mt-3 inline-flex items-center gap-2 self-start rounded-full bg-tomato-soft px-3.5 py-2 text-[14px] font-bold text-danger">
                          <span className="emoji" aria-hidden="true">😮‍💨</span> يوم متعب؟ ما عندي طاقة الليلة
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-[14.5px] leading-relaxed text-ink/80">
                        {dayIdx === -1 ? 'اليوم للتسوق وتجهيز بسيط في المساء، فيكون عشاء الغد سهلًا.' : fmtDate(state.startDate)}
                      </p>
                      <div className="mt-auto pt-4"><Button variant="primary" onClick={() => openRecipe(heroR.id)}>عرض الوصفة</Button></div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="p-6 md:col-span-2">
                <h2 className="text-[24px] font-extrabold">انتهت الخطة</h2>
                <p className="mt-1 text-[14.5px] text-ink/80">ابدأ دورة جديدة بالوصفات نفسها أو عدّلها من تبويب الخطة.</p>
                <Button variant="primary" className="mt-3" onClick={() => {
                  set({ startDate: addDays(today, 1), checked: {}, custom: state.custom.map((c) => ({ ...c, checked: false })) });
                  toast('تبدأ دورة جديدة غدًا.');
                }}>ابدأ دورة جديدة غدًا</Button>
              </div>
            )}
          </section>

          {missedThaw.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-ice/20 bg-ice-soft p-4 text-[14px] leading-relaxed">
              <Glyph emoji="❄️" bg="#fff" />
              {!forgot ? (
                <div className="flex-1">
                  <p className="font-bold">هل نُقلت حصة {tonightR?.title} إلى الثلاجة أمس؟</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="soft" className="flex-1" onClick={() => set((s) => {
                      let p = s.prepDone;
                      for (const t of missedThaw) p = togglePrep(p, t.key, today);
                      return { prepDone: p };
                    })}>نعم</Button>
                    <Button variant="outline" className="flex-1" onClick={() => setForgot(true)}>نسيت</Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <p className="font-bold">الإذابة السريعة الآمنة</p>
                  <p className="mt-1">تُوضع الحصة في كيس محكم داخل ماء بارد، ويُغيَّر الماء كل 30 دقيقة، وتُطبخ فور ذوبانها. كيس مسطح 500 غ يذوب في نحو ساعة، و1–1.5 كغ في 2–3 ساعات. لا ماء ساخن ولا سطح المطبخ.</p>
                  {options.length > 0 && <button className="mt-2 font-bold text-ice underline" onClick={() => setSosOpen(true)}>أو وجبة سريعة الليلة بدلها</button>}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------ today's prep */}
          <div>
            <h3 className="px-1 text-[19px] font-extrabold">مهام اليوم</h3>
            <p className="mb-3 mt-0.5 px-1 text-[13.5px] leading-relaxed text-muted">
              دقائق قليلة في أوقات موجودة أصلًا في يومك، فلا يأخذ العشاء من وقتك أكثر من مدة طبخه.
            </p>
            {sections.length > 0 ? (
              <ol className="space-y-3" aria-label="مهام اليوم">
                {sections.map((sec, i) => (
                  <li key={sec.id} aria-current={i === current ? 'step' : undefined}
                    className={`rounded-[22px] border bg-paper p-4 ${i === current ? 'border-saffron shadow-[var(--shadow-card)] ring-2 ring-saffron/45' : 'border-line'} ${i < current ? 'opacity-80' : ''}`}>
                    {sec.node}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-2xl border border-dashed border-line bg-paper px-4 py-5 text-center text-[14px] text-muted">لا مهام اليوم.</p>
            )}
          </div>
        </div>

        {/* ================================================ side column */}
        <aside className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-[19px] font-extrabold">خطتك للأيام القادمة</h3>
                <button className="text-[13.5px] font-bold text-teal underline" onClick={() => go('plan')}>الخطة كاملة</button>
              </div>
              <ul className="space-y-2">
                {upcoming.map((x) => {
                  const r = RECIPE[x.rid];
                  return (
                    <li key={x.night}>
                      <button onClick={() => openRecipe(x.rid)} className="dish-card flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-line bg-paper text-start">
                        <RecipeImage recipe={r} className="h-[76px] w-[96px] shrink-0" plateSize={52} />
                        <span className="min-w-0 flex-1 py-2">
                          <span className="block text-[12.5px] font-bold text-copper">{dayName(x.date)}</span>
                          <span className="block truncate text-[15px] font-bold">{r.title}</span>
                          <span className="block text-[12.5px] text-muted"><span className="num">{r.total}</span> دقيقة</span>
                        </span>
                        <Icon name="down" className="me-3 size-4 rotate-90 text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 px-1 text-[19px] font-extrabold">كم من الوقت لديك؟</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              {MOODS.map((m) => (
                <button key={m.id} onClick={() => browse(m.preset)}
                  className="flex items-center gap-2.5 rounded-2xl border border-line bg-paper px-3 py-3 text-start text-[14px] font-bold transition hover:border-teal">
                  <span className="emoji text-[22px]" aria-hidden="true">{m.emoji}</span>{m.label}
                </button>
              ))}
            </div>
          </section>

          {nextShop && (
            <button onClick={() => go('shop')} className="flex w-full items-center gap-3 rounded-2xl bg-saffron-soft px-4 py-3.5 text-start">
              <Glyph emoji="🛒" bg="#fff" size={40} />
              <span className="flex-1">
                <span className="block text-[15px] font-bold">التسوق القادم {relDay(nextShop.date, today)}</span>
                <span className="block text-[13px] text-muted">لعشاءات {relRange(nextShop.firstNight, nextShop.lastNight)}</span>
              </span>
              <span className="num text-[15px] font-extrabold text-copper">{omr(nextShop.total)}</span>
            </button>
          )}
        </aside>
      </div>

      {/* ------------------------------------------------ worth trying */}
      {suggestions.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h3 className="text-[19px] font-extrabold">وصفات تستحق التجربة</h3>
            <button className="text-[13.5px] font-bold text-teal underline" onClick={() => browse()}>كل الوصفات</button>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-5">
            {suggestions.map((r) => <li key={r.id}><RecipeCard r={r} state={state} store={store} open={() => openRecipe(r.id)} compact /></li>)}
          </ul>
        </section>
      )}

      <p className="px-1 text-center text-[13px] text-muted">
        إرشادات التجهيز المسبق وسلامة الغذاء والحفظ في <button className="font-bold text-teal underline" onClick={() => go('more')}>المزيد</button>.
      </p>

      <Sheet open={sosOpen} onClose={() => setSosOpen(false)} title="وجبة سريعة الليلة">
        <p className="mb-3 text-[14px] leading-relaxed text-muted">
          تُقدَّم إحدى هذه الوجبات الليلة، وتنتقل {tonightR?.title} إلى الغد كما هي، فلا يضيع شيء. الحصة المذابة تبقى صالحة في الثلاجة يومًا إلى يومين، فتُطبخ غدًا دون تأجيل آخر.
        </p>
        <ul className="space-y-2">
          {options.map((o) => {
            const r = RECIPE[o.recipeId];
            return (
              <li key={o.recipeId}>
                <button onClick={() => pickEmergency(o.recipeId)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-paper p-3 text-start hover:border-teal">
                  <RecipeImage recipe={r} className="h-14 w-[72px] shrink-0 rounded-xl" plateSize={42} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{r.title}</div>
                    <div className="truncate text-[13px] text-muted">{r.subtitle}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge icon="clock"><span className="num">{r.total}</span> د</Badge>
                    {o.laterIndex === null && <Badge tone="copper">ليلة إضافية</Badge>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">إن كانت الوجبة في خطتك أصلًا تُقدَّم إلى الليلة ولا يتغير عدد الليالي. «ليلة إضافية» تمدّ الخطة ليلة؛ مكوناتها تظهر في التسوق.</p>
      </Sheet>
    </div>
  );

  function dayName(d: string): string {
    const rel = relDay(d, today);
    return rel.startsWith('بعد') || rel.startsWith('قبل') ? weekdayShort.format(new Date(`${d}T00:00:00Z`)) : rel;
  }

  function relRange(a: number, b: number): string {
    const da = gen.nightDates[a - 1];
    const db = gen.nightDates[b - 1];
    if (!da) return '';
    const f = (d: string) => (diffDays(d, today) <= 1 && diffDays(d, today) >= 0 ? relDay(d, today) : weekdayShort.format(new Date(`${d}T00:00:00Z`)));
    return a === b ? f(da) : `${f(da)} إلى ${f(db)}`;
  }
}

function cookLine(now: number, start: string, dinner: string, prep: string): string {
  const s = toMinutes(start);
  const d = toMinutes(dinner);
  if (now < s) return `باقي ${duration(s - now)} على بدء الطهي.`;
  if (now < d) return 'وقت الطهي الآن.';
  if (now < toMinutes(prep)) return `بالهناء والعافية. تجهيز عشاء الغد ${fmtTime(prep)}.`;
  return 'بالهناء والعافية.';
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-sand-2/70 px-2 py-2">
      <dt className="text-[12px] font-bold text-muted">{label}</dt>
      <dd className="num text-[17px] font-extrabold">{value}</dd>
    </div>
  );
}

function Group({ time, lead, title, sub, action, children }: { time: string; lead: ReactNode; title: string; sub: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className="flex items-start gap-3">
        {lead}
        <div className="min-w-0 flex-1">
          <p className="num text-[13px] font-bold text-copper">{fmtTime(time)}</p>
          <h4 className="text-[16px] font-extrabold leading-snug">{title}</h4>
          <p className="mt-0.5 text-[13px] text-muted">{sub}</p>
        </div>
        {action}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </>
  );
}

function TaskList({ tasks, done, toggle, showDishes = false }: { tasks: DayTask[]; done: (t: DayTask) => boolean; toggle: (t: DayTask) => void; showDishes?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const d = done(t);
        const k = KIND[t.kind];
        const dishes = t.dishes ?? (showDishes && t.recipeId && t.night ? [{ night: t.night, recipeId: t.recipeId }] : []);
        return (
          <li key={t.key}>
            <button role="checkbox" aria-checked={d} onClick={() => toggle(t)}
              className={`flex w-full items-start gap-3 rounded-2xl p-3 text-start transition ${d ? 'bg-sand' : 'bg-sand/70 hover:bg-sand-2/70'}`}>
              <Glyph emoji={k.emoji} bg={k.bg} />
              <span className="min-w-0 flex-1">
                <span className={`block text-[14.5px] leading-relaxed ${d ? 'text-muted line-through decoration-1' : ''}`}>{t.text}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
                  <span><span className="num">{t.min}</span> د</span>
                  {t.note && <span>{t.note}</span>}
                </span>
                {dishes.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {dishes.map((x) => {
                      const r = RECIPE[x.recipeId];
                      return r && (
                        <span key={x.night} className="inline-flex items-center gap-1 rounded-full bg-paper py-0.5 pe-2.5 ps-0.5 text-[12px] font-bold">
                          <Plate emoji={r.emoji} tint={r.tint} size={22} />{r.title.split(' ').slice(0, 2).join(' ')}
                        </span>
                      );
                    })}
                  </span>
                )}
              </span>
              <span aria-hidden="true" className={`mt-1 grid size-7 shrink-0 place-items-center rounded-lg border-2 ${d ? 'border-teal bg-teal text-white' : 'border-[#c9c6b8] bg-paper text-transparent'}`}>
                <Icon name="check" className="size-4" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
