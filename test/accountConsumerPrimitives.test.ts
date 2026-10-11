// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { hex, type Bytes } from '../src/crdt/custodyCrypto';
import { sameBytes } from '../src/crdt/verifiedRecords';
import { validateContentUpdates } from '../src/crdt/contentCompaction';
import { Y, hasPendingUpdates } from '../src/crdt/yjs';
import { capturedSourcePresence } from '../src/crdt/sourceCapture';

const oldHex = (bytes: Uint8Array) =>
  Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
const oldSame = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, i) => value === b[i]);
it('byte leaves preserve exact encodings/comparisons, including offset views and mutations', () => {
  const detached = new Uint8Array([1]);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  expect(() => oldHex(detached)).toThrow();
  expect(() => hex(detached)).toThrow();
  expect(() => sameBytes(detached, new Uint8Array())).toThrow();
  expect(sameBytes(new Uint8Array(), detached)).toBe(true);
  expect(hex(Uint8Array.from({ length: 256 }, (_, n) => n))).toBe(
    oldHex(Uint8Array.from({ length: 256 }, (_, n) => n)),
  );
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 8192 }), fc.nat(), (bytes, n) => {
      const a = bytes.subarray(Math.min(bytes.length, n % 7));
      const b = a.slice();
      expect(hex(a)).toBe(oldHex(a));
      expect(sameBytes(a, b)).toBe(oldSame(a, b));
      if (b.length) b[n % b.length]! ^= 1;
      expect(sameBytes(a, b)).toBe(oldSame(a, b));
      expect(sameBytes(a, b.subarray(1))).toBe(oldSame(a, b.subarray(1)));
    }),
    { seed: 101011, numRuns: 120 },
  );
});

const reference = (updates: readonly Bytes[]) => {
  const doc = new Y.Doc({ gc: false });
  try {
    for (const bytes of updates) {
      Y.decodeUpdate(bytes);
      Y.applyUpdate(doc, bytes);
    }
    return !hasPendingUpdates(doc);
  } finally {
    doc.destroy();
  }
};
const outcome = (check: typeof reference, updates: readonly Bytes[]) => {
  try {
    return check(updates);
  } catch {
    return 'unreadable';
  }
};
it('isolated validation agrees with the original for reordered, repeated, pending and malformed updates', () => {
  const doc = new Y.Doc({ gc: false });
  const updates: Bytes[] = [];
  doc.on('update', (update: Uint8Array) => {
    updates.push(new Uint8Array(update));
  });
  const text = doc.getText('text');
  text.insert(0, 'parent');
  text.insert(6, ' child');
  text.delete(1, 3);
  doc.getMap('root').set('child', new Y.Doc());
  updates.push(new Uint8Array(Y.encodeStateAsUpdate(doc)));
  try {
    expect(validateContentUpdates([updates[1]!])).toBe(false);
    expect(validateContentUpdates([updates[0]!, updates[1]!])).toBe(true);
    // Validation cannot accidentally reuse the previous invocation's parent/deletion state.
    expect(validateContentUpdates([updates[1]!])).toBe(false);
    fc.assert(
      fc.property(fc.array(fc.nat(4), { maxLength: 12 }), (order) => {
        const selected = order.map((i) => updates[i]!);
        expect(outcome(validateContentUpdates, selected)).toBe(outcome(reference, selected));
      }),
      { seed: 101012, numRuns: 100 },
    );
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 100 }), (bytes) => {
        expect(outcome(validateContentUpdates, [bytes])).toBe(outcome(reference, [bytes]));
      }),
      { seed: 101013, numRuns: 100 },
    );
  } finally {
    doc.destroy();
  }
});

it('verified source lookups agree with rebuilding a catalogue, including duplicates in the batch', () => {
  const bytes = (v: number) => new Uint8Array([v]);
  fc.assert(
    fc.property(fc.array(fc.tuple(fc.nat(7), fc.nat(255)), { maxLength: 30 }), (items) => {
      const retained = new Map([
        ['0', bytes(0)],
        ['1', bytes(1)],
      ]);
      const incoming = items.map(([id, value]) => ({ id: String(id), bytes: bytes(value) }));
      const check = (fn: () => boolean[]) => {
        try {
          return fn();
        } catch {
          return 'conflict';
        }
      };
      const expected = check(() => {
        const catalog = new Map(retained);
        return incoming.map(({ id, bytes }) => {
          const previous = catalog.get(id);
          if (previous && oldHex(previous) !== oldHex(bytes)) throw Error('conflict');
          catalog.set(id, bytes);
          return !!previous;
        });
      });
      expect(check(() => capturedSourcePresence(retained, incoming))).toEqual(expected);
      expect([...retained].map(([id, b]) => [id, [...b]])).toEqual([
        ['0', [0]],
        ['1', [1]],
      ]);
    }),
    { seed: 101014, numRuns: 120 },
  );
});
