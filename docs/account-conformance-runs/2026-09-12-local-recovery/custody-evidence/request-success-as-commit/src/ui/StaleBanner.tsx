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

import { daysUntilFreeze, isFrozen } from '../crdt/freeze';
import { relativeDay, compareDates, type ISODate } from '../lib/date';
import { useWorkspaceUi } from './workspaceUi';

export interface StaleBannerProps {
  today: ISODate;
  onGoTo: (date: ISODate) => void;
}

export const StaleBanner = ({ today, onGoTo }: StaleBannerProps): React.ReactElement | null => {
  const { snapshot, execute } = useWorkspaceUi();
  const stale = snapshot.days.filter(
    (day) => compareDates(day.date, today) < 0 && !isFrozen(day.date, today) && day.next.length > 0,
  );
  if (stale.length === 0) return null;

  const first = stale[0]!;
  const items = stale.reduce((sum, day) => sum + day.next.length, 0);
  const soonest = Math.min(...stale.map((day) => daysUntilFreeze(day.date, today)));

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
            void execute({
              kind: 'bulk',
              from: day.date,
              to: { date: today, section: 'scheduled' },
            });
          }
        }}
      >
        Scheduled today
      </button>
      <button
        type="button"
        className="card-action"
        onClick={() => {
          for (const day of stale) void execute({ kind: 'bulk', from: day.date, to: 'master' });
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
