// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createPageAccountWorkspace } from '../src/crdt/accountWorkspacePort';
import { createDoc, encodeState } from '../src/crdt/yjs';
import {
  makeSourceCapsule,
  decodeSourceCapsule,
  eraseCapsule,
  capturedRecovery,
} from '../src/crdt/sourceCapture';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { AdmissionCarrier } from '../src/crdt/admissionQueue';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { JournalUpdate } from '../src/crdt/journalStore';
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) await stop();
});
const identity = {
  id: '02'.repeat(16),
  actor: { kind: 'human' as const, name: 'Fixture', color: '#e0662f' },
  device: { id: 'fixture', name: 'Fixture' },
};
const route = {
  principal: identity.id,
  workspace: '03'.repeat(16),
  credential: '06'.repeat(16),
  epoch: 1,
  generation: 1,
};
async function fixture() {
  const stop = new AbortController(),
    cleanup: (() => void | Promise<void>)[] = [],
    records: OpenedRecord[] = [],
    pending: JournalUpdate[] = [];
  const doc = createDoc();
  records.push({ kind: 'state', gen: 1, seq: 1, bytes: new Uint8Array(encodeState(doc)) });
  doc.destroy();
  let state: AdmissionCarrier['state'] = 'active',
    next = 2,
    calls = 0;
  const commit = (input: readonly Bytes[]) => {
    const sequences: number[] = [];
    for (const bytes of input) {
      const capsule = decodeSourceCapsule(bytes, route);
      try {
        for (const source of capsule.sources) {
          const seq = next++;
          records.push({ kind: 'update', gen: 1, seq, bytes: source.bytes.slice() });
          sequences.push(seq);
        }
      } finally {
        eraseCapsule(capsule);
      }
    }
    return { storeId: '04'.repeat(16), generation: 1, sequences };
  };
  const carrier: AdmissionCarrier = {
    get state() {
      return state;
    },
    signal: stop.signal,
    beforeRelease: (fn) => cleanup.push(fn),
    observedJournalCharacters: 0,
    close: async () => {
      if (state !== 'active') return;
      state = 'closing';
      stop.abort();
      for (const fn of cleanup) await fn();
      state = 'closed';
    },
    captureLocal: (_update, sources) => makeSourceCapsule(route, sources ?? []),
    appendLocal: (bytes) => {
      const key = 'fixture-' + next++;
      pending.push({ key, generation: 1, bytes: bytes.slice() });
      return { status: 'journalled', key, generation: 1 };
    },
    appendBatch: async (input) => {
      calls++;
      return commit(input.map((r) => r.bytes));
    },
    loadRecovery: async () =>
      capturedRecovery(
        {
          records: records.map((r) => ({ ...r, bytes: r.bytes.slice() })),
          journal: pending.map((r) => ({ ...r, bytes: r.bytes.slice() })),
        },
        route,
      ),
    flushJournal: async () => {
      calls++;
      const removed = pending.length,
        receipt = commit(pending.map((r) => r.bytes));
      for (const r of pending.splice(0)) r.bytes.fill(0);
      return { contentReceipts: [receipt], removed, retained: 0 };
    },
  };
  const opened = await createPageAccountWorkspace(carrier, 'verified-device', {
    identity,
    today: () => '2026-10-29',
  });
  stops.push(() => opened.workspace.close());
  await opened.workspace.whenDurable();
  await new Promise((r) => setTimeout(r, 0));
  return { ...opened, pending, calls: () => calls };
}
it('page extraction keeps real same-handler admission, source capture and original Undo', async () => {
  const f = await fixture(),
    text = f.workspace.text({ kind: 'master' }),
    before = f.calls();
  const ticket = text.input(
    { name: 'insert', text: 'A real admitted edit.' },
    { ranges: [{ anchor: 0, head: 0 }], main: 0 },
  );
  expect(text.read().text).toBe('A real admitted edit.');
  expect(f.pending.length).toBeGreaterThan(0);
  expect(f.calls()).toBe(before);
  await ticket.accepted;
  await f.workspace.command({ kind: 'undo' }).accepted;
  expect(text.read().text).toBe('');
  await f.workspace.command({ kind: 'redo' }).accepted;
  expect(text.read().text).toBe('A real admitted edit.');
  await f.workspace.whenDurable();
  expect(f.pending).toHaveLength(0);
});
it('the application workspace cannot use the internal signed receiver without its original verifier', async () => {
  const f = await fixture(),
    before = f.workspace.snapshot();
  await expect(f.workspace.receive(new Uint8Array([1])).accepted).rejects.toMatchObject({
    code: 'receive-refused',
    cause: { message: 'Use the owned signed-page receiver' },
  });
  expect(f.workspace.snapshot()).toEqual(before);
});
it('actual internal receive queues preserve FIFO exclusion through an asynchronous commit', async () => {
  const f = await fixture(),
    text = f.workspace.text({ kind: 'master' });
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>((r) => (entered = r)),
    hold = new Promise<void>((r) => (release = r));
  const received = f.enqueue(Uint8Array.of(1), async (_bytes, promote) => {
    entered();
    await hold;
    promote([]);
    return 'settled';
  });
  await started;
  const ticket = text.input(
    { name: 'insert', text: 'queued behind real receive' },
    { ranges: [{ anchor: 0, head: 0 }], main: 0 },
  );
  expect(text.read().text).toBe('');
  release();
  expect(await received).toBe('settled');
  await ticket.accepted;
  expect(text.read().text).toBe('queued behind real receive');
});
it('a prepared no-op uses the original final FIFO callback without exposing it on the workspace', async () => {
  const f = await fixture();
  let finished = 0;
  expect('enqueue' in f.workspace).toBe(false);
  expect('prepare' in f.workspace).toBe(false);
  await f.prepare(Uint8Array.of(1), async (_bytes, stage) => {
    stage([], async (apply) => {
      finished++;
      apply();
    });
    return true;
  });
  expect(finished).toBe(1);
  expect(f.workspace.status.state).toBe('active');
});
