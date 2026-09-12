/**
 * What day it is (PRD §8).
 *
 * Rollover happens in the last-known timezone at a configurable hour. The timer
 * is re-armed rather than polled, and the date is re-read when the tab becomes
 * visible again — a phone that was asleep across midnight comes back to the
 * right day without having had a timer fire.
 *
 * Nothing here has to be precisely right. The freeze is three days wide and
 * compaction seven, which is the standard PRD §8 sets: a day of ambiguity is
 * immaterial to every consumer of this value.
 */

import { useEffect, useState } from 'react';
import { todayFor, untilRollover, type ISODate } from '../lib/date';
import { nowLocal } from '../lib/temporal';

export const useToday = (rolloverHour = 0): ISODate => {
  const [today, setToday] = useState<ISODate>(() => todayFor(nowLocal(), rolloverHour));

  useEffect(() => {
    let timer: number | undefined;

    const check = (): void => setToday(todayFor(nowLocal(), rolloverHour));

    const arm = (): void => {
      window.clearTimeout(timer);
      // A second past the boundary, so the clock has definitely crossed it.
      timer = window.setTimeout(
        () => {
          check();
          arm();
        },
        untilRollover(nowLocal(), rolloverHour) + 1000,
      );
    };

    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      check();
      arm();
    };

    check();
    arm();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [rolloverHour]);

  return today;
};
