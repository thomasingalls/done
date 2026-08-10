/**
 * Calendar dates (PRD §8, TRD §4.2).
 *
 * A day key is a calendar date, not an instant. Cards carry a UTC timestamp in
 * `createdAt`; the day they live in is a local calendar day, because "which day
 * did I do this on" is a local question and always was.
 *
 * That distinction is the whole reason this is built on `Temporal` (see
 * lib/temporal.ts). `Temporal.PlainDate` is a calendar date with no timezone
 * attached and no way to acquire one by accident, and `Temporal.PlainDateTime`
 * is a wall-clock reading — which is exactly what "rollover happens in the
 * user's last-known timezone" means. Neither can silently become an instant,
 * so none of the arithmetic below has to be defended.
 *
 * PRD §8 sets the standard for everything time-dependent: "any feature leaning
 * heavily on knowing precisely when the user's midnight is requires serious
 * justification." Nothing here leans on it — the freeze is three days wide and
 * compaction seven — which is also why DST is not modelled: a wall clock that
 * skips or repeats an hour moves nothing across a three-day boundary.
 */

import { Temporal, nowLocal, type PlainDate, type PlainDateTime } from './temporal';

/** `YYYY-MM-DD`, which is what a day is keyed by and what sorts correctly. */
export type ISODate = string;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const plainDate = (iso: ISODate): PlainDate => Temporal.PlainDate.from(iso);

/** The calendar date a wall-clock reading falls on. No timezone is applied. */
export const toISODate = (at: PlainDateTime): ISODate => at.toPlainDate().toString();

export const addDays = (iso: ISODate, days: number): ISODate =>
  plainDate(iso).add({ days }).toString();

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: ISODate, to: ISODate): number =>
  plainDate(from).until(plainDate(to), { largestUnit: 'day' }).days;

export const compareDates = (a: ISODate, b: ISODate): number =>
  Temporal.PlainDate.compare(plainDate(a), plainDate(b));

const epochNanoseconds = (instant: string): bigint | null => {
  try {
    return Temporal.Instant.from(instant).epochNanoseconds;
  } catch {
    return null;
  }
};

/**
 * Two `createdAt` instants, oldest first.
 *
 * Comparing them as text is wrong and looks right, which is why this exists at
 * all: `Temporal.Instant.toString()` emits fractional seconds only when it
 * needs them, so `…:00.5Z` sorts *before* `…:00Z` as a string while being half
 * a second later in time.
 *
 * Total on every input, including one this schema never wrote. It is used by a
 * repair that runs on every document change (`repairCardMemberships`), where an
 * exception would be a document the app cannot open — so an unparsable value
 * sorts last and ties break as text rather than throwing.
 */
export const compareInstants = (a: string, b: string): number => {
  const left = epochNanoseconds(a);
  const right = epochNanoseconds(b);
  if (left === null || right === null) {
    if (left !== right) return left === null ? 1 : -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return left < right ? -1 : left > right ? 1 : 0;
};

/**
 * Today, in the last-known timezone, honouring the configured rollover hour
 * (PRD §8). A rollover of 4 means 03:00 still belongs to yesterday — the hour
 * is subtracted from the wall clock before the calendar date is read, which is
 * the whole mechanism.
 */
export const todayFor = (now: PlainDateTime, rolloverHour = 0): ISODate =>
  now.subtract({ hours: rolloverHour }).toPlainDate().toString();

/** Today by the clock the app is actually running against. */
export const currentDate = (rolloverHour = 0): ISODate => todayFor(nowLocal(), rolloverHour);

/** Milliseconds until the next rollover, for scheduling the day flip. */
export const untilRollover = (now: PlainDateTime, rolloverHour = 0): number => {
  const boundary = now.with({
    hour: rolloverHour,
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });
  const next =
    Temporal.PlainDateTime.compare(boundary, now) > 0 ? boundary : boundary.add({ days: 1 });
  return now.until(next).total({ unit: 'millisecond' });
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `Wed 5 Aug` — the header format from PRD §7.4. The names are a table rather
 * than `Intl.DateTimeFormat` because the format is fixed and English, and
 * handing a `PlainDate` to `Intl` means constructing an instant on the way.
 * `dayOfWeek` is ISO-8601, so Monday is 1.
 */
export const formatDay = (iso: ISODate): string => {
  const date = plainDate(iso);
  return `${WEEKDAYS[date.dayOfWeek - 1] as string} ${date.day} ${MONTHS[date.month - 1] as string}`;
};

/** `Wed 5 Aug 2026`, for anywhere the year is not obvious from context. */
export const formatDayLong = (iso: ISODate): string => `${formatDay(iso)} ${plainDate(iso).year}`;

/**
 * What to call a day relative to today. The header shows the date (PRD §7.4);
 * this is for the peeks and the stale-item banner, where "yesterday" reads
 * better than a date the user has to subtract from.
 */
export const relativeDay = (iso: ISODate, today: ISODate): string => {
  const delta = daysBetween(today, iso);
  if (delta === 0) return 'Today';
  if (delta === -1) return 'Yesterday';
  if (delta === 1) return 'Tomorrow';
  return formatDay(iso);
};
