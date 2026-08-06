/**
 * Movement between surfaces (PRD §4, TRD §4.7).
 *
 * Moving items is the workflow's actual mechanic, so the PRD specifies each
 * flow by *difficulty* on purpose: nothing → Done is trivial and
 * non-negotiable, master → anywhere is deliberately two steps. That table is
 * the specification for this module, and the difficulty lives in the UI. What
 * lives here is atomicity and the rules.
 *
 * Three properties every operation holds:
 *
 * 1. **One transaction.** A move is a splice and an insert inside a single
 *    `transact`, so it is one undo step and one observable event rather than a
 *    document that briefly holds the card twice or not at all.
 * 2. **An origin.** Every mutation names its actor (TRD §4.8). Bulk operations
 *    pass the system origin, which is what keeps them out of the human's undo
 *    stack.
 * 3. **A frozen day rejects.** The freeze is a policy check, and a check only
 *    in the UI is a check that the next caller forgets. Operations return
 *    `false` rather than throwing: a refused move is an ordinary outcome, not
 *    an exception.
 *
 * Card content lives once in the canonical registry. A move changes ordered id
 * membership and the separate canonical location, so concurrent text edits
 * survive even when another replica moves the card at the same time.
 */

import type { ISODate } from '../lib/date';
import { BLOCK_MARKER, newId } from '../lib/id';
import type { ActorId, Origin } from './actors';
import {
  NEXT_CAP,
  cardAt,
  cardBody,
  cardId,
  cardLocation,
  cardOrigin,
  cardsIn,
  cardsMap,
  collectionOf,
  countIn,
  dayAt,
  ensureDay,
  indexOfCard,
  newCard,
  registerCard,
  setCardLocation,
  type Card,
  type Collection,
  type Section,
} from './days';
import { isFrozen } from './freeze';
import { transact, type YDoc, type YText, type YUndoManager } from './yjs';

/** Where a card is, or is going. A card has no date of its own (PRD §9). */
export interface Ref {
  date: ISODate;
  section: Section;
}

export interface Workspace {
  doc: YDoc;
  /** The acting actor. Bulk and repair operations pass the system origin. */
  origin: Origin;
  /**
   * Materialising a day is bookkeeping, not something the human typed, so it is
   * attributed to the system actor and stays out of the undo stack — the same
   * reasoning as roster registration in actors.ts, and for a sharper reason.
   * Deleting a `Y.Map` deletes everything under it, so if the day map belonged
   * to the human's first write, undoing that write would take the whole day
   * with it, including anything added since by anyone.
   */
  systemOrigin: Origin;
  author: ActorId;
  today: ISODate;
  /**
   * Optional, and only so that a move is one undo step. `Y.UndoManager` merges
   * transactions that land within half a second of each other, which is right
   * for typing and wrong for a card move: pressing Done a moment after typing
   * the card would otherwise make one undo revert both.
   */
  undo?: YUndoManager;
}

/**
 * A structural change: its own transaction, and its own undo step on each side.
 * Every operation below that moves, creates or destroys a card goes through it.
 */
const discrete = <T>(workspace: Workspace, fn: () => T): T => {
  workspace.undo?.stopCapturing();
  const result = transact(workspace.doc, workspace.origin, fn);
  workspace.undo?.stopCapturing();
  return result;
};

const writable = (workspace: Workspace, date: ISODate): boolean => !isFrozen(date, workspace.today);

/** Capacity check for Next, from PRD §3. Every insert path goes through it. */
const capacityFor = (doc: YDoc, ref: Ref): number => {
  if (ref.section !== 'next') return Number.POSITIVE_INFINITY;
  return NEXT_CAP - countIn(doc, ref.date, 'next');
};

export const canAccept = (workspace: Workspace, ref: Ref, count = 1): boolean =>
  writable(workspace, ref.date) && capacityFor(workspace.doc, ref) >= count;

/**
 * The target collection, materialising the day if it is the first write to it.
 *
 * Called *before* the operation's own transaction rather than inside it, for
 * two reasons: Yjs ignores the origin of a nested `transact`, so a day created
 * inside the operation would carry the operation's origin rather than the
 * system's; and the day map has to be somebody else's before the operation
 * starts, or undoing the operation deletes it.
 *
 * Undefined only for a compacted day, whose collections are gone by design —
 * unreachable through the checks above, and refused rather than asserted away.
 */
const collectionAt = (workspace: Workspace, ref: Ref): Collection | undefined =>
  collectionOf(ensureDay(workspace.doc, workspace.systemOrigin, ref.date), ref.section);

