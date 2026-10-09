// @vitest-environment node
import { it, expect } from 'vitest';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  createSelectionSnapshots,
  type SelectionSnapshot,
  type SelectionPositions,
  type SelectionMetadata,
} from '../src/crdt/selectionSnapshots';
import { Y, createHistoryDoc, forkDoc } from '../src/crdt/yjs';
import { relativeSelection, resolveSelection } from '../src/crdt/workspaceCommands';

const positions = (clock = 1): SelectionPositions => {
  const at = { type: null, tname: 'master', item: { client: 7, clock }, assoc: 0 };
  return new Map([['master', { ranges: [{ anchor: at, head: at }], main: 0 }]]);
};
const copyGraph = (source: unknown, actual: unknown) => {
  const expected = structuredClone(source),
    sources = new Set<object>();
  const children = (v: object): unknown[] => (v instanceof Map ? [...v].flat() : Object.values(v));
  const collect = (v: unknown) => {
    if (!v || typeof v !== 'object' || sources.has(v)) return;
    sources.add(v);
    children(v).forEach(collect);
  };
  collect(source);
  assert.deepStrictEqual(actual, expected);
  const forward = new Map<object, object>(),
    reverse = new Map<object, object>();
  const visit = (a: unknown, b: unknown) => {
    if (!a || typeof a !== 'object') {
      assert.equal(b, a);
      return;
    }
    assert.ok(b && typeof b === 'object');
    assert.ok(!sources.has(b), 'restored graph must not share mutable nodes');
    if (forward.has(a)) {
      assert.equal(b, forward.get(a), 'snapshot must preserve aliases');
      return;
    }
    assert.ok(!reverse.has(b), 'snapshot must not merge distinct nodes');
    forward.set(a, b);
    reverse.set(b, a);
    children(a).forEach((v, i) => visit(v, children(b)[i]));
  };
  visit(expected, actual);
};

it('captures actual root and nested Yjs positions and restores detached resolvable selections', () => {
  const owner = createSelectionSnapshots(),
    doc = createHistoryDoc();
  doc.getText('master').insert(0, 'abcdef');
  const card = new Y.Text('ABCDEFGHIJ');
  doc.getMap<Y.Text>('cards').set('one', card);
  const source = new Map([
    [
      'master',
      relativeSelection(doc.getText('master'), { ranges: [{ anchor: 1, head: 3 }], main: 0 }),
    ],
    [
      'card:one',
      relativeSelection(card, {
        ranges: [
          { anchor: 2, head: 4 },
          { anchor: 7, head: 8 },
        ],
        main: 1,
      }),
    ],
  ]);
  const token = owner.capture(source),
    fork = forkDoc(doc, false);
  try {
    const restored = owner.restore(token);
    copyGraph(source, restored);
    expect(resolveSelection(fork, fork.getText('master'), restored.get('master')).toJSON()).toEqual(
      { ranges: [{ anchor: 1, head: 3 }], main: 0 },
    );
    expect(
      resolveSelection(
        fork,
        fork.getMap<Y.Text>('cards').get('one')!,
        restored.get('card:one'),
      ).toJSON(),
    ).toEqual({
      ranges: [
        { anchor: 2, head: 4 },
        { anchor: 7, head: 8 },
      ],
      main: 1,
    });
    const empty = owner.capture(new Map());
    expect(owner.restore(empty)).toEqual(new Map());
  } finally {
    owner.close();
    doc.destroy();
    fork.destroy();
  }
});

