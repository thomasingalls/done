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

it('long strings and arbitrary scalar content agree with full normalization, including unequal values at equal clocks', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 31, maxLength: 150 }),
      fc.jsonValue(),
      fc.uint8Array({ maxLength: 80 }),
      (value, json, binary) => {
        const a = new Y.Doc({ gc: false }),
          b = new Y.Doc({ gc: false });
        a.clientID = b.clientID = 71;
        for (const d of [a, b]) {
          d.getText('master').insert(0, value);
          d.getMap('meta').set('json', structuredClone(json));
          d.getMap('meta').set('binary', binary.slice());
          d.getArray('array').push([value]);
          d.getMap('meta').set('scalars', [undefined, null, -0, NaN, Infinity, 10n]);
          const text = new Y.Text();
          d.getMap('nested').set('text', text);
          text.insert(0, value);
          text.format(0, value.length, { ['format'.repeat(8)]: value });
          const xml = new Y.XmlElement('node'.repeat(9));
          xml.setAttribute('attribute'.repeat(5), value);
          d.getXmlFragment('xml').insert(0, [xml]);
        }
        try {
          expect(sameDocState(a, b)).toBe(full(a, b));
          // Mutate an encoded value without changing any clock/deletion bookkeeping.
          const items = [...b.store.clients.values()].flat();
          const item = items.find(
            (i) => i instanceof Y.Item && i.content instanceof Y.ContentString,
          )! as Y.Item;
          const content = item.content as Y.ContentString;
          content.str = (content.str[0] === 'x' ? 'y' : 'x') + content.str.slice(1);
          expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
          expect(full(a, b)).toBe(false);
          expect(sameDocState(a, b)).toBe(false);
          content.str = value;
          const jsonItem = items.find(
            (i) => i instanceof Y.Item && i.parentSub === 'json',
          ) as Y.Item;
          const any = jsonItem.content as Y.ContentAny;
          any.arr[0] = ['different', any.arr[0]];
          expect(full(a, b)).toBe(false);
          expect(sameDocState(a, b)).toBe(false);
        } finally {
          a.destroy();
          b.destroy();
        }
      },
    ),
    { seed: 140917, numRuns: 200 },
  );
});

it('keeps string positions, root identities, UTF-8 equivalence and the complete fallback', () => {
  const pairs = [
    ['left'.repeat(9), 'right'.repeat(9), 'x'.repeat(64), 'x'.repeat(64)],
    ['master', 'master', 'x'.repeat(64), 'y'.repeat(64)],
    ['master', 'master', 'x'.repeat(63) + '\uD800', 'x'.repeat(63) + '\uD801'],
    ['master', 'master', 'x'.repeat(64), 'x'.repeat(64)],
  ];
  for (const [rootA, rootB, valueA, valueB] of pairs) {
    const a = new Y.Doc({ gc: false }),
      b = new Y.Doc({ gc: false });
    a.clientID = b.clientID = 72;
    try {
      a.getText(rootA!).insert(0, valueA!);
      b.getText(rootB!).insert(0, valueB!);
      expect(sameDocState(a, b)).toBe(full(a, b));
      a.getText(rootA!).delete(2, 20);
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
      expect(sameDocState(a, b)).toBe(full(a, b));
      const c = forkDoc(a, true);
      try {
        expect(sameDocState(a, c)).toBe(full(a, c));
      } finally {
        c.destroy();
      }
    } finally {
      a.destroy();
      b.destroy();
    }
  }
});

it('compares all content even when long strings occur after the bounded eligibility probe', () => {
  const a = new Y.Doc({ gc: false }),
    b = new Y.Doc({ gc: false });
  a.clientID = b.clientID = 73;
  try {
    for (let i = 0; i < 80; i++) for (const d of [a, b]) d.getMap('meta').set('key' + i, i);
    a.getText('master').insert(0, 'x'.repeat(200));
    b.getText('master').insert(0, 'y'.repeat(200));
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    expect(full(a, b)).toBe(false);
    expect(sameDocState(a, b)).toBe(false);
  } finally {
    a.destroy();
    b.destroy();
  }
});

it('keeps simultaneously borrowed comparison scratch separate under encoding reentry', () => {
  const docs = Array.from({ length: 4 }, () => new Y.Doc({ gc: false }));
  try {
    for (const doc of docs) {
      doc.clientID = 91;
      doc.getText('master').insert(0, 'same long text'.repeat(8));
    }
    let reentries = 0;
    const value = {
      get nested() {
        reentries++;
        expect(sameDocState(docs[2]!, docs[3]!)).toBe(full(docs[2]!, docs[3]!));
        return 'same';
      },
    };
    docs[0]!.getMap('meta').set('value', value);
    docs[1]!.getMap('meta').set('value', { nested: 'same' });
    expect(sameDocState(docs[0]!, docs[1]!)).toBe(true);
    expect(reentries).toBeGreaterThan(0);
    docs[3]!.getText('master').insert(0, 'different');
    docs[0]!.getMap('meta').set('value', { nested: 'same' });
    Y.applyUpdate(docs[1]!, Y.encodeStateAsUpdate(docs[0]!));
    expect(sameDocState(docs[0]!, docs[1]!)).toBe(full(docs[0]!, docs[1]!));
  } finally {
    for (const doc of docs) doc.destroy();
  }
});

it('releases partial comparison scratch when an encoded value throws', () => {
  const a = new Y.Doc({ gc: false }),
    b = new Y.Doc({ gc: false });
  let fail = false;
  try {
    for (const doc of [a, b]) {
      doc.clientID = 92;
      doc.getText('master').insert(0, 'long text that must not survive a scratch lease'.repeat(4));
    }
    a.getMap('meta').set('value', {
      get nested() {
        if (fail) throw Error('encoding failed');
        return 'same';
      },
    });
    b.getMap('meta').set('value', { nested: 'same' });
    fail = true;
    expect(() => sameDocState(a, b)).toThrow('encoding failed');
    fail = false;
    expect(sameDocState(a, b)).toBe(full(a, b));
    expect(sameDocState(b, a)).toBe(true);
  } finally {
    a.destroy();
    b.destroy();
  }
});

it('compares large then small documents without retaining active scratch fields', () => {
  const a = new Y.Doc({ gc: false }),
    b = new Y.Doc({ gc: false }),
    c = new Y.Doc({ gc: false }),
    d = new Y.Doc({ gc: false });
  try {
    for (const doc of [a, b, c, d]) {
      doc.clientID = 93;
      doc.getText('master').insert(0, 'same text'.repeat(8));
    }
    for (const doc of [a, b]) {
      for (let i = 0; i < 1100; i++) doc.getText('text' + i).insert(0, 'long text'.repeat(5));
      doc.getMap('meta').set('binary', new Uint8Array(400_000));
    }
    expect(sameDocState(a, b)).toBe(true);
    expect(sameDocState(c, d)).toBe(true);
    const content = d.store.clients.get(93)![0]! as Y.Item;
    (content.content as Y.ContentString).str = 'othertex'.repeat(9);
    expect(sameDocState(c, d)).toBe(full(c, d));
    expect(sameDocState(c, d)).toBe(false);
  } finally {
    for (const doc of [a, b, c, d]) doc.destroy();
  }
});
