// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  Y,
  createHistoryDoc,
  workspaceUndo,
  forkWorkspaceHistory,
  forkDoc,
  sameDocState,
} from '../src/crdt/yjs';
import { cloneDocument } from '../src/crdt/admissionDocument';
import {
  AdmissionError,
  createAdmissionOwner,
  type AdmissionSession,
} from '../src/crdt/admissionQueue';
import { createAdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import type { JournalSession } from '../src/crdt/custody';
import { startupRefusal } from '../src/crdt/ownedStartup';
import { makeSource } from './storage-properties/oracle';

const corpus = () =>
  makeSource([
    { lane: 0, actor: 1, at: 0, text: 'a', remove: 0 },
    ...Array.from({ length: 3 }, () => ({ lane: 0, actor: 0, at: 0, text: 'a', remove: 0 })),
  ]);
const view = (doc: Y.Doc) => [0, 1, 2].map((i) => doc.getText(`lane${i}`).toString());
const pending = (doc: Y.Doc) => ({
  missing: [...(doc.store.pendingStructs?.missing ?? [])].sort(([a], [b]) => a - b),
  update: doc.store.pendingStructs?.update,
  ds: doc.store.pendingDs,
});
describe('pending document forks', () => {
  it('classifies runtime projection mismatch separately from persisted corruption', () => {
    const error = new AdmissionError('projection-mismatch', 'mismatch');
    expect(startupRefusal(error)).toEqual({
      kind: 'unavailable',
      reason: 'runtime-projection-mismatch',
    });
    expect(startupRefusal(error, AbortSignal.abort())).toMatchObject({ kind: 'cancelled' });
  });
  it('preserves a projection failure raised during admitted initialization through lifecycle shutdown', async () => {
    let session: AdmissionSession | undefined,
      checks = 0;
    const carrier = {
      state: 'active',
      signal: new AbortController().signal,
      loadRecovery: async () => ({ records: [], journal: [] }),
      appendLocal: () => ({ status: 'journalled' }),
      flushJournal: async () => ({ retained: 0 }),
      close: async () => {},
    } as unknown as JournalSession;
    try {
      await expect(
        createAdmittedWorkspace(
          async (options) => {
            session = await createAdmissionOwner(carrier, options);
            return {
              ...session,
              get status() {
                return session!.status;
              },
              matches: () => ++checks === 1,
            };
          },
          {
            identity: {
              id: 'human',
              actor: { kind: 'human', name: 'test', color: '#3f8fd6' },
              device: { id: 'device', name: 'test' },
            },
            validateReceive: () => {},
            today: () => '2026-09-08',
          },
        ),
      ).rejects.toMatchObject({ code: 'projection-mismatch' });
    } finally {
      await session?.close();
    }
  });
  it.each(['draft', 'history'])(
    'preserves the saved pending corpus through a %s fork and later basis',
    (kind) => {
      const source = corpus(),
        original = createHistoryDoc(),
        manager = workspaceUndo(original, 'human');
      for (const id of [3, 1, 5]) Y.applyUpdate(original, Uint8Array.from(source.updates[id]!));
      const history = kind === 'history' ? forkWorkspaceHistory(manager, 'human') : undefined;
      const fork = history?.doc ?? cloneDocument(original);
      try {
        expect(pending(fork)).toEqual(pending(original));
        for (const id of [0, 2, 4, 6])
          for (const doc of [original, fork])
            Y.applyUpdate(doc, Uint8Array.from(source.updates[id]!));
        expect(view(original)).toEqual(source.final);
        expect(view(fork)).toEqual(source.final);
        expect(fork.store.pendingStructs).toBeNull();
        expect(fork.store.pendingDs).toBeNull();
      } finally {
        history?.destroy();
        manager.destroy();
        fork.destroy();
        original.destroy();
      }
    },
  );
  it('detaches pending structs, missing-clock maps and pending deletion bytes from the source', () => {
    const source = makeSource([{ lane: 0, actor: 1, at: 1, text: 'later', remove: 2 }]);
    const original = createHistoryDoc();
    Y.applyUpdate(original, Uint8Array.from(source.updates[3]!));
    expect(original.store.pendingStructs).not.toBeNull();
    expect(original.store.pendingDs).not.toBeNull();
    const before = structuredClone(pending(original)),
      fork = forkDoc(original, false);
    try {
      expect(sameDocState(original, fork)).toBe(true);
      fork.store.pendingStructs!.missing.set(999, 100);
      fork.store.pendingStructs!.update.fill(0);
      fork.store.pendingDs!.fill(0);
      expect(pending(original)).toEqual(before);
      expect(sameDocState(original, fork)).toBe(false);
    } finally {
      original.destroy();
      fork.destroy();
    }
  });
  it('compares actual content and deletions even when integrated state vectors agree', () => {
    const a = createHistoryDoc(),
      b = createHistoryDoc();
    a.clientID = b.clientID = 101;
    a.getText('master').insert(0, 'AA');
    b.getText('master').insert(0, 'BB');
    try {
      expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
      expect(sameDocState(a, b)).toBe(false);
      const c = forkDoc(a);
      try {
        expect(sameDocState(a, c)).toBe(true);
        a.getText('master').delete(0, 1);
        expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(c));
        expect(sameDocState(a, c)).toBe(false);
        Y.applyUpdate(c, Y.encodeStateAsUpdate(a));
        expect(sameDocState(a, c)).toBe(true);
      } finally {
        c.destroy();
      }
    } finally {
      a.destroy();
      b.destroy();
    }
  });
  it('preserves generated delivery histories across repeated detached forks and later dependencies', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lane: fc.nat(2),
            actor: fc.nat(2),
            at: fc.nat(40),
            remove: fc.nat(8),
            text: fc.string({ maxLength: 6 }),
          }),
          { maxLength: 22 },
        ),
        fc.array(fc.nat(100), { minLength: 1, maxLength: 30 }),
        fc.boolean(),
        (edits, keys, reorder) => {
          const source = makeSource(edits),
            original = createHistoryDoc();
          let fork = forkDoc(original, false);
          const order = source.updates.map((_, i) => i);
          if (reorder)
            order.sort((a, b) => keys[a % keys.length]! - keys[b % keys.length]! || a - b);
          try {
            for (const id of order) {
              for (const doc of [original, fork])
                Y.applyUpdate(doc, Uint8Array.from(source.updates[id]!));
              expect(view(fork)).toEqual(view(original));
              expect(sameDocState(original, fork)).toBe(true);
              const next = forkDoc(fork, false);
              fork.destroy();
              fork = next;
              expect(pending(fork)).toEqual(pending(original));
            }
            // The pinned delivery repair now owns the complete external oracle for every order.
            expect(view(fork)).toEqual(source.final);
            expect(fork.store.pendingStructs).toBeNull();
            expect(fork.store.pendingDs).toBeNull();
          } finally {
            original.destroy();
            fork.destroy();
          }
        },
      ),
      { seed: 8941, numRuns: 500 },
    );
  });
});

