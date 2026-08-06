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
import {
  cardBody,
  cardId,
  cardText,
  titleOf,
  type Card as CardType,
  type Origin,
  type Section,
  type Store,
} from '../crdt';
import { blurToStatic, cardKeymap, type CardHooks } from '../editor/cardCommands';
import { createEditor, type EditorHandle } from '../editor/createEditor';
import { renderStatic } from '../editor/staticRender';
import { useYText } from './useYjs';

export interface CardAction {
  label: string;
  hint: string;
  run: () => void;
  disabled?: boolean;
}

export interface CardProps {
  store: Store;
  card: CardType;
  section: Section;
  /** No editor mounts and no action runs. The freeze is permanent (PRD §6). */
  frozen: boolean;
  /** Done cards are static until deliberately unlocked (PRD §5). */
  guarded: boolean;
  actions: CardAction[];
  hooks: CardHooks;
  /** False for a neighbouring day, which renders content but never edits it. */
  editable: boolean;
  origin: Origin;
  /** Set after a split/merge so editing resumes at the structural join. */
  autoFocusAt?: number;
}

/** Long enough to be deliberate, matching the gesture layer's own hold (TRD §8.4). */
const UNLOCK_HOLD_MS = 400;

export const Card = ({
  store,
  card,
  section,
  frozen,
  guarded,
  actions,
  hooks,
  editable,
  origin,
  autoFocusAt,
}: CardProps): React.ReactElement => {
  const text = useYText(cardText(card));
  const [editing, setEditing] = useState(autoFocusAt !== undefined);
  const staticHost = useRef<HTMLDivElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const pendingCaret = useRef<{ x: number; y: number } | null>(null);
  const pendingPosition = useRef<number | null>(autoFocusAt ?? null);
  const hold = useRef<number | undefined>(undefined);

  // Held in a ref because the parent rebuilds them each render, and a changed
  // dependency here would tear the editor down mid-keystroke.
  const latestHooks = useRef(hooks);
  latestHooks.current = hooks;

  useEffect(() => {
    if (editing) return;
    const host = staticHost.current;
    if (host) renderStatic(host, text);
  }, [editing, text]);

  useEffect(() => {
    if (!editing) return;
    const parent = editorHost.current;
    if (!parent) return;

    const bridge: CardHooks = {
      split: (at, tailFrom) => latestHooks.current.split(at, tailFrom),
      mergeBackwards: () => latestHooks.current.mergeBackwards(),
      leave: () => latestHooks.current.leave(),
    };

    const handle: EditorHandle = createEditor({
      parent,
      text: cardText(card),
      awareness: store.awareness,
      undo: store.undo,
      origin,
      surface: 'card',
      extra: [cardKeymap(bridge), blurToStatic(() => setEditing(false))],
    });
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
  }, [editing, card, store, origin]);

  useEffect(() => {
    if (autoFocusAt === undefined || editing || frozen || !editable) return;
    pendingPosition.current = autoFocusAt;
    setEditing(true);
  }, [autoFocusAt, editable, editing, frozen]);

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

  useEffect(() => clearHold, [clearHold]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!guarded || editing) return;
    const { clientX: x, clientY: y } = event;
    clearHold();
    hold.current = window.setTimeout(() => {
      hold.current = undefined;
      open({ x, y });
    }, UNLOCK_HOLD_MS);
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // A guarded card does not become editable by tapping it (PRD §5).
    if (editing || guarded) return;
    open({ x: event.clientX, y: event.clientY });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (editing || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    open();
  };

  const label = titleOf(cardBody(card)) || 'Empty card';

  return (
    <article
      className="card"
      data-section={section}
      data-editing={editing}
      data-guarded={guarded && !editing}
      data-frozen={frozen}
      data-card={cardId(card)}
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
          onPointerUp={clearHold}
          onPointerCancel={clearHold}
          onPointerLeave={clearHold}
        />
      )}

      {editable && !frozen && actions.length > 0 && (
        <div className="card-actions">
          {guarded && !editing && (
            <button type="button" className="card-action" onClick={() => open()}>
              Unlock
            </button>
          )}
          {actions.map((action) => (
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
