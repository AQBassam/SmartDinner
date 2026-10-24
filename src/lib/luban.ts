import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { buildShare, type Share } from './share';
import type { Store } from '../store';

/**
 * Linking the plan to a Luban TV screen through Luban's data server, so every change reaches the screen by itself.
 *
 * The guide makes a random write key (32 bytes) and keeps it in this browser only. The TV is given the read id: the
 * first 22 characters of base64url(SHA-256(key)), so it can read the plan but never change it, and the id does not
 * lead back to the key. What is sent is the same as the copied code: dishes, times and tasks, no names, no prices.
 */
export const LUBAN_API = 'https://luban.bassamailab.xyz';
export const LINK_PREFIX = 'LBNL.';
const LS_KEY = 'sdg.luban.v1';
const DEBOUNCE_MS = 3000;
const RETRY_MS = 60_000;

export interface Link {
  key: string;
  id: string;
  /** when the plan last reached the server (ms), and what was sent, to skip sending the same plan again */
  sentAt?: number;
  sent?: string;
  /** the last attempt failed: shown, and retried in a minute */
  error?: boolean;
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function newKey(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The read id of a write key, as Luban's server computes it. */
export async function readId(key: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  return b64url(digest).slice(0, 22);
}

export const linkCode = (id: string) => LINK_PREFIX + id;

export function sharePlan(store: Pick<Store, 'state' | 'gen'>): Share {
  const { state, gen } = store;
  return buildShare({ startDate: state.startDate, nights: state.nights, times: state.times, diets: state.special.map((m) => m.diet) }, gen, state.shopTime);
}

/** PUT the plan. Resolves to the server's time of the write; throws with the HTTP status otherwise. */
export async function pushPlan(key: string, json: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const r = await fetchImpl(`${LUBAN_API}/v1/dinner`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Luban-Key': key }, body: json });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return ((await r.json()) as { at: number }).at * 1000;
}

export async function deletePlan(key: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`${LUBAN_API}/v1/dinner`, { method: 'DELETE', headers: { 'X-Luban-Key': key } });
}

// ---------- the link, kept apart from the plan state (not in backups: a key belongs to one browser)
let current: Link | null = load();
const listeners = new Set<() => void>();

function load(): Link | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LS_KEY);
    const x = raw ? JSON.parse(raw) : null;
    return x && /^[A-Za-z0-9_-]{43}$/.test(x.key) && /^[A-Za-z0-9_-]{22}$/.test(x.id) ? x : null;
  } catch {
    return null;
  }
}
function save(next: Link | null) {
  current = next;
  try {
    if (next) localStorage.setItem(LS_KEY, JSON.stringify(next));
    else localStorage.removeItem(LS_KEY);
  } catch { /* private mode: the link lasts this visit */ }
  listeners.forEach((f) => f());
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const getLink = () => current;
export const useLink = () => useSyncExternalStore(subscribe, getLink, getLink);

/** Send now if the plan differs from what the server has. Used by the hook and by «link». */
export async function sync(json: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const l = current;
  if (!l || (l.sent === json && !l.error)) return;
  try {
    const at = await pushPlan(l.key, json, fetchImpl);
    if (current?.key === l.key) save({ ...current, sentAt: at, sent: json, error: false });
  } catch (e) {
    // 429 is a write a moment ago, not a failure: the hook tries again in a few seconds
    if (current?.key === l.key) save({ ...current, error: (e as { status?: number }).status !== 429 });
    throw e;
  }
}

export async function link(json: string): Promise<Link> {
  const key = newKey();
  save({ key, id: await readId(key) });
  await sync(json).catch(() => undefined);
  return current!;
}

export async function unlink(): Promise<void> {
  const l = current;
  save(null);
  if (l) await deletePlan(l.key).catch(() => undefined);
}

/** While linked: the plan is sent 3 s after the last change, and again a minute after a failure. */
export function useLubanSync(store: Pick<Store, 'state' | 'gen'>) {
  const l = useLink();
  const { state, gen } = store;
  const json = useMemo(() => (l ? JSON.stringify(sharePlan({ state, gen })) : ''),
    // the plan depends on these only; the rest of the state (shopping ticks, prices) never reaches the TV
    [!!l, state.startDate, state.nights, state.times, state.special, state.shopTime, gen]);
  useEffect(() => {
    if (!l || (l.sent === json && !l.error)) return;
    // every failure saves the link, which runs this again: so a failure is retried after RETRY_MS
    const t = setTimeout(() => { sync(json).catch(() => undefined); }, l.error ? RETRY_MS : DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [l, json]);
}
