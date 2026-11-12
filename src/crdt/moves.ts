/**
 * Movement between surfaces (PRD §4, TRD §4.7).
 *
 * Moving items is the workflow's actual mechanic, so the PRD specifies each
 * flow by *difficulty* on purpose: nothing → Done is trivial and
 * non-negotiable, while master → anywhere explicitly chooses Copy or Move. That table is
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
import { masterLineSelection } from '../editor/masterLineSelection';
import { masterLineBody } from '../lib/masterLineBody';
import { newId } from '../lib/id';
import type { ActorId, Origin } from './actors';
import {
  NEXT_CAP,
  SECTIONS,
  cardAt,
  cardBody,
  cardId,
  cardLocation,
  cardOrigin,
  cardGoalsContext,
  cardsIn,
  cardsMap,
  collectionOf,
  countIn,
  dayAt,
  ensureDay,
  indexOfCard,
  listDays,
  newCard,
  unfiledCards,
  registerCard,
  setCardLocation,
  type Card,
  type Collection,
  type Section,
  type GoalsContext,
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
const discrete = <T>(workspace: Workspace, fn: () => T, open = false): T => {
  workspace.undo?.stopCapturing();
  const result = transact(workspace.doc, workspace.origin, fn);
  // An open step stays capturing so the same command's later text slices join it.
  if (!open) workspace.undo?.stopCapturing();
  return result;
};

const writable = (workspace: Workspace, date: ISODate): boolean => !isFrozen(date, workspace.today);

/**
 * Where a card arriving in a collection lands.
 *
 * Every collection puts ordinary arrivals on top. Existing membership order
 * remains the user's: explicit reorder indices and split adjacency are separate,
 * and editing text never sorts the collection or changes a timestamp.
 */
const ARRIVAL_INDEX = 0;

/**
 * Capacity check for Next, from PRD §3. Every insert path goes through it, and
 * it is the *only* place the cap is enforced: the cap is a rule about adding,
 * and nothing in this file ever moves a card out of Next to satisfy it.
 *
 * That matters for the one case no write path can refuse. Two devices each
 * adding a third card while apart are both inside the cap when they write, and
 * a relay that holds no authority has nowhere to reject either (TRD §10.6) — so
 * the merge shows six. Keeping them is the decision (PRD §3): they are six
 * things the user wrote, and an app that quietly relocated three of them would
 * be overruling one device on behalf of the other.
 *
 * Negative capacity is therefore an ordinary state, and it reads correctly
 * everywhere it is used: every caller asks for at least one and gets nothing
 * until the user has moved Next back under three.
 */
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
  options: { origin?: string | null; goalsContext?: GoalsContext | null; open?: boolean } = {},
): boolean => {
  if (!canAccept(workspace, ref)) return false;

  const target = collectionAt(workspace, ref);
  if (!target) return false;

  const id = newId();
  const card = newCard(text, workspace.author, {
    id,
    origin: options.origin ?? null,
    goalsContext: options.goalsContext ?? null,
  });
  return discrete(
    workspace,
    () => {
      registerCard(workspace.doc, id, card, ref);
      target.insert(ARRIVAL_INDEX, [id]);
      return true;
    },
    options.open === true,
  );
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
    const at = toIndex ?? ARRIVAL_INDEX;
    target.insert(Math.min(Math.max(at, 0), target.length), [id]);
    setCardLocation(workspace.doc, id, to);
    return true;
  });
};

