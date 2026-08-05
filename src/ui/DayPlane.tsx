/**
 * Days on the vertical axis (PRD §7.1, §7.3).
 *
 * "Days run vertically, journal-style: past above, future below." Three panels
 * are mounted — yesterday, today, tomorrow — positioned so the one in focus
 * fills the plane and its neighbours show as slivers above and below. Those
 * slivers *are* the peeks: real panels with real content, which is what TRD
 * §8.1 means by "a revealed neighbour shows real content at no editor cost",
 * and they are click targets to move a day (PRD §7.3).
 *
 * The four bands of PRD §7.4 fall out of that rather than being built:
 * `[peek: Tue] / [header: Wed] / [body: Wed] / [peek: Thu]`, in that order,
 * with the peeks bracketing the header rather than sitting inside the body.
 */

import type { Store, Workspace } from '../crdt';
import { addDays, relativeDay, type ISODate } from '../lib/date';
import { DayPanel } from './DayPanel';

export interface DayPlaneProps {
  store: Store;
  workspace: Workspace;
  date: ISODate;
  today: ISODate;
  /** Live drag offset in pixels; positive reveals the past. */
  shift: number;
  /** True while the release is animating to its resting place. */
  settling: boolean;
  showMenuTrigger: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onGoTo: (date: ISODate) => void;
}

export const DayPlane = ({
  store,
  workspace,
  date,
  today,
  shift,
  settling,
  showMenuTrigger,
  menuOpen,
  onOpenMenu,
  onGoTo,
}: DayPlaneProps): React.ReactElement => {
  const previous = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <main className="day-plane" aria-label="Days">
      <div
        className="day-track"
        data-settling={settling}
        style={{ '--day-shift': `${shift}px` } as React.CSSProperties}
      >
        {[previous, date, next].map((panelDate, index) => (
          <DayPanel
            key={panelDate}
            store={store}
            workspace={workspace}
            date={panelDate}
            today={today}
            offset={index - 1}
            // Only the day in focus carries it: a neighbour is inert, and a
            // second copy of the only non-gesture route to the menu is a second
            // thing to keep in step for no gain.
            showMenuTrigger={showMenuTrigger && index === 1}
            menuOpen={menuOpen}
            onOpenMenu={onOpenMenu}
            onGoTo={onGoTo}
          />
        ))}
      </div>

      {/*
       * The peeks are the neighbouring panels themselves; these sit over their
       * slivers to make them targets without putting a control inside a panel
       * that is meant to be inert.
       */}
      <button
        type="button"
        className="day-peek"
        data-edge="top"
        aria-label={`Go to ${relativeDay(previous, today)}`}
        onClick={() => onGoTo(previous)}
      />
      <button
        type="button"
        className="day-peek"
        data-edge="bottom"
        aria-label={`Go to ${relativeDay(next, today)}`}
        onClick={() => onGoTo(next)}
      />
    </main>
  );
};