it('generated capture and repeated restores preserve aliases without lending mutable snapshot data', () => {
  fc.assert(
    fc.property(
      fc.array(fc.nat(20), { minLength: 1, maxLength: 10 }),
      fc.boolean(),
      (ids, shared) => {
        const owner = createSelectionSnapshots();
        const source = positions(),
          selected = source.get('master')!;
        for (const [i, n] of ids.entries())
          source.set('card:' + i, shared ? selected : positions(n).get('master')!);
        const expected = structuredClone(source),
          token = owner.capture(source);
        try {
          source.get('master')!.ranges[0]!.anchor.item!.clock = 1234;
          source.delete('card:0');
          const first = owner.restore(token);
          expect(first, 'capture must detach mutable input').toEqual(expected);
          copyGraph(expected, first);
          first.get('master')!.ranges[0]!.head.item!.clock = 999;
          first.clear();
          const second = owner.restore(token);
          expect(second, 'restore must not lend the private payload').toEqual(expected);
          const third = owner.restore(token);
          copyGraph(second, third);
          third.get('master')!.ranges.push(third.get('master')!.ranges[0]!);
          expect(owner.restore(token), 'later restores must retain the original snapshot').toEqual(
            expected,
          );
        } finally {
          owner.close();
        }
      },
    ),
    { seed: 150903, numRuns: 200 },
  );
});

it('rejects malformed cloned selection graphs without changing existing snapshots', () => {
  const owner = createSelectionSnapshots(),
    valid = positions(),
    token = owner.capture(valid);
  const malformed: unknown[] = [
    null,
    {},
    [],
    new Map([[1, valid.get('master')]]),
    new Map([['card:', valid.get('master')]]),
    new Map([['other', valid.get('master')]]),
  ];
  const altered = (change: (s: ReturnType<typeof positions>) => void) => {
    const p = positions();
    change(p);
    malformed.push(p);
  };
  altered((p) => {
    p.get('master')!.ranges = [];
  });
  altered((p) => {
    p.get('master')!.ranges.length = 2;
  });
  altered((p) => {
    p.get('master')!.main = 1;
  });
  altered((p) => {
    p.get('master')!.main = -1;
  });
  altered((p) => {
    Object.assign(p.get('master')!, { extra: true });
  });
  altered((p) => {
    p.get('master')!.ranges[0]!.anchor.assoc = Infinity;
  });
  altered((p) => {
    p.get('master')!.ranges[0]!.anchor.item!.clock = 0.5;
  });
  altered((p) => {
    p.get('master')!.ranges[0]!.anchor.item!.client = -1;
  });
  altered((p) => {
    p.get('master')!.ranges[0]!.anchor.item!.clock = Number.MAX_SAFE_INTEGER + 1;
  });
  altered((p) => {
    p.get('master')!.ranges[0]!.anchor.type = { client: 1, clock: 0 };
  });
  altered((p) => {
    p.get('master')!.ranges[0]!.anchor.tname = null;
  });
  altered((p) => {
    Object.assign(p.get('master')!.ranges[0]!.anchor, { item: p });
  });
  try {
    for (const value of malformed) {
      expect(() => owner.capture(value as SelectionPositions)).toThrow(
        'Invalid selection snapshot value',
      );
      expect(owner.restore(token)).toEqual(valid);
    }
  } finally {
    owner.close();
  }
});

it('tokens expose no payload and reject foreign cloned reconstructed and primitive identities', () => {
  const a = createSelectionSnapshots(),
    b = createSelectionSnapshots(),
    token = a.capture(positions());
  try {
    expect(Object.getOwnPropertyDescriptors(token)).toEqual({});
    expect(Object.getPrototypeOf(token)).toBeNull();
    expect(Object.isFrozen(token)).toBe(true);
    expect(a.capture(positions())).not.toBe(token);
    expect(() => b.restore(token), 'foreign owner must not restore a snapshot').toThrow(
      'Unknown or foreign selection snapshot',
    );
    const wrong: unknown[] = [
      {},
      Object.create(token),
      Object.freeze(Object.create(null)),
      structuredClone(token),
      JSON.parse(JSON.stringify(token)),
      { owner: a, kind: 'selection-snapshot', positions: positions() },
      null,
      undefined,
      1,
      'token',
      Symbol('token'),
    ];
    for (const value of wrong)
      expect(() => a.restore(value as SelectionSnapshot)).toThrow(
        'Unknown or foreign selection snapshot',
      );
    expect(a.restore(token)).toEqual(positions());
  } finally {
    a.close();
    b.close();
  }
});

