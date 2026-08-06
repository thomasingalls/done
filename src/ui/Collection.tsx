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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NEXT_CAP,
  archiveOf,
  cardId,
  cardsIn,
  collectionOf,
  compose,
  countIn,
  dayAt,
  mergeCardBackwards,
  moveCard,
  parseCollections,
  removeCard,
  splitCard,
  type Card as CardType,
  type Ref,
  type Section,
  type Store,
  type Workspace,
} from '../crdt';
import type { CardHooks } from '../editor/cardCommands';
import { renderStatic } from '../editor/staticRender';
import { addDays, type ISODate } from '../lib/date';
import { Card, type CardAction } from './Card';
import { Compose } from './Compose';
import { useYValue } from './useYjs';

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
  const { cards, archived, nextIsFull } = useYValue(
    store.days,
    () => {
      const day = dayAt(store.doc, date);
      const live = collectionOf(day, section);
      if (!live) return `archive:${archiveOf(day)?.toString() ?? 'absent'}:${section}`;
      return `${countIn(store.doc, date, 'next')}:${live.toArray().join(',')}`;
    },
    () => {
      const day = dayAt(store.doc, date);
      const live = collectionOf(day, section);
      const archive = archiveOf(day);
      return {
        cards: live ? cardsIn(store.doc, date, section) : [],
        archived: !live && archive ? parseCollections(archive.toString())[section] : [],
        nextIsFull: countIn(store.doc, date, 'next') >= NEXT_CAP,
      };
    },
  );

  // Set after a split so the card that was created opens with the caret in it.
  const [focusCard, setFocusCard] = useState<{ id: string; at: number } | null>(null);

  const ref: Ref = useMemo(() => ({ date, section }), [date, section]);

  const hooksFor = useCallback(
    (id: string): CardHooks => ({
      split: (at, tailFrom) => {
        const created = splitCard(workspace, ref, id, at, tailFrom);
        if (created) setFocusCard({ id: created, at: 0 });
        return created !== null;
      },
      mergeBackwards: () => {
        const index = cards.findIndex((card) => cardId(card) === id);
        const previous = index > 0 ? cards[index - 1] : undefined;
        const at = mergeCardBackwards(workspace, ref, id);
        if (at !== null && previous) setFocusCard({ id: cardId(previous), at });
        return at;
      },
      leave: () => setFocusCard((current) => (current?.id === id ? null : current)),
    }),
    [workspace, ref, cards],
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
  const count = cards.length + archived.length;
  if (count === 0 && !(active && section !== 'scheduled')) return null;

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
              {...(focusCard?.id === cardId(card) ? { autoFocusAt: focusCard.at } : {})}
            />
          ))}
          {archived.map((body, index) => (
            <ArchivedCard key={`${section}:${index}`} body={body} section={section} />
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