// Frozen pre-experiment V1 fork oracle; does not call the optimized fork or comparator.
const v1Fork = (source: Y.Doc, gc: boolean) => {
  const doc = new Y.Doc({ gc });
  const bytes = Y.encodeStateAsUpdate({
    ...source,
    store: { ...source.store, pendingStructs: null, pendingDs: null },
  } as Y.Doc);
  try {
    Y.applyUpdate(doc, bytes);
    const p = source.store.pendingStructs;
    doc.store.pendingStructs = p ? { missing: new Map(p.missing), update: p.update.slice() } : null;
    doc.store.pendingDs = source.store.pendingDs?.slice() ?? null;
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  } finally {
    bytes.fill(0);
  }
};

it('generated runtime codec forks agree with V1 and detach nested mutable content in both directions', () => {
  fc.assert(
    fc.property(
      fc
        .array(fc.integer({ min: 0, max: 0xffff }), { minLength: 1, maxLength: 180 })
        .map((units) => String.fromCharCode(...units)),
      fc.jsonValue(),
      fc.uint8Array({ minLength: 1, maxLength: 80 }),
      fc.boolean(),
      (value, json, binary, gc) => {
        const source = createHistoryDoc();
        source.clientID = 107;
        const text = source.getText('master');
        text.insert(0, value + '😀\uFEFF');
        text.delete(0, Math.floor(value.length / 2));
        const map = source.getMap('meta');
        map.set('json', { rows: [structuredClone(json)] });
        map.set('binary', binary.slice());
        map.set('scalars', [undefined, null, -0, NaN, Infinity, 10n]);
        const nested = new Y.Map();
        map.set('nested', nested);
        const array = new Y.Array();
        nested.set('array', array);
        array.push([value, { value }]);
        const child = new Y.Text();
        nested.set('text', child);
        child.insert(0, value);
        const xml = new Y.XmlElement('node');
        xml.setAttribute('name', value);
        source.getXmlFragment('xml').insert(0, [xml]);
        const before = Y.encodeStateAsUpdate(source),
          expected = v1Fork(source, gc),
          actual = forkDoc(source, gc);
        try {
          expect(Y.encodeStateAsUpdate(actual)).toEqual(Y.encodeStateAsUpdate(expected));
          expect(actual.getText('master').toDelta()).toEqual(expected.getText('master').toDelta());
          expect(pending(actual)).toEqual(pending(expected));
          (actual.getMap('meta').get('json') as { rows: unknown[] }).rows.push('private');
          (actual.getMap('meta').get('binary') as Uint8Array).fill(0);
          const forkNested = actual.getMap('meta').get('nested') as Y.Map<unknown>;
          (forkNested.get('text') as Y.Text).insert(0, 'private');
          (forkNested.get('array') as Y.Array<unknown>).push(['private']);
          expect(Y.encodeStateAsUpdate(source)).toEqual(before);
          const actualBefore = Y.encodeStateAsUpdate(actual);
          (map.get('json') as { rows: unknown[] }).rows.push('accepted');
          (map.get('binary') as Uint8Array).fill(255);
          text.insert(0, 'accepted');
          expect(Y.encodeStateAsUpdate(actual)).toEqual(actualBefore);
        } finally {
          actual.destroy();
          expected.destroy();
          source.destroy();
        }
      },
    ),
    { seed: 140918, numRuns: 200 },
  );
});

