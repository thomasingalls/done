/**
 * Days, collections and cards (TRD §4.1–§4.3).
 *
 * ```
 * days  Y.Map<ISODate, Y.Map>
 *   └── "2026-08-05"
 *         ├── journal    Y.Text                 ← document, stays editable
 *         ├── next       Y.Array<Card>  (≤3)    ← collection
 *         ├── scheduled  Y.Array<Card>
 *         ├── done       Y.Array<Card>
 *         └── archive    Y.Text | absent        ← set on compaction (§4.5)
 * ```
 *
 * The split between the two shapes is the load-bearing decision: text where the
 * unit of interaction is the whole document, arrays where it is the item. There
 * is no parallel structured representation of item *content* — a card's text is
 * markdown in a `Y.Text` and nothing here parses it.
 *
 * **A card carries no date.** The day whose collection holds it is its date
 * (PRD §9), so rescheduling is an array move and there is no field to update.
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
import type { ISODate } from '../lib/date';

export type Section = 'next' | 'scheduled' | 'done';

/** Ordered as they appear in a day, which is also the export order (TRD §9). */
export const SECTIONS: readonly Section[] = ['next', 'scheduled', 'done'];

/** PRD §3: at most three items in Next. Enforcing it is a core function. */
export const NEXT_CAP = 3;

/**
 * A card is a `Y.Map`, so it is typed structurally rather than as an interface
 * with a constructor: what is stored is a map, and pretending otherwise would
 * mean a serializer in the write path, which is the thing this design exists to
 * avoid.
 */
export type Card = YMap<unknown>;
export type Collection = YArray<Card>;
export type Day = YMap<unknown>;

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
 * Builds a card, unattached. Attaching it is the caller's transaction, which is
 * what keeps a move to a single splice-and-insert rather than two steps a
 * reader has to know are atomic.
 */
export const newCard = (text: string, author: ActorId, options: NewCardOptions = {}): Card => {
  const card: Card = newMap<unknown>();
  card.set('id', options.id ?? newId());
  card.set('text', newText(text));
  card.set('origin', options.origin ?? null);
  card.set('author', author);
  card.set('createdAt', options.createdAt ?? new Date().toISOString());
  return card;
};

/** A detached copy, for moving a card between collections without a serializer round-trip. */
export const copyCard = (card: Card): Card =>
  newCard(cardBody(card), cardAuthor(card), {
    id: cardId(card),
    origin: cardOrigin(card),
    createdAt: cardCreatedAt(card),
  });

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

    if (!day.has('journal')) day.set('journal', newText());
    // A compacted day has had its collections deleted on purpose (§4.5), and
    // is frozen several days over besides. Re-creating them here would undo
    // compaction from a write path that should never have reached this day.
    if (!isCompacted(day)) {
      for (const section of SECTIONS) if (!day.has(section)) day.set(section, newArray<Card>());
    }
    return day;
  });

export const journalOf = (day: Day | undefined): YText | undefined =>
  day?.get('journal') as YText | undefined;

export const collectionOf = (day: Day | undefined, section: Section): Collection | undefined =>
  day?.get(section) as Collection | undefined;

/** Set by compaction; its presence means the collections have been collapsed (§4.5). */
export const archiveOf = (day: Day | undefined): YText | undefined =>
  day?.get('archive') as YText | undefined;

export const isCompacted = (day: Day | undefined): boolean => archiveOf(day) !== undefined;

export const cardsIn = (doc: YDoc, date: ISODate, section: Section): Card[] =>
  collectionOf(dayAt(doc, date), section)?.toArray() ?? [];

export const countIn = (doc: YDoc, date: ISODate, section: Section): number =>
  collectionOf(dayAt(doc, date), section)?.length ?? 0;

export const journalText = (doc: YDoc, date: ISODate): string =>
  journalOf(dayAt(doc, date))?.toString() ?? '';

/** Index of a card in its collection, or -1. Identity, not equality: cards move. */
export const indexOfCard = (collection: Collection, id: string): number => {
  const cards = collection.toArray();
  for (let index = 0; index < cards.length; index++) {
    if (cardId(cards[index] as Card) === id) return index;
  }
  return -1;
};

/** True where a day has nothing in it — the state a merely-visited day is left in. */
export const isDayEmpty = (day: Day | undefined): boolean => {
  if (!day) return true;
  if ((journalOf(day)?.length ?? 0) > 0) return false;
  if ((archiveOf(day)?.length ?? 0) > 0) return false;
  return SECTIONS.every((section) => (collectionOf(day, section)?.length ?? 0) === 0);
};
