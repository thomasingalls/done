/**
 * What holds across devices, for every schedule rather than the schedules
 * somebody thought of (PRD §13 phase 3, TRD §11).
 *
 * `multiDevice.test.ts` puts two stores either side of a relay and walks them
 * through named scenarios. These generate the scenario instead: N stores, one
 * relay, and a schedule of edits and partitions that `fast-check` writes and
 * then shrinks. The phase-3 exit criterion is "phone and laptop consistent
 * across a week including offline edits on both", and a week is a thing only a
 * week can establish — but "consistent, whatever the two of them did while
 * apart" is a property, and this is it.
 *
 * Three replicas are here for their own reasons, not as a bigger two. With two,
 * every partition is symmetric and every replica has seen either all of a
 * change or none of it. With three, one replica can be *between* the other two:
 * it has the first half of what one of them did and none of the second, and it
 * runs the cap repair on that partial view. Whether two independently repairing
 * replicas agree is only a real question once a third can disagree with both.
 *
 * Each property names the defects it rules out. The gap — dangling ids and
 * orphaned cards, which survive convergence when the history buttons are in the
 * alphabet — is not an oversight; it is the finding, and it has its own file
 * (`syncDefects.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  ALL_DEFECTS,
  cardIdsOf,
  masterText,
  openFleet,
  placements,
  storedMembership,
  violations,
  type Defect,
  type Fleet,
  type Replica,
} from './replicas';
import {
  opArbitraryAdditive,
  opArbitraryWithoutHistory,
  runSchedule,
  scheduleArbitrary,
} from './operations';
import {
  Y,
  applyUpdate,
  compose,
  enforceCap,
  listDays,
  repairCardMemberships,
  type Origin,
  type YDoc,
} from '../src/crdt';

/** Enough generated schedules to be evidence, few enough that `pnpm test` stays quick. */
const RUNS = 40;

const SYSTEM: Origin = Object.freeze({
  actor: 'system',
  kind: 'system' as const,
  device: 'replay',
});

/**
 * A bare document fed a log of updates, then repaired exactly the way
 * `watchCap` repairs a live one. Bare rather than a whole store because the
 * question is about the repair functions and nothing else: given the same
 * updates in a different order, do they decide the same thing?
 */
const repaired = (log: readonly Uint8Array[]): YDoc => {
  const doc = new Y.Doc();
  for (const update of log) applyUpdate(doc, update, 'replay');
  repairCardMemberships(doc, SYSTEM);
  for (const date of listDays(doc)) enforceCap(doc, SYSTEM, date);
  return doc;
};

/**
 * The defects concurrency alone can produce. Everything not listed is ruled out
 * separately, either with a narrower alphabet or with a named regression.
 */
const CONCURRENCY_DEFECTS: Defect[] = ['cap exceeded', 'duplicate membership', 'stale membership'];

/** Runs a generated schedule on a fresh fleet and hands the converged fleet back. */
const played = async (
  size: number,
  seed: number,
  steps: Parameters<typeof runSchedule>[1],
  check: (fleet: Fleet, rounds: number) => void,
): Promise<void> => {
  const fleet = await openFleet(size, seed);
  try {
    await runSchedule(fleet, steps);
    check(fleet, await fleet.converge());
  } finally {
    fleet.destroy();
  }
};

/**
 * Everything a device shows, plus the arrays underneath it — because two
 * replicas can agree on every card the user sees while their stored membership
 * still differs, and a difference there is a repair that has not settled.
 */
const view = (replica: Replica): unknown => ({
  cards: placements(replica.store.doc),
  master: masterText(replica),
  membership: storedMembership(replica.store.doc),
});

/** Each replica paired with the first, ready to be compared. */
const against = (fleet: Fleet): [unknown, unknown][] =>
  fleet.replicas.slice(1).map((other) => [view(other), view(fleet.replicas[0] as Replica)]);

