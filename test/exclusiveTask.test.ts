// @vitest-environment node
/** Native API wiring model; actual browser grants are tested separately. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  openWriteSession,
  withExclusiveSlot,
  requireExclusiveSessionTask,
  type SessionTask,
} from '../src/crdt/writeSession';
import { withLocalJournalUnderPermit } from '../src/crdt/custody';
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (name: string, options: LockOptions, callback: (lock: Lock) => unknown) =>
        callback({ name, mode: options.mode } as Lock),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('forged tasks cannot execute their supplied guard or source resolver', async () => {
  const step = vi.fn(),
    resolvePrincipal = vi.fn(),
    operation = vi.fn();
  const fake = { step } as unknown as SessionTask;
  expect(() => requireExclusiveSessionTask(fake, 'slot')).toThrow('exclusive task');
  await expect(
    withLocalJournalUnderPermit(
      fake,
      { slotId: 'slot', workspaceId: 'workspace', resolvePrincipal },
      'not a factor',
      operation,
    ),
  ).rejects.toThrow('exclusive task');
  expect(step).not.toHaveBeenCalled();
  expect(resolvePrincipal).not.toHaveBeenCalled();
  expect(operation).not.toHaveBeenCalled();
});
it('only the actual exclusive scope for that slot passes and it expires before session release', async () => {
  let saved!: SessionTask;
  await withExclusiveSlot('slot', async (task) => {
    saved = task;
    expect(() => requireExclusiveSessionTask(task, 'slot')).not.toThrow();
    expect(() => requireExclusiveSessionTask(task, 'other')).toThrow('exclusive task');
  });
  expect(() => requireExclusiveSessionTask(saved, 'slot')).toThrow('exclusive task');
});
it('an original shared task is genuine but cannot stand in for exclusive ownership', async () => {
  const session = await openWriteSession('slot');
  try {
    await session.run(async (task) => {
      expect(() => requireExclusiveSessionTask(task, 'slot')).toThrow('exclusive task');
    });
  } finally {
    await session.close();
  }
});
it('a structurally identical copy of a live exclusive task is never its native scope', async () => {
  await withExclusiveSlot('slot', async (task) => {
    expect(() => requireExclusiveSessionTask({ ...task }, 'slot')).toThrow('exclusive task');
  });
});
it('cancellation invalidates the still-tracked task before native drain completes', async () => {
  const stop = new AbortController();
  await expect(
    withExclusiveSlot(
      'slot',
      async (task) => {
        stop.abort();
        expect(() => requireExclusiveSessionTask(task, 'slot')).toThrow('live');
      },
      { signal: stop.signal },
    ),
  ).rejects.toMatchObject({ code: 'inactive' });
});
