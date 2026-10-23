/**
 * One card (PRD §3, §5; TRD §4.4).
 *
 * Static until focused. The static render and the mounted editor come from the
 * same decoration path (see editor/staticRender.ts), so they are the same
 * markdown rendered the same way — the pixel-identity constraint is met by
 * construction rather than by two implementations agreeing.
 *
 * Three trigger regimes, one mechanism:
 *
 * - **Next and Scheduled** mount on tap.
 * - **Done** mounts only on long-press, on the explicit unlock control, or on
 *   Enter with the card focused (PRD §5: "long-press (mobile) or explicit action
 *   (desktop)"). Creation stays easy and editing stays hard, and the two do not
 *   conflict because the compose field at the foot of the list is always live.
 * - **A frozen day** never mounts at all (§4.5).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { titleOf, type Section } from '../crdt/days';
import type { WorkspaceSnapshot } from '../crdt/admittedWorkspace';
import { useWorkspaceUi } from './workspaceUi';
import { blurToStatic, cardKeymap, type CardHooks } from '../editor/cardCommands';
import { renderStatic } from '../editor/staticRender';

export interface CardAction {
  label: string;
  hint: string;
  run: () => void;
  disabled?: boolean;
  requiresUnlock?: boolean;
}

export interface CardReorder {
  dragging: boolean;
  offsetY: number;
  start: (clientY: number) => boolean;
  move: (clientY: number) => void;
  finish: (commit: boolean) => void;
  cancel: () => void;
  moveBy: (offset: number) => void;
}

export interface CardProps {
  card: WorkspaceSnapshot['cards'][number];
  section: Section;
  /** No editor mounts and no action runs. The freeze is permanent (PRD §6). */
  frozen: boolean;
  /** Done cards are static until deliberately unlocked (PRD §5). */
  guarded: boolean;
  actions: CardAction[];
  hooks: CardHooks;
  /** False for a neighbouring day, which renders content but never edits it. */
  editable: boolean;
  /** Present for live cards on the active, writable day. */
  reorder?: CardReorder;
  /** Set after a split/merge so editing resumes at the structural join. */
  autoFocusAt?: number;
}

/** Long enough to be deliberate, matching the gesture layer's own hold (TRD §8.4). */
const UNLOCK_HOLD_MS = 400;
const POINTER_SLOP_PX = 10;
const DRAG_SLOP_PX = 4;

interface ReorderPointer {
  pointerId: number;
  startX: number;
  startY: number;
  element: HTMLElement;
  armed: boolean;
  moved: boolean;
  unlockOnRelease: boolean;
}

