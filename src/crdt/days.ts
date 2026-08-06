/**
 * Days, collections and cards (TRD §4.1–§4.3).
 *
 * ```
 * days  Y.Map<ISODate, Y.Map>
 *   └── "2026-08-05"
 *         ├── next       Y.Array<CardId> (≤3)   ← collection
 *         ├── scheduled  Y.Array<CardId>
 *         ├── done       Y.Array<CardId>
 *         └── archive    Y.Text | absent        ← set on compaction (§4.5)
 * cards         Y.Map<CardId, Card>             ← canonical card content
 * cardLocations Y.Map<CardId, "date:section">  ← canonical membership
 * ```
 *
 * The split between the two shapes is the load-bearing decision: text where the
 * unit of interaction is the whole document, arrays where it is the item. There
 * is no parallel structured representation of item *content* — a card's text is
 * markdown in a `Y.Text` and nothing here parses it.
 *
 * **A card carries no date.** Its canonical membership is kept separately so
 * concurrent moves have one deterministic winner without duplicating the
 * card's collaborative text. Day collections retain presentation order.
 */

import type { ActorId } from './actors';
import {
  newArray,
  newMap,
  newText,
  transact,
  type YArray,
  type YDoc,
  type YMap,
  type YText,
} from './yjs';
import { newId } from '../lib/id';
import { Temporal } from '../lib/temporal';
import type { ISODate } from '../lib/date';

export type Section = 'next' | 'scheduled' | 'done';

/**
 * Storage order: how the sections are written to a day file and to `archive`
 * (TRD §9), and the order every iteration over a day's contents takes.
 */
export const SECTIONS: readonly Section[] = ['next', 'scheduled', 'done'];

/**
 * Reading order, which is not the same thing. Next is what you are doing,
 * Done is what you did, and Scheduled is the tail of intentions that have not
 * come up yet — so it sits at the bottom where it can be scrolled past rather
 * than between the two surfaces that are in use all day.
 *
 * Deliberately separate from `SECTIONS`: presentation must not be able to
 * change the file format by being rearranged.
 */
export const DISPLAY_SECTIONS: readonly Section[] = ['next', 'done', 'scheduled'];

/** PRD §3: at most three items in Next. Enforcing it is a core function. */
export const NEXT_CAP = 3;

/**
 * A card is a `Y.Map`, so it is typed structurally rather than as an interface
 * with a constructor: what is stored is a map, and pretending otherwise would
 * mean a serializer in the write path, which is the thing this design exists to
 * avoid.
 */
export type Card = YMap<unknown>;
export type Collection = YArray<string>;
export type Day = YMap<unknown>;

export interface CardLocation {
  date: ISODate;
  section: Section;
}

const locationKey = ({ date, section }: CardLocation): string => `${date}:${section}`;

const parseLocation = (value: unknown): CardLocation | null => {
  if (typeof value !== 'string') return null;
  const split = value.lastIndexOf(':');
  if (split < 0) return null;
  const date = value.slice(0, split);
  const section = value.slice(split + 1);
  if (!/^(?:next|scheduled|done)$/u.test(section)) return null;
  return { date, section: section as Section };
};

export const cardId = (card: Card): string => card.get('id') as string;
export const cardText = (card: Card): YText => card.get('text') as YText;
export const cardAuthor = (card: Card): ActorId => card.get('author') as ActorId;
export const cardOrigin = (card: Card): string | null => (card.get('origin') as string) ?? null;
export const cardCreatedAt = (card: Card): string => card.get('createdAt') as string;
export const cardBody = (card: Card): string => cardText(card).toString();

/** Line 1 is the title, everything after is the description (PRD §3). */
export const titleOf = (body: string): string => (body.split('\n')[0] as string).trim();

export interface NewCardOptions {
  /** Item provenance: the id of the card it came from, or `'master'`. */
  origin?: string | null;
  createdAt?: string;
  id?: string;
}

/**
 * Builds a card, unattached. Registering it and inserting its id belong to the
 * caller's transaction, so creation is one atomic operation.
 */
