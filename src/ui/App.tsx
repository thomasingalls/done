/**
 * The shell (PRD §7, TRD §8).
 *
 * ```
 *                     ┌──────────┐
 *                     │   PAST   │   (drag down)
 *                     └────┬─────┘
 *    ┌────────┐       ┌────┴─────┐       ┌────────┐
 *    │  MENU  │───────│  TODAY   │───────│ GOALS  │
 *    └────────┘       └────┬─────┘       └────────┘
 *    (drag right)     ┌────┴─────┐       (drag left)
 *                     │  FUTURE  │   (drag up)
 *                     └──────────┘
 * ```
 *
 * Today is the origin and every view is a fixed direction away: no navigation
 * stack, no back semantics, no nested screens. Movement is continuous and
 * interruptible — the adjacent view is partially visible during the drag, and a
 * release below threshold snaps back.
 *
 * Which surfaces are reachable *by gesture* depends on the breakpoint, because
 * at wide the menu is already a panel and at medium so is Goals. That is one
 * decision, made in useBreakpoint.ts and read here rather than re-derived.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { shouldCommit, type Direction } from '../gestures/recognizer';
import { useGestures } from '../gestures/useGestures';
import { addDays, currentDate, type ISODate } from '../lib/date';
import { useWorkspaceUi } from './workspaceUi';
import { DayPlane } from './DayPlane';
import { Goals } from './Goals';
import { Menu } from './Menu';
import { UnfiledPanel } from './UnfiledPanel';
import { StaleBanner } from './StaleBanner';
import { goalsIsPanel, menuIsPanel, useBreakpoint } from './useBreakpoint';
import { useToday } from './useToday';
import { useGentleContext } from './useGentleContext';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Matches `--duration-snap`; the swap happens once the movement has landed. */
const SNAP_MS = 220;

/** Which lateral surface a horizontal drag is moving. */
type Lateral = 'menu' | 'goals';

