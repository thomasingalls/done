/**
 * The operation language the property tests are written in (TRD §11).
 *
 * A generated operation names an *index*, not a card id: "the second card in
 * Next on the middle day". The interpreter takes it modulo whatever is actually
 * there, so every generated sequence is applicable to every reachable state and
 * shrinking cannot produce a case that fails for being nonsense. That is the
 * one design decision here, and everything else follows from it.
 *
 * Every branch of `applyOp` is a call the UI makes. The two text edits are the
 * exception, and they are what the CodeMirror bindings do through `yCollab` —
 * a transaction against the human's origin, which is what makes them undoable.
 */

import * as fc from 'fast-check';
import {
  cardId,
  cardText,
  cardsIn,
  compose,
  copyFromMaster,
  mergeCardBackwards,
  moveAllNextTo,
  moveAllNextToMaster,
  moveCard,
  removeCard,
  removeFromMaster,
  reorderCard,
  splitCard,
  transact,
  SECTIONS,
  type Section,
} from '../src/crdt';
import type { ISODate } from '../src/lib/date';
import { DAYS, settle, type Fleet, type Replica } from './replicas';

export type Op =
  | { t: 'compose'; day: number; section: number; text: string }
  | { t: 'move'; day: number; section: number; card: number; toDay: number; toSection: number }
  | { t: 'reorder'; day: number; section: number; card: number; to: number }
  | { t: 'remove'; day: number; section: number; card: number }
  | { t: 'split'; day: number; section: number; card: number; at: number }
  | { t: 'merge'; day: number; section: number; card: number }
  | { t: 'type'; day: number; section: number; card: number; at: number; del: number; text: string }
  | { t: 'master'; at: number; del: number; text: string }
  | { t: 'unmaster'; line: number }
  | { t: 'copy'; day: number; section: number; lines: string[] }
  | { t: 'bulk'; day: number; toDay: number; toSection: number }
  | { t: 'bulkToMaster'; day: number }
  | { t: 'undo' }
  | { t: 'redo' };

const at = <T>(items: readonly T[], index: number): T | undefined =>
  items.length === 0 ? undefined : (items[index % items.length] as T);

const dayOf = (index: number): ISODate => DAYS[index % DAYS.length] as ISODate;
const sectionOf = (index: number): Section => SECTIONS[index % SECTIONS.length] as Section;
const refOf = (day: number, section: number): { date: ISODate; section: Section } => ({
  date: dayOf(day),
  section: sectionOf(section),
});

/**
 * Interprets one operation against a replica's live state. Every branch is a
 * call the UI makes; nothing here reaches into the document except the two text
 * edits, which are what the CodeMirror bindings do through `yCollab`.
 */
