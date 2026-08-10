/**
 * Days, collections and cards (TRD §4.1–§4.3).
 *
 * ```
 * days  Y.Map<ISODate, Y.Map>
 *   └── "2026-08-05"
 *         ├── next       Y.Array<CardId>        ← collection; ≤3 per device
 *         ├── scheduled  Y.Array<CardId>
 *         ├── done       Y.Array<CardId>        ← newest first
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
import { nowInstant } from '../lib/temporal';
import { compareInstants, type ISODate } from '../lib/date';

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

/**
 * PRD §3: at most three items in Next. Enforcing it is a core function, and
 * what it means is that a device refuses to *add* a fourth — not that a day is
 * held to three afterwards. Two devices can each fill Next while apart, and
 * when they meet the day shows all of them (PRD §3, "the cap bounds what you
 * can add"). The rule does not soften: an expanded Next takes nothing new until
 * the user has moved it back under three.
 */
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
  card.set('createdAt', options.createdAt ?? nowInstant().toString());
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

export interface RecoveryCard {
  id: string;
  card: Card;
  /** Retained when the card's former day collection no longer exists. */
  location: CardLocation | null;
}

/**
 * Registry cards that no normal collection can currently show.
 *
 * This includes fully locationless orphans and cards whose last-known day was
 * compacted by an older client. A location pointing at a missing collection is
 * evidence, not corruption, so it is exposed to recovery instead of erased.
 */
