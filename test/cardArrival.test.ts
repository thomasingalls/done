import { afterEach, expect, it } from 'vitest';
import {
  cardBody,
  cardId,
  cardText,
  cardsIn,
  compose,
  moveCard,
  reorderCard,
  transact,
  type Section,
} from '../src/crdt';
import { harness, TODAY, type Harness } from './workspace';

let context: Harness | undefined;
afterEach(() => context?.destroy());

const bodies = (section: Section) => cardsIn(context!.store.doc, TODAY, section).map(cardBody);

it.each(['next', 'scheduled', 'done'] as const)(
  '%s places new arrivals first without changing the stored card fields',
  async (section) => {
    context = await harness();
    const to = { date: TODAY, section };
    expect(compose(context.me, to, 'earlier')).toBe(true);
    const earlier = cardsIn(context.store.doc, TODAY, section)[0]!;
    const fields = earlier.toJSON();
    expect(compose(context.me, to, 'latest')).toBe(true);
    expect(bodies(section)).toEqual(['latest', 'earlier']);
    expect(earlier.toJSON()).toEqual(fields);
  },
);

it('Next → Later prepends the same multiline card and preserves the manually ordered tail', async () => {
  context = await harness();
  const scheduled = { date: TODAY, section: 'scheduled' as const };
  compose(context.me, scheduled, 'older');
  compose(context.me, scheduled, 'newer');
  const newer = cardsIn(context.store.doc, TODAY, 'scheduled').find(
    (card) => cardBody(card) === 'newer',
  )!;
  reorderCard(context.me, scheduled, cardId(newer), 0);
  expect(bodies('scheduled')).toEqual(['newer', 'older']);
  compose(context.me, { date: TODAY, section: 'next' }, 'Continue the project\n- Keep this detail');
  const source = cardsIn(context.store.doc, TODAY, 'next')[0]!;
  const id = cardId(source);
  const fields = source.toJSON();
  expect(moveCard(context.me, { date: TODAY, section: 'next' }, id, scheduled)).toBe(true);
  expect(bodies('scheduled')).toEqual([
    'Continue the project\n- Keep this detail',
    'newer',
    'older',
  ]);
  expect(cardId(cardsIn(context.store.doc, TODAY, 'scheduled')[0]!)).toBe(id);
  expect(source.toJSON()).toEqual(fields);
  expect(bodies('next')).toEqual([]);
});

it('explicit placement and later text edits retain user order rather than sorting by time', async () => {
  context = await harness();
  const scheduled = { date: TODAY, section: 'scheduled' as const };
  compose(context.me, scheduled, 'first');
  compose(context.me, scheduled, 'second');
  const first = cardsIn(context.store.doc, TODAY, 'scheduled').find(
    (card) => cardBody(card) === 'first',
  )!;
  const second = cardsIn(context.store.doc, TODAY, 'scheduled').find(
    (card) => cardBody(card) === 'second',
  )!;
  moveCard(context.me, scheduled, cardId(first), scheduled, 0);
  expect(bodies('scheduled')).toEqual(['first', 'second']);
  transact(context.store.doc, context.me.origin, () => cardText(second).insert(0, 'edited '));
  expect(bodies('scheduled')).toEqual(['first', 'edited second']);
  expect(reorderCard(context.me, scheduled, cardId(first), 1)).toBe(true);
  expect(bodies('scheduled')).toEqual(['edited second', 'first']);
});
