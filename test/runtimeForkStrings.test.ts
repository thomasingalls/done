// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  Y,
  createHistoryDoc,
  createSelectionHistory,
  forkDoc,
  sameDocState,
} from '../src/crdt/yjs';

const integrated = (doc: Y.Doc) =>
  Y.encodeStateAsUpdate({
    ...doc,
    store: { ...doc.store, pendingStructs: null, pendingDs: null },
  } as Y.Doc);
// Native V1 full normalization is independent of both private codecs and their scratch pool.
const full = (a: Y.Doc, b: Y.Doc) => {
  if (!Y.equalSnapshots(Y.snapshot(a), Y.snapshot(b))) return false;
  const pending = (doc: Y.Doc) => ({
    missing: doc.store.pendingStructs
      ? [...doc.store.pendingStructs.missing].sort(([a], [b]) => a - b)
      : null,
    update: doc.store.pendingStructs?.update ?? null,
    ds: doc.store.pendingDs,
  });
  const normalize = (doc: Y.Doc) => {
    const copy = new Y.Doc();
    try {
      Y.applyUpdate(copy, integrated(doc));
      return Y.encodeStateAsUpdate(copy);
    } finally {
      copy.destroy();
    }
  };
  return (
    JSON.stringify(pending(a)) === JSON.stringify(pending(b)) &&
    Buffer.from(normalize(a)).equals(Buffer.from(normalize(b)))
  );
};
const withFork = (source: Y.Doc, check: (actual: Y.Doc, native: Y.Doc) => void) => {
  const owner = createSelectionHistory(),
    history = owner.create(source, 'human'),
    native = forkDoc(source, false);
  let fork: Y.UndoManager | undefined;
  try {
    fork = owner.fork(history, 'human');
    expect(integrated(fork.doc)).toEqual(integrated(native));
    expect(sameDocState(fork.doc, native)).toBe(full(fork.doc, native));
    check(fork.doc, native);
  } finally {
    fork?.destroy();
    fork?.doc.destroy();
    native.destroy();
    history.destroy();
    owner.close();
  }
};
const anyContent = (doc: Y.Doc) => doc.getArray('values')._start!.content as Y.ContentAny;
const make = (values: unknown[]) => {
  const doc = createHistoryDoc();
  doc.clientID = 193;
  // Ensure the existing bounded equality eligibility probe selects the private comparison.
  doc.getText('master').insert(0, 'ordinary master text '.repeat(4));
  doc.getArray('values').push(values);
  return doc;
};

it('forks interleaved primitive any strings and text fields with native canonical bytes', () => {
  const source = make(['A'.repeat(90), 'tiny', 119, 0, 'B'.repeat(80)]);
  try {
    source.getText('next').insert(0, 'middle'.repeat(20));
    source.getMap('cards').set('long-key-'.repeat(7), 'map value '.repeat(15));
    source.getArray('values').push(['tail'.repeat(100), null, false, true]);
    // Undefined is a native ContentAny value, although Y.Array insertion rejects it.
    anyContent(source).arr[1] = undefined;
    source.getText('last').insert(0, 'last'.repeat(80));
    withFork(source, (actual, native) => {
      expect(actual.getArray('values').toArray()).toEqual(native.getArray('values').toArray());
      expect(actual.getMap('cards').toJSON()).toEqual(native.getMap('cards').toJSON());
      expect(actual.getText('next').toString()).toBe(source.getText('next').toString());
      const external = new Y.Doc();
      try {
        Y.applyUpdate(external, Y.encodeStateAsUpdate(actual));
        expect(integrated(external)).toEqual(integrated(native));
      } finally {
        external.destroy();
      }
    });
  } finally {
    source.destroy();
  }
});

it('generated primitive any forks and same-clock mutations agree with native normalization', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 100 }),
          fc
            .array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 100 })
            .map((units) => String.fromCharCode(...units)),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
        ),
        { minLength: 1, maxLength: 16 },
      ),
      (values) => {
        const source = make(['long-BMP-'.repeat(16), ...values, 'end'.repeat(32)]);
        try {
          source.getText('interleaved').insert(0, 'more text'.repeat(8));
          source.getMap('cards').set('body', values[0]);
          withFork(source, (actual, native) => {
            expect(sameDocState(source, actual)).toBe(full(source, actual));
            const arr = anyContent(actual).arr;
            for (const replacement of ['changed'.repeat(40), 119, ['nested'.repeat(15)]]) {
              arr[0] = replacement;
              expect(sameDocState(native, actual)).toBe(full(native, actual));
              expect(full(native, actual)).toBe(false);
            }
          });
        } finally {
          source.destroy();
        }
      },
    ),
    { seed: 193917, numRuns: 150 },
  );
});

