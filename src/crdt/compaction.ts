/**
 * Compaction (TRD §4.5, §10.4).
 *
 * A **storage optimization**, not a UX rule. Seven days after its date a day's
 * collections serialize to canonical markdown in `archive` and the arrays are
 * deleted. By then the day has been read-only for four days, so nothing the
 * user can see depends on whether this has run — which is exactly the property
 * that lets the window be a free tuning parameter and lets a failed compaction
 * be deferred forever.
 *
 * **Nothing here may consult the freeze, and freeze.ts may not consult this.**
 * Draft v2 of the TRD conflated them and §11 keeps a regression test for it.
 *
 * This is the only destructive operation in the system, so it carries the
 * mitigations §10.4 asks for:
 *
 * - the serializer is shared with export, so it is exercised continuously by
 *   something that deletes nothing;
 * - the round trip is verified — serialize, parse, compare — and a mismatch
 *   leaves the day alone. Yjs has no transaction rollback, so the verification
 *   runs *before* the deletion inside the same transaction rather than after
 *   it: same guarantee, and one that does not depend on being able to undo;
 * - a failure defers indefinitely rather than retrying destructively;
 * - the clock is only ever the local one. A day is compacted when the local
 *   date exceeds it by seven in the last-known timezone; no remote clock is
 *   consulted, so a wrong clock elsewhere cannot delete anything here.
 */

import { daysBetween, type ISODate } from '../lib/date';
import type { Origin } from './actors';
import { SECTIONS, archiveOf, collectionOf, dayAt, isCompacted, listDays, type Day } from './days';
import { parseCollections, readCollections, serializeCollections } from './serialize';
import { newText, transact, type YDoc } from './yjs';

/** Four days after the freeze, deliberately (TRD §4.5). A free tuning parameter. */
export const COMPACTION_DAYS = 7;

export const isCompactionDue = (date: ISODate, today: ISODate): boolean =>
  daysBetween(date, today) >= COMPACTION_DAYS;

const hasCards = (day: Day): boolean =>
  SECTIONS.some((section) => (collectionOf(day, section)?.length ?? 0) > 0);

export type CompactionOutcome = 'compacted' | 'skipped' | 'deferred';

/**
 * Compacts one day. Idempotent: a day that already has an archive is skipped,
 * so two devices running this concurrently both produce the same archive text
 * from the same source and Yjs converges on one of them.
 */
export const compactDay = (
  doc: YDoc,
  systemOrigin: Origin,
  date: ISODate,
  today: ISODate,
): CompactionOutcome => {
  if (!isCompactionDue(date, today)) return 'skipped';

  const day = dayAt(doc, date);
  if (!day || isCompacted(day)) return 'skipped';
  // An empty day would trade three empty arrays for a text holding three
  // headings. Nothing to reclaim, so nothing to risk.
  if (!hasCards(day)) return 'skipped';

  const collections = readCollections(day);
  const archive = serializeCollections(collections);

  const parsed = parseCollections(archive);
  const matches = SECTIONS.every(
    (section) =>
      parsed[section].length === collections[section].length &&
      parsed[section].every((body, index) => body === collections[section][index]),
  );
  if (!matches) return 'deferred';

  transact(doc, systemOrigin, () => {
    day.set('archive', newText(archive));
    for (const section of SECTIONS) day.delete(section);
  });

  return 'compacted';
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

/** Exposed for the freeze-independence test: the stored shape, not the policy. */
export const archiveTextOf = (doc: YDoc, date: ISODate): string | undefined =>
  archiveOf(dayAt(doc, date))?.toString();