describe.each([2, 3])('%i devices through a relay', (size) => {
  it('converge on the same document, whatever they did while apart', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), scheduleArbitrary(size), async (seed, steps) => {
        await played(size, seed, steps, (fleet) => {
          for (const [other, first] of against(fleet)) expect(other).toEqual(first);
        });
      }),
      { numRuns: RUNS },
    );
  }, 300_000);

  /**
   * TRD §11 lists "concurrent insert-from-two-devices" among the sequences the
   * cap must survive, and the repair that catches it runs independently on
   * every replica. This is the claim that independent repairs agree: no day
   * shows four cards in Next, no collection holds an id twice, and no
   * collection holds an id whose canonical location says it lives elsewhere.
   */
  it('keep the cap and the membership arrays sound', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), scheduleArbitrary(size), async (seed, steps) => {
        await played(size, seed, steps, (fleet) => {
          for (const replica of fleet.replicas) {
            expect(violations(replica.store.doc, CONCURRENCY_DEFECTS)).toEqual([]);
          }
        });
      }),
      { numRuns: RUNS },
    );
  }, 300_000);

  /**
   * The whole invariant set, with undo and redo left out of the alphabet. This
   * is the strong statement — every stored id is backed by a card, and every
   * card is somewhere a device will draw it — and the narrower alphabet is what
   * makes it true. See `syncDefects.test.ts` for the two ways undo breaks it.
   */
  it('strand nothing when nobody presses undo', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer(),
        scheduleArbitrary(size, { ops: opArbitraryWithoutHistory }),
        async (seed, steps) => {
          await played(size, seed, steps, (fleet) => {
            for (const [other, first] of against(fleet)) expect(other).toEqual(first);
            for (const replica of fleet.replicas) {
              expect(violations(replica.store.doc, ALL_DEFECTS)).toEqual([]);
            }
          });
        },
      ),
      { numRuns: RUNS },
    );
  }, 300_000);

  /**
   * The phase-3 criterion stated as loss rather than as agreement. Two devices
   * agreeing on an empty day is convergence and is also a catastrophe, so with
   * nothing in the alphabet that deletes anything, every card any device
   * created has to be on every device at the end.
   *
   * The concurrent creation of a day that neither device has written to before
   * is the case this is really about: both replicas mint their own `Y.Map` for
   * the date, one of them wins the key outright, and the loser's collections —
   * with the loser's cards in them — are dropped by Yjs. Nothing is lost only
   * because the canonical registry survives that and the membership repair
   * re-homes what fell out of it.
   */
  it('lose nothing that was written on any of them', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer(),
        scheduleArbitrary(size, { ops: opArbitraryAdditive }),
        async (seed, steps) => {
          const fleet = await openFleet(size, seed);
          try {
            await runSchedule(fleet, steps);

            // Everything anybody made, gathered before the fleet converges so
            // that a card only one replica ever saw still counts.
            const written = new Set(
              fleet.replicas.flatMap((replica) => [...cardIdsOf(replica.store.doc)]),
            );

            await fleet.converge();

            for (const replica of fleet.replicas) {
              const shown = new Set(placements(replica.store.doc).map((card) => card.id));
              expect([...written].filter((id) => !shown.has(id))).toEqual([]);
            }
          } finally {
            fleet.destroy();
          }
        },
      ),
      { numRuns: RUNS },
    );
  }, 300_000);

  /**
   * The repairs are triggered by document changes and produce document changes,
   * which is the shape a feedback loop has. This says there isn't one: the
   * round after the last productive round moves nothing, on every replica and
   * on the relay, so a network that has finished talking has finished talking.
   */
  it('go quiet one round after the last change', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), scheduleArbitrary(size), async (seed, steps) => {
        await played(size, seed, steps, (_fleet, rounds) => {
          expect(rounds).toBeLessThanOrEqual(3);
        });
      }),
      { numRuns: RUNS },
    );
  }, 300_000);
});

/**
 * The generated schedules above reach this by chance; it is written out here
 * because the mechanism is not obvious from the code and nothing else names it.
 *
 * `ensureDay` mints a `Y.Map` for a date that has never been written to. Two
 * devices doing that while apart produce two different maps for one key, and
 * Yjs resolves that the only way it can — one map wins the key outright and the
 * loser's is deleted, taking its three collection arrays and every id in them
 * with it. That is the exact failure `actors.ts` describes for the schema-v2
 * `meta.actors` map and fixed by flattening the keys, and `days` still has the
 * shape that causes it.
 *
 * It is not a bug only because a card's content and canonical location live in
 * roots that merge by id and therefore survive, and because the membership
 * repair pushes anything located-but-unfiled back into the winning day. The
 * cost is presentation order: the loser's cards arrive at the end of the
 * collection rather than where they were left.
 */
describe('a day both devices create at once', () => {
  it('keeps the cards from the map that lost the key', async () => {
    const fleet = await openFleet(2, 5);
    try {
      const [phone, laptop] = fleet.replicas as [Replica, Replica];
      // Neither device has ever written to this date, so neither has a day map.
      fleet.net.disconnect(phone.store.doc);
      fleet.net.disconnect(laptop.store.doc);
      const day = { date: '2026-08-05', section: 'scheduled' as const };
      compose(phone.workspace, day, 'from the phone');
      compose(laptop.workspace, day, 'from the laptop');

      await fleet.converge();

      for (const replica of fleet.replicas) {
        expect(new Set(placements(replica.store.doc).map((card) => card.body))).toEqual(
          new Set(['from the phone', 'from the laptop']),
        );
        expect(violations(replica.store.doc, ALL_DEFECTS)).toEqual([]);
      }
      expect(view(laptop)).toEqual(view(phone));
    } finally {
      fleet.destroy();
    }
  }, 60_000);
});

/**
 * TRD §11 asks for random sequences "applied in both orders". A relay over TCP
 * does not reorder, but a device that has been away receives a week in one
 * batch while a device that was present received it a keystroke at a time, and
 * the two must not end up with different documents.
 *
 * The interesting half is not that Yjs converges — it does — but that the
 * repairs compute the same answer either way. `repairCardMemberships` iterates
 * the card registry, whose *iteration* order is the order entries were
 * integrated and therefore differs between two replicas that received the same
 * updates in different orders. The repair has to be indifferent to that.
 */
describe('delivery order', () => {
  it('does not change what the repairs decide', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), scheduleArbitrary(3), async (seed, steps) => {
        const fleet = await openFleet(3, seed);
        try {
          await runSchedule(fleet, steps);
          await fleet.converge();

          const log = fleet.updates;
          const forwards = repaired(log);
          const backwards = repaired([...log].reverse());
          try {
            expect(placements(backwards)).toEqual(placements(forwards));
            expect(violations(backwards, ALL_DEFECTS)).toEqual(violations(forwards, ALL_DEFECTS));
          } finally {
            forwards.destroy();
            backwards.destroy();
          }
        } finally {
          fleet.destroy();
        }
      }),
      { numRuns: 20 },
    );
  }, 300_000);
});