/* -------------------------------------------------------------------------- */
/* Creating                                                                    */

/**
 * The compose field at the foot of Done (PRD §4): type, Enter, done. The one
 * flow the PRD calls non-negotiable, so it is also the one with the fewest
 * conditions on it — only the freeze, which cannot apply to a day you are
 * composing into unless you have navigated three days back on purpose.
 */
export const compose = (
  workspace: Workspace,
  ref: Ref,
  text: string,
  options: { origin?: string | null } = {},
): boolean => {
  if (!canAccept(workspace, ref)) return false;

  const target = collectionAt(workspace, ref);
  if (!target) return false;

  const id = newId();
  const card = newCard(text, workspace.author, {
    id,
    origin: options.origin ?? null,
  });
  return discrete(workspace, () => {
    registerCard(workspace.doc, id, card, ref);
    target.push([id]);
    return true;
  });
};

/* -------------------------------------------------------------------------- */
/* Moving                                                                      */

/**
 * Next → Done and every other card move. Splice and insert in one transaction,
 * which is the whole argument for collections being arrays (TRD §4.3).
 */
export const moveCard = (
  workspace: Workspace,
  from: Ref,
  id: string,
  to: Ref,
  toIndex?: number,
): boolean => {
  if (!writable(workspace, from.date)) return false;
  if (!canAccept(workspace, to)) return false;

  const source = collectionOf(dayAt(workspace.doc, from.date), from.section);
  if (!source) return false;
  const index = indexOfCard(source, id);
  if (index < 0) return false;
  const card = cardAt(workspace.doc, id);
  const location = card && cardLocation(workspace.doc, id);
  if (!card || location?.date !== from.date || location.section !== from.section) return false;

  const target = collectionAt(workspace, to);
  if (!target) return false;

  return discrete(workspace, () => {
    source.delete(index, 1);
    const at = toIndex ?? target.length;
    target.insert(Math.min(Math.max(at, 0), target.length), [id]);
    setCardLocation(workspace.doc, id, to);
    return true;
  });
};

/** Reordering inside one collection. Same transaction discipline. */
export const reorderCard = (workspace: Workspace, ref: Ref, id: string, to: number): boolean => {
  if (!writable(workspace, ref.date)) return false;

  const collection = collectionOf(dayAt(workspace.doc, ref.date), ref.section);
  if (!collection) return false;
  const index = indexOfCard(collection, id);
  if (index < 0 || index === to) return false;

  discrete(workspace, () => {
    collection.delete(index, 1);
    collection.insert(Math.min(Math.max(to, 0), collection.length), [id]);
  });
  return true;
};

export const removeCard = (workspace: Workspace, ref: Ref, id: string): boolean => {
  if (!writable(workspace, ref.date)) return false;

  const collection = collectionOf(dayAt(workspace.doc, ref.date), ref.section);
  if (!collection) return false;
  const index = indexOfCard(collection, id);
  if (index < 0) return false;

  discrete(workspace, () => {
    collection.delete(index, 1);
    cardsMap(workspace.doc).delete(id);
    setCardLocation(workspace.doc, id, null);
  });
  return true;
};

/* -------------------------------------------------------------------------- */
/* The master list                                                             */

