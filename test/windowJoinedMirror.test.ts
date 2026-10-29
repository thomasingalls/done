// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { fixture, cleanupMirrorFixtures, scope, route } from './fixtures/accountMirror';
import { decodeSourceCapsule, eraseCapsule } from '../src/crdt/sourceCapture';
import { eraseJournalSnapshot } from '../src/crdt/journalStore';
import { deriveStoreName } from '../src/crdt/storeName';
const logical = { ...route, principal: '17'.repeat(16), workspace: '18'.repeat(16) };
afterEach(cleanupMirrorFixtures);
const selection = (at: number) => ({ ranges: [{ anchor: at, head: at }], main: 0 });
async function ready() {
  const f = await fixture(logical),
    controller = await f.openController(),
    w = controller.workspace;
  await w.whenDurable();
  await new Promise((r) => setTimeout(r, 0));
  return { ...f, controller, w };
}
it('seals logical Account sources inside the distinct physical Local journal scope', async () => {
  const f = await ready();
  const field = f.w.text({ kind: 'master' });
  const ticket = field.input({ name: 'insert', text: 'joined writing' }, selection(0));
  expect(field.read().text).toBe('joined writing');
  expect(f.storage.length).toBeGreaterThan(0);
  await ticket.accepted;
  const journal = f.workerJournal.snapshot();
  try {
    expect(journal.length).toBeGreaterThan(0);
    for (const r of journal) {
      const c = decodeSourceCapsule(r.bytes, logical);
      expect(c.principal).toBe(logical.principal);
      expect(c.workspace).toBe(logical.workspace);
      eraseCapsule(c);
      expect(() => decodeSourceCapsule(r.bytes, route)).toThrow();
    }
  } finally {
    eraseJournalSnapshot(journal);
  }
  await f.w.whenDurable();
  expect(f.counts().flushCalls).toBeGreaterThan(0);
});
it('a legitimate joined route retains canonical Undo across a fresh epoch handoff', async () => {
  const f = await ready();
  await f.w.text({ kind: 'master' }).input({ name: 'insert', text: 'kept undo' }, selection(0))
    .accepted;
  await f.controller.journalFence(async (fence) => {
    f.moveWorkerContext(2);
    await f.controller.rebind(fence, f.opening());
  });
  await f.w.command({ kind: 'undo' }).accepted;
  expect(f.w.text({ kind: 'master' }).read().text).toBe('');
  await f.w.command({ kind: 'redo' }).accepted;
  expect(f.w.text({ kind: 'master' }).read().text).toBe('kept undo');
});
for (const key of ['workspace', 'principal'] as const)
  it(
    'a rebind cannot replace the fixed logical ' + key + ' while retaining physical keys',
    async () => {
      const f = await ready(),
        incoming = f.opening();
      (incoming.route as Record<string, unknown>)[key] = 'ff'.repeat(16);
      await expect(
        f.controller.journalFence((fence) => f.controller.rebind(fence, incoming)),
      ).rejects.toThrow('Admission closed');
      expect(f.cohort.signal.aborted).toBe(true);
      expect(incoming.key.every((v) => v === 0)).toBe(true);
    },
  );
it('physical identity cannot impersonate the logical actor at opening', async () => {
  const f = await fixture(logical);
  f.options.identity.id = scope.principalId;
  await expect(f.openController()).rejects.toThrow('bound');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
for (const key of ['workspace', 'principal'] as const)
  it(
    'malformed logical ' + key + ' is refused independently of a valid physical scope',
    async () => {
      const f = await fixture(logical);
      (f.material.route as Record<string, unknown>)[key] = 'invalid';
      await expect(f.openController()).rejects.toThrow('bound');
      expect(f.material.key.every((v) => v === 0)).toBe(true);
    },
  );
it('the database name stays derived from physical custody identity', async () => {
  const f = await fixture(logical);
  (f.material as { dbName: string }).dbName = await deriveStoreName(
    logical.principal,
    logical.workspace,
  );
  await expect(f.openController()).rejects.toThrow('bound');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
it('journal era bindings remain attached to physical custody rather than the logical Account route', async () => {
  const f = await fixture(logical);
  (f.material as unknown as { binding: unknown }).binding = {
    identity: { ...scope, principalId: logical.principal, workspaceId: logical.workspace },
    intent: 'controlled-joined-era',
    era: { current: '11'.repeat(32), previous: null, revision: 1 },
  };
  await expect(f.openController()).rejects.toThrow('bound');
  expect(f.material.key.every((v) => v === 0)).toBe(true);
});
