/**
 * The Temporal seam.
 *
 * Dates are Temporal's job here, not `Date`'s: a day key is a calendar date
 * with no instant behind it, and `Date` has no type for that — every operation
 * on one has to be talked out of applying a timezone. `Temporal.PlainDate` and
 * `Temporal.PlainDateTime` say exactly what is meant, which is why PRD §8's
 * "coarse enough that a day of ambiguity is immaterial" can be a statement
 * about the *callers* rather than a hope about the arithmetic.
 *
 * Temporal is not yet in the runtimes this project targets — Chromium 141 does
 * not have it, and Node 22 only behind `--harmony-temporal` — so the ponyfill
 * stands in where the global is missing. It is used as a value, never installed
 * on `globalThis`: nothing else in the app should have to know which of the two
 * it got.
 *
 * **This is the only file permitted to import `temporal-polyfill`.** When the
 * platform ships Temporal, deleting the import and the dependency is the whole
 * migration. `test/seam.test.ts` enforces that mechanically, the same way it
 * does for Yjs.
 */

import { Temporal as Ponyfill } from 'temporal-polyfill';

type TemporalApi = typeof Ponyfill;

const native = (globalThis as { Temporal?: TemporalApi }).Temporal;

export const Temporal: TemporalApi = native ?? Ponyfill;

/** Whether the platform supplied it, for the settings panel to be honest about. */
export const temporalIsNative = native !== undefined;

/**
 * A wall-clock reading in the last-known timezone — what rollover is measured
 * in. The instant comes from `Date.now()` so fake-clock tooling has one stable
 * seam even after browsers ship a native `Temporal.Now` implementation.
 */
export type PlainDateTime = Ponyfill.PlainDateTime;
export type PlainDate = Ponyfill.PlainDate;
export type Instant = Ponyfill.Instant;

export const nowLocal = (): PlainDateTime =>
  Temporal.Instant.fromEpochMilliseconds(Date.now())
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDateTime();

let previous: Instant | null = null;

/**
 * A UTC instant, strictly increasing for as long as this device is running.
 *
 * `Date.now()` reads milliseconds, and a device can write several cards inside
 * one of those. Two cards then carry the same `createdAt` — and `createdAt` is
 * what puts Done back in newest-first order when a merge destroys the array
 * that held it (see `repairCardMemberships`). Equal timestamps there mean the
 * order this device did things in is simply not in the document to recover, so
 * a reading that has not advanced is nudged one nanosecond past the last one.
 *
 * Instants carry nanoseconds, so this stays a timestamp rather than a counter
 * dressed as one: it can run at most a nanosecond per card ahead of the clock,
 * and it converges back the moment the clock catches up. Two *devices* can
 * still tie, which is correct — nothing happened first there.
 */
export const nowInstant = (): Instant => {
  const reading = Temporal.Instant.fromEpochMilliseconds(Date.now());
  const next =
    previous && Temporal.Instant.compare(reading, previous) <= 0
      ? previous.add({ nanoseconds: 1 })
      : reading;
  previous = next;
  return next;
};