export const newCard = (text: string, author: ActorId, options: NewCardOptions = {}): Card => {
  const card: Card = newMap<unknown>();
  card.set('id', options.id ?? newId());
  card.set('text', newText(text));
  card.set('origin', options.origin ?? null);
  card.set('author', author);
  card.set('createdAt', options.createdAt ?? Temporal.Now.instant().toString());
  return card;
};

/** A detached copy, for moving a card between collections without a serializer round-trip. */
export const copyCard = (card: Card): Card =>
  newCard(cardBody(card), cardAuthor(card), {
    id: cardId(card),
    origin: cardOrigin(card),
    createdAt: cardCreatedAt(card),
  });

/** Cards own their text once, here; collections contain only stable ids. */
export const cardsMap = (doc: YDoc): YMap<Card> => doc.getMap('cards') as YMap<Card>;
export const cardLocationsMap = (doc: YDoc): YMap<string> => doc.getMap('cardLocations');

export const cardAt = (doc: YDoc, id: string): Card | undefined => cardsMap(doc).get(id);
export const cardLocation = (doc: YDoc, id: string): CardLocation | null =>
  parseLocation(cardLocationsMap(doc).get(id));
export const setCardLocation = (doc: YDoc, id: string, location: CardLocation | null): void => {
  if (location) cardLocationsMap(doc).set(id, locationKey(location));
  else cardLocationsMap(doc).delete(id);
};

/** Attach a new canonical card. Must be called inside the owning operation's transaction. */
export const registerCard = (doc: YDoc, id: string, card: Card, location: CardLocation): string => {
  cardsMap(doc).set(id, card);
  setCardLocation(doc, id, location);
  return id;
};

/**
 * Typed `YMap<unknown>` rather than `YMap<Day>` because Yjs's generics are
 * invariant: a `YMap<Day>` is not a `YMap<unknown>`, and the undo manager, the
 * observers and the seam all want the latter. The value type is recovered at
 * the accessors below, which is the only place it matters.
 */
export const daysMap = (doc: YDoc): YMap<unknown> => doc.getMap('days');

/** The day if it has ever been written to. Absent days occupy nothing (TRD §4.2). */
export const dayAt = (doc: YDoc, date: ISODate): Day | undefined =>
  daysMap(doc).get(date) as Day | undefined;

export const listDays = (doc: YDoc): ISODate[] => [...daysMap(doc).keys()].sort();

/**
 * Creates the day on first write. Callers already inside a transaction get that
 * transaction's origin — Yjs ignores the origin of a nested `transact`, which
 * is correct here: a day materialised in the course of a human's edit belongs
 * to that edit.
 */
export const ensureDay = (doc: YDoc, origin: unknown, date: ISODate): Day =>
  transact(doc, origin, () => {
    const map = daysMap(doc);
    let day = map.get(date) as Day | undefined;
    if (!day) {
      day = newMap<unknown>();
      map.set(date, day);
    }

    // A compacted day has had its collections deleted on purpose (§4.5), and
    // is frozen several days over besides. Re-creating them here would undo
    // compaction from a write path that should never have reached this day.
    if (!isCompacted(day)) {
      for (const section of SECTIONS) if (!day.has(section)) day.set(section, newArray<string>());
    }
    return day;
  });

export const collectionOf = (day: Day | undefined, section: Section): Collection | undefined =>
  day?.get(section) as Collection | undefined;

/** Set by compaction; its presence means the collections have been collapsed (§4.5). */
export const archiveOf = (day: Day | undefined): YText | undefined =>
  day?.get('archive') as YText | undefined;

export const isCompacted = (day: Day | undefined): boolean => archiveOf(day) !== undefined;

export const cardsIn = (doc: YDoc, date: ISODate, section: Section): Card[] => {
  const seen = new Set<string>();
  return (collectionOf(dayAt(doc, date), section)?.toArray() ?? []).flatMap((id) => {
    if (seen.has(id)) return [];
    const card = cardAt(doc, id);
    const location = card && cardLocation(doc, id);
    if (!card || location?.date !== date || location.section !== section) return [];
    seen.add(id);
    return [card];
  });
};

