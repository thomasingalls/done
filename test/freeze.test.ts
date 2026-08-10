/**
 * PRD §6 and TRD §4.5, §11.
 *
 * Two mechanisms that draft v2 of the TRD conflated, and §11 asks for the
 * regression test by name: "freeze behavior is identical whether or not a day
 * has been compacted, and compaction timing never affects what the UI permits."
 *
 * So the interesting assertions here are the negative ones. Freezing must not
 * change the stored representation; compacting must not change what is allowed.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPACTION_DAYS,
  FREEZE_DAYS,
  SECTIONS,
  archiveTextOf,
  cardBody,
  cardId,
  cardsIn,
  cardsMap,
  compactDay,
  compose,
  countIn,
  dayAt,
  isCompacted,
  isFrozen,
  moveCard,
  newText,
  readCollections,
  reorderCard,
  removeCard,
  serializeCollections,
  setCardLocation,
  staleDays,
  transact,
  Y,
} from '../src/crdt';
import { addDays } from '../src/lib/date';
import { harness, TODAY, type Harness } from './workspace';

let context: Harness;
afterEach(() => context?.destroy());

const ago = (days: number): string => addDays(TODAY, -days);

describe('the freeze', () => {
  it('lands three days after the day, and never lifts', () => {
    expect(isFrozen(TODAY, TODAY)).toBe(false);
    expect(isFrozen(ago(1), TODAY)).toBe(false);
    expect(isFrozen(ago(2), TODAY)).toBe(false);
    expect(isFrozen(ago(FREEZE_DAYS), TODAY)).toBe(true);
    expect(isFrozen(ago(400), TODAY)).toBe(true);
  });

  it('does not reach forwards', () => {
    expect(isFrozen(addDays(TODAY, 1), TODAY)).toBe(false);
  });

  it('refuses mutations to a frozen day', async () => {
    context = await harness();
    const old = ago(FREEZE_DAYS);

    // Written while the day was current, then reached for after it froze.
    const past = { ...context.me, today: old };
    compose(past, { date: old, section: 'next' }, 'was going to do this');
    const id = cardId(cardsIn(context.store.doc, old, 'next')[0]!);

    expect(compose(context.me, { date: old, section: 'done' }, 'late addition')).toBe(false);
    expect(
      moveCard(context.me, { date: old, section: 'next' }, id, { date: old, section: 'done' }),
    ).toBe(false);
    expect(removeCard(context.me, { date: old, section: 'next' }, id)).toBe(false);
    expect(countIn(context.store.doc, old, 'next')).toBe(1);
  });

  it('never reaches the master list, which has no date to freeze on (PRD §6)', async () => {
    context = await harness();
    const old = ago(30);
    const past = { ...context.me, today: old };
    compose(past, { date: old, section: 'done' }, 'seed a very old day');

    context.store.doc.transact(
      () => context.store.master.insert(0, 'still a living document'),
      context.me.origin,
    );

    expect(context.store.master.toString()).toBe('still a living document');
  });

  it('refuses to reorder cards after the day freezes', async () => {
    context = await harness();
    const old = ago(FREEZE_DAYS);
    const past = { ...context.me, today: old };
    compose(past, { date: old, section: 'done' }, 'second');
    compose(past, { date: old, section: 'done' }, 'first');
    const id = cardId(cardsIn(context.store.doc, old, 'done')[0]!);

    expect(reorderCard(context.me, { date: old, section: 'done' }, id, 1)).toBe(false);
    expect(cardsIn(context.store.doc, old, 'done').map(cardBody)).toEqual(['first', 'second']);
  });

  it('changes nothing about how the day is stored', async () => {
    context = await harness();
    const old = ago(1);
    const past = { ...context.me, today: old };
    compose(past, { date: old, section: 'next' }, 'x');

    const before = readCollections(context.store.doc, old);
    // A day freezes by the calendar moving, not by anything happening to it.
    const after = readCollections(context.store.doc, old);
    expect(after).toEqual(before);
    expect(isCompacted(context.store.days.get(old) as never)).toBe(false);
  });
});

describe('the stale-item indicator', () => {
  it('reports past days that still hold Next items, before they freeze', async () => {
    context = await harness();
    const yesterday = ago(1);
    const past = { ...context.me, today: yesterday };
    compose(past, { date: yesterday, section: 'next' }, 'unfinished');
    compose(context.me, { date: TODAY, section: 'next' }, 'today is not stale');

    const stale = staleDays(context.store.doc, TODAY);
    expect(stale.map((day) => day.date)).toEqual([yesterday]);
    expect(stale[0]?.daysLeft).toBe(FREEZE_DAYS - 1);
  });

  it('says nothing about a day that has already frozen — that day is finished', async () => {
    context = await harness();
    const old = ago(FREEZE_DAYS);
    const past = { ...context.me, today: old };
    compose(past, { date: old, section: 'next' }, 'too late');

    expect(staleDays(context.store.doc, TODAY)).toEqual([]);
  });
});

describe('compaction is safety-paused independently of the freeze', () => {
  const seed = (test: Harness, date: string): void => {
    const past = { ...test.me, today: date };
    compose(past, { date, section: 'next' }, 'planned\n\nwith a blank line');
    compose(past, { date, section: 'done' }, 'finished');
  };

  it('does not run at the freeze, only four days later', async () => {
    context = await harness();
    const frozen = ago(FREEZE_DAYS);
    seed(context, frozen);

    expect(compactDay(context.store.doc, context.store.actor.systemOrigin, frozen, TODAY)).toBe(
      'skipped',
    );
    expect(isCompacted(context.store.days.get(frozen) as never)).toBe(false);
  });

  it('defers a due day without deleting its live Yjs types', async () => {
    context = await harness();
    const old = ago(COMPACTION_DAYS);
    seed(context, old);

    expect(compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY)).toBe(
      'deferred',
    );
    expect(isCompacted(context.store.days.get(old) as never)).toBe(false);
    expect(archiveTextOf(context.store.doc, old)).toBeUndefined();
    expect(cardsIn(context.store.doc, old, 'next').map(cardBody)).toEqual([
      'planned\n\nwith a blank line',
    ]);
  });

  it('continues to read archives created by older clients', async () => {
    context = await harness();
    const old = ago(COMPACTION_DAYS);
    seed(context, old);
    const before = readCollections(context.store.doc, old);
    const day = dayAt(context.store.doc, old)!;
    const ids = SECTIONS.flatMap((section) => cardsIn(context.store.doc, old, section).map(cardId));

    transact(context.store.doc, context.store.actor.systemOrigin, () => {
      day.set('archive', newText(serializeCollections(before)));
      for (const section of SECTIONS) day.delete(section);
      for (const id of ids) {
        cardsMap(context.store.doc).delete(id);
        setCardLocation(context.store.doc, id, null);
      }
    });

    expect(readCollections(context.store.doc, old)).toEqual(before);
    expect(isCompacted(day)).toBe(true);
  });

  it('reproduces the collections exactly, blank lines and all', async () => {
    context = await harness();
    const old = ago(COMPACTION_DAYS);
    seed(context, old);

    const before = readCollections(context.store.doc, old);
    compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY);
    const after = readCollections(context.store.doc, old);

    expect(after).toEqual(before);
  });

  it('is a mutation-free, repeatable deferral', async () => {
    context = await harness();
    const old = ago(COMPACTION_DAYS);
    seed(context, old);

    const before = Y.encodeStateAsUpdate(context.store.doc);
    expect(compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY)).toBe(
      'deferred',
    );
    expect(compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY)).toBe(
      'deferred',
    );
    expect(Y.encodeStateAsUpdate(context.store.doc)).toEqual(before);
    expect(archiveTextOf(context.store.doc, old)).toBeUndefined();
  });

  it('leaves an empty day alone rather than trading arrays for headings', async () => {
    context = await harness();
    const old = ago(COMPACTION_DAYS);
    const past = { ...context.me, today: old };
    compose(past, { date: old, section: 'done' }, 'x');
    const id = cardId(cardsIn(context.store.doc, old, 'done')[0]!);
    removeCard(past, { date: old, section: 'done' }, id);

    expect(compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY)).toBe(
      'skipped',
    );
  });

  it('never enters the human undo stack', async () => {
    context = await harness();
    const old = ago(COMPACTION_DAYS);
    seed(context, old);
    compose(context.me, { date: TODAY, section: 'done' }, 'typed by me');

    compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY);
    context.store.undo.undo();

    // The safety deferral made no undo entry; the typed card is what came back.
    expect(isCompacted(context.store.days.get(old) as never)).toBe(false);
    expect(cardsIn(context.store.doc, old, 'done').map(cardBody)).toEqual(['finished']);
    expect(cardsIn(context.store.doc, TODAY, 'done')).toEqual([]);
  });

  it('does not change what the freeze permits, before or after', async () => {
    context = await harness();
    const old = ago(COMPACTION_DAYS);
    seed(context, old);

    const refusedBefore = compose(context.me, { date: old, section: 'done' }, 'nope');
    compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY);
    const refusedAfter = compose(context.me, { date: old, section: 'done' }, 'still nope');

    expect(refusedBefore).toBe(false);
    expect(refusedAfter).toBe(false);
  });

  it('keeps the live day readable exactly as it was', async () => {
    context = await harness();
    const old = ago(COMPACTION_DAYS);
    seed(context, old);

    const before = cardsIn(context.store.doc, old, 'done').map(cardBody);
    compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY);

    expect(readCollections(context.store.doc, old).done).toEqual(before);
  });
});
