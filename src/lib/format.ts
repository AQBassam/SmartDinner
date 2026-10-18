import type { Ingredient } from './data';

/** Western digits everywhere (0-9). */
export function num(n: number, maxDecimals = 2): string {
  const f = 10 ** maxDecimals;
  const r = Math.round(n * f) / f;
  return r.toLocaleString('en-US', { maximumFractionDigits: maxDecimals, useGrouping: false });
}

export function omr(n: number): string {
  return `${(Math.round(n * 1000) / 1000).toFixed(3)} ر.ع`;
}

/** Arabic counted noun. forms = [مفرد, مثنى, جمع 3-10, تمييز 11+] */
export const PORTION = ['حصة', 'حصتان', 'حصص', 'حصة'] as const;
export const PERSON = ['فرد', 'فردان', 'أفراد', 'فردًا'] as const;

export function arCount(n: number, forms: readonly [string, string, string, string]): string {
  const [one, two, few, many] = forms;
  if (n === 0.5) return `نصف ${one}`;
  if (!Number.isInteger(n)) return `${num(n, 1)} ${one}`;
  if (n === 1) return `${one} ${/ة$/.test(one) ? 'واحدة' : 'واحد'}`;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function fmtGrams(g: number): string {
  if (g >= 1000) return `${num(g / 1000, 2)} كغ`;
  return `${num(g, 0)} غ`;
}

export function fmtMl(ml: number): string {
  if (ml <= 90) {
    const spoons = Math.max(0.5, Math.round((ml / 15) * 2) / 2);
    return arCount(spoons, ['ملعقة كبيرة', 'ملعقتان كبيرتان', 'ملاعق كبيرة', 'ملعقة كبيرة']);
  }
  if (ml >= 1000) return `${num(ml / 1000, 2)} لتر`;
  return `${num(Math.round(ml / 10) * 10, 0)} مل`;
}

/** Round a recipe display quantity to something a cook can measure. */
export function roundForCook(ing: Ingredient, q: number): number {
  if (ing.unit === 'pcs') {
    if (ing.round === 'half') return Math.max(0.5, Math.round(q * 2) / 2);
    return Math.max(1, Math.round(q));
  }
  if (ing.unit === 'g') {
    const step = q < 50 ? 5 : q < 500 ? 10 : 50;
    return Math.max(step, Math.round(q / step) * step);
  }
  if (ing.unit === 'ml') {
    if (q <= 90) return q;
    return Math.round(q / 50) * 50;
  }
  return q;
}

export function fmtQty(ing: Ingredient, q: number | undefined): string {
  if (ing.unit === 'none' || q === undefined) return 'حسب الرغبة';
  const r = roundForCook(ing, q);
  if (ing.unit === 'pcs') return arCount(r, ing.forms!);
  if (ing.unit === 'g') return fmtGrams(r);
  return fmtMl(r);
}

// ---------- dates (ISO yyyy-mm-dd, computed in UTC to avoid DST drift) ----------
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

const dfLong = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dfShort = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fmtDate = (iso: string) => dfLong.format(new Date(`${iso}T00:00:00Z`));
export const fmtDateShort = (iso: string) => dfShort.format(new Date(`${iso}T00:00:00Z`));

export function relDay(iso: string, today: string): string {
  const d = diffDays(iso, today);
  if (d === 0) return 'اليوم';
  if (d === 1) return 'غدًا';
  if (d === -1) return 'أمس';
  if (d > 1 && d <= 10) return `بعد ${arCount(d, ['يوم', 'يومين', 'أيام', 'يومًا'])}`;
  if (d < -1) return `قبل ${arCount(-d, ['يوم', 'يومين', 'أيام', 'يومًا'])}`;
  return fmtDateShort(iso);
}

/** 24h "HH:MM" → "7:25 م" (Western digits). */
export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
