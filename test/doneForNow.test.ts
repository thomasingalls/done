// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createAdmittedWorkspace, type AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import { createAdmissionOwner } from '../src/crdt/admissionQueue';
import type { JournalSession } from '../src/crdt/custody';
import {
  cardAt,
  cardBody,
  cardId,
  cardText,
  cardsIn,
  compose,
  doneForNow,
  transact,
} from '../src/crdt';
import { harness, TODAY, type Harness } from './workspace';

const identity = {
  id: 'progress-human',
  actor: { kind: 'human' as const, name: 'Test', color: '#777777' },
  device: { id: 'progress-device', name: 'Test' },
};
const to = { date: TODAY, section: 'next' as const };
const PATH = [
  { level: 1, title: 'Work' },
  { level: 3, title: 'Project' },
];
const BODY = 'Keep going\n- First detail\n  - Nested detail';
let context: Harness | undefined;
afterEach(() => context?.destroy());

it('records one Done copy and schedules the original atomically, preserving provenance and manual tails', async () => {
  context = await harness();
  compose(context.me, { date: TODAY, section: 'done' }, 'earlier progress');
  compose(context.me, { date: TODAY, section: 'scheduled' }, 'earlier plan');
  compose(context.me, to, BODY, { goalsContext: PATH });
  const original = cardsIn(context.store.doc, TODAY, 'next')[0]!;
  const id = cardId(original);
  const originalFields = original.toJSON();
  const observed: string[][] = [];
  const observe = () =>
    observed.push(
      ['next', 'done', 'scheduled'].map((s) =>
        cardsIn(context!.store.doc, TODAY, s as 'next' | 'done' | 'scheduled')
          .map(cardBody)
          .join('|'),
      ),
    );
  context.store.doc.on('update', observe);
  const copyId = doneForNow(context.me, to, id)!;
  context.store.doc.off('update', observe);
  expect(observed).toEqual([['', BODY + '|earlier progress', BODY + '|earlier plan']]);
  expect(copyId).not.toBe(id);
  const copy = cardAt(context.store.doc, copyId)!;
  expect(copy.get('origin')).toBe(id);
  expect(copy.get('author')).toBe(context.me.author);
  expect(original.toJSON()).toEqual(originalFields);
  expect(copy.toJSON()['goalsContext']).toEqual(originalFields['goalsContext']);
  context.store.undo.undo();
  expect(cardsIn(context.store.doc, TODAY, 'next').map(cardId)).toEqual([id]);
  expect(cardAt(context.store.doc, copyId)).toBeUndefined();
  expect(cardsIn(context.store.doc, TODAY, 'scheduled').map(cardBody)).toEqual(['earlier plan']);
  context.store.undo.redo();
  const restored = cardAt(context.store.doc, copyId)!;
  transact(context.store.doc, context.me.origin, () => cardText(restored).insert(0, 'progress: '));
  expect(cardBody(original)).toBe(BODY);
  expect(cardBody(restored)).toBe('progress: ' + BODY);
});

it('refuses a non-Next source, a stale location and a frozen day without any writes', async () => {
  context = await harness();
  compose(context.me, { date: TODAY, section: 'scheduled' }, BODY);
  const id = cardId(cardsIn(context.store.doc, TODAY, 'scheduled')[0]!);
  const before = context.store.doc.toJSON();
  expect(doneForNow(context.me, { date: TODAY, section: 'scheduled' }, id)).toBeNull();
  expect(doneForNow(context.me, to, id)).toBeNull();
  expect(doneForNow({ ...context.me, today: '2026-08-09' }, to, id)).toBeNull();
  expect(context.store.doc.toJSON()).toEqual(before);
  compose(context.me, to, 'frozen next');
  const nextId = cardId(cardsIn(context.store.doc, TODAY, 'next')[0]!);
  const seeded = context.store.doc.toJSON();
  expect(doneForNow({ ...context.me, today: '2026-08-09' }, to, nextId)).toBeNull();
  expect(context.store.doc.toJSON()).toEqual(seeded);
});

