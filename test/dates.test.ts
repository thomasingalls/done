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
  const at = (hours: number, minutes = 0): Date => new Date(2026, 7, 5, hours, minutes);

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

describe('local calendar dates', () => {
  it('reads the local date rather than the UTC one', () => {
    // Late in the evening local time is the next day in UTC for anything east
    // of the meridian and the previous one to its west; the calendar date the
    // app stores is the one the user is living in.
    const evening = new Date(2026, 7, 5, 23, 30);
    expect(toISODate(evening)).toBe('2026-08-05');
  });
});