export const App = (): React.ReactElement => {
  const gentleContext = useGentleContext();
  const { snapshot } = useWorkspaceUi();
  const breakpoint = useBreakpoint();
  const settings = snapshot.settings;
  const today = useToday(settings.rolloverHour);

  const [date, setDate] = useState<ISODate>(currentDate);
  // Overlay navigation has one destination; opening either panel replaces the other.
  const [openPanel, setOpenPanel] = useState<Lateral | null>(null);
  const menuOpen = openPanel === 'menu';
  const goalsOpen = openPanel === 'goals';
  const [unfiledOpen, setUnfiledOpen] = useState(false);

  const placed = new Set(
    snapshot.days.flatMap((day) => [...day.next, ...day.scheduled, ...day.done]),
  );
  const unfiled = snapshot.cards.filter((card) => !placed.has(card.id));

  const [lateral, setLateral] = useState<Lateral | null>(null);
  const [menuProgress, setMenuProgress] = useState(0);
  const [goalsProgress, setGoalsProgress] = useState(0);
  const [dayShift, setDayShift] = useState(0);
  const [settling, setSettling] = useState(false);

  const menu = useRef<HTMLElement>(null);
  const goals = useRef<HTMLElement>(null);
  const goalsEditor = useRef<EditorView | null>(null);
  const plane = useRef<HTMLDivElement>(null);
  const dragTarget = useRef<Lateral | null>(null);
  const openAtDragStart = useRef(0);
  const started = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const goalsFocusTimer = useRef<number | undefined>(undefined);

  const menuOverlay = !menuIsPanel(breakpoint);
  const goalsOverlay = !goalsIsPanel(breakpoint);

  /** Measured rather than assumed: the widths are in rem. */
  const widthOf = (element: HTMLElement | null, fallback: number): number =>
    element?.getBoundingClientRect().width || fallback;

  /** What one day of vertical movement covers: a panel plus the gap after it. */
  const dayStep = useCallback((): number => {
    const panel = plane.current?.querySelector('.day-panel');
    return (panel?.getBoundingClientRect().height ?? 600) + 8;
  }, []);

  const clearSettlement = useCallback(() => {
    if (settleTimer.current !== undefined) window.clearTimeout(settleTimer.current);
    settleTimer.current = undefined;
  }, []);

  const afterSettlement = useCallback(
    (finish: () => void) => {
      clearSettlement();
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = undefined;
        finish();
      }, SNAP_MS);
    },
    [clearSettlement],
  );

  const clearGoalsFocus = useCallback(() => {
    if (goalsFocusTimer.current !== undefined) window.clearTimeout(goalsFocusTimer.current);
    goalsFocusTimer.current = undefined;
  }, []);

  const onGoalsEditorReady = useCallback((view: EditorView | null) => {
    goalsEditor.current = view;
  }, []);

  const goTo = useCallback(
    (next: ISODate) => {
      clearSettlement();
      setSettling(false);
      setDayShift(0);
      setDate(next);
    },
    [clearSettlement],
  );

  /**
   * Move by whole days. The panels are keyed by date, so the movement is
   * animated first and the dates swapped underneath once it has landed —
   * swapping first would jump.
   */
  const step = useCallback(
    (days: number) => {
      if (days === 0) return;
      clearSettlement();
      setSettling(true);
      setDayShift(-days * dayStep());
      afterSettlement(() => {
        setSettling(false);
        setDayShift(0);
        setDate((current) => addDays(current, days));
      });
    },
    [afterSettlement, clearSettlement, dayStep],
  );

  /**
   * A wheel over Today walks the same vertical day axis as a touch drag. A
   * genuinely long day keeps the wheel while it has content in that direction.
   * At an edge, native scroll chaining reaches the bounded three-day plane,
   * which can expose only one neighbour in either direction.
   */
  const onDayWheel = useCallback((event: React.WheelEvent<HTMLDivElement>): void => {
    if (
      event.ctrlKey ||
      !window.matchMedia('(any-pointer: fine)').matches ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    ) {
      return;
    }

    const target = event.target as HTMLElement;
    const scrollRegion = target.closest<HTMLElement>('[data-scroll="day"]');
    if (scrollRegion) {
      const maximum = scrollRegion.scrollHeight - scrollRegion.clientHeight;
      const canScroll =
        maximum > 1 &&
        (event.deltaY < 0 ? scrollRegion.scrollTop > 1 : scrollRegion.scrollTop < maximum - 1);
      if (canScroll) {
        return;
      }
    }

    target.closest<HTMLElement>('.day-plane')?.setAttribute('data-wheel-navigation', 'true');
  }, []);

  const closeLateral = useCallback(() => {
    setOpenPanel(null);
    setMenuProgress(0);
    setGoalsProgress(0);
    setLateral(null);
  }, []);

  const closeGoals = useCallback(() => {
    closeLateral();
    plane.current?.querySelector<HTMLButtonElement>('.goals-trigger')?.focus();
  }, [closeLateral]);

  const canNavigate = useCallback(
    (direction: Direction): boolean => {
      if (direction === 'right') return menuOverlay || menuOpen;
      if (direction === 'left') return goalsOverlay || goalsOpen || menuOpen;
      return true;
    },
    [goalsOpen, goalsOverlay, menuOpen, menuOverlay],
  );

  const shell = useGestures<HTMLDivElement>({
    config: { navigable: ['x', 'y'] },
    enabled: !unfiledOpen,
    canNavigate,
    handlers: {
      onNavigationStart: (axis) => {
        if (axis === 'y') {
          clearSettlement();
          setSettling(false);
        }
        dragTarget.current = null;
      },

      onNavigationMove: (axis, delta) => {
        if (axis === 'y') {
          setDayShift(delta);
          return;
        }

        if (!dragTarget.current) {
          // An open surface owns the drag, so closing it is the same gesture
          // reversed. Otherwise the direction chooses: right for the menu on
          // the left, left for Goals on the right.
          const target: Lateral = menuOpen
            ? 'menu'
            : goalsOpen
              ? 'goals'
              : delta > 0
                ? 'menu'
                : 'goals';
          dragTarget.current = target;
          openAtDragStart.current = (target === 'menu' ? menuOpen : goalsOpen) ? 1 : 0;
          setLateral(target);
        }

        const toGoals = dragTarget.current === 'goals';
        const width = toGoals ? widthOf(goals.current, 320) : widthOf(menu.current, 272);
        // Goals arrives from the right, so its progress reads the sign back.
        const progress = clamp(openAtDragStart.current + (toGoals ? -delta : delta) / width, 0, 1);
        if (toGoals) setGoalsProgress(progress);
        else setMenuProgress(progress);
      },

      onNavigationEnd: (axis, delta, velocity) => {
        if (axis === 'y') {
          setSettling(true);
          if (!shouldCommit(delta, velocity, dayStep())) {
            setDayShift(0);
            afterSettlement(() => setSettling(false));
            return;
          }
          // Dragging down reveals the day above it: the past.
          const days = delta > 0 ? -1 : 1;
          setDayShift(-days * dayStep());
          afterSettlement(() => {
            setSettling(false);
            setDayShift(0);
            setDate((current) => addDays(current, days));
          });
          return;
        }

        const toGoals = dragTarget.current === 'goals';
        const width = toGoals ? widthOf(goals.current, 320) : widthOf(menu.current, 272);
        const wasOpen = openAtDragStart.current === 1;
        const towardsOpen = toGoals ? delta < 0 : delta > 0;
        const open =
          shouldCommit(delta, velocity, width) && towardsOpen !== wasOpen ? !wasOpen : wasOpen;

        setOpenPanel(open ? (toGoals ? 'goals' : 'menu') : null);
        if (toGoals) {
          setGoalsProgress(open ? 1 : 0);
        } else {
          setMenuProgress(open ? 1 : 0);
        }
        dragTarget.current = null;
        setLateral(null);
      },

      onNavigationCancel: (axis) => {
        if (axis === 'y') {
          setSettling(true);
          setDayShift(0);
          afterSettlement(() => setSettling(false));
          return;
        }

        const target = dragTarget.current;
        if (target === 'goals') setGoalsProgress(openAtDragStart.current);
        if (target === 'menu') setMenuProgress(openAtDragStart.current);
        dragTarget.current = null;
        setLateral(null);
      },
    },
  });

  /**
   * Desktop is keyboard-first (PRD §7.6): the axes under a modifier, `t` back
   * to today. The command palette is Phase 4 — it is backed by the search index
   * (TRD §8.5), and there is nothing yet for it to search.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing =
        target?.closest('.cm-editor, input, textarea, select') != null ||
        target?.isContentEditable === true;

      if (unfiledOpen) {
        if (event.key === 'Escape') setUnfiledOpen(false);
        return;
      }

      if (event.key === 'Escape' && (menuOpen || goalsOpen)) {
        closeLateral();
        return;
      }

      if (typing || event.ctrlKey || event.metaKey || event.shiftKey) return;

      if (!event.altKey) {
        if (event.key === 't') {
          event.preventDefault();
          goTo(today);
        }
        return;
      }

      const moves: Record<string, () => void> = {
        ArrowUp: () => step(-1),
        k: () => step(-1),
        ArrowDown: () => step(1),
        j: () => step(1),
        ArrowLeft: () => setOpenPanel(menuOverlay ? 'menu' : null),
        h: () => setOpenPanel(menuOverlay ? 'menu' : null),
        ArrowRight: () => setOpenPanel(goalsOverlay ? 'goals' : null),
        l: () => setOpenPanel(goalsOverlay ? 'goals' : null),
      };

      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      move();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    closeLateral,
    goTo,
    goalsOpen,
    goalsOverlay,
    menuOpen,
    menuOverlay,
    unfiledOpen,
    step,
    today,
  ]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setDate(today);
  }, [today]);

  useEffect(() => {
    setOpenPanel((open) =>
      (open === 'menu' && !menuOverlay) || (open === 'goals' && !goalsOverlay) ? null : open,
    );
  }, [goalsOverlay, menuOverlay]);

  useEffect(() => {
    if (unfiled.length === 0) setUnfiledOpen(false);
  }, [unfiled.length]);

  /**
   * A narrow Goals panel is an editing surface. Its keyboard must not resize
   * the viewport while the panel is still moving, so focus only after the snap
   * has landed. Blurring a committed close dismisses the keyboard while the
   * mounted EditorView keeps its selection ready for the next open.
   */
  useEffect(() => {
    clearGoalsFocus();
    if (!goalsOverlay) return;

    if (!goalsOpen) {
      goalsEditor.current?.contentDOM.blur();
      return;
    }

    goalsFocusTimer.current = window.setTimeout(() => {
      goalsFocusTimer.current = undefined;
      goalsEditor.current?.focus();
    }, SNAP_MS);

    return clearGoalsFocus;
  }, [clearGoalsFocus, goalsOpen, goalsOverlay]);

  useEffect(
    () => () => {
      clearSettlement();
      clearGoalsFocus();
    },
    [clearGoalsFocus, clearSettlement],
  );

  return (
    <div
      className="shell"
      data-local-workspace="true"
      ref={shell}
      data-breakpoint={breakpoint}
      data-menu={lateral === 'menu' ? 'dragging' : menuOpen ? 'open' : 'closed'}
      data-goals={lateral === 'goals' ? 'dragging' : goalsOpen ? 'open' : 'closed'}
      data-unfiled={unfiledOpen ? 'open' : 'closed'}
      // `data-select` is owned by useGestures — React must not re-assert it on
      // a render that happens to land mid-selection.
      // Derived rather than kept in step: the drag owns the number only while
      // it is happening, and open/closed owns it the rest of the time. Setting
      // both at every call site is how a trigger ends up flipping the state
      // without moving the panel.
      style={
        {
          '--menu-progress': !menuOverlay
            ? 1
            : lateral === 'menu'
              ? menuProgress
              : menuOpen
                ? 1
                : 0,
          '--goals-progress': !goalsOverlay
            ? 1
            : lateral === 'goals'
              ? goalsProgress
              : goalsOpen
                ? 1
                : 0,
        } as React.CSSProperties
      }
    >
      <Menu
        ref={menu}
        today={today}
        date={date}
        onGoTo={goTo}
        onClose={closeLateral}
        gentleContext={gentleContext.enabled}
        onGentleContext={gentleContext.change}
        gentleContextStored={gentleContext.stored}
      />

      <UnfiledPanel
        today={today}
        cards={unfiled}
        open={unfiledOpen}
        onClose={() => setUnfiledOpen(false)}
      />

      <button
        type="button"
        className="unfiled-scrim"
        aria-label="Close unfiled cards"
        tabIndex={unfiledOpen ? 0 : -1}
        onClick={() => setUnfiledOpen(false)}
      />

      <button type="button" className="scrim" aria-label="Close" onClick={closeLateral} />

      <div className="plane" ref={plane} onWheel={onDayWheel}>
        <StaleBanner today={today} onGoTo={goTo} />
        <DayPlane
          date={date}
          today={today}
          shift={dayShift}
          settling={settling}
          showMenuTrigger={menuOverlay}
          menuOpen={menuOpen}
          showGoalsTrigger={goalsOverlay}
          goalsOpen={goalsOpen}
          onOpenGoals={() => {
            closeLateral();
            setOpenPanel('goals');
          }}
          onOpenMenu={() => setOpenPanel((open) => (open === 'menu' ? null : 'menu'))}
          onGoTo={goTo}
          unfiledCount={unfiled.length}
          unfiledOpen={unfiledOpen}
          onOpenUnfiled={() => {
            closeLateral();
            setUnfiledOpen((open) => !open);
          }}
        />
      </div>

      <Goals
        gentleContext={gentleContext.enabled}
        ref={goals}
        date={date}
        today={today}
        onEditorReady={onGoalsEditorReady}
        onClose={goalsOverlay ? closeGoals : undefined}
      />
    </div>
  );
};