it('forks only the private metadata schema and refuses mixed owners without altering its inputs', () => {
  const a = createSelectionSnapshots(),
    b = createSelectionSnapshots(),
    one = a.capture(positions()),
    two = b.capture(positions());
  const good: SelectionMetadata = new Map([
    ['before', one],
    ['after', one],
  ]);
  try {
    const copy = a.fork(good);
    expect(copy).not.toBe(good);
    expect(copy.get('before')).toBe(one);
    expect(copy.get('after')).toBe(one);
    expect(a.fork(new Map())).toEqual(new Map());
    const bad: unknown[] = [
      {},
      [],
      new Map([
        ['before', one],
        ['after', two],
      ]),
      new Map([
        ['before', one],
        ['unknown', one],
      ]),
      new Map([['before', {}]]),
    ];
    for (const value of bad) expect(() => a.fork(value as SelectionMetadata)).toThrow();
    expect(good).toEqual(
      new Map([
        ['before', one],
        ['after', one],
      ]),
    );
    copy.clear();
    expect(a.restore(good.get('before')!)).toEqual(positions());
    class InternalMap extends Map<'before' | 'after', SelectionSnapshot> {
      override [Symbol.iterator](): MapIterator<['before' | 'after', SelectionSnapshot]> {
        throw Error('iterator override must not run');
      }
    }
    expect(a.fork(new InternalMap(good)).get('before')).toBe(one);
  } finally {
    a.close();
    b.close();
  }
});

it('capture failures publish no token and leave existing snapshots usable', () => {
  const owner = createSelectionSnapshots(),
    token = owner.capture(positions());
  const throwing = positions(),
    badClone = positions();
  let returned: SelectionSnapshot | undefined,
    reads = 0;
  Object.defineProperty(throwing.get('master')!, 'main', {
    enumerable: true,
    get() {
      reads++;
      throw Error('capture fault');
    },
  });
  Object.defineProperty(badClone.get('master')!, 'main', {
    enumerable: true,
    get() {
      return () => {};
    },
  });
  try {
    expect(() => {
      returned = owner.capture(throwing);
    }).toThrow('capture fault');
    expect(reads).toBe(1);
    expect(returned).toBeUndefined();
    expect(() => {
      returned = owner.capture(badClone);
    }).toThrow();
    expect(returned).toBeUndefined();
    expect(owner.restore(token)).toEqual(positions());
    const next = owner.capture(positions(2));
    expect(owner.restore(next)).toEqual(positions(2));
  } finally {
    owner.close();
  }
});

it('close during native capture prevents issuance and terminal owners never regain access', () => {
  const owner = createSelectionSnapshots(),
    token = owner.capture(positions()),
    input = positions();
  let reads = 0,
    returned: SelectionSnapshot | undefined;
  Object.defineProperty(input.get('master')!, 'main', {
    enumerable: true,
    get() {
      reads++;
      owner.close();
      return 0;
    },
  });
  expect(() => {
    returned = owner.capture(input);
  }, 'close during capture must prevent token issuance').toThrow(
    'Selection snapshot owner is closed',
  );
  expect(returned).toBeUndefined();
  expect(reads).toBe(1);
  owner.close();
  owner.close();
  expect(() => owner.capture(input)).toThrow('Selection snapshot owner is closed');
  expect(reads).toBe(1);
  expect(() => owner.restore(token)).toThrow('Selection snapshot owner is closed');
  expect(() => owner.fork(new Map())).toThrow('Selection snapshot owner is closed');
  const reopened = createSelectionSnapshots();
  try {
    expect(() => reopened.restore(token)).toThrow('Unknown or foreign selection snapshot');
  } finally {
    reopened.close();
  }
});

