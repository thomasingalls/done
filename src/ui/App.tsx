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
import { shouldCommit, type Direction } from '../gestures/recognizer';
import { useGestures } from '../gestures/useGestures';
import { addDays, currentDate, type ISODate } from '../lib/date';
import {
  DEFAULT_SETTINGS,
  compactDueDays,
  readSettings,
  scheduleCompaction,
  type Workspace,
} from '../crdt';
import { DayPlane } from './DayPlane';
import { Goals } from './Goals';
import { Menu } from './Menu';
import { StaleBanner } from './StaleBanner';
import { goalsIsPanel, menuIsPanel, useBreakpoint } from './useBreakpoint';
import { useStore } from './useStore';
import { useToday } from './useToday';
import { useYValue } from './useYjs';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Matches `--duration-snap`; the swap happens once the movement has landed. */
const SNAP_MS = 220;

/** Which lateral surface a horizontal drag is moving. */
type Lateral = 'menu' | 'goals';

export const App = (): React.ReactElement => {
  const { store, storage, error } = useStore();
  const breakpoint = useBreakpoint();
  const settings = useYValue(
    store?.meta,
    () => (store ? JSON.stringify(readSettings(store.meta)) : 'absent'),
    () => (store ? readSettings(store.meta) : DEFAULT_SETTINGS),
  );
  const today = useToday(settings.rolloverHour);

  const [date, setDate] = useState<ISODate>(currentDate);
  const [menuOpen, setMenuOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);

  const [lateral, setLateral] = useState<Lateral | null>(null);
  const [menuProgress, setMenuProgress] = useState(0);
  const [goalsProgress, setGoalsProgress] = useState(0);
  const [dayShift, setDayShift] = useState(0);
  const [settling, setSettling] = useState(false);

  const menu = useRef<HTMLElement>(null);
  const goals = useRef<HTMLElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const dragTarget = useRef<Lateral | null>(null);
  const openAtDragStart = useRef(0);
  const started = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);

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

  const closeLateral = useCallback(() => {
    setMenuOpen(false);
    setGoalsOpen(false);
    setMenuProgress(0);
    setGoalsProgress(0);
    setLateral(null);
  }, []);

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

        if (toGoals) {
          setGoalsOpen(open);
          setGoalsProgress(open ? 1 : 0);
        } else {
          setMenuOpen(open);
          setMenuProgress(open ? 1 : 0);
        }
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
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('.cm-editor, input, textarea') != null;

      if (event.key === 'Escape' && (menuOpen || goalsOpen)) {
        closeLateral();
        return;
      }

      if (!event.altKey) {
        if (!typing && event.key === 't') {
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
        ArrowLeft: () => setMenuOpen(menuOverlay),
        h: () => setMenuOpen(menuOverlay),
        ArrowRight: () => setGoalsOpen(goalsOverlay),
        l: () => setGoalsOpen(goalsOverlay),
      };

      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      move();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeLateral, goTo, goalsOpen, goalsOverlay, menuOpen, menuOverlay, step, today]);

  /** Compaction, opportunistically, on idle. Never on the keystroke path. */
  useEffect(() => {
    if (!store) return;
    return scheduleCompaction(() => {
      compactDueDays(store.doc, store.actor.systemOrigin, today);
    });
  }, [store, today]);

  /** The rollover hour is in the document, so the first real `today` arrives late. */
  useEffect(() => {
    if (!store || started.current) return;
    started.current = true;
    setDate(today);
  }, [store, today]);

  useEffect(() => {
    if (!menuOverlay) setMenuOpen(false);
    if (!goalsOverlay) setGoalsOpen(false);
  }, [goalsOverlay, menuOverlay]);

  useEffect(() => clearSettlement, [clearSettlement]);

  if (error) {
    return (
      <div className="boot" role="alert">
        <p>Could not open local storage.</p>
        <p className="menu-note">{error.message}</p>
      </div>
    );
  }

  if (!store) {
    // Deliberately blank rather than a spinner: offline is the normal state,
    // and this wait is a disk read, not a network one (PRD principle 3).
    return <div className="boot" aria-busy="true" />;
  }

  const workspace: Workspace = {
    doc: store.doc,
    origin: store.actor.origin,
    systemOrigin: store.actor.systemOrigin,
    author: store.actor.id,
    today,
    undo: store.undo,
  };
  const system: Workspace = { ...workspace, origin: store.actor.systemOrigin };

  return (
    <div
      className="shell"
      ref={shell}
      data-breakpoint={breakpoint}
      data-menu={lateral === 'menu' ? 'dragging' : menuOpen ? 'open' : 'closed'}
      data-goals={lateral === 'goals' ? 'dragging' : goalsOpen ? 'open' : 'closed'}
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
        store={store}
        storage={storage}
        settings={settings}
        today={today}
        date={date}
        onGoTo={goTo}
        onClose={closeLateral}
      />

      <button type="button" className="scrim" aria-label="Close" onClick={closeLateral} />

      <div className="plane" ref={plane}>
        <StaleBanner store={store} system={system} today={today} onGoTo={goTo} />
        <DayPlane
          store={store}
          workspace={workspace}
          date={date}
          today={today}
          shift={dayShift}
          settling={settling}
          showMenuTrigger={menuOverlay}
          menuOpen={menuOpen}
          onOpenMenu={() => setMenuOpen((open) => !open)}
          onGoTo={goTo}
        />
      </div>

      <Goals ref={goals} store={store} workspace={workspace} date={date} />
    </div>
  );
};