export const Card = ({
  card,
  section,
  frozen,
  guarded,
  actions,
  hooks,
  editable,
  reorder,
  autoFocusAt,
}: CardProps): React.ReactElement => {
  const { mountEditor } = useWorkspaceUi();
  const { id, text } = card;
  const [editing, setEditing] = useState(autoFocusAt !== undefined);
  const staticHost = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const editorHost = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const pendingCaret = useRef<{ x: number; y: number } | null>(null);
  const pendingPosition = useRef<number | null>(autoFocusAt ?? null);
  const hold = useRef<number | undefined>(undefined);
  const pointer = useRef<ReorderPointer | null>(null);

  // Held in a ref because the parent rebuilds them each render, and a changed
  // dependency here would tear the editor down mid-keystroke.
  const latestHooks = useRef(hooks);
  latestHooks.current = hooks;
  const latestReorder = useRef(reorder);
  latestReorder.current = reorder;

  useEffect(() => {
    if (editing) return;
    const host = staticHost.current;
    if (host) {
      renderStatic(host, text);
      if (returnFocus.current) {
        returnFocus.current = false;
        host.focus();
      }
    }
  }, [editing, text]);

  useEffect(() => {
    if (!editing) return;
    const parent = editorHost.current;
    if (!parent) return;

    const bridge: CardHooks = {
      split: (at, tailFrom) => latestHooks.current.split(at, tailFrom),
      mergeBackwards: () => latestHooks.current.mergeBackwards(),
      leave: () => {
        pendingPosition.current = view.current?.state.selection.main.head ?? null;
        returnFocus.current = true;
        setEditing(false);
        latestHooks.current.leave();
      },
    };

    const handle = mountEditor(parent, { kind: 'card', id }, [
      cardKeymap(bridge),
      blurToStatic((event) => {
        // Keep the editor unlocked while focus moves to its own actions. Removing
        // those buttons during blur would swallow the following click or Tab.
        if (
          event.relatedTarget instanceof Node &&
          parent.closest('.card')?.contains(event.relatedTarget)
        )
          return;
        // A split/merge request is consumed when focus leaves, just as it is
        // for Enter/Escape. Otherwise the parent's request reopens this editor.
        latestHooks.current.leave();
        setEditing(false);
      }),
    ]);
    view.current = handle.view;
    handle.view.focus();

    // Focus lands where the user pointed (TRD §4.4). Falls back to the end,
    // which is where a keyboard-initiated edit wants to be anyway.
    const at = pendingCaret.current;
    pendingCaret.current = null;
    const pointed = at ? handle.view.posAtCoords({ x: at.x, y: at.y }) : null;
    const requested = pendingPosition.current;
    pendingPosition.current = null;
    const position = pointed ?? requested ?? handle.view.state.doc.length;
    handle.view.dispatch({
      selection: { anchor: Math.min(Math.max(position, 0), handle.view.state.doc.length) },
    });

    return () => {
      handle.destroy();
      view.current = null;
    };
  }, [editing, id, mountEditor]);

  useEffect(() => {
    if (autoFocusAt === undefined || editing || frozen || !editable) return;
    pendingPosition.current = autoFocusAt;
    setEditing(true);
  }, [autoFocusAt, editable, editing, frozen]);

  useEffect(() => {
    if (frozen || !editable) setEditing(false);
  }, [frozen, editable]);

  const open = useCallback(
    (at?: { x: number; y: number }) => {
      if (frozen || !editable) return;
      if (at) pendingCaret.current = at;
      setEditing(true);
    },
    [frozen, editable],
  );

  const clearHold = useCallback(() => {
    if (hold.current !== undefined) window.clearTimeout(hold.current);
    hold.current = undefined;
  }, []);

  useEffect(
    () => () => {
      clearHold();
      if (pointer.current?.armed) latestReorder.current?.cancel();
      pointer.current = null;
    },
    [clearHold],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if ((!guarded && !reorder) || editing || frozen || !editable || event.pointerType === 'mouse')
      return;
    const { clientX: x, clientY: y, pointerId } = event;
    clearHold();
    pointer.current = {
      pointerId,
      startX: x,
      startY: y,
      element: event.currentTarget,
      armed: false,
      moved: false,
      unlockOnRelease: true,
    };
    hold.current = window.setTimeout(() => {
      hold.current = undefined;
      const active = pointer.current;
      if (!active || active.pointerId !== pointerId) return;

      const controller = latestReorder.current;
      if (!controller || !controller.start(y)) {
        pointer.current = null;
        open({ x, y });
        return;
      }

      active.armed = true;
      try {
        active.element.setPointerCapture(pointerId);
      } catch {
        controller.cancel();
        pointer.current = null;
      }
    }, UNLOCK_HOLD_MS);
  };

  const onHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (!reorder || editing || event.button !== 0) return;
    event.preventDefault();
    clearHold();
    const active: ReorderPointer = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      element: event.currentTarget,
      armed: false,
      moved: false,
      unlockOnRelease: false,
    };
    pointer.current = active;
    if (!reorder.start(event.clientY)) {
      pointer.current = null;
      return;
    }
    active.armed = true;
    try {
      active.element.setPointerCapture(active.pointerId);
    } catch {
      reorder.cancel();
      pointer.current = null;
    }
  };

  const onReorderPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);

    if (!active.armed) {
      if (distance >= POINTER_SLOP_PX) {
        clearHold();
        pointer.current = null;
      }
      return;
    }

    // Once the hold has claimed the card, the shell must not reinterpret the
    // first post-hold movement as day navigation or text selection.
    event.preventDefault();
    event.stopPropagation();
    if (!active.moved && distance >= DRAG_SLOP_PX) active.moved = true;
    if (active.moved) latestReorder.current?.move(event.clientY);
  };

  const onReorderPointerUp = (event: React.PointerEvent<HTMLElement>): void => {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    clearHold();
    pointer.current = null;
    if (!active.armed) return;

    event.preventDefault();
    latestReorder.current?.finish(active.moved);
    if (!active.moved && active.unlockOnRelease) {
      open({ x: active.startX, y: active.startY });
    }
  };

  const onReorderPointerCancel = (event: React.PointerEvent<HTMLElement>): void => {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    clearHold();
    pointer.current = null;
    if (active.armed) latestReorder.current?.cancel();
  };

  const onReorderPointerLeave = (event: React.PointerEvent<HTMLElement>): void => {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId || active.armed) return;
    clearHold();
    pointer.current = null;
  };

  const onLostPointerCapture = (event: React.PointerEvent<HTMLElement>): void => {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId || !active.armed) return;
    pointer.current = null;
    latestReorder.current?.cancel();
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // A guarded card does not become editable by tapping it (PRD §5).
    if (editing || guarded) return;
    open({ x: event.clientX, y: event.clientY });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (editing || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    if (!event.repeat) open();
  };

  const label = titleOf(text) || 'Empty card';

  return (
    <article
      className="card"
      data-section={section}
      data-editing={editing}
      data-guarded={guarded && !editing}
      data-frozen={frozen}
      data-card={id}
      onBlurCapture={(event) => {
        if (
          editing &&
          !(
            event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)
          )
        ) {
          latestHooks.current.leave();
          setEditing(false);
        }
      }}
      data-reordering={reorder?.dragging === true}
      style={
        reorder?.dragging
          ? ({ '--card-reorder-y': `${reorder.offsetY}px` } as React.CSSProperties)
          : undefined
      }
    >
      {/*
       * Keyed apart on purpose. Both branches are a `div` in the same position,
       * so React would otherwise reuse the element and only swap its className
       * — leaving the statically rendered lines in place underneath the editor
       * it does not know is there. Nothing about that is visible in the JSX.
       */}
      {editing ? (
        <div key="editor" className="card-surface" ref={editorHost} />
      ) : (
        // No `role`, and deliberately not a `<button>`: a button's content model
        // is phrasing content and a card renders block markdown — headings,
        // lists, quotes. It is focusable and answers Enter, which is the part of
        // a button's behaviour that matters here.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          key="static"
          className="card-surface md-render"
          ref={staticHost}
          tabIndex={frozen || !editable ? -1 : 0}
          aria-label={guarded ? `${label} — press Enter to unlock` : label}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMoveCapture={onReorderPointerMove}
          onPointerUp={onReorderPointerUp}
          onPointerCancel={onReorderPointerCancel}
          onPointerLeave={onReorderPointerLeave}
          onLostPointerCapture={onLostPointerCapture}
        />
      )}

      {!frozen && actions.length > 0 && (
        <div className="card-actions">
          {reorder && !editing && (
            <button
              type="button"
              className="card-action card-reorder-handle"
              title="Drag to reorder; use arrow keys to move"
              aria-label={`Reorder ${label}`}
              onClick={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                reorder.moveBy(event.key === 'ArrowUp' ? -1 : 1);
              }}
              onPointerDown={onHandlePointerDown}
              onPointerMoveCapture={onReorderPointerMove}
              onPointerUp={onReorderPointerUp}
              onPointerCancel={onReorderPointerCancel}
              onLostPointerCapture={onLostPointerCapture}
            >
              <GripIcon />
            </button>
          )}
          {guarded && !editing && (
            <button type="button" className="card-action" onClick={() => open()}>
              Unlock
            </button>
          )}
          {actions
            .filter((action) => !action.requiresUnlock || !guarded || editing)
            .map((action) => (
              <button
                key={action.label}
                type="button"
                className="card-action"
                title={action.hint}
                aria-label={`${action.hint}: ${label}`}
                disabled={action.disabled === true}
                onClick={action.run}
              >
                {action.label}
              </button>
            ))}
        </div>
      )}
    </article>
  );
};

const GripIcon = (): React.ReactElement => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path
      d="M4.5 3h.01M9.5 3h.01M4.5 7h.01M9.5 7h.01M4.5 11h.01M9.5 11h.01"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