export const recoveryCards = (doc: YDoc): RecoveryCard[] => {
  const referenced = new Set<string>();
  for (const date of listDays(doc)) {
    const day = dayAt(doc, date);
    for (const section of SECTIONS) {
      for (const id of collectionOf(day, section)?.toArray() ?? []) referenced.add(id);
    }
  }

  return [...cardsMap(doc).entries()]
    .flatMap(([id, card]): RecoveryCard[] => {
      const location = cardLocation(doc, id);
      if (!location) return referenced.has(id) ? [] : [{ id, card, location: null }];
      const collection = collectionOf(dayAt(doc, location.date), location.section);
      return collection ? [] : [{ id, card, location }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
};

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
 * Membership skew the repair pass can observe. Visible cards are exactly the
 * triple intersection of registry ∩ locations ∩ matching collection arrays
 * (`cardsIn`); anything outside that triangle is an issue.
 */
export type MembershipIssue =
  | { kind: 'card-without-location'; id: string }
  | { kind: 'location-without-card'; id: string }
  | { kind: 'invalid-location'; id: string; value: unknown }
  | { kind: 'location-without-collection'; id: string; location: CardLocation }
  | { kind: 'array-without-card'; id: string; date: ISODate; section: Section }
  | {
      kind: 'array-location-mismatch';
      id: string;
      date: ISODate;
      section: Section;
      location: CardLocation;
    }
  | { kind: 'duplicate-in-array'; id: string; date: ISODate; section: Section }
  | { kind: 'missing-from-array'; id: string; location: CardLocation };

/**
 * Diagnostics for tests and audits. A successful repair can intentionally
 * leave recoverable issues (`card-without-location` and
 * `location-without-collection`) rather than deleting cards or provenance
 * without evidence.
 */
export const cardMembershipIssues = (doc: YDoc): MembershipIssue[] => {
  const issues: MembershipIssue[] = [];
  const locations = cardLocationsMap(doc);
  const present = new Set<string>();

  for (const [id, value] of locations.entries()) {
    if (!cardAt(doc, id)) {
      issues.push({ kind: 'location-without-card', id });
      continue;
    }
    const location = parseLocation(value);
    if (!location) {
      issues.push({ kind: 'invalid-location', id, value });
      continue;
    }
    const collection = collectionOf(dayAt(doc, location.date), location.section);
    if (!collection) issues.push({ kind: 'location-without-collection', id, location });
  }

  for (const [id] of cardsMap(doc).entries()) {
    if (!locations.has(id)) {
      issues.push({ kind: 'card-without-location', id });
    }
  }

  for (const date of listDays(doc)) {
    const day = dayAt(doc, date);
    for (const section of SECTIONS) {
      const collection = collectionOf(day, section);
      if (!collection) continue;
      const seen = new Set<string>();
      for (const id of collection.toArray()) {
        if (seen.has(id)) {
          issues.push({ kind: 'duplicate-in-array', id, date, section });
          continue;
        }
        seen.add(id);
        const card = cardAt(doc, id);
        if (!card) {
          issues.push({ kind: 'array-without-card', id, date, section });
          continue;
        }
        const location = cardLocation(doc, id);
        if (!location) continue;
        if (location.date !== date || location.section !== section) {
          issues.push({ kind: 'array-location-mismatch', id, date, section, location });
          continue;
        }
        present.add(`${locationKey(location)}:${id}`);
      }
    }
  }

  for (const [id] of cardsMap(doc).entries()) {
    const location = cardLocation(doc, id);
    if (!location) continue;
    const collection = collectionOf(dayAt(doc, location.date), location.section);
    if (!collection) continue;
    if (!present.has(`${locationKey(location)}:${id}`)) {
      issues.push({ kind: 'missing-from-array', id, location });
    }
  }

  return issues;
};

/**
 * Where a card goes when it is re-homed — put back into the collection its
 * canonical location names, after the array entry that held its position was
 * destroyed (see `repairCardMemberships`).
 *
 * Its old index is not recoverable: the entry that encoded it is gone. So the
 * position is recomputed from something every replica agrees on, and what that
 * should be is the section's own ordering rule (PRD §3).
 *
 * Next and Scheduled are ordered by intent, and intent is not stored anywhere —
 * an arrival appends, and so does a return.
 *
 * Done is ordered by time, so its order *can* be restored: the card goes back
 * above everything completed before it, which puts a run of returning cards
 * back in newest-first order and interleaves it with what is already there
 * rather than dumping it at one end. The key is `createdAt`, which is the
 * completion time exactly for the compose path — how most things reach Done —
 * and the *writing* time for a card that was written earlier in Next and
 * finished later. There is no completion timestamp to use instead, and PRD §9
 * is clear that there should not be one; this is a repair choosing a position,
 * not the app recording when anything was finished.
 */
const rehomeIndex = (doc: YDoc, collection: Collection, section: Section, card: Card): number => {
  if (section !== 'done') return collection.length;
  const createdAt = cardCreatedAt(card);
  const entries = collection.toArray();
  const older = entries.findIndex((id) => {
    const other = cardAt(doc, id);
    return other !== undefined && compareInstants(cardCreatedAt(other), createdAt) < 0;
  });
  return older < 0 ? entries.length : older;
};

/**
 * Reconciles the ordered arrays with the canonical location map, in both
 * directions: an array entry the map disowns is removed, and a card the map
 * places somewhere no array holds is put back (`rehomeIndex` decides where).
 *
 * The map has one deterministic value per id, so concurrent assignments have
 * one winner; arrays retain ordering but no longer decide which of two
 * locations owns the item.
 *
 * Repair policy:
 * - array id with a card but no location → restore location from the first
 *   array occurrence (day order, then `SECTIONS` order)
 * - card with no location and no array evidence → retain it for recovery
 * - location (or invalid location string) without a card → drop the location
 * - location whose collection is gone (legacy compaction) → retain both the
 *   card and its last-known location for recovery
 * - otherwise reconcile arrays to the location map (drop strangers / duplicates,
 *   re-home missing ids according to section ordering)
 */
export const repairCardMemberships = (doc: YDoc, origin: unknown): number => {
  const removals: Array<{ collection: Collection; index: number }> = [];
  const present = new Set<string>();
  const arrayHome = new Map<string, CardLocation>();

  for (const date of listDays(doc)) {
    const day = dayAt(doc, date);
    for (const section of SECTIONS) {
      const collection = collectionOf(day, section);
      if (!collection) continue;
      const seen = new Set<string>();
      collection.toArray().forEach((id, index) => {
        const card = cardAt(doc, id);
        if (!card) {
          removals.push({ collection, index });
          return;
        }

        const location = cardLocation(doc, id);
        if (!location) {
          if (seen.has(id) || arrayHome.has(id)) {
            removals.push({ collection, index });
            return;
          }
          seen.add(id);
          arrayHome.set(id, { date, section });
          return;
        }

        const belongs = location.date === date && location.section === section;
        if (!belongs || seen.has(id)) {
          removals.push({ collection, index });
          return;
        }
        seen.add(id);
        present.add(`${locationKey(location)}:${id}`);
      });
    }
  }

  const restoreLocations: Array<{ id: string; location: CardLocation }> = [];
  const dropLocations = new Set<string>();
  const missing: Array<{ collection: Collection; section: Section; id: string; card: Card }> = [];

  for (const [id, value] of cardLocationsMap(doc).entries()) {
    if (!cardAt(doc, id)) {
      dropLocations.add(id);
      continue;
    }
    if (!parseLocation(value)) dropLocations.add(id);
  }

  for (const [id, card] of cardsMap(doc).entries()) {
    const location = cardLocation(doc, id);
    if (location) {
      const collection = collectionOf(dayAt(doc, location.date), location.section);
      if (!collection) continue;
      if (!present.has(`${locationKey(location)}:${id}`)) {
        missing.push({ collection, section: location.section, id, card });
      }
      continue;
    }

    const home = arrayHome.get(id);
    if (home) {
      restoreLocations.push({ id, location: home });
      dropLocations.delete(id);
    }
  }

  // Oldest first, because `rehomeIndex` puts each returning card above what was
  // finished before it: run ascending and a batch lands newest-first. The sort
  // is also what makes two replicas agree — this list is built by iterating the
  // card registry, whose order is the order entries were *integrated*, so two
  // replicas handed the same updates in a different order read it differently.
  missing.sort(
    (a, b) =>
      compareInstants(cardCreatedAt(a.card), cardCreatedAt(b.card)) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const changes = removals.length + restoreLocations.length + dropLocations.size + missing.length;
  if (changes === 0) return 0;

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
    for (const id of dropLocations) cardLocationsMap(doc).delete(id);
    for (const { id, location } of restoreLocations) setCardLocation(doc, id, location);
    // Indices are read here rather than above because the removals have landed
    // in between, and a returning card is placed among what is left.
    for (const { collection, section, id, card } of missing) {
      collection.insert(rehomeIndex(doc, collection, section, card), [id]);
    }
  });
  return changes;
};
