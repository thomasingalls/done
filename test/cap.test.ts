/**
 * The three-item cap, on one device and across two (PRD §3, TRD §11).
 *
 * The cap is a rule about **adding**. Every write path refuses a fourth card —
 * paste, multi-line copy, drag, split, undo — at the point of the mistake, and
 * that is the first half of this file.
 *
 * The second half is the case no write path can refuse, and it is where the
 * rule stops being a number the day is held to. Two devices each adding a third
 * card while apart are both inside the cap at the moment they write, and a
 * relay that holds no authority has nowhere to reject either (TRD §10.6). The
 * merge shows six, and **all six are kept**: they are six things the user
 * wrote, on two devices that were each obeying the rule, and relocating three
 * of them would mean overruling one device on behalf of the other. What does
 * not soften is the rule itself — an expanded Next takes nothing new until the
 * user has moved it back under three, one card at a time, to Scheduled.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  NEXT_CAP,
  Y,
  cardBody,
  cardsIn,
  compose,
  copyFromMaster,
  countIn,
  moveCard,
  newCard,
  registerCard,
  cardId,
  splitCard,
} from '../src/crdt';
import { harness, settle, TODAY, type Harness } from './workspace';

let context: Harness;
afterEach(() => context?.destroy());

const fillNext = (test: Harness): void => {
  for (let index = 0; index < NEXT_CAP; index++) {
    compose(test.me, { date: TODAY, section: 'next' }, `item ${index}`);
  }
};

const insertConcurrent = (doc: Y.Doc, id: string, body: string): void => {
  const next = (doc.getMap('days').get(TODAY) as Y.Map<unknown>).get('next') as Y.Array<string>;
  const card = newCard(body, 'elsewhere', { id });
  doc.transact(
    () => {
      registerCard(doc, id, card, { date: TODAY, section: 'next' });
      next.insert(next.length, [id]);
    },
    { actor: 'remote' },
  );
};

describe('the cap refuses at the write path', () => {
  it('takes three and no more', async () => {
    context = await harness();
    fillNext(context);
    expect(compose(context.me, { date: TODAY, section: 'next' }, 'a fourth')).toBe(false);
    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP);
  });

  it('truncates a multi-line copy from master rather than overflowing', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'next' }, 'already here');

    const copied = copyFromMaster(context.me, { date: TODAY, section: 'next' }, [
      'one',
      'two',
      'three',
      'four',
    ]);

    expect(copied).toBe(2);
    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP);
  });

  it('refuses a move into a full Next', async () => {
    context = await harness();
    fillNext(context);
    compose(context.me, { date: TODAY, section: 'scheduled' }, 'waiting');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'scheduled')[0]!);

    expect(
      moveCard(context.me, { date: TODAY, section: 'scheduled' }, id, {
        date: TODAY,
        section: 'next',
      }),
    ).toBe(false);
    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP);
  });

  it('refuses a split that would make a fourth card', async () => {
    context = await harness();
    fillNext(context);
    const id = cardId(cardsIn(context.store.doc, TODAY, 'next')[0]!);
    expect(splitCard(context.me, { date: TODAY, section: 'next' }, id, 2, 2)).toBeNull();
    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP);
  });
});

describe('the cap stretches where it cannot refuse', () => {
  it('keeps both devices’ Next items when they fill it while apart', async () => {
    context = await harness();
    const phone = context.store.doc;

    compose(context.me, { date: TODAY, section: 'next' }, 'one');
    compose(context.me, { date: TODAY, section: 'next' }, 'two');

    const laptop = new Y.Doc();
    Y.applyUpdate(laptop, Y.encodeStateAsUpdate(phone));

    // Neither device can see the other's third card, and both are legal.
    compose(context.me, { date: TODAY, section: 'next' }, 'phone third');
    insertConcurrent(laptop, 'lap001', 'laptop third');

    Y.applyUpdate(phone, Y.encodeStateAsUpdate(laptop));
    await settle();

    // Four in Next, and nothing was moved anywhere to get back to three.
    expect(cardsIn(phone, TODAY, 'next').map(cardBody)).toHaveLength(NEXT_CAP + 1);
    expect(new Set(cardsIn(phone, TODAY, 'next').map(cardBody))).toEqual(
      new Set(['one', 'two', 'phone third', 'laptop third']),
    );
    expect(cardsIn(phone, TODAY, 'scheduled')).toHaveLength(0);

    laptop.destroy();
  });

  it('still refuses to add while Next is over the cap', async () => {
    context = await harness();
    fillNext(context);
    insertConcurrent(context.store.doc, 'over01', 'a fourth from elsewhere');
    await settle();

    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP + 1);
    expect(compose(context.me, { date: TODAY, section: 'next' }, 'a fifth')).toBe(false);
    expect(copyFromMaster(context.me, { date: TODAY, section: 'next' }, ['also no'])).toBe(0);

    const id = cardId(cardsIn(context.store.doc, TODAY, 'next')[0]!);
    expect(splitCard(context.me, { date: TODAY, section: 'next' }, id, 2, 2)).toBeNull();
    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP + 1);
  });

  it('takes a new card again once the user has moved Next back under three', async () => {
    context = await harness();
    fillNext(context);
    insertConcurrent(context.store.doc, 'over01', 'a fourth from elsewhere');
    await settle();

    // The way out is the ordinary one: move items to Scheduled, one gesture
    // each, until there is room. Two, because at three there is still none.
    const [first, second] = cardsIn(context.store.doc, TODAY, 'next');
    for (const card of [first, second]) {
      expect(
        moveCard(context.me, { date: TODAY, section: 'next' }, cardId(card!), {
          date: TODAY,
          section: 'scheduled',
        }),
      ).toBe(true);
    }
    await settle();

    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP - 1);
    expect(compose(context.me, { date: TODAY, section: 'next' }, 'room for this')).toBe(true);
    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP);
    expect(compose(context.me, { date: TODAY, section: 'next' }, 'but not this')).toBe(false);
  });

  it('leaves the overflow alone rather than making it a system operation to undo', async () => {
    context = await harness();
    fillNext(context);
    insertConcurrent(context.store.doc, 'over01', 'from elsewhere');
    await settle();

    // Nothing ran on the app's behalf, so undo reaches straight past the merge
    // to the human's own last write.
    context.store.undo.undo();
    expect(cardsIn(context.store.doc, TODAY, 'next').map(cardBody)).toEqual([
      'item 1',
      'item 0',
      'from elsewhere',
    ]);
    expect(cardsIn(context.store.doc, TODAY, 'scheduled')).toHaveLength(0);
  });
});
