/**
 * The shell.
 *
 * Phase 1's plane has two positions: the master-list document, and the menu one
 * drag to its right. Days above and below and Goals to the right are Phase 2 —
 * what exists here is the gesture model itself, which the phase has to prove on
 * a real device before the rest of the plane is worth building (PRD §13).
 */

import { useCallback, useRef, useState } from 'react';
import { shouldCommit } from '../gestures/recognizer';
import { useGestures } from '../gestures/useGestures';
import { Editor } from './Editor';
import { Menu } from './Menu';
import { useBreakpoint } from './useBreakpoint';
import { useStore } from './useStore';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const App = (): React.ReactElement => {
  const { store, storage, error } = useStore();
  const breakpoint = useBreakpoint();

  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const menu = useRef<HTMLElement>(null);
  const openAtDragStart = useRef(0);

  /** Measured rather than assumed: `--menu-width` is in rem. */
  const menuExtent = useCallback(() => menu.current?.getBoundingClientRect().width ?? 272, []);

  const shell = useGestures<HTMLDivElement>({
    enabled: breakpoint !== 'wide',
    handlers: {
      onNavigationStart: () => {
        openAtDragStart.current = menuOpen ? 1 : 0;
        setDragging(true);
      },
      onNavigationMove: (_axis, delta) => {
        setProgress(clamp(openAtDragStart.current + delta / menuExtent(), 0, 1));
      },
      onNavigationEnd: (_axis, delta, velocity) => {
        const wasOpen = openAtDragStart.current === 1;
        const towardsOpen = delta > 0;
        const commit = shouldCommit(delta, velocity, menuExtent()) && towardsOpen !== wasOpen;
        const open = commit ? !wasOpen : wasOpen;
        setDragging(false);
        setMenuOpen(open);
        setProgress(open ? 1 : 0);
      },
    },
  });

  const setMenu = (open: boolean): void => {
    setMenuOpen(open);
    setProgress(open ? 1 : 0);
    setDragging(false);
  };

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

  return (
    <div
      className="shell"
      ref={shell}
      data-breakpoint={breakpoint}
      data-menu={dragging ? 'dragging' : menuOpen ? 'open' : 'closed'}
      // `data-select` is owned by useGestures — React must not re-assert it on
      // a render that happens to land mid-selection.
      style={{ '--menu-progress': breakpoint === 'wide' ? 1 : progress } as React.CSSProperties}
    >
      <Menu ref={menu} actor={store.actor} storage={storage} />

      <button
        type="button"
        className="scrim"
        aria-label="Close menu"
        onClick={() => setMenu(false)}
      />

      <main className="panel">
        <header className="panel-header">
          <button
            type="button"
            className="menu-trigger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="menu"
            onClick={() => setMenu(!menuOpen)}
          >
            <MenuIcon />
          </button>
          <h1 className="panel-title">Master list</h1>
        </header>

        <div className="panel-body">
          <Editor
            text={store.master}
            awareness={store.awareness}
            undo={store.undo}
            origin={store.actor.origin}
            placeholder="Everything. Tasks, projects, someday-maybes, notes to self."
            autoFocus
          />
        </div>
      </main>
    </div>
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
