// @vitest-environment node
import { expect, it } from 'vitest';
import { LOCAL_RETENTION_MIN_RECORDS as MIN } from '../src/crdt/automaticLocalRetention';
import { createLedgerHints } from '../src/crdt/ledgerHints';

const microtasks = async () => {
  for (let n = 0; n < 5; n++) await Promise.resolve();
};

it('announces a hint that returns after a scheduler read it during validation', async () => {
  const hints = createLedgerHints();
  let notices = 0;
  hints.subscribe(() => notices++);
  hints.settle({ revision: 0, records: MIN }, false);
  await microtasks();
  notices = 0;
  hints.begin();
  expect(hints.hint()).toBeUndefined(); // retention observed the gap and went idle
  hints.settle({ revision: 0, records: MIN }, undefined); // byte-equal: same hint comes back
  await microtasks();
  expect(notices).toBe(1);
  // No read in the gap and nothing changed: no announcement.
  hints.begin();
  hints.settle({ revision: 0, records: MIN }, undefined);
  await microtasks();
  expect(notices).toBe(1);
});

it('tracks the full-check path from adopted views and keeps it stable while a check runs', async () => {
  const hints = createLedgerHints();
  let notices = 0;
  hints.subscribe(() => notices++);
  expect(hints.fullCheck()).toBe(false);
  hints.begin();
  hints.settle({ revision: 0, records: 10 }, true); // adopted view lost its indexes
  await microtasks();
  expect(hints.fullCheck()).toBe(true);
  expect(notices).toBe(1);
  hints.begin(); // the next change's reference check is in flight
  expect(hints.fullCheck()).toBe(true);
  hints.settle({ revision: 0, records: 11 }, undefined);
  expect(hints.fullCheck()).toBe(true);
  hints.begin();
  hints.abandon(); // validation threw: hint stays withdrawn, flag unchanged
  expect(hints.hint()).toBeUndefined();
  expect(hints.fullCheck()).toBe(true);
  hints.begin();
  hints.abandon(false); // indexed delta adopted, then its discretionary audit yielded
  expect(hints.fullCheck()).toBe(false);
  hints.begin();
  hints.settle({ revision: 1, records: 3 }, false); // reduced baseline
  await microtasks();
  expect(hints.fullCheck()).toBe(false);
  hints.withdraw();
  expect(hints.hint()).toBeUndefined();
  hints.dispose();
  const after = notices;
  hints.settle({ revision: 2, records: 4 }, true);
  await microtasks();
  expect(notices).toBe(after);
});
