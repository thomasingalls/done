/**
 * Three ways a card used to stop being reachable, found by the property suites
 * next door and pinned here as minimized regressions.
 *
 * A card's identity is spread across three roots — `cards`, `cardLocations`
 * and a day's ordered arrays. Membership repair now observes all three roots,
 * restores a missing location when an array supplies evidence, and retains
 * truly locationless cards as explicitly unfiled. Compaction no longer deletes
 * shared types without proof that offline replicas have observed them.
 */

import { describe, expect, it } from 'vitest';
import {
  archiveTextOf,
  cardBody,
  cardId,
  cardLocation,
  cardsIn,
  cardsMap,
  compactDay,
  compose,
  moveCard,
  readDayContent,
} from '../src/crdt';
import { openFleet, placements, settle, storedMembership, type Fleet } from './replicas';

const DAY = '2026-08-05';

const only = (fleet: Fleet, index: number): Fleet['replicas'][number] =>
  fleet.replicas[index] as Fleet['replicas'][number];

describe('undo across devices', () => {
  /**
   * **A card the user can no longer reach.**
   *
   * Two devices move the same card while apart. They converge — one move wins,
   * which is correct and is what `convergence.test.ts` asserts. Then the losing
   * device presses undo, expecting its own move to come back off.
   *
   * `Y.UndoManager` reverts a
   * transaction by deleting what it inserted and restoring what it deleted, and
   * the second half is refused for a `Y.Map` key that another client has also
   * written: `redoItem` in yjs 13.6 returns null with "it is not possible to
   * redo this item because it conflicts with a change from another client". The
   * insertion is still deleted. Membership repair must restore the location
   * from the surviving array evidence instead of making the card unreachable.
   */
  it('undo of a move that lost a merge puts the card back', async () => {
    const fleet = await openFleet(2, 7);
    const [a, b] = [only(fleet, 0), only(fleet, 1)];
    try {
      compose(a.workspace, { date: DAY, section: 'scheduled' }, 'call the dentist');
      await fleet.converge();
      const id = cardId(cardsIn(a.store.doc, DAY, 'scheduled')[0]!);

      fleet.net.disconnect(a.store.doc);
      fleet.net.disconnect(b.store.doc);
      moveCard(b.workspace, { date: DAY, section: 'scheduled' }, id, {
        date: DAY,
        section: 'done',
      });
      moveCard(a.workspace, { date: DAY, section: 'scheduled' }, id, {
        date: DAY,
        section: 'next',
      });
      await settle();

      await fleet.converge();
      expect(cardsIn(a.store.doc, DAY, 'next').map((card) => cardBody(card))).toEqual([
        'call the dentist',
      ]);

      a.store.undo.undo();
      await fleet.converge();

      expect(cardLocation(a.store.doc, id)).not.toBeNull();
      expect(placements(a.store.doc).map((card) => card.body)).toEqual(['call the dentist']);
      expect(placements(b.store.doc)).toEqual(placements(a.store.doc));
    } finally {
      fleet.destroy();
    }
  }, 60_000);

  /**
   * **A membership entry nothing will ever clear.**
   *
   * The mirror image, and the milder of the two. One device composes a card,
   * the other moves it — which replaces the array entry with one of its own —
   * and then the first device undoes its compose. The card and its location go,
   * correctly; the *other* device's array entry stays, pointing at nothing.
   *
   * Membership repair removes the stale array id, and must be triggered by the
   * card registry or location-map change even when the day itself was untouched.
   */
  it('undo of a compose clears the membership a peer created', async () => {
    const fleet = await openFleet(2, 11);
    const [a, b] = [only(fleet, 0), only(fleet, 1)];
    try {
      compose(a.workspace, { date: DAY, section: 'scheduled' }, 'call the dentist');
      await fleet.converge();
      const id = cardId(cardsIn(a.store.doc, DAY, 'scheduled')[0]!);

      moveCard(b.workspace, { date: DAY, section: 'scheduled' }, id, {
        date: DAY,
        section: 'done',
      });
      await fleet.converge();

      a.store.undo.undo();
      await fleet.converge();

      expect(cardsMap(a.store.doc).size).toBe(0);
      expect(storedMembership(a.store.doc)).toEqual([]);
      expect(storedMembership(b.store.doc)).toEqual([]);
    } finally {
      fleet.destroy();
    }
  }, 60_000);
});

describe('compaction and a device that was away', () => {
  /**
   * **A card written before the freeze, deleted by a compaction that never saw
   * it.**
   *
   * The freeze is three days (PRD §6) and compaction is seven (TRD §4.5), which
   * leaves a four-day window: an edit made legally on day + 2 can still be
   * unsynced when another device compacts on day + 7. No clock is wrong and no
   * rule is broken — this is a phone in a drawer for five days, which PRD §13's
   * exit criterion ("a week including offline edits on both") describes exactly.
   *
   * A time threshold cannot prove that every replica has observed the shared
   * types slated for deletion. Compaction therefore validates but defers,
   * leaving the structured day available for the late update to merge into.
   */
  it('keeps an edit made before the freeze by a device that was offline', async () => {
    const fleet = await openFleet(2, 3);
    const [laptop, phone] = [only(fleet, 0), only(fleet, 1)];
    const day = '2026-07-29';
    try {
      // Both present on the day itself.
      compose(
        { ...laptop.workspace, today: day },
        { date: day, section: 'done' },
        'from the laptop',
      );
      await fleet.converge();
      expect(cardsIn(phone.store.doc, day, 'done')).toHaveLength(1);

      // The phone goes into a drawer, and two days later — still inside the
      // three-day freeze window, so a legal write — something gets added to it.
      fleet.net.disconnect(phone.store.doc);
      const twoDaysLater = '2026-07-31';
      expect(
        compose(
          { ...phone.workspace, today: twoDaysLater },
          { date: day, section: 'done' },
          'from the phone',
        ),
      ).toBe(true);
      await settle();

      // Five days after that the laptop's idle pass compacts the day.
      expect(compactDay(laptop.store.doc, laptop.store.actor.systemOrigin, day, '2026-08-05')).toBe(
        'deferred',
      );
      expect(archiveTextOf(laptop.store.doc, day)).toBeUndefined();
      await settle();

      // The phone comes back out of the drawer.
      fleet.net.connect(phone.store.doc);
      await fleet.converge();

      expect(archiveTextOf(laptop.store.doc, day)).toBeUndefined();
      expect(readDayContent(laptop.store.doc, day).done).toContain('from the laptop');
      expect(readDayContent(laptop.store.doc, day).done).toContain('from the phone');
      expect(readDayContent(phone.store.doc, day).done).toContain('from the phone');
    } finally {
      fleet.destroy();
    }
  }, 60_000);
});
