/**
 * The stale-Next indicator (PRD §6).
 *
 * "Before the freeze lands, a passive indicator (dot, banner — something
 * ambient, not modal) surfaces that there are stale Next items in recent days,
 * with bulk actions."
 *
 * Passive is the operative word. Unfinished Next items are left where they are
 * at midnight — not carried forward, not dropped, not prompted about — so this
 * is a line of text with a few buttons and no way to interrupt anything.
 *
 * Both bulk actions run as the **system** actor. A bulk resolution that entered
 * the human's undo stack would unwind a dozen card moves in one step days after
 * the fact, which is the concrete failure TRD §4.8 exists to prevent.
 */

import { useEffect, useState } from 'react';
import {
  moveAllNextTo,
  moveAllNextToMaster,
  staleDays,
  type StaleDay,
  type Store,
  type Workspace,
} from '../crdt';
import { relativeDay, type ISODate } from '../lib/date';

/**
 * Recomputed on a deep observation of `days`, debounced. The scan walks every
 * day, which is nothing on its own and too much to repeat per keystroke — and
 * nothing about a freeze three days out needs to be current to the millisecond.
 */
const useStaleDays = (store: Store, today: ISODate): StaleDay[] => {
  const [stale, setStale] = useState<StaleDay[]>(() => staleDays(store.doc, today));

  useEffect(() => {
    let timer: number | undefined;
    const recompute = (): void => setStale(staleDays(store.doc, today));

    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(recompute, 500);
    };

    recompute();
    store.days.observeDeep(schedule);
    return () => {
      window.clearTimeout(timer);
      store.days.unobserveDeep(schedule);
    };
  }, [store, today]);

  return stale;
};

export interface StaleBannerProps {
  store: Store;
  /** Carries the system origin: these are the app's writes, not the user's. */
  system: Workspace;
  today: ISODate;
  onGoTo: (date: ISODate) => void;
}

export const StaleBanner = ({
  store,
  system,
  today,
  onGoTo,
}: StaleBannerProps): React.ReactElement | null => {
  const stale = useStaleDays(store, today);
  if (stale.length === 0) return null;

  const first = stale[0] as StaleDay;
  const items = stale.reduce((sum, day) => sum + day.cards.length, 0);
  const soonest = Math.min(...stale.map((day) => day.daysLeft));

  return (
    <output className="stale">
      <span className="stale-text">
        {items} unfinished Next {items === 1 ? 'item' : 'items'} in{' '}
        {stale.length === 1 ? relativeDay(first.date, today) : `${stale.length} days`}
        {soonest > 0 ? `, freezing in ${soonest} ${soonest === 1 ? 'day' : 'days'}` : ''}.
      </span>

      <button
        type="button"
        className="card-action"
        onClick={() => {
          for (const day of stale) {
            moveAllNextTo(system, day.date, { date: today, section: 'scheduled' });
          }
        }}
      >
        Scheduled today
      </button>
      <button
        type="button"
        className="card-action"
        onClick={() => {
          for (const day of stale) moveAllNextToMaster(system, store.master, day.date);
        }}
      >
        To master
      </button>
      <button type="button" className="card-action" onClick={() => onGoTo(first.date)}>
        Show
      </button>
    </output>
  );
};
