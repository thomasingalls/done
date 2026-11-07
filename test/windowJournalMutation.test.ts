// @vitest-environment node
/** Effect routing model only. Native protection independently authenticates coverage in browser tests. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  openWindowCeremonyCohort,
  type WindowAccountCohort,
} from '../src/crdt/accountWorkerCohort';
import {
  createProtectionJournalRetirement,
  createSlotJournalRemover,
  retirePageLocalJournal,
} from '../src/crdt/windowJournalMutation';
import type { SessionTask } from '../src/crdt/writeSession';
const roots: WindowAccountCohort[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await r.close();
  vi.unstubAllGlobals();
});
const prefix = (n = 'a') => 'done.pending-update.done.' + n.repeat(32) + '.';
const key = (n: number, p = prefix()) =>
  p + '12'.repeat(16) + '.' + '34'.repeat(16) + '.' + String(n).padStart(16, '0');
async function fixture() {
  const held: LockInfo[] = [],
    values: Record<string, string> = {};
  vi.stubGlobal('window', {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('navigator', {
    locks: {
      query: async () => ({ held, pending: [] }),
      request: async (name: string, options: LockOptions, callback: (l: Lock) => unknown) => {
        const row = { name, mode: options.mode ?? 'exclusive', clientId: 'window' } as LockInfo;
        held.push(row);
        try {
          return await callback({ name, mode: row.mode! } as Lock);
        } finally {
          held.splice(held.indexOf(row), 1);
        }
      },
    },
  });
  let fail = false;
  const remove = vi.fn((k: string) => {
    if (fail) throw Error('storage refused');
    delete values[k];
  });
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, p) {
        if (p === 'getItem') return (k: string) => values[k] ?? null;
        if (p === 'removeItem') return remove;
        return target[p as string];
      },
    }),
  );
  const root = await openWindowCeremonyCohort('retirement-unit', async () => {});
  roots.push(root);
  return {
    root,
    values,
    remove,
    retirement: createProtectionJournalRetirement(root),
    fail() {
      fail = true;
    },
  };
}
it('forged supervisors never execute caller-supplied effects', () => {
  const write = vi.fn();
  expect(() =>
    createProtectionJournalRetirement({ write } as unknown as WindowAccountCohort),
  ).toThrow('inactive');
  expect(write).not.toHaveBeenCalled();
});
it('no retirement request is accepted outside the requested private protection flight', async () => {
  const f = await fixture();
  f.values[key(1)] = 'sealed';
  expect(() =>
    f.retirement.remove({ id: 1, prefix: prefix(), entries: [[key(1), 'sealed']] }),
  ).toThrow('scope');
  expect(f.values[key(1)]).toBe('sealed');
  expect(f.remove).not.toHaveBeenCalled();
});
it('exact identity/value matching removes only represented input pairs and retains a replaced entry', async () => {
  const f = await fixture();
  f.values[key(1)] = 'one';
  f.values[key(2)] = 'replacement';
  f.values[key(3)] = 'unrelated';
  f.retirement.start(1);
  expect(
    f.retirement.remove({
      id: 1,
      prefix: prefix(),
      entries: [
        [key(1), 'one'],
        [key(2), 'old'],
        [key(4), 'already absent'],
      ],
    }),
  ).toEqual({ removed: 1, changed: 1, retained: 0 });
  expect(f.values).toEqual({ [key(2)]: 'replacement', [key(3)]: 'unrelated' });
});
it('a refused native storage removal is reported and retained', async () => {
  const f = await fixture();
  f.values[key(1)] = 'sealed';
  f.retirement.start(1);
  f.fail();
  expect(f.retirement.remove({ id: 1, prefix: prefix(), entries: [[key(1), 'sealed']] })).toEqual({
    removed: 0,
    changed: 0,
    retained: 1,
  });
  expect(f.values[key(1)]).toBe('sealed');
});
it('one private flight cannot switch source prefixes or accept another identity', async () => {
  const f = await fixture();
  f.values[key(1)] = 'A';
  f.values[key(1, prefix('b'))] = 'B';
  f.retirement.start(1);
  f.retirement.remove({ id: 1, prefix: prefix(), entries: [] });
  expect(() =>
    f.retirement.remove({ id: 1, prefix: prefix('b'), entries: [[key(1, prefix('b')), 'B']] }),
  ).toThrow('scope');
  expect(() => f.retirement.remove({ id: 2, prefix: prefix(), entries: [[key(1), 'A']] })).toThrow(
    'scope',
  );
  expect(f.remove).not.toHaveBeenCalled();
});
it('late stop cannot cancel the later protection flight and retired identities never replay', async () => {
  const f = await fixture();
  f.retirement.start(1);
  f.retirement.stop(1);
  f.retirement.start(2);
  f.retirement.stop(1);
  f.values[key(1)] = 'A';
  expect(() => f.retirement.start(1)).toThrow('scope');
  expect(f.retirement.remove({ id: 2, prefix: prefix(), entries: [[key(1), 'A']] }).removed).toBe(
    1,
  );
});
it('duplicate or over-bound lists refuse before any key is removed', async () => {
  const f = await fixture();
  f.values[key(1)] = 'A';
  f.retirement.start(1);
  expect(() =>
    f.retirement.remove({
      id: 1,
      prefix: prefix(),
      entries: [
        [key(1), 'A'],
        [key(1), 'A'],
      ],
    }),
  ).toThrow('scope');
  expect(() =>
    f.retirement.remove({
      id: 1,
      prefix: prefix(),
      entries: Array.from({ length: 17 }, (_, i) => [key(i + 1), 'A'] as const),
    }),
  ).toThrow('scope');
  expect(f.remove).not.toHaveBeenCalled();
});
it('withdrawal closes the flight, while original slot mutation guard still rejects ceremony supervision', async () => {
  const f = await fixture();
  expect(() => createSlotJournalRemover(f.root, prefix())).toThrow('inactive');
  f.retirement.start(1);
  await f.root.close();
  expect(() => f.retirement.remove({ id: 1, prefix: prefix(), entries: [] })).toThrow('inactive');
  expect(() => f.retirement.stop(1)).not.toThrow();
});
it('Page retirement rejects a caller-shaped task before any storage effect', () => {
  const step = vi.fn();
  expect(() =>
    retirePageLocalJournal({ step } as unknown as SessionTask, 'slot', prefix(), []),
  ).toThrow('exclusive task');
  expect(step).not.toHaveBeenCalled();
});
