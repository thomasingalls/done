/**
 * Compaction (TRD §4.5, §10.4).
 *
 * A **storage optimization**, not a UX rule. The original implementation
 * serialized a seven-day-old day to `archive` and deleted its live Yjs types.
 * That is unsafe without replica acknowledgements: a device can reconnect with
 * an edit made against a nested card type that another device has since
 * deleted. Yjs converges correctly, but the deleted parent makes that edit
 * unreachable.
 *
 * Compaction is therefore safety-paused. Due, non-empty days report `deferred`
 * and remain live. Existing archives from earlier versions stay readable; no
 * new destructive archive is produced until the protocol can prove every
 * replica has observed the state being discarded.
 *
 * **Nothing here may consult the freeze, and freeze.ts may not consult this.**
 * Draft v2 of the TRD conflated them and §11 keeps a regression test for it.
 *
 * The paused path performs no serialization and no mutation. If destructive
 * compaction is re-enabled, its serializer checks and replica acknowledgement
 * protocol belong in the same change; until then, repeating work whose result
 * cannot affect this outcome only increases launch cost.
 */

import { daysBetween, type ISODate } from '../lib/date';
import { SECTIONS, archiveOf, collectionOf, dayAt, isCompacted, listDays, type Day } from './days';
import type { Origin } from './actors';
import type { YDoc } from './yjs';

/** Four days after the freeze, deliberately (TRD §4.5). A free tuning parameter. */
export const COMPACTION_DAYS = 7;

export const isCompactionDue = (date: ISODate, today: ISODate): boolean =>
  daysBetween(date, today) >= COMPACTION_DAYS;

const hasCards = (day: Day): boolean =>
  SECTIONS.some((section) => (collectionOf(day, section)?.length ?? 0) > 0);

export type CompactionOutcome = 'compacted' | 'skipped' | 'deferred';

/**
 * Validates whether one day could be compacted, but deliberately leaves it
 * intact. `systemOrigin` remains in the signature so re-enabling compaction is
 * an explicit protocol change rather than an API migration at every caller.
 */
export const compactDay = (
  doc: YDoc,
  _systemOrigin: Origin,
  date: ISODate,
  today: ISODate,
): CompactionOutcome => {
  if (!isCompactionDue(date, today)) return 'skipped';

  const day = dayAt(doc, date);
  if (!day || isCompacted(day)) return 'skipped';
  // An empty day would trade three empty arrays for a text holding three
  // headings. Nothing to reclaim, so nothing to risk.
  if (!hasCards(day)) return 'skipped';

  // Safety pause: there is no proof that an offline replica has observed the
  // nested Yjs types we would delete. Serialization is deferred with deletion;
  // validating an archive that cannot be written only adds launch-time work.
  return 'deferred';
};

export interface CompactionResult {
  compacted: ISODate[];
  deferred: ISODate[];
}

/** Every day that is due. Runs opportunistically on idle (§4.5). */
export const compactDueDays = (
  doc: YDoc,
  systemOrigin: Origin,
  today: ISODate,
): CompactionResult => {
  const result: CompactionResult = { compacted: [], deferred: [] };

  for (const date of listDays(doc)) {
    const outcome = compactDay(doc, systemOrigin, date, today);
    if (outcome === 'compacted') result.compacted.push(date);
    if (outcome === 'deferred') result.deferred.push(date);
  }

  return result;
};

/**
 * Schedules compaction for a quiet moment. `requestIdleCallback` where it
 * exists, a timeout where it does not — this must never compete with the
 * keystroke path, which is the one thing the whole app is for.
 */
export const scheduleCompaction = (run: () => void, delayMs = 4000): (() => void) => {
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void) => number })
    .requestIdleCallback;

  const timer = setTimeout(() => {
    if (idle) idle(run);
    else run();
  }, delayMs);

  return () => clearTimeout(timer);
};

/** Reads legacy archives written before destructive compaction was paused. */
export const archiveTextOf = (doc: YDoc, date: ISODate): string | undefined =>
  archiveOf(dayAt(doc, date))?.toString();