export const countIn = (doc: YDoc, date: ISODate, section: Section): number =>
  cardsIn(doc, date, section).length;

/** Index of a card in its collection, or -1. Identity, not equality: cards move. */
export const indexOfCard = (collection: Collection, id: string): number => {
  return collection.toArray().indexOf(id);
};

/** True where a day has nothing in it — the state a merely-visited day is left in. */
export const isDayEmpty = (day: Day | undefined): boolean => {
  if (!day) return true;
  if ((archiveOf(day)?.length ?? 0) > 0) return false;
  return SECTIONS.every((section) => (collectionOf(day, section)?.length ?? 0) === 0);
};

/**
 * Schema-v1 collections embedded each Card directly. Move them into the
 * canonical registry and replace each array item with its id. This runs once on
 * open, before editors or undo are constructed, and preserves existing local
 * Phase 2 data.
 */
export const migrateCardsToRegistry = (doc: YDoc, origin: unknown): void => {
  transact(doc, origin, () => {
    const registry = cardsMap(doc);
    for (const date of listDays(doc)) {
      const day = dayAt(doc, date);
      for (const section of SECTIONS) {
        const collection = day?.get(section) as YArray<string | Card> | undefined;
        if (!collection) continue;

        const entries = collection.toArray();
        for (let index = 0; index < entries.length; index++) {
          const entry = entries[index];
          if (typeof entry === 'string') {
            if (registry.has(entry) && !cardLocation(doc, entry)) {
              setCardLocation(doc, entry, { date, section });
            }
            continue;
          }

          const id = cardId(entry as Card);
          if (!registry.has(id)) {
            const canonical = copyCard(entry as Card);
            registry.set(id, canonical);
          }
          if (!cardLocation(doc, id)) setCardLocation(doc, id, { date, section });
          collection.delete(index, 1);
          collection.insert(index, [id]);
        }
      }
    }
  });
};

/**
 * Removes stale physical memberships left by concurrent moves. The card's
 * canonical location map has one deterministic value per id, so concurrent
 * assignments have one winner; arrays retain ordering but no longer decide
 * which of two locations owns the item.
 */
export const repairCardMemberships = (doc: YDoc, origin: unknown): number => {
  const removals: Array<{ collection: Collection; index: number }> = [];
  const present = new Set<string>();

  for (const date of listDays(doc)) {
    const day = dayAt(doc, date);
    for (const section of SECTIONS) {
      const collection = collectionOf(day, section);
      if (!collection) continue;
      const seen = new Set<string>();
      collection.toArray().forEach((id, index) => {
        const card = cardAt(doc, id);
        const location = card && cardLocation(doc, id);
        const belongs = location?.date === date && location.section === section;
        if (!card || !belongs || seen.has(id)) removals.push({ collection, index });
        else {
          seen.add(id);
          present.add(`${locationKey(location)}:${id}`);
        }
      });
    }
  }

  const missing: Array<{ collection: Collection; id: string }> = [];
  for (const [id] of cardsMap(doc).entries()) {
    const location = cardLocation(doc, id);
    if (!location || present.has(`${locationKey(location)}:${id}`)) continue;
    const collection = collectionOf(dayAt(doc, location.date), location.section);
    if (collection) missing.push({ collection, id });
  }

  if (removals.length === 0 && missing.length === 0) return 0;
  transact(doc, origin, () => {
    const byCollection = new Map<Collection, number[]>();
    for (const removal of removals) {
      const indices = byCollection.get(removal.collection) ?? [];
      indices.push(removal.index);
      byCollection.set(removal.collection, indices);
    }
    for (const [collection, indices] of byCollection) {
      for (const index of indices.sort((a, b) => b - a)) collection.delete(index, 1);
    }
    for (const { collection, id } of missing) collection.push([id]);
  });
  return removals.length + missing.length;
};