it('generated branch and group lifetimes match an independent snapshot ledger through owner close', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          op: fc.constantFrom('fork', 'after', 'clear', 'drop', 'restore', 'foreign', 'close'),
          at: fc.nat(50),
        }),
        { maxLength: 30 },
      ),
      (steps) => {
        const owner = createSelectionSnapshots(),
          foreign = createSelectionSnapshots();
        let closed = false,
          serial = 1;
        const one = owner.capture(positions(0));
        const branches: {
          actual: SelectionMetadata;
          expected: Map<'before' | 'after', SelectionPositions>;
        }[] = [
          {
            actual: new Map([
              ['before', one],
              ['after', one],
            ]),
            expected: new Map([
              ['before', positions(0)],
              ['after', positions(0)],
            ]),
          },
        ];
        const check = () => {
          for (const b of branches) {
            expect([...b.actual.keys()]).toEqual([...b.expected.keys()]);
            for (const [key, token] of b.actual) {
              if (closed)
                expect(() => owner.restore(token)).toThrow('Selection snapshot owner is closed');
              else {
                expect(
                  () => owner.restore(token),
                  'retained branch snapshot must survive metadata disposal',
                ).not.toThrow();
                const restored = owner.restore(token);
                expect(restored).toEqual(b.expected.get(key));
                restored.clear();
                expect(owner.restore(token), 'branch restores must stay detached').toEqual(
                  b.expected.get(key),
                );
              }
              expect(
                () => foreign.restore(token),
                'foreign owner must not restore a snapshot',
              ).toThrow('Unknown or foreign selection snapshot');
            }
          }
        };
        const prefix: typeof steps = [
          { op: 'fork', at: 0 },
          { op: 'after', at: 1 },
          { op: 'fork', at: 1 },
          { op: 'clear', at: 1 },
          { op: 'drop', at: 0 },
          { op: 'restore', at: 0 },
          { op: 'foreign', at: 0 },
        ];
        try {
          check();
          for (const step of [...prefix, ...steps, { op: 'close' as const, at: 0 }]) {
            const i = step.at % branches.length,
              b = branches[i]!;
            if (step.op === 'close') {
              owner.close();
              closed = true;
            } else if (step.op === 'clear') {
              b.actual.clear();
              b.expected.clear();
            } else if (step.op === 'drop' && branches.length > 1) {
              b.actual.clear();
              branches.splice(i, 1);
            } else if (step.op === 'fork') {
              if (closed)
                expect(() => owner.fork(b.actual)).toThrow('Selection snapshot owner is closed');
              else
                branches.push({
                  actual: owner.fork(b.actual),
                  expected: structuredClone(b.expected),
                });
            } else if (step.op === 'after') {
              const source = positions(serial++);
              if (closed)
                expect(() => owner.capture(source)).toThrow('Selection snapshot owner is closed');
              else {
                const token = owner.capture(source);
                b.actual.set('after', token);
                b.expected.set('after', structuredClone(source));
                source.clear();
              }
            } else if (step.op === 'foreign') {
              const token = foreign.capture(positions(serial++));
              expect(() => owner.restore(token)).toThrow(
                closed
                  ? 'Selection snapshot owner is closed'
                  : 'Unknown or foreign selection snapshot',
              );
            }
            check();
          }
          expect(() => owner.fork(new Map())).toThrow('Selection snapshot owner is closed');
        } finally {
          owner.close();
          foreign.close();
        }
      },
    ),
    { seed: 150904, numRuns: 160 },
  );
});

it('generated sparse range arrays cannot disguise holes with extra enumerable properties', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 8 }), (holes) => {
      const owner = createSelectionSnapshots(),
        value = positions(),
        ranges = value.get('master')!.ranges;
      ranges.length = holes + 1;
      for (let i = 0; i < holes; i++)
        Object.defineProperty(ranges, 'extra' + i, { value: ranges[0], enumerable: true });
      try {
        expect(() => owner.capture(value), 'sparse selection ranges must be refused').toThrow(
          'Invalid selection snapshot value',
        );
      } finally {
        owner.close();
      }
    }),
    { seed: 150905, numRuns: 80 },
  );
});
