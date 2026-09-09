// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { Y } from '../src/crdt/yjs';
import saved from './core-reproductions/original-order.json';
import { makeSource } from './storage-properties/oracle';
import { exercise, concurrentSource, check } from './yjs-delivery/model.mjs';
const arbitrary = fc.record({
  edits: fc.array(
    fc.record({
      lane: fc.nat(2),
      actor: fc.nat(2),
      at: fc.nat(40),
      remove: fc.nat(8),
      text: fc.string({ maxLength: 6 }),
    }),
    { minLength: 1, maxLength: 16 },
  ),
  keys: fc.array(fc.nat(10000), { minLength: 32, maxLength: 32 }),
  split: fc.nat(50),
  early: fc.nat(50),
  hops: fc.nat(3),
  duplicate: fc.boolean(),
});
function* permutations(ids: number[]): Generator<number[]> {
  if (!ids.length) {
    yield [];
    return;
  }
  for (let i = 0; i < ids.length; i++)
    for (const tail of permutations(ids.filter((_, j) => i !== j))) yield [ids[i]!, ...tail];
}
describe('pinned Yjs delivery wake-ups', () => {
  it('retains the earlier cross-client wake-up when its supplied reader starts after the dependency', () => {
    const doc = new Y.Doc();
    try {
      for (const id of [2, 3, 4, 6, 0])
        Y.applyUpdate(doc, Uint8Array.from(saved.outcome.source.updates[id]!));
      expect(doc.store.pendingStructs?.missing.get(102)).toBe(0);
      for (const id of [1, 5])
        Y.applyUpdate(doc, Uint8Array.from(saved.outcome.source.updates[id]!));
      check(Y, doc, saved.outcome.source);
    } finally {
      doc.destroy();
    }
  });
  it('completes every order of the saved seven original records without redelivery', () => {
    let count = 0;
    for (const order of permutations(saved.outcome.order)) {
      const doc = new Y.Doc();
      try {
        for (const id of order)
          Y.applyUpdate(doc, Uint8Array.from(saved.outcome.source.updates[id]!));
        check(Y, doc, saved.outcome.source);
        count++;
      } finally {
        doc.destroy();
      }
    }
    expect(count).toBe(5040);
  });
  it.each(['originals', 'handoff', 'concurrent-handoff'])(
    'preserves the external ledger under generated %s histories',
    (arm) => {
      fc.assert(
        fc.property(arbitrary, (history) => {
          const source =
            arm === 'concurrent-handoff'
              ? concurrentSource(Y, history)
              : (() => {
                  const s = makeSource(history.edits);
                  return { updates: s.updates, expected: s.final };
                })();
          // Unit source roots use lane0, while the shared browser model calls that root master.
          if (arm === 'concurrent-handoff') exercise(Y, source, history, 'handoff');
          else {
            const mapped = {
              ...Y,
              Doc: class extends Y.Doc {
                override getText(name: string) {
                  return super.getText(name === 'master' ? 'lane0' : name);
                }
              },
            };
            exercise(mapped, source, history, arm);
          }
        }),
        { seed: 8941, numRuns: 1000 },
      );
    },
    30000,
  );
});
