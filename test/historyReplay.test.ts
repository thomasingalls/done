// @vitest-environment node
import { it, expect } from 'vitest';
import fc from 'fast-check';
import {
  Y,
  createHistoryDoc,
  createSelectionHistory,
  isTextBufferBasis,
  sameDocState,
  encodeState,
  applyUpdate,
  type YDoc,
  type YUndoManager,
} from '../src/crdt/yjs';
const links = (doc: YDoc) => {
  const out: [string, string][] = [];
  for (const structs of doc.store.clients.values())
    for (const item of structs)
      if (item instanceof Y.Item && item.redone)
        for (let i = 0; i < item.length; i++)
          out.push([
            `${item.id.client}:${item.id.clock + i}`,
            `${item.redone.client}:${item.redone.clock + i}`,
          ]);
  return out.sort(([a], [b]) => a.localeCompare(b));
};
const dispose = (h: YUndoManager) => {
  h.destroy();
  h.doc.destroy();
};
const equal = (a: YUndoManager, b: YUndoManager) => {
  expect(sameDocState(a.doc, b.doc)).toBe(true);
  expect(links(a.doc)).toEqual(links(b.doc));
  expect(a.undoStack).toEqual(b.undoStack);
  expect(a.redoStack).toEqual(b.redoStack);
  expect(a.doc.getText('master').toString()).toBe(b.doc.getText('master').toString());
};

it('generated native text replay equals fresh history including old redone chains, split deletions and both stacks', () => {
  const steps = fc.array(
    fc.record({
      at: fc.nat(80),
      len: fc.integer({ min: 1, max: 5 }),
      insert: fc.boolean(),
      group: fc.boolean(),
      text: fc.constantFrom('é', '\u0000', '中', 'abc', '\ufffd', '\u2028'),
    }),
    { minLength: 20, maxLength: 50 },
  );
  fc.assert(
    fc.property(steps, (actions) => {
      const owner = createSelectionHistory(),
        human = {},
        source = owner.create(createHistoryDoc(), human);
      let target: YUndoManager | undefined, fresh: YUndoManager | undefined;
      try {
        source.doc.clientID = 80001;
        source.doc.getMap('meta').set('nested', {
          values: [undefined, null, -0, Number.MIN_VALUE, Number.MAX_VALUE, 'naïve'],
          nested: { é: '中' },
        });
        source.doc.transact(() => source.doc.getText('master').insert(0, 'abcdef ghijkl'), human);
        source.undo();
        source.redo();
        source.undo();
        source.redo(); // Existing multi-hop links before any buffer replay.
        expect(links(source.doc).length).toBeGreaterThan(0);
        target = owner.fork(source, human);
        expect(isTextBufferBasis(source.doc)).toBe(true);
        let writer = 81000;
        for (const step of actions) {
          const updates: Uint8Array[] = [];
          const capture = (b: Uint8Array) => updates.push(b.slice());
          source.doc.clientID = ++writer;
          if (step.group) source.stopCapturing();
          source.doc.on('update', capture);
          const text = source.doc.getText('master'),
            at = Math.min(step.at, text.length);
          source.doc.transact(() => {
            if (step.insert) text.insert(at, step.text);
            else if (at < text.length) text.delete(at, Math.min(step.len, text.length - at));
          }, human);
          source.doc.off('update', capture);
          const update = updates.length ? Y.mergeUpdates(updates) : new Uint8Array([0, 0]);
          owner.catchUpText(target, source, update);
          fresh = owner.fork(source, human);
          equal(target, fresh);
          equal(target, source);
          expect(isTextBufferBasis(target.doc)).toBe(true);
          expect(target.doc.getMap('meta').get('nested')).toEqual(
            source.doc.getMap('meta').get('nested'),
          );
          expect(target.doc.getMap('meta').get('nested')).not.toBe(
            source.doc.getMap('meta').get('nested'),
          );
          const replay = createHistoryDoc();
          try {
            applyUpdate(replay, encodeState(target.doc));
            expect(sameDocState(replay, source.doc)).toBe(true);
          } finally {
            replay.destroy();
          }
          dispose(fresh);
          fresh = undefined;
          update.fill(0);
          for (const b of updates) b.fill(0);
        }
        fresh = owner.fork(source, human);
        const undos = fresh.undoStack.length;
        for (let i = 0; i < undos; i++) {
          fresh.doc.clientID = target.doc.clientID = ++writer;
          fresh.undo();
          target.undo();
          equal(target, fresh);
        }
        const redos = fresh.redoStack.length;
        for (let i = 0; i < redos; i++) {
          fresh.doc.clientID = target.doc.clientID = ++writer;
          fresh.redo();
          target.redo();
          equal(target, fresh);
        }
      } finally {
        if (fresh) dispose(fresh);
        if (target) dispose(target);
        dispose(source);
        owner.close();
      }
    }),
    { seed: 171511, numRuns: 100 },
  );
}, 30000);

it('documents the trusted replay boundary: raw same-clock private-field mutation is not validated by replay', () => {
  const owner = createSelectionHistory(),
    human = {},
    source = owner.create(createHistoryDoc(), human);
  source.doc.getText('master').insert(0, 'A');
  const target = owner.fork(source, human),
    updates: Uint8Array[] = [];
  try {
    const item = target.doc.getText('master')._start!;
    expect(item.content).toBeInstanceOf(Y.ContentString);
    (item.content as Y.ContentString).str = 'X'; // Deliberately outside Yjs transactions and owner APIs.
    source.doc.on('update', (b) => updates.push(b.slice()));
    source.doc.getText('master').insert(1, 'B');
    owner.catchUpText(target, source, updates[0]!);
    expect(target.doc.getText('master').toString()).toBe('XB');
    expect(source.doc.getText('master').toString()).toBe('AB');
    expect(sameDocState(target.doc, source.doc)).toBe(false);
  } finally {
    dispose(target);
    dispose(source);
    owner.close();
    for (const b of updates) b.fill(0);
  }
});
