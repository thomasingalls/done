/**
 * PRD §8. Calendar arithmetic, and the rollover hour.
 *
 * The standard §8 sets is that nothing may lean heavily on knowing precisely
 * when the user's midnight is. These tests hold the arithmetic down anyway,
 * because "coarse enough not to matter" is a claim about the *consumers* of
 * these functions, not a licence for them to be wrong.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  daysBetween,
  formatDay,
  relativeDay,
  toISODate,
  todayFor,
  untilRollover,
} from '../src/lib/date';
import { Temporal, type PlainDateTime } from '../src/lib/temporal';

describe('calendar arithmetic', () => {
  it('steps days across month and year boundaries', () => {
    expect(addDays('2026-08-05', 1)).toBe('2026-08-06');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // a leap year
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-08-05', '2026-08-08')).toBe(3);
    expect(daysBetween('2026-08-08', '2026-08-05')).toBe(-3);
    expect(daysBetween('2026-08-05', '2026-08-05')).toBe(0);
  });

  it('orders dates as strings do, which is why the format is what it is', () => {
    expect(compareDates('2026-08-05', '2026-08-06')).toBeLessThan(0);
    const dates = ['2026-09-01', '2026-08-05'];
    dates.sort();
    expect(dates).toEqual(['2026-08-05', '2026-09-01']);
  });

  it('names a day the way the header does', () => {
    expect(formatDay('2026-08-05')).toBe('Wed 5 Aug');
    expect(relativeDay('2026-08-05', '2026-08-05')).toBe('Today');
    expect(relativeDay('2026-08-04', '2026-08-05')).toBe('Yesterday');
    expect(relativeDay('2026-08-06', '2026-08-05')).toBe('Tomorrow');
    expect(relativeDay('2026-08-01', '2026-08-05')).toBe('Sat 1 Aug');
  });
});

describe('the rollover hour', () => {
  /** A wall-clock reading, which is what rollover is measured against. */
  const at = (hour: number, minute = 0): PlainDateTime =>
    Temporal.PlainDateTime.from({ year: 2026, month: 8, day: 5, hour, minute });

  it('is midnight by default', () => {
    expect(todayFor(at(0, 1))).toBe('2026-08-05');
    expect(todayFor(at(23, 59))).toBe('2026-08-05');
  });

  it('keeps the small hours on the previous day when it is set', () => {
    expect(todayFor(at(3), 4)).toBe('2026-08-04');
    expect(todayFor(at(4), 4)).toBe('2026-08-05');
    expect(todayFor(at(23), 4)).toBe('2026-08-05');
  });

  it('reports a positive wait to the next rollover', () => {
    const wait = untilRollover(at(22), 4);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(24 * 3_600_000);
    expect(untilRollover(at(3), 4)).toBe(3_600_000);
  });
});

describe('calendar dates carry no timezone', () => {
  it('reads the wall clock, which is the only clock a day key has', () => {
    // Late in the evening is the next day in UTC for anything east of the
    // meridian and the previous one to its west. A `PlainDateTime` has no
    // offset to apply, so there is nothing here to get wrong — which is the
    // reason this is built on Temporal rather than on `Date`.
    const evening = Temporal.PlainDateTime.from('2026-08-05T23:30');
    expect(toISODate(evening)).toBe('2026-08-05');
  });

  it('steps a day without an hour of DST changing the answer', () => {
    // A wall clock that skips or repeats an hour moves nothing across a day
    // boundary, because none of this arithmetic is in milliseconds.
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });
});
