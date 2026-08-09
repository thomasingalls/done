/**
 * Three ways a card stops being reachable, found by the property suites next
 * door and pinned here as the shortest sequence that produces each.
 *
 * Every test in this file is `it.fails`: it runs the sequence, asserts what
 * *should* happen, and passes because that assertion currently throws. That is
 * deliberate. A skipped test rots and an ordinary test that encodes the wrong
 * answer teaches the wrong answer to the next person; `it.fails` records the
 * defect, keeps it executing on every run, and goes red the moment somebody
 * fixes it — at which point the `.fails` comes off and the test stands as the
 * regression it was written to be.
 *
 * All three share a root cause worth naming. A card's identity is spread across
 * three roots — `cards`, `cardLocations` and a day's ordered arrays — and
 * `repairCardMemberships` is what keeps them agreeing. The repair is sound
 * (`syncProperties.test.ts` generates thousands of schedules it survives). What
 * fails is everything around it: it is triggered by one of the three roots, it
 * declines to act on one of the states it can be handed, and one operation
 * deletes a collection out from under it.
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
   * What it gets is a card that is nowhere. `Y.UndoManager` reverts a
   * transaction by deleting what it inserted and restoring what it deleted, and
   * the second half is refused for a `Y.Map` key that another client has also
   * written: `redoItem` in yjs 13.6 returns null with "it is not possible to
   * redo this item because it conflicts with a change from another client". The
   * insertion is still deleted. So `cardLocations[id]` is removed rather than
   * rolled back, while `cards[id]` survives — and `repairCardMemberships`
   * explicitly skips a card with no location (`if (!location || …) continue`),
   * so nothing ever puts it back. The card is not in any collection, not in the
   * export, and not deletable. It is just gone, on every device.
   *
   * Two candidate fixes, neither free:
   *
   * - `new Y.UndoManager(scope, { …, ignoreRemoteMapChanges: true })`, which
   *   makes the restore overwrite the peer's value instead of refusing. Undo
   *   would then clobber a concurrent move — a worse outcome than the peer
   *   expects, but a far better one than a vanished card, and the membership
   *   repair reconciles the arrays afterwards.
   * - Teach `repairCardMemberships` that a card with no location is a card that
   *   lost its location, and re-home it from whichever collection still holds
   *   its id (or, if none does, a fallback day) rather than skipping it.
   *
   * The second is the one that also covers the third defect in this file.
   */
  it.fails('undo of a move that lost a merge puts the card back', async () => {
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

      // What actually happens: `cards` still holds the card, `cardLocations`
      // does not, and every collection on both devices is empty.
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
   * `repairCardMemberships` would remove it on sight. It never gets the chance,
   * because `watchCap` observes the `days` map alone and that undo touched only
   * `cards` and `cardLocations`. Nothing else will ever touch that day either,
   * so the entry is permanent — invisible, since `cardsIn` filters it out, but
   * counted by `collection.length`, which is what `arrivalIndex` and
   * `reorderCard`'s clamp are computed from. A drag onto a collection carrying
   * stale entries lands at the wrong index.
   *
   * The fix is one line of trigger rather than one of logic: the repair reads
   * `cards` and `cardLocations`, so it has to be woken by them too.
   */
  it.fails('undo of a compose clears the membership a peer created', async () => {
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
      // What actually happens: `["2026-08-05:done:<id>"]`, on both devices, for good.
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
   * `compactDay` serializes the collections it can see, verifies the round trip,
   * then deletes the three arrays and every card id it found. The absent
   * device's card was not in the archive, because the compacting device never
   * had it — and when the two merge, the array its insert lived in has been
   * deleted, so the insert goes with it. `cards[id]` and `cardLocations[id]`
   * survive the merge, and `repairCardMemberships` looks up
   * `collectionOf(dayAt(date), section)`, finds nothing on a compacted day, and
   * leaves the card where it is: registered, located, and shown by nothing.
   *
   * It is not in the day view, not in the archive, and not in the export — so
   * "your data outlives the app" (PRD principle 4) does not hold for it either.
   *
   * The narrow fix is for the repair to fold a card stranded on a compacted day
   * back into that day's `archive`: rebuild the text from
   * `parseCollections(archive)` plus the stranded bodies in a deterministic
   * order and re-`set` the key, which is the same argument `compactDay` already
   * makes for two devices compacting at once — identical input, identical text,
   * and Yjs keeps one of them. The broader fix is to stop compaction deleting
   * anything until the day is old enough that no unsynced writer can still be
   * holding an edit to it, which means a compaction window wider than the
   * longest partition the app intends to survive.
   */
  it.fails('keeps an edit made before the freeze by a device that was offline', async () => {
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
        'compacted',
      );
      await settle();

      // The phone comes back out of the drawer.
      fleet.net.connect(phone.store.doc);
      await fleet.converge();

      const archive = archiveTextOf(laptop.store.doc, day) as string;
      expect(archive).toContain('from the laptop');
      // What actually happens: the phone's card is in `cards`, located at
      // `2026-07-29:done`, and present in no archive, no collection and no export.
      expect(archive).toContain('from the phone');
      expect(readDayContent(phone.store.doc, day).done).toContain('from the phone');
    } finally {
      fleet.destroy();
    }
  }, 60_000);
});
