import type { Bytes } from '../src/crdt/custodyCrypto';
import * as comparisons from '../src/crdt/verifiedRecords';
// @vitest-environment node
/** Data comparison only; input records are not cryptographic receipts in this wiring fixture. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { withExclusiveSlot, type SessionTask } from '../src/crdt/writeSession';
import { assertCoveredLocalJournal } from '../src/crdt/coveredLocalJournal';
import type { JournalUpdate } from '../src/crdt/journalStore';
import type { OpenedRecord } from '../src/crdt/contentRecord';
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const entry = (bytes: Bytes): JournalUpdate => ({ key: 'opaque', generation: 1, bytes });
const row = (bytes: Bytes, kind: OpenedRecord['kind'] = 'update'): OpenedRecord => ({
  gen: 1,
  seq: 1,
  kind,
  bytes,
});
it('actual exclusive scope can compare multiple exact update copies without changing any input', async () => {
  const a = new Uint8Array([1, 2, 3]),
    b = new Uint8Array([4, 5, 6]);
  await withExclusiveSlot('slot', (task) =>
    assertCoveredLocalJournal(task, 'slot', [entry(a), entry(b)], [row(b.slice()), row(a.slice())]),
  );
  expect(a).toEqual(new Uint8Array([1, 2, 3]));
  expect(b).toEqual(new Uint8Array([4, 5, 6]));
});
it('equal-length different bytes refuse rather than treating a bucket or length as coverage', async () => {
  await expect(
    withExclusiveSlot('slot', (task) =>
      assertCoveredLocalJournal(
        task,
        'slot',
        [entry(new Uint8Array([1, 2, 3]))],
        [row(new Uint8Array([1, 2, 4]))],
      ),
    ),
  ).rejects.toMatchObject({ code: 'repair-required' });
});
it('state/heads/outbound records cannot substitute for an exact copied journal update', async () => {
  for (const kind of ['state', 'heads', 'outbound'] as const)
    await expect(
      withExclusiveSlot('slot', (task) =>
        assertCoveredLocalJournal(
          task,
          'slot',
          [entry(new Uint8Array([1]))],
          [row(new Uint8Array([1]), kind)],
        ),
      ),
    ).rejects.toMatchObject({ code: 'repair-required' });
});
it('one missing update refuses the whole comparison even when other entries are represented', async () => {
  await expect(
    withExclusiveSlot('slot', (task) =>
      assertCoveredLocalJournal(
        task,
        'slot',
        [entry(new Uint8Array([1])), entry(new Uint8Array([2]))],
        [row(new Uint8Array([1]))],
      ),
    ),
  ).rejects.toMatchObject({ code: 'repair-required' });
});
it('duplicate immutable update bytes need no invented multiplicity or CRDT-vector shortcut', async () => {
  await withExclusiveSlot('slot', (task) =>
    assertCoveredLocalJournal(
      task,
      'slot',
      [entry(new Uint8Array([1])), entry(new Uint8Array([1]))],
      [row(new Uint8Array([1]))],
    ),
  );
});
it('a caller-shaped task cannot grant data retirement authority', async () => {
  await expect(
    assertCoveredLocalJournal({ step: vi.fn() } as unknown as SessionTask, 'slot', [], []),
  ).rejects.toThrow('exclusive task');
});

it('a real equal-length filter collision still requires full byte equality', async () => {
  // Deterministic8-byte collision for the non-cryptographic candidate filter, hash1262861256.
  const a = new Uint8Array([218, 57, 251, 218, 113, 191, 135, 26]);
  const b = new Uint8Array([234, 62, 78, 3, 65, 97, 83, 185]);
  const compare = vi.spyOn(comparisons, 'sameBytes');
  await expect(
    withExclusiveSlot('slot', (task) =>
      assertCoveredLocalJournal(task, 'slot', [entry(a)], [row(b)]),
    ),
  ).rejects.toMatchObject({ code: 'repair-required' });
  expect(compare).toHaveBeenCalledWith(b, a);
});
