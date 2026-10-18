import { ING, RECIPE, RECIPES } from './data';
import { BATCH_SPAN, nightDate, type Generated } from './engine';
import { addDays, fmtTime, fromMinutes, toMinutes } from './format';

const weekday = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { weekday: 'long', day: 'numeric', timeZone: 'UTC' });
import { needLabel } from './purchase';

/**
 * The family's day around dinner. Work is moved into moments that already exist:
 *   shop     — the shopping trip (portion proteins, shape/freeze, wash greens)
 *   evening  — 9:30 pm, while tomorrow's lunch is being prepared (thaw + chop + marinate for tomorrow's dinner)
 *   afternoon— 4:15 pm, right after lunch dishes: the «what's for dinner?» moment, answered
 */
export type Slot = 'shop' | 'evening' | 'afternoon';
export type TaskKind = 'thaw' | 'prep' | 'portion' | 'wash';

export interface DayTask {
  key: string; // `${date}:${id}` — stable id for the done-checkbox
  id: string;
  date: string;
  slot: Slot;
  kind: TaskKind;
  text: string;
  min: number;
  note?: string;
  night: number | null; // the dinner this task serves
  recipeId?: string; // the dish this task prepares (absent for multi-dish shopping tasks)
  dishes?: { night: number; recipeId: string }[]; // shopping tasks: the dishes they prepare
}

export interface DayPlan {
  date: string;
  tonight: { night: number; recipeId: string; start: string } | null;
  tomorrow: { night: number; recipeId: string } | null;
  shopBatch: number | null;
  shop: DayTask[];
  afternoon: DayTask[];
  evening: DayTask[];
}

export interface Times { lunchEnd: string; ask: string; dinner: string; prep: string }

export interface ScheduleInput {
  startDate: string;
  nights: string[];
  times: Times;
}

const shortName = (n: string) => n.replace(/\s*\(.*\)$/, '');
/** Definite forms for the items named inside generated sentences. */
const DEF: Record<string, string> = { minced_beef: 'اللحم المفروم', lettuce: 'الخس', parsley: 'البقدونس', chicken_breast: 'صدور الدجاج', chicken_thighs: 'أفخاذ الدجاج', fish_fillet: 'فيليه السمك' };
const defName = (id: string, name: string) => DEF[id] ?? shortName(name);

export function startCooking(recipeId: string, dinner: string): string {
  return fromMinutes(toMinutes(dinner) - (RECIPE[recipeId]?.total ?? 30));
}

