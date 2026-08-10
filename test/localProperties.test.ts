/**
 * What holds on one device, for every sequence rather than for the sequences
 * somebody thought of (TRD §11).
 *
 * The hand-written suites state that a particular sequence produces a
 * particular result. These state that a *class* of sequences produces no
 * broken state at all, which is the only way to make a claim about the cap
 * ("no sequence — paste, multi-line insert, undo, drag …") that means what §11
 * says it means. `fast-check` generates the sequences and shrinks a failure to
 * something short enough to read.
 *
 * The single-replica case is the floor. Everything here holds with the history
 * buttons in the alphabet, which is worth stating explicitly because the
 * networked properties next door do not (see `syncDefects.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  ALL_DEFECTS,
  DAYS,
  openFleet,
  placements,
  settle,
  violations,
  type Fleet,
} from './replicas';
import { applyOp, cardBodyArbitrary, opArbitrary } from './operations';
import {
  SECTIONS,
  archiveTextOf,
  cardsIn,
  compactDay,
  compose,
  parseDay,
  readDayContent,
  serializeDay,
  type DayContent,
} from '../src/crdt';

/** A configuration for the fleet properties: enough runs to be evidence, few enough to run in CI. */
const RUNS = 60;

const dayContentArbitrary: fc.Arbitrary<DayContent> = fc.record({
  next: fc.array(cardBodyArbitrary, { maxLength: 3 }),
  scheduled: fc.array(cardBodyArbitrary, { maxLength: 4 }),
  done: fc.array(cardBodyArbitrary, { maxLength: 4 }),
});

describe('the day serializer', () => {
  /**
   * TRD §11 requires `compact → parse` to reproduce arbitrary collections
   * exactly, and compaction is the one destructive operation in the system:
   * everything it deletes, it deletes on the strength of this round trip.
   */
  it('round trips any collection of cards, byte for byte', () => {
    fc.assert(
      fc.property(dayContentArbitrary, (content) => {
        expect(parseDay(serializeDay(content))).toEqual(content);
      }),
      { numRuns: 500 },
    );
  });

  it('round trips a day that is only blank lines and list markers', () => {
    const awkward: DayContent = {
      next: ['', '\n', '- '],
      scheduled: ['- [ ] nested\n  - [ ] deeper'],
      done: ['ends in a blank line\n', '## Done'],
    };
    expect(parseDay(serializeDay(awkward))).toEqual(awkward);
  });
});

describe('compaction', () => {
  /**
   * The verification inside `compactDay` runs before the deletion, so a day is
   * either archived losslessly or left alone. This is the property that makes
   * the deletion safe rather than the code comment that says it is.
   */
  it('either defers or reproduces the day exactly', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), dayContentArbitrary, async (seed, content) => {
        const fleet = await openFleet(1, seed);
        const [only] = fleet.replicas as [Fleet['replicas'][number]];
        try {
          const old = '2026-07-20';
          const past = { ...only.workspace, today: old };
          for (const section of SECTIONS) {
            for (const body of content[section]) {
              compose(past, { date: old, section }, body);
            }
          }
          await settle();

          const before = readDayContent(only.store.doc, old);
          compactDay(only.store.doc, only.store.actor.systemOrigin, old, '2026-08-05');
          const archive = archiveTextOf(only.store.doc, old);

          // Whatever it decided, the day reads exactly as it did — a deferred
          // day still has its collections, a compacted one reads through the
          // archive, and compaction is invisible from here either way.
          expect(readDayContent(only.store.doc, old)).toEqual(before);

          // And where it did write an archive, that archive is the day. Where
          // it did not, this is the assertion above restated, which is the
          // point: there is no third outcome in which something was lost.
          expect(parseDay(archive ?? serializeDay(before))).toEqual(before);

          // A compacted day has given its cards back; a deferred one has not
          // touched them. The reading above is the same in both cases.
          expect(SECTIONS.flatMap((section) => cardsIn(only.store.doc, old, section))).toHaveLength(
            archive === undefined ? SECTIONS.flatMap((section) => before[section]).length : 0,
          );
        } finally {
          fleet.destroy();
        }
      }),
      { numRuns: RUNS },
    );
  }, 120_000);
});

describe('one device, any sequence', () => {
  /**
   * The cap, the membership arrays and the card registry, against everything
   * the UI can do including undo and redo. Nothing here needs a network, so
   * nothing here has an excuse.
   */
  it('leaves no broken state behind', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer(),
        fc.array(opArbitrary, { minLength: 20, maxLength: 80 }),
        async (seed, ops) => {
          const fleet = await openFleet(1, seed);
          const [only] = fleet.replicas as [Fleet['replicas'][number]];
          try {
            for (const op of ops) {
              applyOp(only, op);
              await settle();
            }
            expect(violations(only.store.doc, ALL_DEFECTS)).toEqual([]);
          } finally {
            fleet.destroy();
          }
        },
      ),
      { numRuns: RUNS },
    );
  }, 120_000);

  /**
   * PRD §3 as a standing claim rather than a list of cases: whatever was done
   * to it, a day shows at most three cards in Next once the repair has run.
   */
  it('never shows a fourth card in Next', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer(),
        fc.array(opArbitrary, { minLength: 20, maxLength: 80 }),
        async (seed, ops) => {
          const fleet = await openFleet(1, seed);
          const [only] = fleet.replicas as [Fleet['replicas'][number]];
          try {
            for (const op of ops) {
              applyOp(only, op);
              await settle();
              expect(violations(only.store.doc, ['cap exceeded'])).toEqual([]);
            }
          } finally {
            fleet.destroy();
          }
        },
      ),
      { numRuns: RUNS },
    );
  }, 120_000);

  it('shows every card it stores, in exactly one place', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer(),
        fc.array(opArbitrary, { minLength: 20, maxLength: 80 }),
        async (seed, ops) => {
          const fleet = await openFleet(1, seed);
          const [only] = fleet.replicas as [Fleet['replicas'][number]];
          try {
            for (const op of ops) applyOp(only, op);
            await settle();

            const shown = placements(only.store.doc);
            expect(new Set(shown.map((card) => card.id)).size).toBe(shown.length);
            for (const { date } of shown) expect(DAYS).toContain(date);
          } finally {
            fleet.destroy();
          }
        },
      ),
      { numRuns: RUNS },
    );
  }, 120_000);
});
