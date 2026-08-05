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

import { useCallback, useMemo, useState } from 'react';
import {
  NEXT_CAP,
  cardId,
  collectionOf,
  compose,
  dayAt,
  mergeCardBackwards,
  moveCard,
  removeCard,
  splitCard,
  type Card as CardType,
  type Ref,
  type Section,
  type Store,
  type Workspace,
} from '../crdt';
import type { CardHooks } from '../editor/cardCommands';
import { addDays, type ISODate } from '../lib/date';
import { Card, type CardAction } from './Card';
import { Compose } from './Compose';
import { useYValue } from './useYjs';

const TITLES: Record<Section, string> = {
  next: 'Next',
  scheduled: 'Scheduled',
  done: 'Done',
};

export interface CollectionProps {
  store: Store;
  workspace: Workspace;
  date: ISODate;
  section: Section;
  frozen: boolean;
  /** False for a neighbouring day: content renders, nothing edits. */
  active: boolean;
}

export const Collection = ({
  store,
  workspace,
  date,
  section,
  frozen,
  active,
}: CollectionProps): React.ReactElement | null => {
  /*
   * Everything this render depends on, read through one hook (see useYjs.ts).
   *
   * The key is membership and order, plus how full Next is, since that is what
   * decides whether a Scheduled card may be promoted. A card's *content* is
   * deliberately absent from it: that is the editor's business, not the list's
   * (TRD §4.4). `absent` rather than an empty string because a day that has
   * just been created holds an empty collection, and those two states have to
   * be distinguishable or the day's arrival is not a change.
   */
  const { cards, nextIsFull } = useYValue(
    store.days,
    () => {
      const day = dayAt(store.doc, date);
      const live = collectionOf(day, section);
      if (!live) return 'absent';
      return `${collectionOf(day, 'next')?.length ?? 0}:${live.toArray().map(cardId).join(',')}`;
    },
    () => {
      const day = dayAt(store.doc, date);
      return {
        cards: collectionOf(day, section)?.toArray() ?? [],
        nextIsFull: (collectionOf(day, 'next')?.length ?? 0) >= NEXT_CAP,
      };
    },
  );

  // Set after a split so the card that was created opens with the caret in it.
  const [focusCard, setFocusCard] = useState<string | null>(null);

  const ref: Ref = useMemo(() => ({ date, section }), [date, section]);

  const hooksFor = useCallback(
    (id: string): CardHooks => ({
      split: (at, tailFrom) => {
        const created = splitCard(workspace, ref, id, at, tailFrom);
        if (created) setFocusCard(created);
        return created !== null;
      },
      mergeBackwards: () => mergeCardBackwards(workspace, ref, id) !== null,
      leave: () => setFocusCard(null),
    }),
    [workspace, ref],
  );

  const actionsFor = useCallback(
    (card: CardType): CardAction[] => {
      const id = cardId(card);

      const done: CardAction = {
        label: 'Done',
        hint: 'Move to Done',
        run: () => void moveCard(workspace, ref, id, { date, section: 'done' }),
      };
      const remove: CardAction = {
        label: 'Remove',
        hint: 'Remove this card',
        run: () => void removeCard(workspace, ref, id),
      };

      if (section === 'next') {
        return [
          done,
          {
            label: 'Later',
            hint: 'Move to Scheduled',
            run: () => void moveCard(workspace, ref, id, { date, section: 'scheduled' }),
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
            run: () => void moveCard(workspace, ref, id, { date, section: 'next' }),
            disabled: nextIsFull,
          },
          {
            label: 'Tomorrow',
            hint: 'Move to tomorrow',
            run: () =>
              void moveCard(workspace, ref, id, { date: addDays(date, 1), section: 'scheduled' }),
          },
          remove,
        ];
      }

      return [remove];
    },
    [workspace, ref, date, section, nextIsFull],
  );

  // An empty collection is noise except where it says something: Next carries
  // the cap, and Done carries the compose field.
  if (cards.length === 0 && !(active && section !== 'scheduled')) return null;

  const full = section === 'next' && cards.length >= NEXT_CAP;

  return (
    <section className="collection" data-section={section} data-full={full}>
      <h2 className="collection-heading">
        <span>{TITLES[section]}</span>
        {section === 'next' && (
          <span className="collection-count" aria-label={`${cards.length} of ${NEXT_CAP}`}>
            {cards.length}/{NEXT_CAP}
          </span>
        )}
      </h2>

      {cards.length === 0 ? (
        <p className="collection-empty">{section === 'done' ? 'Nothing yet.' : 'Empty.'}</p>
      ) : (
        <div className="card-list">
          {cards.map((card) => (
            <Card
              key={cardId(card)}
              store={store}
              card={card}
              section={section}
              frozen={frozen}
              guarded={section === 'done'}
              actions={actionsFor(card)}
              hooks={hooksFor(cardId(card))}
              editable={active}
              origin={workspace.origin}
              autoFocus={focusCard === cardId(card)}
            />
          ))}
        </div>
      )}

      {/*
       * The one flow PRD §4 calls "trivial, non-negotiable": type, Enter, done.
       * It is always live, which is what lets Done cards be guarded without the
       * two rules fighting each other (PRD §5).
       */}
      {section === 'done' && active && !frozen && (
        <Compose
          placeholder="What got done?"
          onSubmit={(value) => compose(workspace, { date, section: 'done' }, value)}
        />
      )}
    </section>
  );
};
