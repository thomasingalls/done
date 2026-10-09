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

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { addDays, relativeDay, type ISODate } from '../lib/date';
import { DayPanel } from './DayPanel';

export interface DayPlaneProps {
  date: ISODate;
  today: ISODate;
  /** Live drag offset in pixels; positive reveals the past. */
  shift: number;
  /** True while the release is animating to its resting place. */
  settling: boolean;
  showMenuTrigger: boolean;
  menuOpen: boolean;
  showGoalsTrigger: boolean;
  goalsOpen: boolean;
  onOpenGoals: () => void;
  onOpenMenu: () => void;
  onGoTo: (date: ISODate) => void;
  unfiledCount: number;
  unfiledOpen: boolean;
  onOpenUnfiled: () => void;
}

export const DayPlane = ({
  date,
  today,
  shift,
  settling,
  showMenuTrigger,
  menuOpen,
  showGoalsTrigger,
  goalsOpen,
  onOpenGoals,
  onOpenMenu,
  onGoTo,
  unfiledCount,
  unfiledOpen,
  onOpenUnfiled,
}: DayPlaneProps): React.ReactElement => {
  const previous = addDays(date, -1);
  const next = addDays(date, 1);
  const scroller = useRef<HTMLElement>(null);
  const center = useRef(0);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const recenter = (): void => {
      element.style.setProperty('--day-viewport-size', `${element.clientHeight}px`);
      const panels = element.querySelectorAll<HTMLElement>('.day-panel');
      if (panels.length < 2) return;
      center.current = Math.abs(panels[1]!.offsetTop - panels[0]!.offsetTop);
      element.style.setProperty('--day-scroll-step', `${center.current}px`);
      delete element.dataset['wheelNavigation'];
      element.scrollTop = center.current;
    };

    const resize = new ResizeObserver(recenter);
    resize.observe(element);
    recenter();
    return () => resize.disconnect();
  }, [date]);

  const onScrollEnd = useCallback((): void => {
    const element = scroller.current;
    if (!element || center.current === 0) return;
    const navigates = element.dataset['wheelNavigation'] === 'true';
    delete element.dataset['wheelNavigation'];
    const displacement = element.scrollTop - center.current;
    if (!navigates || Math.abs(displacement) < center.current / 2) {
      element.scrollTop = center.current;
      return;
    }
    onGoTo(displacement > 0 ? next : previous);
  }, [next, onGoTo, previous]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    let touchPointer: number | null = null;
    const restoreWheelScroll = (event: PointerEvent): void => {
      if (event.pointerId !== touchPointer) return;
      touchPointer = null;
      element.style.removeProperty('overflow-y');
      element.scrollTop = center.current;
    };
    const suspendWheelScroll = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      touchPointer = event.pointerId;
      element.style.overflowY = 'hidden';
    };

    element.addEventListener('scrollend', onScrollEnd);
    element.addEventListener('pointerdown', suspendWheelScroll, { capture: true });
    window.addEventListener('pointerup', restoreWheelScroll);
    window.addEventListener('pointercancel', restoreWheelScroll);
    return () => {
      element.removeEventListener('scrollend', onScrollEnd);
      element.removeEventListener('pointerdown', suspendWheelScroll, { capture: true });
      window.removeEventListener('pointerup', restoreWheelScroll);
      window.removeEventListener('pointercancel', restoreWheelScroll);
    };
  }, [onScrollEnd]);

  return (
    <main ref={scroller} className="day-plane" data-wheel-scroll-plane aria-label="Days">
      <div className="day-wheel-overlay">
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
      </div>

      <div className="day-scroll-range" aria-hidden="true">
        <span className="day-scroll-stop" data-position="previous" />
        <span className="day-scroll-stop" data-position="current" />
        <span className="day-scroll-stop" data-position="next" />
      </div>

      <div
        className="day-track"
        data-settling={settling}
        style={{ '--day-shift': `${shift}px` } as React.CSSProperties}
      >
        {[previous, date, next].map((panelDate, index) => (
          <DayPanel
            key={panelDate}
            date={panelDate}
            today={today}
            offset={index - 1}
            // Only the day in focus carries it: a neighbour is inert, and a
            // second copy of the only non-gesture route to the menu is a second
            // thing to keep in step for no gain.
            showMenuTrigger={showMenuTrigger && index === 1}
            menuOpen={menuOpen}
            showGoalsTrigger={showGoalsTrigger && index === 1}
            goalsOpen={goalsOpen}
            onOpenGoals={onOpenGoals}
            onOpenMenu={onOpenMenu}
            onGoTo={onGoTo}
            unfiledCount={unfiledCount}
            unfiledOpen={unfiledOpen}
            onOpenUnfiled={onOpenUnfiled}
          />
        ))}
      </div>
    </main>
  );
};
