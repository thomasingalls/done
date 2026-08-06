/**
 * TRD §11, cap enforcement: "No sequence — paste, multi-line insert, undo,
 * drag, concurrent insert-from-two-devices — produces four cards in `next`."
 *
 * The first four are refused at the write path, at the point of the mistake.
 * The fifth cannot be: two devices each adding a third card while apart is a
 * legal pair of operations that converges to four, and a relay that holds no
 * authority has nowhere to reject one of them (TRD §10.6). So the cap is also a
 * repair, and this file tests both halves — the refusal and the recovery.
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
  enforceCap,
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

describe('the cap is repaired where it cannot be refused', () => {
  it('survives two devices inserting a third card while apart', async () => {
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

    expect(countIn(phone, TODAY, 'next')).toBe(NEXT_CAP);
    // Nothing is deleted: the overflow lands in Scheduled on the same day.
    const everything = [
      ...cardsIn(phone, TODAY, 'next').map(cardBody),
      ...cardsIn(phone, TODAY, 'scheduled').map(cardBody),
    ];
    expect(everything).toHaveLength(4);
    expect(everything).toContain('laptop third');
    expect(everything).toContain('phone third');

    laptop.destroy();
  });

  it('runs as the system actor, so undo does not step through it', async () => {
    context = await harness();
    fillNext(context);

    // A remote update is the shape this arrives in; forcing it directly is the
    // same thing with fewer moving parts.
    insertConcurrent(context.store.doc, 'over01', 'overflow');

    await settle();
    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP);

    // The repair is the system's work; undo reaches past it to the human's.
    context.store.undo.undo();
    expect(countIn(context.store.doc, TODAY, 'next')).toBe(NEXT_CAP - 1);
    expect(cardsIn(context.store.doc, TODAY, 'scheduled').map(cardBody)).toEqual(['overflow']);
  });

  it('is deterministic, so two replicas repairing separately agree', async () => {
    context = await harness();
    const a = context.store.doc;
    fillNext(context);

    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    insertConcurrent(b, 'extra1', 'extra');

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    await settle();

    const overflow = enforceCap(b, context.store.actor.systemOrigin, TODAY);
    expect(overflow).toBe(1);

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    await settle();

    expect(countIn(a, TODAY, 'next')).toBe(NEXT_CAP);
    expect(cardsIn(a, TODAY, 'next').map(cardBody)).toEqual(
      cardsIn(b, TODAY, 'next').map(cardBody),
    );

    b.destroy();
  });
});
