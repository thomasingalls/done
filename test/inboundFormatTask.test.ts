// @vitest-environment node
/** Original-scope API wiring models. Native leases, real custody and old tabs are separate obligations. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { accountWorkerRuntime } from '../src/crdt/accountWorkerRuntime';
const mocked = vi.hoisted(() => ({
  current: undefined as ReturnType<typeof accountWorkerRuntime>,
}));
vi.mock('../src/crdt/accountWorkerRuntime', () => ({
  accountWorkerRuntime: (slot?: string) => {
    const r = mocked.current;
    if (r && slot !== undefined && r.ticket.slotId !== slot) throw Error('wrong runtime slot');
    return r;
  },
}));
// Only the coordination seam is under test. These model fixtures grant no Account/custody proof.
vi.mock('../src/crdt/promotionRecord', () => ({
  checkPromotionCompatibility: async () => {},
  readPromotion: async () => ({ marker: { v: 9, stage: 'account-receiving' } }),
}));
import {
  openWriteSession,
  openAccountWriteSession,
  withExclusiveSlot,
  requireAccountFormatSessionTask,
  type SessionTask,
} from '../src/crdt/writeSession';
let locks: LockManager;
beforeEach(() => {
  mocked.current = undefined;
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('isSecureContext', true);
  locks = {
    request: async (name: string, options: LockOptions, callback: (lock: Lock) => unknown) =>
      callback({ name, mode: options.mode } as Lock),
  } as LockManager;
  vi.stubGlobal('navigator', { locks });
});
afterEach(() => {
  mocked.current = undefined;
  vi.unstubAllGlobals();
});
function runtime(kind: 'account' | 'local' = 'account') {
  const stop = new AbortController(),
    join = { request: locks.request.bind(locks) },
    r = {
      kind,
      join,
      ticket: { slotId: 'slot' },
      signal: stop.signal,
      assertCurrent() {
        if (stop.signal.aborted) throw Error('runtime closed');
      },
    } as unknown as NonNullable<ReturnType<typeof accountWorkerRuntime>>;
  mocked.current = r;
  return { r, stop };
}
it('forged tasks, copied shapes and serialized tickets cannot invoke a supplied guard', () => {
  const step = vi.fn();
  for (const fake of [
    { step },
    { slotId: 'slot', mode: 'exclusive', step },
    { v: 1, slotId: 'slot', incarnation: '11'.repeat(16), windowClient: 'claimed' },
  ])
    expect(() => requireAccountFormatSessionTask(fake as unknown as SessionTask, 'slot')).toThrow(
      'actual format task',
    );
  expect(step).not.toHaveBeenCalled();
});
it('only the original live exclusive scope for the exact slot is accepted', async () => {
  let saved!: SessionTask;
  await withExclusiveSlot('slot', async (task) => {
    saved = task;
    expect(() => requireAccountFormatSessionTask(task, 'slot')).not.toThrow();
    expect(() => requireAccountFormatSessionTask(task, 'other')).toThrow('actual format task');
    expect(() => requireAccountFormatSessionTask({ ...task }, 'slot')).toThrow(
      'actual format task',
    );
  });
  expect(() => requireAccountFormatSessionTask(saved, 'slot')).toThrow('actual format task');
});
it('a genuine ordinary shared scope never substitutes for exclusive or Account cohort ownership', async () => {
  const session = await openWriteSession('slot');
  try {
    await session.run((task) => {
      expect(() => requireAccountFormatSessionTask(task, 'slot')).toThrow(
        'Account cohort format task',
      );
    });
  } finally {
    await session.close();
  }
});
it('a claimed Account runtime cannot elevate a generic shared task lacking that join', async () => {
  runtime();
  const session = await openWriteSession('slot');
  try {
    await session.run((task) => {
      expect(() => requireAccountFormatSessionTask(task, 'slot')).toThrow(
        'Account cohort format task',
      );
    });
  } finally {
    await session.close();
  }
});
it('the original Account joined opening and live task pass but copies and settled scopes do not', async () => {
  runtime();
  let opening!: SessionTask, completed!: SessionTask;
  const session = await openAccountWriteSession('slot', 'model-only', {
    initialize(task) {
      opening = task;
      requireAccountFormatSessionTask(task, 'slot');
    },
    dispose() {},
  });
  try {
    expect(() => requireAccountFormatSessionTask(opening, 'slot')).toThrow('actual format task');
    await session.run((task) => {
      completed = task;
      expect(() => requireAccountFormatSessionTask(task, 'slot')).not.toThrow();
      expect(() => requireAccountFormatSessionTask({ ...task }, 'slot')).toThrow(
        'actual format task',
      );
    });
    expect(() => requireAccountFormatSessionTask(completed, 'slot')).toThrow('actual format task');
  } finally {
    await session.close();
  }
});
it('Local Worker scopes are refused even when their original shared join matches', async () => {
  runtime('local');
  const session = await openWriteSession('slot');
  try {
    await session.run((task) => {
      expect(() => requireAccountFormatSessionTask(task, 'slot')).toThrow(
        'Account cohort format task',
      );
    });
  } finally {
    await session.close();
  }
});
it('an otherwise matching runtime cannot replace the exact join recorded for a live task', async () => {
  runtime();
  const session = await openAccountWriteSession('slot', 'model-only', {
    initialize() {},
    dispose() {},
  });
  try {
    await session.run((task) => {
      const held = mocked.current!;
      try {
        mocked.current = { ...held, join: { ...held.join } };
        expect(() => requireAccountFormatSessionTask(task, 'slot')).toThrow(
          'Account cohort format task',
        );
      } finally {
        mocked.current = held;
      }
    });
  } finally {
    await session.close();
  }
});
it('cancellation invalidates an exclusive scope before its native callback drains', async () => {
  const stop = new AbortController();
  await expect(
    withExclusiveSlot(
      'slot',
      async (task) => {
        stop.abort();
        expect(() => requireAccountFormatSessionTask(task, 'slot')).toThrow('live');
      },
      { signal: stop.signal },
    ),
  ).rejects.toMatchObject({ code: 'inactive' });
});
