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

/** A wall-clock reading in the last-known timezone — what rollover is measured in. */
export type PlainDateTime = Ponyfill.PlainDateTime;
export type PlainDate = Ponyfill.PlainDate;

export const nowLocal = (): PlainDateTime => Temporal.Now.plainDateTimeISO();