it('retains Unicode fallback and UTF-8 equivalence for any string fields', () => {
  const values = [
    'x'.repeat(31),
    'x'.repeat(32),
    '\uFEFF' + 'x'.repeat(100),
    'café 漢字 '.repeat(10),
    '🚀'.repeat(40),
    '\uDC00' + 'x'.repeat(80),
    'x'.repeat(80) + '\uD800',
    'x'.repeat(50) + '\uD800middle\uDC00',
  ];
  const source = make(values);
  try {
    withFork(source, (actual, native) => {
      expect(actual.getArray('values').toArray()).toEqual(native.getArray('values').toArray());
      expect(sameDocState(source, actual)).toBe(true);
    });
    const a = make(['x'.repeat(64) + '\uD800']),
      b = make(['x'.repeat(64) + '\uD801']);
    try {
      expect(full(a, b)).toBe(true);
      expect(sameDocState(a, b)).toBe(true);
      anyContent(b).arr[0] = 'x'.repeat(64) + 'y';
      expect(full(a, b)).toBe(false);
      expect(sameDocState(a, b)).toBe(false);
    } finally {
      a.destroy();
      b.destroy();
    }
  } finally {
    source.destroy();
  }
});

it('distinguishes any string type, byte position, length boundaries and field order', () => {
  const variants: unknown[][] = [
    ['A'.repeat(64), 119, 'B'.repeat(80)],
    ['B'.repeat(80), 119, 'A'.repeat(64)],
    ['A'.repeat(64), '119', 'B'.repeat(80)],
    ['A'.repeat(64), ['119'], 'B'.repeat(80)],
    ['A'.repeat(63), 119, 'B'.repeat(81)],
    ['A'.repeat(64), null, 'B'.repeat(80)],
    ['A'.repeat(64), false, 'B'.repeat(80)],
  ];
  const docs = variants.map(make);
  try {
    for (let i = 0; i < docs.length; i++)
      for (let j = 0; j < docs.length; j++) {
        expect(Y.encodeStateVector(docs[i]!)).toEqual(Y.encodeStateVector(docs[j]!));
        expect(full(docs[i]!, docs[j]!)).toBe(i === j);
        expect(sameDocState(docs[i]!, docs[j]!)).toBe(i === j);
      }
  } finally {
    docs.forEach((doc) => doc.destroy());
  }
});

it('keeps boxed, nonplain and nested any objects native and detaches mutable binary leaves', () => {
  class Example {
    field = 'nonplain'.repeat(12);
  }
  const binary = new Uint8Array([1, 2, 3]),
    boxed = Object('boxed'.repeat(15)),
    nested = { items: ['long'.repeat(40), { binary }], ordinary: new Example() },
    source = make(['kept'.repeat(32), null, null, null]);
  // Yjs insertion validates constructors; its pinned codec can still encounter these runtime
  // ContentAny values. Compare exactly what that codec does, without claiming app acceptance.
  anyContent(source).arr.splice(1, 3, boxed, new Example(), nested);
  try {
    withFork(source, (actual, native) => {
      const values = actual.getArray('values').toArray();
      expect(values).toEqual(native.getArray('values').toArray());
      expect(typeof values[1]).toBe('object');
      expect(values[1]).not.toBe(boxed);
      const copied = values[3] as typeof nested;
      const child = copied.items[1] as { binary: Uint8Array };
      child.binary.fill(9);
      expect(binary).toEqual(new Uint8Array([1, 2, 3]));
      nested.items.push('source only');
      expect(copied.items).toHaveLength(2);
      (values[2] as Example).field = 'child only';
      expect((anyContent(source).arr[2] as Example).field).toBe('nonplain'.repeat(12));
    });
  } finally {
    source.destroy();
  }
});

