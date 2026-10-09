import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { Y } from '../src/crdt/yjs';
import { makeSource, checkRecovery } from './storage-properties/oracle';

describe('encrypted storage property oracle negative controls', () => {
  it.each([
    { lane: 0, at: 1, remove: 0, text: 'late' },
    { lane: 0, at: 1, remove: 2, text: '' },
  ])('detects loss of invisible pending structs/deletions: %j', (edit) => {
    const source = makeSource([edit]);
    // Both offline documents look empty. Only future dependency delivery exposes the loss.
    expect(() => checkRecovery(source, [3], [])).toThrow(/recovery-/);
    expect(() => checkRecovery(source, [3], [new Uint8Array(source.updates[3]!)])).not.toThrow();
  });
  it('detects a lost insertion anchored in another client’s undelivered update', () => {
    const source = makeSource([{ lane: 0, actor: 1, at: 1, remove: 0, text: 'remote-basis' }]);
    expect(() => checkRecovery(source, [3], [])).toThrow(/recovery-/);
    expect(() => checkRecovery(source, [3], [new Uint8Array(source.updates[3]!)])).not.toThrow();
  });
  it('recovers the saved partial-merge corpus after the pinned delivery repair', () => {
    const source = makeSource([
      { lane: 0, actor: 1, at: 0, text: 'a', remove: 0 },
      ...Array.from({ length: 3 }, () => ({ lane: 0, actor: 0, at: 0, text: 'a', remove: 0 })),
    ]);
    const ids = [3, 1, 5],
      original = ids.map((i) => new Uint8Array(source.updates[i]!));
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, Y.mergeUpdates(original));
      source.updates.forEach((u, i) => {
        if (!ids.includes(i)) Y.applyUpdate(doc, new Uint8Array(u));
      });
      // Runtime delivery repair does not change production's conservative partial-compaction policy.
      expect(doc.getText('lane0').toString()).toBe(source.final[0]);
      expect(doc.store.pendingStructs).toBeNull();
      expect(doc.store.pendingDs).toBeNull();
      expect(source.final[0]).toBe('aaaabase0');
      expect(() => checkRecovery(source, ids, original)).not.toThrow();
    } finally {
      doc.destroy();
    }
  });
  it('detects a refused update leaking into recovered state', () => {
    const source = makeSource([]);
    expect(() => checkRecovery(source, [], [new Uint8Array(source.updates[0]!)])).toThrow(
      /recovery-/,
    );
  });
  it('detects loss of a deletion despite equal state vectors', () => {
    const source = makeSource([{ lane: 0, at: 1, text: '', remove: 2 }]);
    expect(() => checkRecovery(source, [0, 3], [new Uint8Array(source.updates[0]!)])).toThrow(
      /recovery-/,
    );
  });
  it('accepts generated reordered, duplicated and merged source histories against the string model', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lane: fc.nat(2),
            actor: fc.nat(2),
            at: fc.nat(40),
            remove: fc.nat(8),
            text: fc.string({ maxLength: 5 }),
          }),
          { maxLength: 30 },
        ),
        (edits) => {
          const source = makeSource(edits),
            ids = source.updates.map((_, i) => i);
          const reverse = source.updates.map((u) => new Uint8Array(u)).reverse();
          expect(() => checkRecovery(source, ids, [...reverse, ...reverse])).not.toThrow();
          expect(() =>
            checkRecovery(source, ids, [new Uint8Array(Y.mergeUpdates(reverse))]),
          ).not.toThrow();
        },
      ),
      { numRuns: 100, seed: 8941 },
    );
  });
});