// Controlled admission carrier; these are semantic/durability controls, not crypto qualification.
const fixture = async (
  preparation: 'reference' | 'local-snapshots' | 'account-text',
  seed: Uint8Array[] = [],
) => {
  const disk: Uint8Array[] = seed.map((b) => b.slice()),
    wal: Uint8Array[] = [];
  let refuse = false,
    gate: Promise<void> | undefined,
    release: (() => void) | undefined;
  const abort = new AbortController();
  const carrier = {
    state: 'active',
    signal: abort.signal,
    ...(preparation === 'account-text'
      ? { captureLocal: (update: Uint8Array) => update.slice() }
      : {}),
    loadRecovery: async () => ({
      records: disk.map((bytes) => ({ kind: 'update', bytes: bytes.slice() })),
      journal: wal.map((bytes) => ({ bytes: bytes.slice() })),
    }),
    appendLocal(bytes: Uint8Array) {
      if (refuse) return { status: 'refused', reason: 'quota' };
      wal.push(bytes.slice());
      return { status: 'journalled' };
    },
    async appendBatch(records: { bytes: Uint8Array }[]) {
      await gate;
      disk.push(...records.map((r) => r.bytes.slice()));
      return {};
    },
    async flushJournal() {
      disk.push(...wal.splice(0));
      return { retained: 0 };
    },
    async close() {
      release?.();
    },
  } as unknown as JournalSession;
  const workspace = await createAdmittedWorkspace(
    (options) => createAdmissionOwner(carrier, options),
    {
      identity,
      today: () => to.date,
      validateReceive: () => {},
      ...(preparation === 'account-text'
        ? { captureSources: true, suppressEmptySources: true }
        : {}),
    },
    preparation,
  );
  return {
    workspace,
    disk,
    wal,
    hold() {
      refuse = true;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    resume() {
      release?.();
      gate = undefined;
      refuse = false;
    },
  };
};
const waitPending = async (w: AdmittedWorkspace) => {
  for (let n = 0; n < 100; n++) {
    if (w.status.pendingItems) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw Error('No pending semantic command');
};

for (const preparation of ['reference', 'local-snapshots', 'account-text'] as const) {
  it(`${preparation} admits both effects together, Undo/Redo and cold recovery retain the pair`, async () => {
    const f = await fixture(preparation);
    let reopened: Awaited<ReturnType<typeof fixture>> | undefined;
    try {
      await f.workspace.command({ kind: 'copy', to, lines: [BODY], goalsContexts: [PATH] })
        .accepted;
      const original = f.workspace.read().cards[0]!;
      const result = await f.workspace.command({ kind: 'done-for-now', id: original.id }).accepted;
      expect(typeof result.value).toBe('string');
      const copyId = result.value as string;
      const snap = f.workspace.read();
      expect(snap.days[0]!.next).toEqual([]);
      expect(snap.days[0]!.scheduled).toEqual([original.id]);
      expect(snap.days[0]!.done).toEqual([copyId]);
      expect(snap.cards.find((c) => c.id === original.id)).toEqual({
        ...original,
        location: { date: TODAY, section: 'scheduled' },
      });
      const copy = snap.cards.find((c) => c.id === copyId)!;
      expect(copy).toMatchObject({
        text: BODY,
        origin: original.id,
        author: identity.id,
        goalsContext: PATH,
      });
      await f.workspace.command({ kind: 'undo' }).accepted;
      expect(f.workspace.read().days[0]!.next).toEqual([original.id]);
      expect(f.workspace.read().cards).toEqual([original]);
      await f.workspace.command({ kind: 'redo' }).accepted;
      expect(f.workspace.read().days[0]!.done).toEqual([copyId]);
      await f.workspace.whenDurable();
      reopened = await fixture(preparation, f.disk);
      expect(reopened.workspace.read().days).toEqual(f.workspace.read().days);
      expect(reopened.workspace.read().cards).toEqual(f.workspace.read().cards);
    } finally {
      await reopened?.workspace.close();
      await f.workspace.close();
    }
  });
  it(`${preparation} keeps both effects private during refusal and copies queued predecessor text`, async () => {
    const f = await fixture(preparation);
    try {
      await f.workspace.command({ kind: 'compose', to, text: BODY }).accepted;
      const original = f.workspace.read().cards[0]!;
      const before = f.workspace.read();
      f.hold();
      const text = f.workspace
        .text({ kind: 'card', id: original.id })
        .input({ name: 'insert', text: 'new detail ' });
      const action = f.workspace.command({ kind: 'done-for-now', id: original.id });
      await waitPending(f.workspace);
      expect(f.workspace.read().cards).toEqual(before.cards);
      expect(f.workspace.read().days).toEqual(before.days);
      f.resume();
      await text.accepted;
      const copyId = (await action.accepted).value as string;
      const snap = f.workspace.read();
      expect(snap.cards).toHaveLength(2);
      const source = snap.cards.find((c) => c.id === original.id)!;
      expect(source.text).toContain('new detail ');
      expect(snap.cards.find((c) => c.id === copyId)!.text).toBe(source.text);
      expect(snap.days[0]!.scheduled).toEqual([original.id]);
      expect(snap.days[0]!.done).toEqual([copyId]);
      expect(
        (await f.workspace.command({ kind: 'done-for-now', id: original.id }).accepted).value,
      ).toBeNull();
      expect(f.workspace.read().cards).toHaveLength(2);
    } finally {
      f.resume();
      await f.workspace.close();
    }
  });
}
