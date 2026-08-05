/**
 * Calendar dates (PRD §8, TRD §4.2).
 *
 * A day key is a calendar date, not an instant. Cards carry a UTC timestamp in
 * `createdAt`; the day they live in is a local calendar day, because "which day
 * did I do this on" is a local question and always was.
 *
 * PRD §8 sets the standard for everything time-dependent: "any feature leaning
 * heavily on knowing precisely when the user's midnight is requires serious
 * justification." Nothing here leans on it. The freeze is three days wide and
 * compaction seven, so a day of timezone ambiguity is immaterial to both, and
 * that is why the arithmetic below can be plain calendar arithmetic rather than
 * anything that has to be right about instants.
 */

/** `YYYY-MM-DD`. */
export type ISODate = string;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (value: number): string => String(value).padStart(2, '0');

/** The calendar date a `Date` falls on in the local timezone. */
export const toISODate = (date: Date): ISODate =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Midnight UTC on the given calendar date. Used only as a canonical number for
 * comparing and stepping dates — never displayed, so the UTC choice is a
 * arithmetic convenience and not a claim about when the day started.
 */
const epoch = (iso: ISODate): number => {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
};

const DAY_MS = 86_400_000;

export const addDays = (iso: ISODate, days: number): ISODate => {
  const shifted = new Date(epoch(iso) + days * DAY_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: ISODate, to: ISODate): number =>
  Math.round((epoch(to) - epoch(from)) / DAY_MS);

export const compareDates = (a: ISODate, b: ISODate): number => epoch(a) - epoch(b);

/**
 * Today, in the last-known timezone, honouring the configured rollover hour
 * (PRD §8). A rollover of 4 means 03:00 still belongs to yesterday — the hour
 * is subtracted before the calendar date is read, which is the whole mechanism.
 */
export const todayFor = (now: Date, rolloverHour = 0): ISODate =>
  toISODate(new Date(now.getTime() - rolloverHour * 3_600_000));

/** Milliseconds until the next rollover, for scheduling the day flip. */
export const untilRollover = (now: Date, rolloverHour = 0): number => {
  const next = new Date(now);
  next.setHours(rolloverHour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `Wed 5 Aug` — the header format from PRD §7.4. Hand-rolled rather than
 * `Intl.DateTimeFormat` because the date is a calendar date with no timezone,
 * and handing one to `Intl` means constructing an instant and hoping it lands
 * on the right side of midnight.
 */
export const formatDay = (iso: ISODate): string => {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] as string;
  return `${weekday} ${day} ${MONTHS[month - 1] as string}`;
};

/** `Wed 5 Aug 2026`, for anywhere the year is not obvious from context. */
export const formatDayLong = (iso: ISODate): string => `${formatDay(iso)} ${iso.slice(0, 4)}`;

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
