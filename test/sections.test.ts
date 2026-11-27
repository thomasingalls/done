/**
 * The order the day reads in, and the order Done is written in.
 *
 * Two different orders, deliberately. `SECTIONS` is how a day is *stored* and
 * exported (TRD §9); `DISPLAY_SECTIONS` is how it is *read*. Keeping them apart
 * is what stops a change to the layout from changing the file format, which is
 * the sort of coupling that is invisible until an export stops round-tripping.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  DISPLAY_SECTIONS,
  SECTIONS,
  cardBody,
  cardId,
  cardsIn,
  compose,
  copyFromMaster,
  moveAllNextTo,
  moveCard,
  serializeDay,
  readDayContent,
} from '../src/crdt';
import { addDays } from '../src/lib/date';
import { harness, TODAY, type Harness } from './workspace';

let context: Harness;
afterEach(() => context?.destroy());

const bodies = (test: Harness, section: 'next' | 'scheduled' | 'done', date = TODAY): string[] =>
  cardsIn(test.store.doc, date, section).map(cardBody);

describe('the reading order', () => {
  it('is Next, then Done, then Scheduled', () => {
    expect(DISPLAY_SECTIONS).toEqual(['next', 'done', 'scheduled']);
  });

  it('is not the storage order, and cannot become it by accident', () => {
    expect(SECTIONS).toEqual(['next', 'scheduled', 'done']);
    expect([...DISPLAY_SECTIONS].sort()).toEqual([...SECTIONS].sort());
  });

  it('leaves the file format alone', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'next' }, 'n');
    compose(context.me, { date: TODAY, section: 'scheduled' }, 's');
    compose(context.me, { date: TODAY, section: 'done' }, 'd');

    const headings = serializeDay(readDayContent(context.store.doc, TODAY))
      .split('\n')
      .filter((line) => line.startsWith('## '));
    expect(headings).toEqual(['## Next', '## Scheduled', '## Done']);
  });
});

describe('Done reads newest-first', () => {
  it('puts a composed card on top', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'eye exam');
    compose(context.me, { date: TODAY, section: 'done' }, 'breakfast');
    compose(context.me, { date: TODAY, section: 'done' }, 'go for a run');

    expect(bodies(context, 'done')).toEqual(['go for a run', 'breakfast', 'eye exam']);
  });

  it('puts a card completed from Next on top', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'already finished');
    compose(context.me, { date: TODAY, section: 'next' }, 'cook potatoes');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'next')[0]!);

    moveCard(context.me, { date: TODAY, section: 'next' }, id, { date: TODAY, section: 'done' });

    expect(bodies(context, 'done')).toEqual(['cook potatoes', 'already finished']);
  });

  it('keeps a multi-line copy from master in the order it was written', async () => {
    context = await harness();
    copyFromMaster(context.me, { date: TODAY, section: 'done' }, ['first', 'second', 'third']);
    // Each line lands on top of the one before, so the run as a whole reads the
    // way it did in master, with the last line most recent.
    expect(bodies(context, 'done')).toEqual(['third', 'second', 'first']);
  });

  it('holds for a bulk move as well', async () => {
    context = await harness();
    const yesterday = addDays(TODAY, -1);
    const past = { ...context.me, today: yesterday };
    compose(past, { date: yesterday, section: 'next' }, 'two');
    compose(past, { date: yesterday, section: 'next' }, 'one');
    compose(context.me, { date: TODAY, section: 'done' }, 'today already');

    moveAllNextTo(context.system, yesterday, { date: TODAY, section: 'done' });

    expect(bodies(context, 'done')).toEqual(['two', 'one', 'today already']);
  });
});

describe('all sections take newest arrivals first', () => {
  it('prepends to Next', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'next' }, 'cook potatoes');
    compose(context.me, { date: TODAY, section: 'next' }, 'fold laundry');
    expect(bodies(context, 'next')).toEqual(['fold laundry', 'cook potatoes']);
  });

  it('prepends to Scheduled', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'scheduled' }, 'first');
    compose(context.me, { date: TODAY, section: 'scheduled' }, 'second');
    expect(bodies(context, 'scheduled')).toEqual(['second', 'first']);
  });
});
