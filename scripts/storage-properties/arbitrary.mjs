import * as fc from 'fast-check';

const pick = fc.nat(40);
const ids = fc.array(pick, { minLength: 1, maxLength: 4 });
const edit = fc.record({
  lane: fc.nat(2),
  actor: fc.nat(2),
  at: fc.nat(40),
  text: fc
    .array(fc.constantFrom('a', 'b', 'c', ' ', '\n', 'é'), { maxLength: 5 })
    .map((v) => v.join('')),
  remove: fc.nat(8),
});
const simple = fc.oneof(
  { weight: 4, arbitrary: fc.record({ op: fc.constant('disk'), ids }) },
  { weight: 4, arbitrary: fc.record({ op: fc.constant('journal'), id: pick }) },
  { weight: 2, arbitrary: fc.constant({ op: 'flush' }) },
  { weight: 3, arbitrary: fc.constant({ op: 'compact' }) },
);
const overlap = fc.record({
  op: fc.constant('overlap'),
  background: fc.constantFrom('disk', 'flush', 'compact'),
  boundary: fc.constantFrom('seal', 'published', 'deleted'),
  ids,
  during: fc.array(simple, { minLength: 1, maxLength: 5 }),
  finish: fc.constantFrom('release', 'release', 'close', 'crash'),
});
const step = fc.oneof(
  { weight: 8, arbitrary: simple },
  { weight: 4, arbitrary: overlap },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('late'), ids, after: ids }) },
  { weight: 1, arbitrary: fc.constant({ op: 'reopen' }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('quota'), id: pick }) },
  { weight: 1, arbitrary: fc.constant({ op: 'remove-failure' }) },
  {
    weight: 2,
    arbitrary: fc.record({
      op: fc.constant('abort'),
      at: fc.constantFrom('reserve', 'record', 'publish', 'delete'),
      ids,
    }),
  },
);
export const historyArbitrary = fc.record({
  edits: fc.array(edit, { maxLength: 22 }),
  steps: fc.array(step, { minLength: 1, maxLength: 35 }),
});

/** Focused sensitivity control for the discovered Yjs framing defect; the baseline uses the full grammar. */
export const incompleteMergeArbitrary = fc
  .array(fc.constantFrom('a', 'b', 'é', '\n'), { minLength: 1, maxLength: 5 })
  .map((letters) => ({
    edits: [
      { lane: 0, actor: 1, at: 0, text: letters.join(''), remove: 0 },
      ...Array.from({ length: 3 }, () => ({
        lane: 0,
        actor: 0,
        at: 0,
        text: letters.join(''),
        remove: 0,
      })),
    ],
    steps: [{ op: 'disk', ids: [3, 1, 5] }, { op: 'compact' }],
  }));

// Fixed seeds make CI reproducible. --seed/--runs support additional exploration; JSON is the durable replay.
export const defaultSeeds = [8941, 130003, 991827];
