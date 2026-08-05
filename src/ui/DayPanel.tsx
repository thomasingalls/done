/**
 * One day (PRD §7.4, TRD §8.2).
 *
 * Header plus scrolling body, in that order. The header is **pinned** — outside
 * the scrolling region rather than sticky within it — because at narrow and
 * medium it holds the only non-gesture route to the menu, and a trigger that
 * can scroll away is a trigger that can become unreachable.
 *
 * The peeks that bracket this are the neighbouring days themselves (see
 * DayPlane), which is what makes a revealed neighbour show real content: cards
 * are static by default, so it costs no editor to have yesterday half on screen.
 */

import { SECTIONS, isFrozen, type Store, type Workspace } from '../crdt';
import { formatDay, relativeDay, type ISODate } from '../lib/date';
import { Collection } from './Collection';
import { Journal } from './Journal';

export interface DayPanelProps {
  store: Store;
  workspace: Workspace;
  date: ISODate;
  today: ISODate;
  /** -1, 0 or 1: yesterday, the day in focus, tomorrow. */
  offset: number;
  /** The menu trigger, absent at wide where the menu is already a panel. */
  showMenuTrigger: boolean;
  onOpenMenu: () => void;
  onGoTo: (date: ISODate) => void;
  menuOpen: boolean;
}

export const DayPanel = ({
  store,
  workspace,
  date,
  today,
  offset,
  showMenuTrigger,
  onOpenMenu,
  onGoTo,
  menuOpen,
}: DayPanelProps): React.ReactElement => {
  const active = offset === 0;
  const frozen = isFrozen(date, today);

  return (
    <section
      className="day-panel"
      data-active={active}
      data-frozen={frozen}
      data-date={date}
      style={{ '--day-index': offset } as React.CSSProperties}
      aria-label={relativeDay(date, today)}
      aria-hidden={!active}
      inert={!active}
    >
      <header className="panel-header">
        {showMenuTrigger && (
          <button
            type="button"
            className="menu-trigger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="menu"
            onClick={onOpenMenu}
          >
            <MenuIcon />
          </button>
        )}
        <h1 className="panel-title">{formatDay(date)}</h1>
        {date !== today && (
          <button type="button" className="panel-action" onClick={() => onGoTo(today)}>
            Today
          </button>
        )}
        {frozen && (
          <span className="panel-badge" title="Three days past. Collections are read-only.">
            Frozen
          </span>
        )}
      </header>

      <div className="day-body" data-scroll="day">
        <Journal store={store} workspace={workspace} date={date} active={active} />
        {SECTIONS.map((section) => (
          <Collection
            key={section}
            store={store}
            workspace={workspace}
            date={date}
            section={section}
            frozen={frozen}
            active={active}
          />
        ))}
      </div>
    </section>
  );
};

const MenuIcon = (): React.ReactElement => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path
      d="M2 4.5h14M2 9h14M2 13.5h14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