export const applyOp = (replica: Replica, op: Op): void => {
  const { store, workspace } = replica;
  const doc = store.doc;

  switch (op.t) {
    case 'compose': {
      compose(workspace, refOf(op.day, op.section), op.text);
      return;
    }
    case 'move': {
      const from = refOf(op.day, op.section);
      const card = at(cardsIn(doc, from.date, from.section), op.card);
      if (card) moveCard(workspace, from, cardId(card), refOf(op.toDay, op.toSection));
      return;
    }
    case 'reorder': {
      const ref = refOf(op.day, op.section);
      const card = at(cardsIn(doc, ref.date, ref.section), op.card);
      if (card) reorderCard(workspace, ref, cardId(card), op.to);
      return;
    }
    case 'remove': {
      const ref = refOf(op.day, op.section);
      const card = at(cardsIn(doc, ref.date, ref.section), op.card);
      if (card) removeCard(workspace, ref, cardId(card));
      return;
    }
    case 'split': {
      const ref = refOf(op.day, op.section);
      const card = at(cardsIn(doc, ref.date, ref.section), op.card);
      if (card) splitCard(workspace, ref, cardId(card), op.at);
      return;
    }
    case 'merge': {
      const ref = refOf(op.day, op.section);
      const card = at(cardsIn(doc, ref.date, ref.section), op.card);
      if (card) mergeCardBackwards(workspace, ref, cardId(card));
      return;
    }
    case 'type': {
      const ref = refOf(op.day, op.section);
      const card = at(cardsIn(doc, ref.date, ref.section), op.card);
      if (!card) return;
      const text = cardText(card);
      transact(doc, workspace.origin, () => {
        const start = op.at % (text.length + 1);
        const remove = Math.min(op.del, text.length - start);
        if (remove > 0) text.delete(start, remove);
        if (op.text.length > 0) text.insert(start, op.text);
      });
      return;
    }
    case 'master': {
      const master = store.master;
      transact(doc, workspace.origin, () => {
        const start = op.at % (master.length + 1);
        const remove = Math.min(op.del, master.length - start);
        if (remove > 0) master.delete(start, remove);
        if (op.text.length > 0) master.insert(start, op.text);
      });
      return;
    }
    case 'unmaster': {
      removeFromMaster(workspace, store.master, [op.line]);
      return;
    }
    case 'copy': {
      copyFromMaster(workspace, refOf(op.day, op.section), op.lines);
      return;
    }
    case 'bulk': {
      moveAllNextTo(workspace, dayOf(op.day), refOf(op.toDay, op.toSection));
      return;
    }
    case 'bulkToMaster': {
      moveAllNextToMaster(workspace, store.master, dayOf(op.day));
      return;
    }
    case 'undo': {
      store.undo.undo();
      return;
    }
    case 'redo': {
      store.undo.redo();
      return;
    }
  }
};

/* -------------------------------------------------------------------------- */
/* Arbitraries                                                                 */

const index = fc.nat({ max: 6 });
const smallDay = fc.nat({ max: DAYS.length - 1 });
const smallSection = fc.nat({ max: SECTIONS.length - 1 });

/**
 * Bodies drawn from a small pool with the awkward shapes over-represented: a
 * card that starts with `- `, one that is only a blank line, one that contains
 * a section heading. Those are the strings the archive serializer has to round
 * trip, and a uniformly random string almost never produces one.
 */
export const cardBodyArbitrary = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom('call the dentist', 'draft the plan', 'review the PR') },
  { weight: 3, arbitrary: fc.string({ maxLength: 10 }) },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      '- [ ] already a list item',
      'first\n\nsecond',
      '## Done',
      '  indented',
      '',
      'trailing \n  ',
    ),
  },
);

type Weighted = { weight: number; arbitrary: fc.Arbitrary<Op> };

/** Operations that only ever add a card or move one. Nothing here loses text. */
const ADDITIVE_OPS: Weighted[] = [
  {
    weight: 5,
    arbitrary: fc.record({
      t: fc.constant('compose' as const),
      day: smallDay,
      section: smallSection,
      text: cardBodyArbitrary,
    }),
  },
  {
    weight: 5,
    arbitrary: fc.record({
      t: fc.constant('move' as const),
      day: smallDay,
      section: smallSection,
      card: index,
      toDay: smallDay,
      toSection: smallSection,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('reorder' as const),
      day: smallDay,
      section: smallSection,
      card: index,
      to: index,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('split' as const),
      day: smallDay,
      section: smallSection,
      card: index,
      at: fc.nat({ max: 12 }),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      t: fc.constant('type' as const),
      day: smallDay,
      section: smallSection,
      card: index,
      at: fc.nat({ max: 20 }),
      del: fc.nat({ max: 3 }),
      text: fc.string({ maxLength: 6 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      t: fc.constant('master' as const),
      at: fc.nat({ max: 40 }),
      del: fc.nat({ max: 4 }),
      text: fc.constantFrom('a line\n', 'note', '\n', '- [ ] todo\n'),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('copy' as const),
      day: smallDay,
      section: smallSection,
      lines: fc.array(fc.constantFrom('one', 'two', '- [ ] three'), { maxLength: 4 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      t: fc.constant('bulk' as const),
      day: smallDay,
      toDay: smallDay,
      toSection: smallSection,
    }),
  },
];

/** Operations that destroy something on purpose, because the user asked. */
const DESTRUCTIVE_OPS: Weighted[] = [
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('remove' as const),
      day: smallDay,
      section: smallSection,
      card: index,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('merge' as const),
      day: smallDay,
      section: smallSection,
      card: index,
    }),
  },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('unmaster' as const), line: index }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('bulkToMaster' as const), day: smallDay }) },
];