export function buildSchedule(input: ScheduleInput, gen: Generated): Map<string, DayPlan> {
  const days = new Map<string, DayPlan>();
  const day = (date: string): DayPlan => {
    let d = days.get(date);
    if (!d) {
      d = { date, tonight: null, tomorrow: null, shopBatch: null, shop: [], afternoon: [], evening: [] };
      days.set(date, d);
    }
    return d;
  };
  const add = (date: string, t: Omit<DayTask, 'key' | 'date'>) => {
    const task: DayTask = { ...t, date, key: `${date}:${t.id}` };
    day(date)[t.slot].push(task);
  };

  // shopping trips
  for (const b of gen.batches) {
    const d = day(b.date);
    d.shopBatch = b.index;
    const dishOf = (night: number) => ({ night, recipeId: input.nights[night - 1] });
    const label = (night: number) => `${RECIPE[input.nights[night - 1]]?.title ?? ''} (${weekday.format(new Date(`${nightDate(input.startDate, night)}T00:00:00Z`))})`;
    for (const l of b.lines) {
      // fresh meat bought for several nights: split into labelled flat bags (frozen products stay in their own bag)
      if (l.cat !== 'protein' || l.have || l.ing.frozen || !l.ing.thaw || l.portions.length === 0) continue;
      const place = (night: number) => (addDays(nightDate(input.startDate, night), -1) === b.date ? 'الثلاجة' : 'الفريزر');
      const parts = l.portions.map((p) => `${needLabel(l.ing, p.qty)} لـ${label(p.night)} في ${place(p.night)}`).join('، و');
      add(b.date, {
        id: `shop-${b.index}-portion-${l.ing.id}`, slot: 'shop', kind: 'portion', min: l.portions.length > 1 ? 5 : 2, night: null,
        dishes: l.portions.map((p) => dishOf(p.night)),
        text: l.portions.length > 1
          ? `تقسيم ${defName(l.ing.id, l.ing.name)} إلى أكياس مسطحة: ${parts}.`
          : `حفظ ${defName(l.ing.id, l.ing.name)}: ${parts}.`,
        note: 'اكتب اسم الوجبة على الكيس. المسطح يتجمد ويذوب أسرع من الكتلة',
      });
    }
    const greens = b.lines.filter((l) => ['lettuce', 'parsley'].includes(l.ing.id) && !l.have);
    if (greens.length) {
      const nights = [...new Set(greens.flatMap((l) => l.portions.map((p) => p.night)))].sort((x, y) => x - y);
      add(b.date, {
        id: `shop-${b.index}-wash`, slot: 'shop', kind: 'wash', min: 5, night: null,
        dishes: nights.map(dishOf),
        text: `غسل ${greens.map((l) => defName(l.ing.id, l.ing.name)).join(' و')} و${greens.length > 1 ? 'تجفيفهما' : 'تجفيفه'} جيدًا، وحفظ${greens.length > 1 ? 'هما' : 'ه'} في علبة مبطنة بمنديل ورقي، لـ${nights.map(label).join(' و')}.`,
        note: 'المغسول الجاف يبقى طازجًا 3–4 أيام',
      });
    }
  }

  input.nights.forEach((rid, i) => {
    const n = i + 1;
    const r = RECIPE[rid];
    if (!r) return;
    const date = nightDate(input.startDate, n);
    const eve = addDays(date, -1);
    day(date).tonight = { night: n, recipeId: rid, start: startCooking(rid, input.times.dinner) };
    day(eve).tomorrow = { night: n, recipeId: rid };

    const batch = Math.floor((n - 1) / BATCH_SPAN);
    const shopDate = gen.batches[batch]?.date;

    // thaw for tomorrow, during the evening session
    for (const nd of gen.needs) {
      if (nd.night !== n || nd.recipeId !== rid) continue;
      const ing = ING[nd.ingId];
      if (!ing.thaw || (nd.storage !== 'freezer' && nd.storage !== 'freeze')) continue;
      const qty = needLabel(ing, nd.qty);
      const boughtToday = gen.batches[nd.batch]?.date === eve;
      const shaped = r.prep.some((p) => p.when === 'shopDay');
      add(eve, {
        id: `thaw-${n}-${ing.id}`, slot: 'evening', kind: 'thaw', min: 1, night: n, recipeId: rid,
        text: boughtToday
          ? `وضع حصة الغد من ${shortName(ing.name)} (${qty}) في الثلاجة مباشرة بعد الشراء، لا في الفريزر.`
          : shaped
            ? `نقل كيس «${r.title}» المجهَّز من الفريزر إلى رف الثلاجة السفلي داخل وعاء.`
            : ing.frozen
              ? `نقل ${qty} من ${shortName(ing.name)} من الفريزر إلى رف الثلاجة السفلي داخل وعاء مغطى.`
              : `نقل كيس ${shortName(ing.name)} المكتوب عليه «${r.title}» (${qty}) من الفريزر إلى رف الثلاجة السفلي داخل وعاء.`,
        note: 'يبقى صالحًا في الثلاجة يومًا إلى يومين قبل الطهي',
      });
    }

    r.prep.forEach((p, k) => {
      const base = { id: `prep-${n}-${k}`, kind: 'prep' as const, text: p.t, min: p.min, note: p.note, night: n, recipeId: rid };
      if (p.when === 'evening') add(eve, { ...base, slot: 'evening' });
      else if (p.when === 'afternoon') add(date, { ...base, slot: 'afternoon' });
      else if (shopDate) add(shopDate, { ...base, id: `shopday-${n}-${k}`, slot: 'shop' });
    });
  });
  return days;
}

