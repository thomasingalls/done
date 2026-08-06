/**
 * PRD §4 and TRD §4.7: the movement table.
 *
 * The PRD specifies each flow by *difficulty*, which is a UI property. What is
 * testable here is the other half: that each flow does what it says, that the
 * two-step ones stay two steps, and that a move is one transaction rather than
 * a document that briefly holds a card twice or not at all.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  cardBody,
  cardId,
  cardOrigin,
  cardsIn,
  compose,
  copyFromMaster,
  mergeCardBackwards,
  moveCard,
  reorderCard,
  removeCard,
  removeFromMaster,
  splitCard,
  transact,
} from '../src/crdt';
import { harness, TODAY, type Harness } from './workspace';

let context: Harness;

afterEach(() => context?.destroy());

const bodies = (test: Harness, section: 'next' | 'scheduled' | 'done', date = TODAY): string[] =>
  cardsIn(test.store.doc, date, section).map(cardBody);

describe('nothing → Done', () => {
  it('is one call, and lands at the top: Done reads newest-first', async () => {
    context = await harness();
    expect(compose(context.me, { date: TODAY, section: 'done' }, 'called the dentist')).toBe(true);
    expect(compose(context.me, { date: TODAY, section: 'done' }, 'and the plumber')).toBe(true);
    expect(bodies(context, 'done')).toEqual(['and the plumber', 'called the dentist']);
  });

  it('appends in the sections ordered by intent rather than by time', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'next' }, 'first');
    compose(context.me, { date: TODAY, section: 'next' }, 'second');
    expect(bodies(context, 'next')).toEqual(['first', 'second']);
  });

  it('records the author and the time (TRD §4.2)', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'x');
    const [card] = cardsIn(context.store.doc, TODAY, 'done');
    expect(card?.get('author')).toBe(context.store.actor.id);
    expect(typeof card?.get('createdAt')).toBe('string');
  });

  it('creates the day it writes into, and no other', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'x');
    expect([...context.store.days.keys()]).toEqual([TODAY]);
  });
});

describe('Next → Done', () => {
  it('moves the same card, keeping its id', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'next' }, 'draft the plan');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'next')[0]!);

    expect(
      moveCard(context.me, { date: TODAY, section: 'next' }, id, {
        date: TODAY,
        section: 'done',
      }),
    ).toBe(true);

    expect(bodies(context, 'next')).toEqual([]);
    expect(bodies(context, 'done')).toEqual(['draft the plan']);
    expect(cardId(cardsIn(context.store.doc, TODAY, 'done')[0]!)).toBe(id);
  });

  it('is one transaction, so it is one undo step and one event', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'next' }, 'draft the plan');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'next')[0]!);

    let updates = 0;
    context.store.doc.on('update', () => (updates += 1));
    moveCard(context.me, { date: TODAY, section: 'next' }, id, { date: TODAY, section: 'done' });
    expect(updates).toBe(1);

    context.store.undo.undo();
    expect(bodies(context, 'next')).toEqual(['draft the plan']);
    expect(bodies(context, 'done')).toEqual([]);
  });

  it('moves between days without touching a date field, because there is none', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'scheduled' }, 'call back');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'scheduled')[0]!);

    moveCard(context.me, { date: TODAY, section: 'scheduled' }, id, {
      date: '2026-08-06',
      section: 'scheduled',
    });

    expect(bodies(context, 'scheduled')).toEqual([]);
    expect(bodies(context, 'scheduled', '2026-08-06')).toEqual(['call back']);
  });
});

describe('master → collection is two steps', () => {
  it('copies without modifying master', async () => {
    context = await harness();
    transact(context.store.doc, context.me.origin, () =>
      context.store.master.insert(
        0,
        '- [ ] Draft the migration plan ^k3f9x2\n- Call the dentist\n',
      ),
    );

    const copied = copyFromMaster(context.me, { date: TODAY, section: 'next' }, [
      '- [ ] Draft the migration plan ^k3f9x2',
      '- Call the dentist',
    ]);

    expect(copied).toBe(2);
    // The list marker, the checkbox and the block marker are chrome, not content.
    expect(bodies(context, 'next')).toEqual(['Draft the migration plan', 'Call the dentist']);
    expect(context.store.master.toString()).toContain('Draft the migration plan ^k3f9x2');
  });

  it('records where the card came from', async () => {
    context = await harness();
    copyFromMaster(context.me, { date: TODAY, section: 'done' }, ['something']);
    expect(cardOrigin(cardsIn(context.store.doc, TODAY, 'done')[0]!)).toBe('master');
  });

  it('removes from master only when asked separately', async () => {
    context = await harness();
    transact(context.store.doc, context.me.origin, () =>
      context.store.master.insert(0, 'one\ntwo\nthree\n'),
    );

    removeFromMaster(context.me, context.store.master, [1]);
    expect(context.store.master.toString()).toBe('one\nthree\n');
  });

  it('drops lines that are only markup', async () => {
    context = await harness();
    expect(copyFromMaster(context.me, { date: TODAY, section: 'done' }, ['- [ ] ', '   '])).toBe(0);
  });
});

describe('splitting and merging', () => {
  it('splits a card in two, leaving the returns behind', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'first half\n\nsecond half');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'done')[0]!);

    // The caret sits after the two returns; the split consumes them.
    const created = splitCard(context.me, { date: TODAY, section: 'done' }, id, 10, 12);

    expect(created).toMatch(/^[a-z0-9]{6}$/);
    expect(bodies(context, 'done')).toEqual(['first half', 'second half']);
  });

  it('gives the new card the old one as its provenance', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'a\n\nb');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'done')[0]!);
    splitCard(context.me, { date: TODAY, section: 'done' }, id, 1, 3);
    expect(cardOrigin(cardsIn(context.store.doc, TODAY, 'done')[1]!)).toBe(id);
  });

  it('merges backwards, returning where the caret should land', async () => {
    context = await harness();
    // Done is newest-first, so composing `second` then `first` puts them in
    // that order on screen and the merge is of `second` into `first`.
    compose(context.me, { date: TODAY, section: 'done' }, 'second');
    compose(context.me, { date: TODAY, section: 'done' }, 'first');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'done')[1]!);

    expect(mergeCardBackwards(context.me, { date: TODAY, section: 'done' }, id)).toBe(5);
    expect(bodies(context, 'done')).toEqual(['firstsecond']);
  });

  it('will not merge the first card into nothing', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'only');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'done')[0]!);
    expect(mergeCardBackwards(context.me, { date: TODAY, section: 'done' }, id)).toBeNull();
  });
});

describe('removal', () => {
  it('takes the card out of its collection', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'scheduled' }, 'x');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'scheduled')[0]!);
    expect(removeCard(context.me, { date: TODAY, section: 'scheduled' }, id)).toBe(true);
    expect(bodies(context, 'scheduled')).toEqual([]);
  });
});

describe('reordering', () => {
  it('moves a card by final display index in one undoable transaction', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'third');
    compose(context.me, { date: TODAY, section: 'done' }, 'second');
    compose(context.me, { date: TODAY, section: 'done' }, 'first');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'done')[0]!);

    let updates = 0;
    context.store.doc.on('update', () => (updates += 1));
    expect(reorderCard(context.me, { date: TODAY, section: 'done' }, id, 2)).toBe(true);
    expect(bodies(context, 'done')).toEqual(['second', 'third', 'first']);
    expect(updates).toBe(1);

    context.store.undo.undo();
    expect(bodies(context, 'done')).toEqual(['first', 'second', 'third']);
  });

  it('does nothing when the card is already at the requested index', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'only');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'done')[0]!);
    expect(reorderCard(context.me, { date: TODAY, section: 'done' }, id, 0)).toBe(false);
  });
});