/** `- [ ] Draft the plan ^k3f9x2` → `Draft the plan`. */
const stripLineMarkup = (line: string): string =>
  line
    .replace(BLOCK_MARKER, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    .trimEnd();

/**
 * Copy-to (PRD §4). **Does not modify master.** The master list is not expected
 * to stay 1:1 with what appears in daily views, and bundling a delete into this
 * is exactly the one-action flow the PRD refuses.
 *
 * Selected lines become one card each; a line that is only markup is dropped.
 */
export const copyFromMaster = (
  workspace: Workspace,
  ref: Ref,
  lines: readonly string[],
): number => {
  const bodies = lines.map(stripLineMarkup).filter((line) => line.length > 0);
  if (bodies.length === 0) return 0;

  const capacity = capacityFor(workspace.doc, ref);
  if (!writable(workspace, ref.date) || capacity < 1) return 0;

  const accepted = bodies.slice(0, Math.min(bodies.length, capacity));

  const target = collectionAt(workspace, ref);
  if (!target) return 0;

  const cards = accepted.map((body) => {
    const id = newId();
    return {
      id,
      card: newCard(body, workspace.author, { id, origin: 'master' }),
    };
  });
  return discrete(workspace, () => {
    target.push(
      cards.map(({ id, card }) => {
        registerCard(workspace.doc, id, card, ref);
        return id;
      }),
    );
    return accepted.length;
  });
};

/**
 * Remove from master — a separate, explicit text deletion. It exists as its own
 * operation precisely so that nothing can call it by accident as part of a copy
 * (PRD §4). Clearing completed items is manual only; there is no auto-archive.
 */
export const removeFromMaster = (
  workspace: Workspace,
  master: YText,
  lineNumbers: readonly number[],
): boolean => {
  const lines = master.toString().split('\n');
  const targets = [...new Set(lineNumbers)]
    .filter((line) => line >= 0 && line < lines.length)
    .sort((a, b) => b - a);
  if (targets.length === 0) return false;

  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  discrete(workspace, () => {
    for (const line of targets) {
      const start = offsets[line] as number;
      const length = (lines[line] as string).length;
      // Take the newline with the line, except on the last line where there
      // isn't one — then take the one before it, so no blank line is left.
      if (line < lines.length - 1) master.delete(start, length + 1);
      else master.delete(Math.max(0, start - 1), length + (start > 0 ? 1 : 0));
    }
  });
  return true;
};

/**
 * Journal line → master (PRD §4). The line gains a stable id if it has none,
 * because now something points at it (TRD §4.6), and the *marked* line is what
 * lands in master so the two ends stay findable from each other.
 */
export const promoteJournalLine = (
  workspace: Workspace,
  master: YText,
  date: ISODate,
  lineNumber: number,
): string | null => {
  const day = dayAt(workspace.doc, date);
  const journal = day?.get('journal') as YText | undefined;
  if (!journal) return null;

  const lines = journal.toString().split('\n');
  const line = lines[lineNumber];
  if (line === undefined || line.trim().length === 0) return null;

  const existing = BLOCK_MARKER.exec(line);
  const id = existing?.[1] ?? newId();

  discrete(workspace, () => {
    if (!existing) {
      let offset = 0;
      for (let index = 0; index < lineNumber; index++)
        offset += (lines[index] as string).length + 1;
      journal.insert(offset + line.length, ` ^${id}`);
    }

    const marked = existing ? line : `${line} ^${id}`;
    const current = master.toString();
    const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
    master.insert(master.length, `${separator}${marked.trimStart()}\n`);
  });

  return id;
};

/* -------------------------------------------------------------------------- */
/* Splitting and merging                                                       */

/**
 * Card split (PRD §10, TRD §4.7): truncate this card's text, insert a new card
 * after it holding the remainder. The threshold that triggers it is a named
 * constant in the editor, not here — this is the operation, not the gesture.
 *
 * Returns the new card's id so the caller can move focus into it.
 */
export const splitCard = (
  workspace: Workspace,
  ref: Ref,
  id: string,
  at: number,
  tailFrom: number = at,
): string | null => {
  if (!writable(workspace, ref.date)) return null;

  const collection = collectionOf(dayAt(workspace.doc, ref.date), ref.section);
  if (!collection) return null;
  const index = indexOfCard(collection, id);
  if (index < 0) return null;
  // A split adds an item; in Next that is the cap, and the cap is unbreakable.
  if (capacityFor(workspace.doc, ref) < 1) return null;

  const card = cardAt(workspace.doc, id);
  if (!card) return null;
  const text = card.get('text') as YText;
  const body = text.toString();
  const cut = Math.min(Math.max(at, 0), body.length);
  // The returns that triggered the split belong to neither half, so the tail
  // can start after the cut rather than at it.
  const tail = body.slice(Math.min(Math.max(tailFrom, cut), body.length));

  const createdId = newId();
  const created = newCard(tail, workspace.author, {
    id: createdId,
    origin: cardId(card),
  });

  discrete(workspace, () => {
    text.delete(cut, body.length - cut);
    registerCard(workspace.doc, createdId, created, ref);
    collection.insert(index + 1, [createdId]);
  });

  return createdId;
};

/**
 * Card merge (backspace at position 0): append this card's text to the previous
 * one and delete it. Returns the position the caret should land on in the
 * previous card, which is the join point.
 */
export const mergeCardBackwards = (workspace: Workspace, ref: Ref, id: string): number | null => {
  if (!writable(workspace, ref.date)) return null;

  const collection = collectionOf(dayAt(workspace.doc, ref.date), ref.section);
  if (!collection) return null;
  const index = indexOfCard(collection, id);
  if (index <= 0) return null;

  const previousId = collection.get(index - 1);
  const previous = previousId && cardAt(workspace.doc, previousId);
  const current = cardAt(workspace.doc, id);
  if (!previous || !current) return null;
  const target = previous.get('text') as YText;
  const body = cardBody(current);
  const join = target.length;

  discrete(workspace, () => {
    if (body.length > 0) target.insert(join, body);
    collection.delete(index, 1);
    cardsMap(workspace.doc).delete(id);
    setCardLocation(workspace.doc, id, null);
  });

  return join;
};

/* -------------------------------------------------------------------------- */
/* Bulk                                                                        */

/**
 * The PRD §6 bulk actions on stale Next items. One transaction covering every
 * card, carrying the **system** origin: a bulk resolution that entered the
 * human's undo stack would unwind dozens of card moves as a single confusing
 * step, which is the concrete reason TRD §4.8 exists.
 */
export const moveAllNextTo = (workspace: Workspace, from: ISODate, to: Ref): number => {
  const source = collectionOf(dayAt(workspace.doc, from), 'next');
  const sourceCards = cardsIn(workspace.doc, from, 'next');
  if (!source || sourceCards.length === 0) return 0;
  if (!writable(workspace, from) || !writable(workspace, to.date)) return 0;

  const capacity = capacityFor(workspace.doc, to);
  const count = Math.min(sourceCards.length, capacity);
  if (count < 1) return 0;

  const target = collectionAt(workspace, to);
  if (!target) return 0;

  return discrete(workspace, () => {
    const ids = sourceCards.slice(0, count).map(cardId);
    for (const id of ids) {
      const index = indexOfCard(source, id);
      if (index >= 0) source.delete(index, 1);
      if (cardAt(workspace.doc, id)) setCardLocation(workspace.doc, id, to);
    }
    target.push(ids);
    return count;
  });
};

/**
 * The other bulk action: back to the master list, as plain lines. Cards become
 * text again, which is the direction the whole data model runs in — structure
 * where the workflow demands it, text everywhere else.
 */
export const moveAllNextToMaster = (workspace: Workspace, master: YText, from: ISODate): number => {
  const source = collectionOf(dayAt(workspace.doc, from), 'next');
  if (!source) return 0;
  if (!writable(workspace, from)) return 0;

  const cards = cardsIn(workspace.doc, from, 'next');
  if (cards.length === 0) return 0;

  discrete(workspace, () => {
    const current = master.toString();
    const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
    const text = cards
      .map((card) => {
        const [title = '', ...rest] = cardBody(card).split('\n');
        return [`- [ ] ${title}`, ...rest.map((line) => `  ${line}`)].join('\n');
      })
      .join('\n');
    master.insert(master.length, `${separator}${text}\n`);
    for (const card of cards) {
      const id = cardId(card);
      const index = indexOfCard(source, id);
      if (index >= 0) source.delete(index, 1);
      cardsMap(workspace.doc).delete(id);
      setCardLocation(workspace.doc, id, null);
    }
  });

  return cards.length;
};

/* -------------------------------------------------------------------------- */
/* The cap, after the fact                                                     */

/**
 * The cap has to be unbreakable by "paste, multi-line insert, undo, drag, and
 * concurrent insert-from-two-devices" (TRD §11). Every write path above refuses
 * to exceed it, which covers the first four at the point of the mistake. The
 * fifth cannot be prevented at write time: two devices each adding a third card
 * offline is a legal pair of operations that converges to four, and a CRDT with
 * a relay that holds no authority has nowhere to reject one of them (TRD §10.6).
 *
 * So the cap is *also* a repair, run after any change to a day. It keeps the
 * first `NEXT_CAP` cards in array order and moves the overflow to Scheduled on
 * the same day — never deletes, because the overflow is something the user
 * wrote — and it runs as the **system** actor so undo does not step through it.
 *
 * Deterministic by construction: both replicas see the same converged array and
 * compute the same overflow, so both produce the same result.
 */
export const enforceCap = (doc: YDoc, systemOrigin: Origin, date: ISODate): number => {
  const day = dayAt(doc, date);
  const next = collectionOf(day, 'next');
  const scheduled = collectionOf(day, 'scheduled');
  const cards = cardsIn(doc, date, 'next');
  if (!next || !scheduled || cards.length <= NEXT_CAP) return 0;

  const overflowCards = cards.slice(NEXT_CAP);

  transact(doc, systemOrigin, () => {
    const ids = overflowCards.map(cardId);
    for (const id of ids) {
      const index = indexOfCard(next, id);
      if (index >= 0) next.delete(index, 1);
      if (cardAt(doc, id)) setCardLocation(doc, id, { date, section: 'scheduled' });
    }
    scheduled.insert(0, ids);
  });

  return overflowCards.length;
};

/** Provenance for the UI: where a card says it came from. */
export const provenanceOf = (card: Card): string | null => cardOrigin(card);