it('preserves and detaches pending updates, missing dependencies and pending delete bytes', () => {
  const source = make(['long pending case '.repeat(9)]),
    remote = new Y.Doc(),
    updates: Uint8Array[] = [];
  remote.on('update', (update: Uint8Array) => updates.push(update));
  remote.getText('remote').insert(0, 'first');
  remote.getText('remote').insert(5, 'second');
  remote.getText('remote').delete(0, 1);
  Y.applyUpdate(source, updates[1]!);
  Y.applyUpdate(source, updates[2]!);
  try {
    expect(source.store.pendingStructs).not.toBeNull();
    expect(source.store.pendingDs).not.toBeNull();
    withFork(source, (actual) => {
      expect(sameDocState(source, actual)).toBe(true);
      const pending = actual.store.pendingStructs!;
      expect(pending.update).not.toBe(source.store.pendingStructs!.update);
      expect(pending.missing).not.toBe(source.store.pendingStructs!.missing);
      expect(actual.store.pendingDs).not.toBe(source.store.pendingDs);
      const key = [...pending.missing.keys()][0]!,
        clock = pending.missing.get(key)!;
      pending.missing.set(key, clock + 1);
      expect(sameDocState(source, actual)).toBe(false);
      pending.missing.set(key, clock);
      pending.update[0] = pending.update[0]! ^ 1;
      expect(sameDocState(source, actual)).toBe(false);
      pending.update[0] = pending.update[0]! ^ 1;
      actual.store.pendingDs![0] = actual.store.pendingDs![0]! ^ 1;
      expect(sameDocState(source, actual)).toBe(false);
      actual.store.pendingDs![0] = actual.store.pendingDs![0]! ^ 1;
      Y.applyUpdate(actual, updates[0]!);
      Y.applyUpdate(source, updates[0]!);
      expect(sameDocState(source, actual)).toBe(true);
      expect(actual.getText('remote').toString()).toBe('irstsecond');
    });
  } finally {
    source.destroy();
    remote.destroy();
  }
});

it('keeps any-string scratch private under reentry and recovers after a native getter throws', () => {
  const a = make(['outer'.repeat(30), null]),
    b = make(['outer'.repeat(30), { key: 'value' }]),
    c = make(['inner'.repeat(30)]),
    d = make(['inner'.repeat(30)]),
    owner = createSelectionHistory(),
    history = owner.create(c, 'human');
  let fail = false,
    reads = 0;
  anyContent(a).arr[1] = {
    get key() {
      reads++;
      if (fail) throw Error('deliberate native any getter failure');
      expect(sameDocState(c, d)).toBe(true);
      const nested = owner.fork(history, 'human');
      try {
        expect(integrated(nested.doc)).toEqual(integrated(c));
      } finally {
        nested.destroy();
        nested.doc.destroy();
      }
      return 'value';
    },
  };
  try {
    expect(sameDocState(a, b)).toBe(true);
    withFork(a, () => {});
    fail = true;
    expect(() => sameDocState(a, b)).toThrow('deliberate native any getter failure');
    const outer = owner.create(a, 'human');
    try {
      expect(() => owner.fork(outer, 'human')).toThrow('deliberate native any getter failure');
    } finally {
      outer.destroy();
    }
    fail = false;
    for (let i = 0; i < 12; i++) {
      expect(sameDocState(a, b)).toBe(full(a, b));
      withFork(a, () => {});
      expect(sameDocState(c, d)).toBe(true);
    }
    expect(reads).toBeGreaterThan(20);
  } finally {
    history.destroy();
    owner.close();
    [a, b, c, d].forEach((doc) => doc.destroy());
  }
});

it('keeps full-byte normalization when adjacent any items are split differently', () => {
  const source = make(['one'.repeat(40), 'two'.repeat(40), 'three'.repeat(40)]);
  try {
    withFork(source, (actual) => {
      const first = actual.getArray('values')._start!;
      actual.transact((tr) =>
        Y.getItemCleanStart(tr, Y.createID(first.id.client, first.id.clock + 1)),
      );
      expect(full(source, actual)).toBe(true);
      expect(sameDocState(source, actual)).toBe(true);
      source.getArray('values').delete(1, 1);
      Y.applyUpdate(actual, Y.encodeStateAsUpdate(source));
      expect(sameDocState(source, actual)).toBe(full(source, actual));
    });
  } finally {
    source.destroy();
  }
});
