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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DISPLAY_SECTIONS } from '../crdt/days';
import { isFrozen } from '../crdt/freeze';
import { formatDay, relativeDay, type ISODate } from '../lib/date';
import { Collection } from './Collection';
import { useWorkspaceUi } from './workspaceUi';

export interface DayPanelProps {
  date: ISODate;
  today: ISODate;
  /** -1, 0 or 1: yesterday, the day in focus, tomorrow. */
  offset: number;
  /** The menu trigger, absent at wide where the menu is already a panel. */
  showMenuTrigger: boolean;
  onOpenMenu: () => void;
  onGoTo: (date: ISODate) => void;
  menuOpen: boolean;
  showGoalsTrigger: boolean;
  goalsOpen: boolean;
  onOpenGoals: () => void;
  unfiledCount: number;
  unfiledOpen: boolean;
  onOpenUnfiled: () => void;
}

type TouchScrollRoom = 'none' | 'top' | 'middle' | 'bottom';

export const DayPanel = ({
  date,
  today,
  offset,
  showMenuTrigger,
  onOpenMenu,
  onGoTo,
  menuOpen,
  showGoalsTrigger,
  goalsOpen,
  onOpenGoals,
  unfiledCount,
  unfiledOpen,
  onOpenUnfiled,
}: DayPanelProps): React.ReactElement => {
  const active = offset === 0;
  const { snapshot } = useWorkspaceUi();
  const hasContent = snapshot.cards.length > 0 || snapshot.master.length > 0;
  const [introDismissed, setIntroDismissed] = useState(() => {
    try {
      return localStorage.getItem('done.onboarding.intro-dismissed') === '1';
    } catch {
      return false;
    }
  });
  const dismissIntro = () => {
    setIntroDismissed(true);
    try {
      localStorage.setItem('done.onboarding.intro-dismissed', '1');
    } catch {
      /* optional hint */
    }
  };
  useEffect(() => {
    if (hasContent && !introDismissed) dismissIntro();
  }, [hasContent, introDismissed]);
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

  useLayoutEffect(() => {
    const element = body.current;
    if (!active && element && element.scrollTop !== 0) {
      element.scrollTop = 0;
      measureTouchScrollRoom();
    }
  }, [active, measureTouchScrollRoom]);

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
        {active && date === today && unfiledCount > 0 && (
          <button
            type="button"
            className="unfiled-trigger"
            aria-label={`File ${unfiledCount} ${unfiledCount === 1 ? 'card' : 'cards'}`}
            aria-expanded={unfiledOpen}
            aria-controls="unfiled-panel"
            onClick={onOpenUnfiled}
          >
            <WarningIcon />
            <span>{unfiledCount}</span>
          </button>
        )}
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
        {showGoalsTrigger && (
          <button
            type="button"
            className="panel-action goals-trigger"
            aria-label="Open Goals"
            aria-expanded={goalsOpen}
            aria-controls="goals"
            title="Open Goals (Alt + →)"
            onClick={onOpenGoals}
          >
            Goals <span aria-hidden="true">→</span>
          </button>
        )}
      </header>

      <div className="day-body" data-scroll="day" data-touch-scroll={touchScrollRoom} ref={body}>
        {active && date === today && !introDismissed && !hasContent && (
          <aside className="onboarding-note" aria-label="Getting started">
            <p>Write everything in Goals. Choose three things for Next. Record what got done.</p>
            <button onClick={onOpenGoals}>Open Goals</button>
            <button aria-label="Dismiss introduction" onClick={dismissIntro}>
              Dismiss
            </button>
          </aside>
        )}
        {DISPLAY_SECTIONS.map((section) => (
          <Collection key={section} date={date} section={section} frozen={frozen} active={active} />
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

const WarningIcon = (): React.ReactElement => (
  <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path
      d="M9 2.25 16 15H2L9 2.25Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M9 6.25v4.25M9 13.25h.01" stroke="currentColor" strokeLinecap="round" />
  </svg>
);
