// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { Y, sameDocState, forkDoc } from '../src/crdt/yjs';
import { makeSource } from './storage-properties/oracle';
// Frozen full-normalization reference; never takes the optimized equality branch.
const full = (a: Y.Doc, b: Y.Doc) => {
  if (!Y.equalSnapshots(Y.snapshot(a), Y.snapshot(b))) return false;
  const pending = (d: Y.Doc) =>
    JSON.stringify({
      missing: d.store.pendingStructs
        ? [...d.store.pendingStructs.missing].sort(([a], [b]) => a - b)
        : null,
      update: d.store.pendingStructs?.update ?? null,
      ds: d.store.pendingDs,
    });
  if (pending(a) !== pending(b)) return false;
  const normalize = (d: Y.Doc) => {
    const copy = new Y.Doc();
    try {
      Y.applyUpdate(
        copy,
        Y.encodeStateAsUpdate({
          ...d,
          store: { ...d.store, pendingStructs: null, pendingDs: null },
        } as Y.Doc),
      );
      return Y.encodeStateAsUpdate(copy);
    } finally {
      copy.destroy();
    }
  };
  const aa = normalize(a),
    bb = normalize(b);
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
};
it('generated reordered/pending/deleted/split states agree with the full comparison on every transition', () => {
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
        { maxLength: 20 },
      ),
      fc.array(fc.nat(100), { minLength: 1, maxLength: 30 }),
      (edits, order) => {
        const source = makeSource(edits),
          a = new Y.Doc({ gc: false }),
          b = new Y.Doc();
        try {
          for (const id of source.updates
            .map((_, i) => i)
            .sort((a, b) => order[a % order.length]! - order[b % order.length]! || a - b)) {
            Y.applyUpdate(a, new Uint8Array(source.updates[id]!));
            expect(sameDocState(a, b)).toBe(full(a, b));
            Y.applyUpdate(b, new Uint8Array(source.updates[id]!));
            expect(sameDocState(a, b)).toBe(full(a, b));
            const c = forkDoc(a, false);
            try {
              c.transact((tr) => {
                for (const structs of c.store.clients.values())
                  for (const item of [...structs])
                    if (item instanceof Y.Item && item.length > 1)
                      Y.getItemCleanStart(tr, Y.createID(item.id.client, item.id.clock + 1));
              });
              expect(sameDocState(a, c)).toBe(full(a, c));
            } finally {
              c.destroy();
            }
          }
        } finally {
          a.destroy();
          b.destroy();
        }
      },
    ),
    { seed: 120917, numRuns: 150 },
  );
}, 15000);