it('runtime forks preserve V1 legacy JSON conversion in text formatting and embeds', () => {
  const source = createHistoryDoc();
  const text = source.getText('master');
  text.insert(0, 'example');
  const value = {
    absent: undefined,
    nonfinite: NaN,
    infinity: Infinity,
    zero: -0,
    date: new Date(0),
  };
  text.format(0, 4, { legacy: value });
  text.insertEmbed(2, value);
  const expected = v1Fork(source, false),
    actual = forkDoc(source, false);
  try {
    expect(actual.getText('master').toDelta()).toEqual(expected.getText('master').toDelta());
    expect(Y.encodeStateAsUpdate(actual)).toEqual(Y.encodeStateAsUpdate(expected));
  } finally {
    source.destroy();
    expected.destroy();
    actual.destroy();
  }
});

it('runtime forks preserve independent UTF-8 replacement across adjacent root and text fields', () => {
  const source = createHistoryDoc();
  source.getText('root\uD800').insert(0, '\uDC00body');
  source.getText('normal').insert(0, 'middle\uD800x\uDC00end');
  const expected = v1Fork(source, false),
    actual = forkDoc(source, false);
  try {
    expect([...actual.share.keys()]).toEqual([...expected.share.keys()]);
    for (const key of expected.share.keys())
      expect(actual.getText(key).toString()).toBe(expected.getText(key).toString());
  } finally {
    source.destroy();
    expected.destroy();
    actual.destroy();
  }
});

