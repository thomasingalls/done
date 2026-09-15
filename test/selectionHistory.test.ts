// @vitest-environment node
import { it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  Y,
  createHistoryDoc,
  workspaceUndo,
  createSelectionHistory,
  forkWorkspaceHistory,
  type YUndoManager,
} from '../src/crdt/yjs';
import { relativeSelection, resolveSelection } from '../src/crdt/workspaceCommands';
import type { SelectionSnapshot } from '../src/crdt/selectionSnapshots';
const origin = {};
const dispose = (h: YUndoManager) => {
  h.destroy();
  h.doc.destroy();
};
const positions = (h: YUndoManager, at = 0) =>
  new Map([
    [
      'master',
      relativeSelection(h.doc.getText('master'), { ranges: [{ anchor: at, head: at }], main: 0 }),
    ],
  ]);
const add = (h: YUndoManager, text: string) => {
  h.stopCapturing();
  h.doc.transact(
    () => h.doc.getText('master').insert(h.doc.getText('master').length, text),
    origin,
  );
  return h.undoStack.at(-1)!;
};

it('binds even empty histories and refuses foreign or generic ownership before forking', () => {
  const a = createSelectionHistory(),
    b = createSelectionHistory();
  const own = a.create(createHistoryDoc(), origin),
    foreign = b.create(createHistoryDoc(), origin),
    generic = workspaceUndo(createHistoryDoc(), origin);
  try {
    for (const h of [foreign, generic]) {
      expect(() => a.fork(h, origin), 'foreign empty history must refuse').toThrow(
        'Unknown, foreign or disposed selection history',
      );
      expect(() => a.capture(h, positions(h))).toThrow();
      expect(() => a.copyMetadata(h, new Map())).toThrow();
    }
    expect(
      () => forkWorkspaceHistory(own, origin),
      'owned history must never fall back to generic cloning',
    ).toThrow('Selection history requires its owning fork');
    const sibling = a.fork(own, origin);
    dispose(sibling);
    const normal = forkWorkspaceHistory(generic, origin);
    dispose(normal);
    own.destroy();
    expect(() => a.fork(own, origin)).toThrow('Unknown, foreign or disposed selection history');
  } finally {
    [own, foreign, generic].forEach(dispose);
    a.close();
    b.close();
  }
});

it('reuses opaque tokens in detached history and metadata while restores stay independently mutable', () => {
  const owner = createSelectionHistory(),
    h = owner.create(createHistoryDoc(), origin);
  const item = add(h, 'abcd'),
    before = owner.capture(h, positions(h, 1)),
    after = owner.capture(h, positions(h, 3));
  item.meta.set('before', before);
  item.meta.set('after', after);
  const sibling = owner.fork(h, origin);
  try {
    const copied = sibling.undoStack[0]!;
    expect(copied.meta, 'history metadata outer map must be detached').not.toBe(item.meta);
    expect(copied.meta.get('before'), 'history fork must reuse the recognized before token').toBe(
      before,
    );
    expect(copied.meta.get('after')).toBe(after);
    expect(copied.insertions).not.toBe(item.insertions);
    expect(copied.insertions.clients).not.toBe(item.insertions.clients);
    expect(sibling.doc).not.toBe(h.doc);
    const restored = owner.restore(sibling, before);
    expect(
      resolveSelection(sibling.doc, sibling.doc.getText('master'), restored.get('master')).main
        .head,
    ).toBe(1);
    restored.clear();
    expect(owner.restore(sibling, before).size).toBe(1);
    h.clear();
    dispose(h);
    expect(owner.restore(sibling, after).size, 'sibling survives accepted-history disposal').toBe(
      1,
    );
    sibling.doc.getText('master').insert(0, 'R');
    expect(
      resolveSelection(
        sibling.doc,
        sibling.doc.getText('master'),
        owner.restore(sibling, after).get('master'),
      ).main.head,
    ).toBe(4);
    sibling.undo();
    const target = sibling.redoStack.at(-1)!;
    target.meta = owner.copyMetadata(sibling, copied.meta);
    expect(target.meta.get('before')).toBe(before);
    target.meta.clear();
    expect(owner.restore(sibling, before).size).toBe(1);
  } finally {
    dispose(h);
    dispose(sibling);
    owner.close();
  }
});

