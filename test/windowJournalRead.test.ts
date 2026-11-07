// @vitest-environment node
/** Read-only data/lifetime wiring; actual Worker AEAD remains a browser obligation. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  openWindowCeremonyCohort,
  type WindowAccountCohort,
} from '../src/crdt/accountWorkerCohort';
import { createWindowJournalReader } from '../src/crdt/windowJournalRead';
const roots: WindowAccountCohort[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await root.close();
  vi.unstubAllGlobals();
});
const prefix = (hex: string) => 'done.pending-update.done.' + hex.repeat(32) + '.';
const key = (p: string) => p + '12'.repeat(16) + '.' + '34'.repeat(16) + '.0000000000000001';
async function fixture() {
  const held: LockInfo[] = [],
    values: Record<string, string> = {};
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('navigator', {
    locks: {
      query: async () => ({ held, pending: [] }),
      request: async (name: string, options: LockOptions, callback: (lock: Lock) => unknown) => {
        const info = { name, mode: options.mode ?? 'exclusive', clientId: 'window' } as LockInfo;
        held.push(info);
        try {
          return await callback({ name, mode: info.mode! } as Lock);
        } finally {
          held.splice(held.indexOf(info), 1);
        }
      },
    },
  });
  const getItem = vi.fn((k: string) => values[k] ?? null),
    storage = new Proxy(values, {
      get(target, property) {
        if (property === 'getItem') return getItem;
        if (property === 'setItem' || property === 'removeItem')
          throw Error('Read-only reader attempted mutation');
        return target[property as string];
      },
    });
  vi.stubGlobal('localStorage', storage);
  const root = await openWindowCeremonyCohort('readonly-data', async () => {});
  roots.push(root);
  return { root, values, getItem, read: createWindowJournalReader(root) };
}
it('forged supervision refuses before invoking a caller write function', () => {
  const write = vi.fn();
  expect(() => createWindowJournalReader({ write } as unknown as WindowAccountCohort)).toThrow(
    'inactive',
  );
  expect(write).not.toHaveBeenCalled();
});
it('a genuine ceremony supervisor receives ciphertext data but no append/remove capability', async () => {
  const f = await fixture(),
    p = prefix('a');
  f.values[key(p)] = 'opaque';
  const id = f.read.begin(p);
  expect(f.read.page(id)).toMatchObject({ entries: [[key(p), 'opaque']], done: true });
  expect(Object.keys(f.read).sort()).toEqual([
    'begin',
    'beginObservation',
    'finish',
    'matchesObservation',
    'page',
  ]);
});
it('two snapshot credits are shared across prefixes and completion returns a credit', async () => {
  const f = await fixture(),
    a = prefix('a'),
    b = prefix('b');
  f.values[key(a)] = 'A';
  f.values[key(b)] = 'B';
  const x = f.read.begin(a),
    y = f.read.begin(b);
  expect(() => f.read.begin(prefix('c'))).toThrow('scope');
  expect(f.read.page(x).entries).toEqual([[key(a), 'A']]);
  expect(f.read.page(y).entries).toEqual([[key(b), 'B']]);
  const z = f.read.begin(prefix('c'));
  expect(f.read.page(z).entries).toEqual([]);
});
it('retained observations bind their own prefix and ignore unrelated-prefix writes', async () => {
  const f = await fixture(),
    a = prefix('a'),
    b = prefix('b');
  f.values[key(a)] = 'A';
  const id = f.read.beginObservation(a);
  f.read.page(id);
  f.values[key(b)] = 'B';
  expect(f.read.matchesObservation(id)).toBe(true);
  f.values[key(a)] = 'changed';
  expect(f.read.matchesObservation(id)).toBe(false);
  f.read.finish(id);
  expect(() => f.read.matchesObservation(id)).toThrow('scope');
});
it('only one retained observation can consume the global credits even across prefixes', async () => {
  const f = await fixture(),
    a = prefix('a'),
    b = prefix('b');
  const id = f.read.beginObservation(a);
  expect(() => f.read.beginObservation(b)).toThrow('scope');
  f.read.finish(id);
  const next = f.read.beginObservation(b);
  f.read.page(next);
  expect(f.read.matchesObservation(next)).toBe(true);
});
it('unrelated storage prefixes are refused before reading local values', async () => {
  const f = await fixture();
  for (const p of ['', 'private', 'done.pending-update.secret.', 'done.pending-update.done.BAD.'])
    expect(() => f.read.begin(p)).toThrow('scope');
  expect(f.getItem).not.toHaveBeenCalled();
});
it('unknown retained journal key grammar refuses rather than dropping the entry', async () => {
  const f = await fixture(),
    p = prefix('a');
  f.values[p + 'unknown'] = 'retained';
  expect(() => f.read.begin(p)).toThrow('scope');
  expect(f.values[p + 'unknown']).toBe('retained');
});
it('Root withdrawal expires all snapshots and prevents late reader use', async () => {
  const f = await fixture(),
    p = prefix('a'),
    id = f.read.beginObservation(p);
  f.read.page(id);
  await f.root.close();
  expect(() => f.read.matchesObservation(id)).toThrow('inactive');
  expect(() => f.read.begin(p)).toThrow('inactive');
});
