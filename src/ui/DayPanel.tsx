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

import { useCallback, useEffect, useRef, useState } from 'react';
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

type TouchScrollRoom = 'none' | 'top' | 'middle' | 'bottom';

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
  const body = useRef<HTMLDivElement>(null);
  const [touchScrollRoom, setTouchScrollRoom] = useState<TouchScrollRoom>('none');

  const measureTouchScrollRoom = useCallback((): void => {
    const element = body.current;
    if (!element) return;
    const maximum = element.scrollHeight - element.clientHeight;
    const next: TouchScrollRoom =
      maximum <= 1
        ? 'none'
        : element.scrollTop <= 1
          ? 'top'
          : element.scrollTop >= maximum - 1
            ? 'bottom'
            : 'middle';
    setTouchScrollRoom((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    const element = body.current;
    if (!element) return;

    let frame: number | undefined;
    const scheduleMeasurement = (): void => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureTouchScrollRoom);
    };
    const resize = new ResizeObserver(scheduleMeasurement);
    const mutation = new MutationObserver(scheduleMeasurement);

    resize.observe(element);
    mutation.observe(element, { childList: true, characterData: true, subtree: true });
    element.addEventListener('scroll', scheduleMeasurement, { passive: true });
    measureTouchScrollRoom();

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      element.removeEventListener('scroll', scheduleMeasurement);
    };
  }, [measureTouchScrollRoom]);

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

      <div className="day-body" data-scroll="day" data-touch-scroll={touchScrollRoom} ref={body}>
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