const HISTORY_OPS: Weighted[] = [
  { weight: 2, arbitrary: fc.constant({ t: 'undo' as const }) },
  { weight: 1, arbitrary: fc.constant({ t: 'redo' as const }) },
];

/** Everything the UI can do. */
export const opArbitrary: fc.Arbitrary<Op> = fc.oneof(
  ...ADDITIVE_OPS,
  ...DESTRUCTIVE_OPS,
  ...HISTORY_OPS,
);

/**
 * Everything except undo and redo. Undo is where the networked failures live
 * (see `syncDefects.test.ts`), so the properties that hold only *without* it
 * are stated against this — the boundary is named rather than left implied by
 * an absence.
 */
export const opArbitraryWithoutHistory: fc.Arbitrary<Op> = fc.oneof(
  ...ADDITIVE_OPS,
  ...DESTRUCTIVE_OPS,
);

/**
 * Nothing that deletes anything, so "was it lost" has an unambiguous answer:
 * every card any replica ever created has to be visible on all of them at the
 * end. This is the alphabet the "nothing written while apart is lost" property
 * needs, and the reason it is a separate property rather than another assertion
 * on the general one.
 */
export const opArbitraryAdditive: fc.Arbitrary<Op> = fc.oneof(...ADDITIVE_OPS);

/**
 * A step in a networked run: somebody edits, or somebody's link goes up or
 * down. Partitions are generated rather than scripted, so the interesting
 * cases — an edit made while apart, two of them, a device that misses a repair
 * — arise from the schedule instead of being anticipated.
 */
export type Step =
  | { t: 'op'; node: number; op: Op }
  | { t: 'offline'; node: number }
  | { t: 'online'; node: number };

export interface ScheduleOptions {
  ops?: fc.Arbitrary<Op>;
  length?: { min: number; max: number };
}

export const scheduleArbitrary = (
  size: number,
  { ops = opArbitrary, length = { min: 20, max: 70 } }: ScheduleOptions = {},
): fc.Arbitrary<Step[]> => {
  const node = fc.nat({ max: size - 1 });
  return fc.array(
    fc.oneof(
      { weight: 8, arbitrary: fc.record({ t: fc.constant('op' as const), node, op: ops }) },
      { weight: 1, arbitrary: fc.record({ t: fc.constant('offline' as const), node }) },
      { weight: 1, arbitrary: fc.record({ t: fc.constant('online' as const), node }) },
    ),
    // A short schedule cannot contain the interesting case. `fast-check` biases
    // array length towards zero, so the floor is set rather than left to the
    // generator: a run has to be long enough to fill a day, break it apart, and
    // have both sides keep working.
    { minLength: length.min, maxLength: length.max },
  );
};

/** Runs a schedule, settling after each step so the repairs get their microtask. */
export const runSchedule = async (fleet: Fleet, steps: readonly Step[]): Promise<void> => {
  for (const step of steps) {
    const replica = fleet.replicas[step.node % fleet.replicas.length] as Replica;
    if (step.t === 'op') applyOp(replica, step.op);
    if (step.t === 'offline') fleet.net.disconnect(replica.store.doc);
    if (step.t === 'online') fleet.net.connect(replica.store.doc);
    await settle();
  }
};