export const minutesOf = (tasks: DayTask[]) => tasks.reduce((s, t) => s + t.min, 0);

// ---------------------------------------------------------------- calendar events
export interface CalendarEvent { id: string; date: string; time: string; durationMin: number; title: string; body: string }

export function scheduleEvents(input: ScheduleInput, gen: Generated, days: Map<string, DayPlan>, shopTime: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const bullets = (ts: DayTask[]) => ts.map((t) => `• ${t.text}`).join('\n');
  for (const d of [...days.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.shopBatch !== null) {
      const b = gen.batches[d.shopBatch];
      out.push({
        id: `shop-${b.index}`, date: d.date, time: shopTime, durationMin: 60,
        title: `التسوق: الدفعة ${b.index + 1} (الليالي ${b.firstNight}–${b.lastNight})`,
        body: `القائمة في تبويب التسوق.${d.shop.length ? `\nبعد الشراء (${minutesOf(d.shop)} دقيقة):\n${bullets(d.shop)}` : ''}`,
      });
    }
    if (d.tonight) {
      const r = RECIPE[d.tonight.recipeId];
      out.push({
        id: `tonight-${d.tonight.night}`, date: d.date, time: input.times.ask, durationMin: 10,
        title: `عشاء الليلة: ${r.title}`,
        body: `ابدأ الطهي ${fmtTime(d.tonight.start)} ليكون جاهزًا ${fmtTime(input.times.dinner)} (${r.total} دقيقة، منها ${r.active} عمل).${d.afternoon.length ? `\nالآن (${minutesOf(d.afternoon)} دقيقة):\n${bullets(d.afternoon)}` : ''}`,
      });
    }
    if (d.tomorrow && d.evening.length) {
      const r = RECIPE[d.tomorrow.recipeId];
      out.push({
        id: `prep-${d.tomorrow.night}`, date: d.date, time: input.times.prep, durationMin: Math.max(5, minutesOf(d.evening)),
        title: `مهام الليلة لعشاء الغد: ${r.title}`,
        body: `${minutesOf(d.evening)} دقيقة أثناء تجهيز غداء الغد:\n${bullets(d.evening)}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- «no energy tonight»
export const EMERGENCY_IDS = RECIPES.filter((r) => r.tags.includes('emergency')).map((r) => r.id);

export interface EmergencyOption { recipeId: string; laterIndex: number | null }

export function emergencyOptions(nights: string[], idx: number): EmergencyOption[] {
  if (EMERGENCY_IDS.includes(nights[idx])) return [];
  return EMERGENCY_IDS.map((id) => {
    const j = nights.findIndex((x, k) => k > idx && x === id);
    return { recipeId: id, laterIndex: j > idx ? j : null };
  }).sort((a, b) => (a.laterIndex === null ? 1 : 0) - (b.laterIndex === null ? 1 : 0));
}

/**
 * Serve an emergency meal tonight; tonight's dish moves to tomorrow (a protein thawed in the fridge
 * stays safe 1–2 days). If the emergency meal was later in the plan it is pulled forward and the nights
 * in between shift by one day; otherwise it is inserted and the plan grows by one night.
 */
export function applyEmergency(nights: string[], idx: number, recipeId: string, maxNights = 21): string[] {
  const out = [...nights];
  const j = out.findIndex((x, k) => k > idx && x === recipeId);
  if (j > idx) out.splice(j, 1);
  out.splice(idx, 0, recipeId);
  return out.slice(0, maxNights);
}

/** Toggle a prep task; keys older than 30 days are dropped so the store stays small. */
export function togglePrep(prepDone: Record<string, boolean>, key: string, today: string): Record<string, boolean> {
  const cutoff = addDays(today, -30);
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(prepDone)) if (v && k.slice(0, 10) >= cutoff && k !== key) out[k] = true;
  if (!prepDone[key]) out[key] = true;
  return out;
}