/** Record partial progress and keep the original task for later, in one undo step. */
export const doneForNow = (workspace: Workspace, from: Ref, id: string): string | null => {
  if (from.section !== 'next' || !writable(workspace, from.date)) return null;
  const source = collectionOf(dayAt(workspace.doc, from.date), 'next');
  const index = source ? indexOfCard(source, id) : -1;
  const card = cardAt(workspace.doc, id);
  const location = card && cardLocation(workspace.doc, id);
  if (!source || index < 0 || !card || location?.date !== from.date || location.section !== 'next')
    return null;

  const doneRef: Ref = { date: from.date, section: 'done' };
  const laterRef: Ref = { date: from.date, section: 'scheduled' };
  const done = collectionAt(workspace, doneRef);
  const later = collectionAt(workspace, laterRef);
  if (!done || !later) return null;
  const copyId = newId();
  const copy = newCard(cardBody(card), workspace.author, {
    id: copyId,
    origin: id,
    goalsContext: cardGoalsContext(card),
  });
  return discrete(workspace, () => {
    source.delete(index, 1);
    registerCard(workspace.doc, copyId, copy, doneRef);
    done.insert(ARRIVAL_INDEX, [copyId]);
    later.insert(ARRIVAL_INDEX, [id]);
    setCardLocation(workspace.doc, id, laterRef);
    return copyId;
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
/* Unfiled cards                                                               */

const unfiledCard = (workspace: Workspace, id: string) =>
  unfiledCards(workspace.doc).find((entry) => entry.id === id);

/** Deleting a retained card also deletes its frozen provenance, when it has one. */
const canDeleteUnfiledCard = (workspace: Workspace, id: string): boolean => {
  const entry = unfiledCard(workspace, id);
  return entry !== undefined && (!entry.location || writable(workspace, entry.location.date));
};

/** Filing may clean stale memberships, but never by rewriting frozen history. */
const canDetachCard = (workspace: Workspace, id: string): boolean => {
  for (const date of listDays(workspace.doc)) {
    const day = dayAt(workspace.doc, date);
    for (const section of SECTIONS) {
      const collection = collectionOf(day, section);
      if (collection && collection.toArray().includes(id) && !writable(workspace, date)) {
        return false;
      }
    }
  }
  return true;
};

/** Remove every writable stale physical reference before assigning a new home. */
const detachCard = (workspace: Workspace, id: string): void => {
  for (const date of listDays(workspace.doc)) {
    const day = dayAt(workspace.doc, date);
    for (const section of SECTIONS) {
      const collection = collectionOf(day, section);
      if (!collection) continue;
      for (let index = collection.length - 1; index >= 0; index--) {
        if (collection.get(index) === id) collection.delete(index, 1);
      }
    }
  }
};

/** Give an otherwise unreachable registry card a normal collection home. */
export const fileCardTo = (workspace: Workspace, id: string, to: Ref): boolean => {
  if (!unfiledCard(workspace, id) || !canDetachCard(workspace, id) || !canAccept(workspace, to)) {
    return false;
  }
  const target = collectionAt(workspace, to);
  if (!target) return false;

  return discrete(workspace, () => {
    detachCard(workspace, id);
    setCardLocation(workspace.doc, id, to);
    target.insert(ARRIVAL_INDEX, [id]);
    return true;
  });
};

const asMasterItem = (card: Card): string => {
  const [title = '', ...rest] = cardBody(card).split('\n');
  return [`- [ ] ${title}`, ...rest.map((line) => `  ${line}`)].join('\n');
};

/** Move an unfiled card back to the free-form Goals document. */
export const fileCardToGoals = (workspace: Workspace, master: YText, id: string): boolean => {
  const card = cardAt(workspace.doc, id);
  if (!card || !canDeleteUnfiledCard(workspace, id) || !canDetachCard(workspace, id)) return false;

  return discrete(workspace, () => {
    const current = master.toString();
    const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
    master.insert(master.length, `${separator}${asMasterItem(card)}\n`);
    detachCard(workspace, id);
    cardsMap(workspace.doc).delete(id);
    setCardLocation(workspace.doc, id, null);
    return true;
  });
};

/** Explicitly discard a retained unfiled card. */
export const removeUnfiledCard = (workspace: Workspace, id: string): boolean => {
  if (!canDeleteUnfiledCard(workspace, id) || !canDetachCard(workspace, id)) return false;
  return discrete(workspace, () => {
    detachCard(workspace, id);
    cardsMap(workspace.doc).delete(id);
    setCardLocation(workspace.doc, id, null);
    return true;
  });
};

/* -------------------------------------------------------------------------- */
/* The master list                                                             */

/**
 * Copy-to (PRD §4). Does not modify master. Explicit Move is a separate operation.
 *
 * Selected lines become one card each; a line that is only markup is dropped.
 */
export const copyFromMaster = (
  workspace: Workspace,
  ref: Ref,
  lines: readonly string[],
  goalsContexts?: readonly (GoalsContext | null)[],
): number => {
  const bodies = lines
    .map((line, index) => ({
      body: masterLineBody(line),
      goalsContext: goalsContexts?.[index] ?? null,
    }))
    .filter((line) => line.body.length > 0);
  if (bodies.length === 0) return 0;

  const capacity = capacityFor(workspace.doc, ref);
  if (!writable(workspace, ref.date) || capacity < 1) return 0;

  const accepted = bodies.slice(0, Math.min(bodies.length, capacity));

  return placeMasterCards(workspace, ref, accepted);
};

/** Explicit, all-or-nothing transfer. Only lines that become cards are removed. */
export const moveFromMaster = (
  workspace: Workspace,
  master: YText,
  ref: Ref,
  lineNumbers: readonly number[],
  goalsContexts?: ReadonlyMap<number, GoalsContext | null>,
): number => {
  const text = master.toString();
  const lines = text.split('\n');
  const selected = [...new Set(lineNumbers)]
    .filter((line) => Number.isInteger(line) && line >= 0 && line < lines.length)
    .sort((a, b) => a - b)
    .filter((line) => masterLineBody(lines[line]!).length > 0);
  if (
    selected.length === 0 ||
    !writable(workspace, ref.date) ||
    capacityFor(workspace.doc, ref) < selected.length
  )
    return 0;
  const deletion = masterLineSelection(text, selected);
  if (!deletion) return 0;
  return placeMasterCards(
    workspace,
    ref,
    selected.map((line) => ({
      body: masterLineBody(lines[line]!),
      goalsContext: goalsContexts?.get(line) ?? null,
    })),
    () => {
      for (const { anchor, head } of [...deletion.ranges].reverse()) {
        master.delete(anchor, head - anchor);
      }
    },
  );
};

/** Day bookkeeping precedes the single human transaction, including the optional source removal. */
const placeMasterCards = (
  workspace: Workspace,
  ref: Ref,
  bodies: readonly { body: string; goalsContext: GoalsContext | null }[],
  removeSource?: () => void,
): number => {
  const target = collectionAt(workspace, ref);
  if (!target) return 0;

  const cards = bodies.map(({ body, goalsContext }) => {
    const id = newId();
    return {
      id,
      card: newCard(body, workspace.author, { id, origin: 'master', goalsContext }),
    };
  });
  return discrete(workspace, () => {
    const ids = cards.map(({ id, card }) => {
      registerCard(workspace.doc, id, card, ref);
      return id;
    });
    // Preserve the established order within a transferred block: Done inserts
    // its lines in reverse; Next and Scheduled retain their source order.
    target.insert(ARRIVAL_INDEX, ref.section === 'done' ? [...ids].reverse() : ids);
    removeSource?.();
    return bodies.length;
  });
};

/**
 * Remove from master — a separate, explicit text deletion. It exists as its own
 * operation as well as the explicit Move flow. Copy never calls it;
 * clearing completed items remains manual, with no auto-archive.
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
    goalsContext: cardGoalsContext(card),
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
    const beforeContext = cardGoalsContext(previous),
      incomingContext = cardGoalsContext(current);
    // A combined card must not claim one source path for unrelated writing.
    if (!beforeContext || JSON.stringify(beforeContext) !== JSON.stringify(incomingContext))
      previous.delete('goalsContext');
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
    target.insert(ARRIVAL_INDEX, to.section === 'done' ? [...ids].reverse() : ids);
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
    const text = cards.map((card) => asMasterItem(card)).join('\n');
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

/** Provenance for the UI: where a card says it came from. */
export const provenanceOf = (card: Card): string | null => cardOrigin(card);
