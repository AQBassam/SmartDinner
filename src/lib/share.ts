import { RECIPE } from './data';
import type { Generated } from './engine';
import { addDays } from './format';
import { buildSchedule, type DayPlan, type DayTask, type ScheduleInput } from './schedule';

/**
 * The plan as Luban's TV screen reads it: one cycle of the computed schedule, which the TV repeats by itself
 * when the cycle ends (the recipes do not change between cycles). Nothing here is personal: dishes, times, tasks.
 *
 * Day k (0-based) is the k-th dinner day. `p` is the day before the first dinner: the shopping trip and the
 * evening prep for night 1. On the TV it is also the last day of every cycle's evening (night 1 of the next cycle).
 * Task texts name the weekday of a night as `{n}` because the weekday shifts from one cycle to the next.
 */
export type ShareTask = [text: string, min: number];
export interface ShareDay {
  /** tonight's dinner: title, emoji, time to start cooking */
  r?: [string, string, string];
  /** tomorrow's dinner: title, emoji */
  m?: [string, string];
  /** tasks on shopping day, after lunch, and in the evening */
  s?: ShareTask[];
  a?: ShareTask[];
  e?: ShareTask[];
  /** shopping trip number (1-based) */
  b?: number;
}
export interface Share {
  v: 1;
  /** nights in the cycle, and the date (YYYY-MM-DD) of the first dinner */
  n: number;
  st: string;
  /** HH:MM: dinner, the after-lunch moment, the evening kitchen session, the shopping trip */
  dn: string;
  ask: string;
  prep: string;
  sh: string;
  d: ShareDay[];
  p: ShareDay;
}

export const SHARE_PREFIX = 'LBN1.';

const tasks = (ts: DayTask[]): ShareTask[] | undefined => (ts.length ? ts.map((t) => [t.text, t.min]) : undefined);

function shareDay(day: DayPlan | undefined): ShareDay {
  const out: ShareDay = {};
  if (!day) return out;
  if (day.tonight) {
    const r = RECIPE[day.tonight.recipeId];
    out.r = [r.title, r.emoji, day.tonight.start];
  }
  if (day.tomorrow) {
    const r = RECIPE[day.tomorrow.recipeId];
    out.m = [r.title, r.emoji];
  }
  const s = tasks(day.shop), a = tasks(day.afternoon), e = tasks(day.evening);
  if (s) out.s = s;
  if (a) out.a = a;
  if (e) out.e = e;
  if (day.shopBatch !== null) out.b = day.shopBatch + 1;
  return out;
}

export function buildShare(input: ScheduleInput, gen: Generated, shopTime: string): Share {
  const days = buildSchedule({ ...input, dayLabel: (night) => `{${night}}` }, gen);
  const n = input.nights.length;
  return {
    v: 1, n, st: input.startDate,
    dn: input.times.dinner, ask: input.times.ask, prep: input.times.prep, sh: shopTime,
    d: Array.from({ length: n }, (_, k) => shareDay(days.get(addDays(input.startDate, k)))),
    p: shareDay(days.get(addDays(input.startDate, -1))),
  };
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = t.writable.getWriter();
  void w.write(bytes as BufferSource).then(() => w.close());
  return new Uint8Array(await new Response(t.readable).arrayBuffer());
}

/** `LBN1.` + base64url of the deflated JSON. About 3 KB for the default 15-night plan. */
export async function encodeShare(share: Share): Promise<string> {
  return SHARE_PREFIX + b64url(await pipe(new TextEncoder().encode(JSON.stringify(share)), new CompressionStream('deflate-raw')));
}

export async function decodeShare(code: string): Promise<Share> {
  const c = code.trim();
  if (!c.startsWith(SHARE_PREFIX)) throw new Error('ليس رمز لُبان.');
  return JSON.parse(new TextDecoder().decode(await pipe(unb64url(c.slice(SHARE_PREFIX.length)), new DecompressionStream('deflate-raw'))));
}
