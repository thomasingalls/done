/**
 * The freeze (PRD §6, TRD §4.5).
 *
 * Three days after its date a day's **collections** become permanently
 * read-only. There is no unfreeze, no override, and none will be added later —
 * per PRD principle 6 the past is not going to be read again, and a freeze with
 * an escape hatch is not a freeze.
 *
 * Two things this is not:
 *
 * - **Not compaction.** Compaction is a storage optimization on a different
 *   schedule with no user-visible effect (see compaction.ts). Draft v2 of the
 *   TRD conflated them; §11 keeps a regression test for it. Nothing in this
 *   file may consult the stored representation, and nothing in compaction.ts
 *   may consult this one.
 * - **Not the master list.** The freeze is a property of a *day*, and the
 *   master list has no date attached, so there is nothing for it to be three
 *   days past. It never freezes (PRD §6).
 */

import { compareDates, daysBetween, type ISODate } from '../lib/date';
import { NEXT_CAP, cardsIn, listDays, type Card } from './days';
import type { YDoc } from './yjs';

/** Days after which a day's collections are read-only. Permanent, per PRD §6. */
export const FREEZE_DAYS = 3;

export const isFrozen = (date: ISODate, today: ISODate): boolean =>
  daysBetween(date, today) >= FREEZE_DAYS;

/** Whole days until the freeze lands; zero or less once it has. */
export const daysUntilFreeze = (date: ISODate, today: ISODate): number =>
  FREEZE_DAYS - daysBetween(date, today);

/**
 * Days in the window between "past" and "frozen" that still hold Next items —
 * what the PRD §6 indicator surfaces. Deliberately bounded to the freeze
 * window: a day that has already frozen is not stale, it is finished.
 */
export interface StaleDay {
  date: ISODate;
  cards: Card[];
  daysLeft: number;
}

export const staleDays = (doc: YDoc, today: ISODate): StaleDay[] =>
  listDays(doc)
    .filter((date) => compareDates(date, today) < 0 && !isFrozen(date, today))
    .map((date) => ({
      date,
      cards: cardsIn(doc, date, 'next'),
      daysLeft: daysUntilFreeze(date, today),
    }))
    .filter((day) => day.cards.length > 0);

/**
 * How many Next items a day can still take. Exposed here rather than inside the
 * move operations because the UI needs the same number to disable a control
 * rather than let it fail (PRD §5: constraints are the feature, not an error
 * message after the fact).
 */
export const remainingNextCapacity = (doc: YDoc, date: ISODate): number =>
  Math.max(0, NEXT_CAP - cardsIn(doc, date, 'next').length);
