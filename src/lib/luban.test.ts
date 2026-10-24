import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// a small localStorage for the node test environment, so the link is kept as in a browser
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
const L = await import('./luban');

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
let calls: Call[] = [];
let reply: (c: Call) => { status: number; body?: unknown } = () => ({ status: 200, body: { ok: true, at: 1792860000 } });
const fake = (async (url: string, init: RequestInit) => {
  const c = { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body as string | undefined };
  calls.push(c);
  const r = reply(c);
  return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
}) as typeof fetch;

beforeEach(() => { calls = []; mem.clear(); vi.stubGlobal('fetch', fake); });
afterEach(async () => { await L.unlink(); reply = () => ({ status: 200, body: { ok: true, at: 1792860000 } }); });

describe('luban: linking the plan to a TV screen', () => {
  it('a 32-byte key, and the read id the server derives from it', async () => {
    const key = L.newKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(L.newKey()).not.toBe(key);
    // the same key in Luban's server (Python): base64url(sha256(b'A' * 43))[:22]
    expect(await L.readId('A'.repeat(43))).toBe('DwBzhbb51LfusnSGBa_hqY');
    expect(await L.readId(key)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(L.linkCode('DwBzhbb51LfusnSGBa_hqY')).toBe('LBNL.DwBzhbb51LfusnSGBa_hqY');
  });

  it('linking sends the plan at once with the key in a header, never in the address', async () => {
    const l = await L.link('{"v":1}');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: 'https://luban.bassamailab.xyz/v1/dinner', method: 'PUT', body: '{"v":1}' });
    expect(calls[0].headers['X-Luban-Key']).toBe(l.key);
    expect(calls[0].url).not.toContain(l.key);
    expect(L.getLink()).toMatchObject({ id: l.id, sent: '{"v":1}', sentAt: 1792860000000, error: false });
    expect(JSON.parse(mem.get('sdg.luban.v1')!).key).toBe(l.key);
  });

  it('the same plan is not sent twice; a changed one is', async () => {
    await L.link('{"a":1}');
    await L.sync('{"a":1}', fake);
    expect(calls).toHaveLength(1);
    await L.sync('{"a":2}', fake);
    expect(calls).toHaveLength(2);
  });

  it('a failure is marked and sent again later; «too soon» is not a failure', async () => {
    reply = () => ({ status: 503 });
    await L.link('{"a":1}');
    expect(L.getLink()?.error).toBe(true);
    reply = () => ({ status: 429 });
    await expect(L.sync('{"a":1}', fake)).rejects.toThrow('429');
    expect(L.getLink()?.error).toBe(false);
    reply = () => ({ status: 200, body: { ok: true, at: 5 } });
    await L.sync('{"a":1}', fake);
    expect(L.getLink()).toMatchObject({ sent: '{"a":1}', sentAt: 5000, error: false });
  });

  it('unlinking deletes the plan on the server and forgets the key here', async () => {
    const l = await L.link('{}');
    await L.unlink();
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE' });
    expect(calls.at(-1)!.headers['X-Luban-Key']).toBe(l.key);
    expect(L.getLink()).toBeNull();
    expect(mem.has('sdg.luban.v1')).toBe(false);
  });
});
