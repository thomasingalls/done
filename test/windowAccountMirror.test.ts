// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createWindowAccountMirror } from '../src/crdt/windowAccountMirror';
import type { WindowAccountCohort } from '../src/crdt/accountWorkerCohort';
import { decodeSourceCapsule, eraseCapsule } from '../src/crdt/sourceCapture';
import { eraseJournalSnapshot } from '../src/crdt/journalStore';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { fixture, cleanupMirrorFixtures, scope, route } from './fixtures/accountMirror';
afterEach(cleanupMirrorFixtures);
const end = (w: Awaited<ReturnType<typeof createWindowAccountMirror>>) =>
  w.text({ kind: 'master' });
const sel = (at: number) => ({ ranges: [{ anchor: at, head: at }], main: 0 });
async function ready() {
  const f = await fixture(),
    w = await f.open();
  await w.whenDurable();
  // Match the next browser input task, after the explicit flush barrier finishes its queue turn.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { ...f, w };
}
it('local text is accepted and sealed in the same handler without a worker append', async () => {
  const f = await ready(),
    before = f.counts();
  f.hold();
  const text = end(f.w),
    at = text.read().text.length;
  const ticket = text.input({ name: 'insert', text: ' local' }, sel(at));
  expect(text.read().text).toBe(' local');
  expect(f.counts()).toEqual(before);
  expect(f.storage.length).toBeGreaterThan(0);
  expect(f.material.key.every((v) => v === 0)).toBe(true);
  await ticket.accepted;
  const snapshot = f.workerJournal.snapshot();
  expect(snapshot.length).toBeGreaterThan(0);
  eraseJournalSnapshot(snapshot);
  f.free();
});
it('the original human Undo and Redo operate on admitted mirror state', async () => {
  const f = await ready();
  await end(f.w).input({ name: 'insert', text: ' edit' }, sel(0)).accepted;
  await f.w.command({ kind: 'undo' }).accepted;
  expect(end(f.w).read().text).toBe('');
  await f.w.command({ kind: 'redo' }).accepted;
  expect(end(f.w).read().text).toBe(' edit');
});
it('quota refusal leaves text pending until the worker commit and later input cannot overtake', async () => {
  const f = await ready();
  f.hold();
  vi.spyOn(f.storage, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const first = end(f.w).input({ name: 'insert', text: 'a' }, sel(0)),
    second = end(f.w).input({ name: 'insert', text: 'b' }, sel(0));
  let accepted = false;
  void first.accepted.then(() => {
    accepted = true;
  });
  for (let i = 0; i < 20 && f.counts().appendCalls === 0; i++)
    await new Promise((r) => setTimeout(r, 0));
  expect(f.counts().appendCalls).toBe(1);
  expect(end(f.w).read().text).toBe('');
  expect(accepted).toBe(false);
  f.free();
  await first.accepted;
  await second.accepted;
  expect(end(f.w).read().text).toBe('ab');
});
it('closing during a commit never promotes its late reply and retains the recoverable suffix', async () => {
  const f = await ready();
  f.hold();
  vi.spyOn(f.storage, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  const ticket = end(f.w).input({ name: 'insert', text: 'uncertain' }, sel(0));
  const refused = expect(ticket.accepted).rejects.toThrow();
  for (let i = 0; i < 20 && f.counts().appendCalls === 0; i++)
    await new Promise((r) => setTimeout(r, 0));
  const closing = f.cohort.close();
  expect(f.cohort.state).toBe('closing');
  expect(f.held.some((v) => v.name === 'done/slot-writer/' + JSON.stringify(scope.slotId))).toBe(
    true,
  );
  f.free();
  await refused;
  await closing;
  expect(f.cohort.state).toBe('closed');
  expect(f.records.some((r) => r.kind === 'update')).toBe(true);
});
it('generic remote input cannot bypass the owned signed-page receiver', async () => {
  const f = await ready(),
    before = f.w.snapshot();
  await expect(f.w.receive(Uint8Array.of(0, 0)).accepted).rejects.toThrow('validation');
  expect(f.w.snapshot()).toEqual(before);
});
it('wrong incarnation refuses and consumes every owned incoming journal key', async () => {
  const f = await fixture();
  (f.material as { incarnation: string }).incarnation = 'ff'.repeat(16);
  const old = new Uint8Array(32).fill(9);
  (f.material as unknown as { previous: [number, Bytes][] }).previous = [[1, old]];
  await expect(f.open()).rejects.toThrow('bound');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
  expect(old.every((v) => v === 0)).toBe(true);
  expect(f.counts().loads).toBe(0);
});
it('wrong actor identity cannot create an admitted mirror or consult worker data', async () => {
  const f = await fixture();
  f.options.identity.id = 'ff'.repeat(16);
  await expect(f.open()).rejects.toThrow('bound');
  expect(f.counts().loads).toBe(0);
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('an opening cannot move journal writes to another database', async () => {
  const f = await fixture();
  (f.material as { dbName: string }).dbName = 'done.other';
  await expect(f.open()).rejects.toThrow('bound');
  expect(f.storage.length).toBe(0);
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('denied Window storage refuses the opening and erases its incoming subkey', async () => {
  const f = await fixture();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('denied', 'SecurityError');
    },
  });
  await expect(f.open()).rejects.toThrow('unavailable');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
  expect(f.cohort.state).toBe('closed');
});
it('a forged structural coordinator is refused without calling its supplied methods', async () => {
  const f = await fixture(),
    write = vi.fn(),
    close = vi.fn();
  await expect(
    createWindowAccountMirror(
      { write, close } as unknown as WindowAccountCohort,
      f.material,
      f.worker,
      f.options,
    ),
  ).rejects.toThrow('inactive');
  expect(write).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('cancellation during the initial asynchronous step cannot retain a live writer or subkey', async () => {
  const f = await fixture(),
    opening = f.open();
  const refused = expect(opening).rejects.toThrow();
  await f.cohort.close();
  await refused;
  expect(f.material.key.every((v) => v === 0)).toBe(true);
  expect(f.held).toEqual([]);
  expect(f.storage.length).toBe(0);
});
it('captures scope and actor identity before its first await', async () => {
  const f = await fixture(),
    opening = f.open();
  f.options.identity.id = 'ff'.repeat(16);
  f.material.route.principal = 'ff'.repeat(16);
  const w = await opening;
  await end(w).input({ name: 'insert', text: 'owned' }, sel(0)).accepted;
  const journal = f.workerJournal.snapshot();
  try {
    for (const e of journal) {
      const c = decodeSourceCapsule(e.bytes, route);
      expect(c.principal).toBe(scope.principalId);
      eraseCapsule(c);
    }
  } finally {
    eraseJournalSnapshot(journal);
  }
});
it('refuses an opening with a hidden authority-looking extension', async () => {
  const f = await fixture();
  Object.defineProperty(f.material, 'rootKey', { value: new Uint8Array(32), enumerable: true });
  await expect(f.open()).rejects.toThrow('bound');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('retained journal openers cannot replace the active generation', async () => {
  const f = await fixture(),
    old = new Uint8Array(32).fill(9);
  (f.material as unknown as { previous: [number, Bytes][] }).previous = [[1, old]];
  await expect(f.open()).rejects.toThrow('bound');
  expect(old.every((v) => v === 0)).toBe(true);
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