it('generated human undo and redo match an unforked history through repeated private forks', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          kind: fc.constantFrom('insert', 'delete', 'undo', 'redo', 'boundary'),
          at: fc.nat(80),
          count: fc.nat(12),
          text: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        { minLength: 12, maxLength: 45 },
      ),
      (actions) => {
        const source = createHistoryDoc();
        source.clientID = 108;
        source.getText('master').insert(0, 'initial text');
        const reference = workspaceUndo(source, 'human');
        let actual = workspaceUndo(v1Fork(source, false), 'human');
        const run = (
          history: ReturnType<typeof workspaceUndo>,
          action: (typeof actions)[number],
        ) => {
          const doc = history.doc,
            text = doc.getText('master');
          doc.clientID = 108;
          if (action.kind === 'undo') history.undo();
          else if (action.kind === 'redo') history.redo();
          else if (action.kind === 'boundary') history.stopCapturing();
          else
            doc.transact(() => {
              const at = action.at % (text.length + 1);
              if (action.kind === 'insert') text.insert(at, action.text);
              else text.delete(at, Math.min(action.count, text.length - at));
            }, 'human');
          const item = history.undoStack.at(-1);
          if (item) item.meta.set('selection', new Map([['master', [text.length]]]));
        };
        // Always include a redone chain before the generated suffix.
        const prefix: typeof actions = [
          { kind: 'insert', at: 1, count: 0, text: 'first' },
          { kind: 'undo', at: 0, count: 0, text: '' },
          { kind: 'redo', at: 0, count: 0, text: '' },
          { kind: 'undo', at: 0, count: 0, text: '' },
          { kind: 'redo', at: 0, count: 0, text: '' },
        ];
        try {
          for (const action of [...prefix, ...actions]) {
            const previous = actual,
              before = Y.encodeStateAsUpdate(previous.doc);
            actual = forkWorkspaceHistory(previous, 'human');
            try {
              const item = actual.undoStack.at(-1) ?? actual.redoStack.at(-1);
              const priorItem = previous.undoStack.at(-1) ?? previous.redoStack.at(-1);
              if (item && priorItem) {
                const selection = item.meta.get('selection') as Map<string, number[]> | undefined;
                if (selection) {
                  const old = structuredClone(priorItem.meta);
                  selection.get('master')!.push(999);
                  expect(priorItem.meta).toEqual(old);
                  selection.get('master')!.pop();
                }
              }
              run(actual, action);
              expect(Y.encodeStateAsUpdate(previous.doc)).toEqual(before);
              run(reference, action);
              expect(actual.doc.getText('master').toString()).toBe(
                source.getText('master').toString(),
              );
              expect(actual.undoStack.length).toBe(reference.undoStack.length);
              expect(actual.redoStack.length).toBe(reference.redoStack.length);
              expect(Y.encodeStateAsUpdate(actual.doc)).toEqual(Y.encodeStateAsUpdate(source));
            } finally {
              previous.destroy();
              previous.doc.destroy();
            }
          }
        } finally {
          actual.destroy();
          actual.doc.destroy();
          reference.destroy();
          source.destroy();
        }
      },
    ),
    { seed: 140919, numRuns: 150 },
  );
});

it('runtime forks preserve and detach binary leaves nested inside arbitrary arrays and objects', () => {
  const source = createHistoryDoc();
  source.getMap('meta').set('nested-bytes', { rows: [new Uint8Array([17, 29, 43])] });
  const before = Y.encodeStateAsUpdate(source),
    actual = forkDoc(source, false);
  try {
    const original = source.getMap('meta').get('nested-bytes') as { rows: Uint8Array[] },
      copy = actual.getMap('meta').get('nested-bytes') as { rows: Uint8Array[] };
    expect(copy.rows[0]).toEqual(new Uint8Array([17, 29, 43]));
    expect(Y.encodeStateAsUpdate(actual)).toEqual(before);
    copy.rows[0]!.fill(0);
    expect(original.rows[0]).toEqual(new Uint8Array([17, 29, 43]));
    original.rows[0]!.fill(255);
    expect(copy.rows[0]).toEqual(new Uint8Array([0, 0, 0]));
  } finally {
    actual.destroy();
    source.destroy();
  }
});
