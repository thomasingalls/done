/**
 * A collection: Next, Scheduled, or Done (PRD §3, §4).
 *
 * The unit of interaction is the item, so this is where the movement table
 * lives — as *affordances*, since the PRD specifies each flow by difficulty:
 * `Next → Done` is one control on the card, `nothing → Done` is a compose field
 * that is always live, and nothing here can move anything out of the master
 * list, because that flow is deliberately two steps and starts elsewhere.
 *
 * The three-item cap on Next is shown before it is hit. PRD principle 5:
 * constraints are the feature, so the count is part of the surface rather than
 * an error after the fact.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NEXT_CAP, type Section } from '../crdt/days';
import type { WorkspaceSnapshot } from '../crdt/admittedWorkspace';
import { useWorkspaceUi } from './workspaceUi';
import type { CardHooks } from '../editor/cardCommands';
import { renderStatic } from '../editor/staticRender';
import { addDays, type ISODate } from '../lib/date';
import { Card, type CardAction, type CardReorder } from './Card';
import { Compose } from './Compose';
import { useCardReorder } from './useCardReorder';

const TITLES: Record<Section, string> = {
  next: 'Next',
  scheduled: 'Scheduled',
  done: 'Done',
};

/** A compacted card has deliberately shed identity and is permanently static. */
const ArchivedCard = ({
  body,
  section,
}: {
  body: string;
  section: Section;
}): React.ReactElement => {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host.current) renderStatic(host.current, body);
  }, [body]);

  return (
    <article className="card" data-section={section} data-frozen="true">
      <div className="card-surface md-render" ref={host} />
    </article>
  );
};

export interface CollectionProps {
  date: ISODate;
  section: Section;
  frozen: boolean;
  /** False for a neighbouring day: content renders, nothing edits. */
  active: boolean;
}

export const Collection = ({
  date,
  section,
  frozen,
  active,
}: CollectionProps): React.ReactElement | null => {
  const { snapshot, execute } = useWorkspaceUi();
  const day = snapshot.days.find((value) => value.date === date);
  const ids = day?.[section] ?? [];
  const byId = new Map(snapshot.cards.map((card) => [card.id, card]));
  const cards = ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  const archived = day?.archived?.[section] ?? [];
  const nextIsFull = (day?.next.length ?? 0) >= NEXT_CAP;

  // Set after a split so the card that was created opens with the caret in it.
  const [focusCard, setFocusCard] = useState<{ id: string; at: number } | null>(null);

  const reorder = useCardReorder({
    cards,
    enabled: section === 'done' && active && !frozen && cards.length > 1,
  });

  const hooksFor = useCallback(
    (id: string): CardHooks => ({
      split: (at, tailFrom) => {
        void execute({ kind: 'split', id, at, tailFrom }).then((created) => {
          if (typeof created === 'string') setFocusCard({ id: created, at: 0 });
        });
        return true;
      },
      mergeBackwards: () => {
        const index = cards.findIndex((card) => card.id === id);
        const previous = index > 0 ? cards[index - 1] : undefined;
        if (!previous) return null;
        void execute({ kind: 'merge', id }).then((at) => {
          if (typeof at === 'number') setFocusCard({ id: previous.id, at });
        });
        return 0;
      },
      leave: () => setFocusCard((current) => (current?.id === id ? null : current)),
    }),
    [execute, cards],
  );

  const actionsFor = useCallback(
    (card: WorkspaceSnapshot['cards'][number]): CardAction[] => {
      const id = card.id;

      const done: CardAction = {
        label: 'Done',
        hint: 'Move to Done',
        run: () => void execute({ kind: 'move', id, to: { date, section: 'done' } }),
      };
      const remove: CardAction = {
        label: 'Remove',
        hint: 'Remove this card',
        run: () => void execute({ kind: 'remove', id }),
      };

      if (section === 'next') {
        return [
          done,
          {
            label: 'Later',
            hint: 'Move to Scheduled',
            run: () => void execute({ kind: 'move', id, to: { date, section: 'scheduled' } }),
          },
          remove,
        ];
      }

      if (section === 'scheduled') {
        return [
          done,
          {
            label: 'Next',
            hint: 'Move to Next',
            run: () => void execute({ kind: 'move', id, to: { date, section: 'next' } }),
            disabled: nextIsFull,
          },
          {
            label: 'Tomorrow',
            hint: 'Move to tomorrow',
            run: () =>
              void execute({
                kind: 'move',
                id,
                to: { date: addDays(date, 1), section: 'scheduled' },
              }),
          },
          remove,
        ];
      }

      return [remove];
    },
    [execute, date, section, nextIsFull],
  );

  // An empty collection is noise except where it says something: Next carries
  // the cap, and Done carries the compose field. Those two render for adjacent
  // days too, so promoting an already-mounted neighbour does not change its
  // layout after the movement lands.
  const count = cards.length + archived.length;
  if (count === 0 && section === 'scheduled') return null;

  const full = section === 'next' && count >= NEXT_CAP;

  return (
    <section className="collection" data-section={section} data-full={full}>
      <h2 className="collection-heading">
        <span>{TITLES[section]}</span>
        {section === 'next' && (
          <span className="collection-count" aria-label={`${count} of ${NEXT_CAP}`}>
            {count}/{NEXT_CAP}
          </span>
        )}
      </h2>

      {count === 0 ? (
        <p className="collection-empty">{section === 'done' ? 'Nothing yet.' : 'Empty.'}</p>
      ) : (
        <div className="card-list" ref={reorder.listRef} data-reordering={reorder.drag !== null}>
          {cards.map((card) => {
            const id = card.id;
            const cardReorder: CardReorder | undefined = reorder.enabled
              ? {
                  dragging: reorder.drag?.id === id,
                  offsetY: reorder.drag?.id === id ? reorder.drag.offsetY : 0,
                  start: (clientY) => reorder.start(id, clientY),
                  move: reorder.move,
                  finish: reorder.finish,
                  cancel: reorder.cancel,
                  moveBy: (offset) => reorder.moveBy(id, offset),
                }
              : undefined;
            return (
              <Card
                key={id}
                card={card}
                section={section}
                frozen={frozen}
                guarded={section === 'done'}
                actions={actionsFor(card)}
                hooks={hooksFor(id)}
                editable={active}
                {...(cardReorder ? { reorder: cardReorder } : {})}
                {...(focusCard?.id === id ? { autoFocusAt: focusCard.at } : {})}
              />
            );
          })}
          {archived.map((body, index) => (
            <ArchivedCard key={`${section}:${index}`} body={body} section={section} />
          ))}
          {reorder.drag && (
            <span
              className="card-drop-indicator"
              aria-hidden="true"
              style={{ '--card-drop-y': `${reorder.drag.indicatorY}px` } as React.CSSProperties}
            />
          )}
        </div>
      )}

      {/*
       * The one flow PRD §4 calls "trivial, non-negotiable": type, Enter, done.
       * It is always live, which is what lets Done cards be guarded without the
       * two rules fighting each other (PRD §5).
       */}
      {section === 'done' && !frozen && (
        <Compose
          placeholder="What got done?"
          onSubmit={async (text) =>
            Boolean(await execute({ kind: 'compose', to: { date, section: 'done' }, text }))
          }
        />
      )}
    </section>
  );
};