it('refuses malformed or foreign metadata and destroys only the failed history fork', () => {
  const owner = createSelectionHistory(),
    foreign = createSelectionHistory();
  const h = owner.create(createHistoryDoc(), origin),
    other = foreign.create(createHistoryDoc(), origin);
  const item = add(h, 'kept'),
    token = owner.capture(h, positions(h));
  const destroyed: Y.Doc[] = [],
    original = Y.Doc.prototype.destroy;
  const spy = vi.spyOn(Y.Doc.prototype, 'destroy').mockImplementation(function (this: Y.Doc) {
    destroyed.push(this);
    original.call(this);
  });
  try {
    for (const meta of [
      new Map([['unknown', token]]),
      new Map([['before', {}]]),
      new Map([['before', structuredClone(token)]]),
      new Map([['before', foreign.capture(other, positions(other))]]),
    ]) {
      item.meta = meta;
      const count = destroyed.length;
      expect(
        () => owner.fork(h, origin),
        'invalid metadata must refuse instead of copying token lookalikes',
      ).toThrow();
      expect(destroyed.length, 'failed fork must dispose its allocated document').toBe(count + 1);
      expect(destroyed.at(-1)).not.toBe(h.doc);
      expect(h.doc.isDestroyed).toBe(false);
      expect(h.doc.getText('master').toString()).toBe('kept');
      expect(owner.restore(h, token).size).toBe(1);
    }
    item.meta = new Map([['before', token]]);
    const sibling = owner.fork(h, origin);
    dispose(sibling);
  } finally {
    spy.mockRestore();
    dispose(h);
    dispose(other);
    owner.close();
    foreign.close();
  }
});

it('terminal history owners reject retained histories and tokens without reviving or destroying another owner', () => {
  const a = createSelectionHistory(),
    b = createSelectionHistory(),
    doc = createHistoryDoc();
  const h = a.create(doc, origin),
    other = b.create(createHistoryDoc(), origin),
    token = a.capture(h, positions(h));
  const spare = createHistoryDoc();
  try {
    a.close();
    a.close();
    for (const action of [
      () => a.fork(h, origin),
      () => a.create(spare, origin),
      () => a.capture(h, positions(h)),
      () => a.copyMetadata(h, new Map()),
      () => a.restore(h, token),
    ])
      expect(action).toThrow('Selection history owner is closed');
    expect(() => b.restore(other, token)).toThrow('Unknown or foreign selection snapshot');
    expect(() => forkWorkspaceHistory(h, origin)).toThrow(
      'Selection history requires its owning fork',
    );
    expect(other.doc.isDestroyed).toBe(false);
    const fresh = b.capture(other, positions(other));
    expect(b.restore(other, fresh).size).toBe(1);
  } finally {
    dispose(h);
    dispose(other);
    spare.destroy();
    b.close();
  }
});

it('generated retained history forks preserve token identity and an independent position ledger', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          op: fc.constantFrom('fork', 'replace', 'drop', 'clear'),
          at: fc.nat(30),
          cursor: fc.nat(6),
        }),
        { maxLength: 30 },
      ),
      (steps) => {
        const owner = createSelectionHistory();
        const first = owner.create(createHistoryDoc(), origin);
        add(first, 'abcdef');
        type Branch = {
          history: YUndoManager;
          expected: Map<string, { token: SelectionSnapshot; cursor: number }>;
        };
        const branches: Branch[] = [{ history: first, expected: new Map() }];
        const set = (b: Branch, key: string, cursor: number) => {
          const token = owner.capture(b.history, positions(b.history, cursor));
          b.history.undoStack[0]!.meta.set(key, token);
          b.expected.set(key, { token, cursor });
        };
        const check = () => {
          for (const b of branches) {
            const meta = b.history.undoStack[0]!.meta;
            expect([...meta.keys()]).toEqual([...b.expected.keys()]);
            for (const [key, value] of b.expected) {
              expect(meta.get(key), 'retained fork must keep recognized token identity').toBe(
                value.token,
              );
              const restored = owner.restore(b.history, meta.get(key));
              expect(
                resolveSelection(
                  b.history.doc,
                  b.history.doc.getText('master'),
                  restored.get('master'),
                ).main.head,
                'retained fork must restore its independent cursor',
              ).toBe(value.cursor);
              restored.clear();
            }
          }
        };
        try {
          set(branches[0]!, 'before', 1);
          set(branches[0]!, 'after', 3);
          const prefix: typeof steps = [
            { op: 'fork', at: 0, cursor: 0 },
            { op: 'replace', at: 1, cursor: 4 },
            { op: 'drop', at: 0, cursor: 0 },
          ];
          for (const step of [...prefix, ...steps]) {
            const i = step.at % branches.length,
              b = branches[i]!;
            if (step.op === 'fork')
              branches.push({
                history: owner.fork(b.history, origin),
                expected: new Map(b.expected),
              });
            else if (step.op === 'replace') set(b, 'after', step.cursor);
            else if (step.op === 'clear') {
              b.history.undoStack[0]!.meta.clear();
              b.expected.clear();
            } else if (branches.length > 1) {
              dispose(b.history);
              branches.splice(i, 1);
            }
            check();
          }
        } finally {
          branches.forEach((b) => dispose(b.history));
          owner.close();
        }
      },
    ),
    { seed: 150906, numRuns: 120 },
  );
});
