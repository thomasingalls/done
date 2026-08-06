/**
 * TRD §11, convergence: "random concurrent edit sequences against two replicas,
 * applied in both orders, assert identical final state. **Must include
 * concurrent card moves** between collections, where array semantics are least
 * obvious."
 *
 * Collections contain references to canonical cards. A move changes the card's
 * location and the ordering arrays in one transaction; concurrent location
 * assignments converge to one Y.Map value, so the item has one visible home and
 * concurrent edits stay attached to its one canonical Y.Text.
 */

import { describe, expect, it } from 'vitest';
import { Y, cardBody, cardId, cardsIn, compose, moveCard, type Section } from '../src/crdt';
import type { Workspace } from '../src/crdt';
import { prng } from './random';

const TODAY = '2026-08-05';
const SECTIONS: Section[] = ['next', 'scheduled', 'done'];

const origin = (actor: string) => Object.freeze({ actor, kind: 'human' as const, device: actor });

const replica = (name: string): Workspace & { destroy: () => void } => {
  const doc = new Y.Doc();
  return {
    doc,
    origin: origin(name),
    systemOrigin: Object.freeze({ actor: 'system', kind: 'system' as const, device: name }),
    author: name,
    today: TODAY,
    destroy: () => doc.destroy(),
  };
};

/** Everything in the day, as `section:body` pairs — the state both sides must agree on. */
const snapshot = (doc: Y.Doc): string[] =>
  SECTIONS.flatMap((section) =>
    cardsIn(doc, TODAY, section).map((card) => `${section}:${cardId(card)}:${cardBody(card)}`),
  );

const sync = (from: Y.Doc, to: Y.Doc): void => Y.applyUpdate(to, Y.encodeStateAsUpdate(from));

describe('concurrent card moves', () => {
  it('converges when both replicas move the same card to different places', () => {
    const a = replica('a');
    const b = replica('b');

    compose(a, { date: TODAY, section: 'next' }, 'draft the plan');
    sync(a.doc, b.doc);

    const id = cardId(cardsIn(a.doc, TODAY, 'next')[0]!);
    moveCard(a, { date: TODAY, section: 'next' }, id, { date: TODAY, section: 'done' });
    moveCard(b, { date: TODAY, section: 'next' }, id, { date: TODAY, section: 'scheduled' });

    sync(a.doc, b.doc);
    sync(b.doc, a.doc);
    sync(a.doc, b.doc);

    expect(snapshot(a.doc)).toEqual(snapshot(b.doc));
    expect(cardsIn(a.doc, TODAY, 'next')).toEqual([]);
    const visible = SECTIONS.flatMap((section) => cardsIn(a.doc, TODAY, section));
    expect(visible).toHaveLength(1);
    expect(cardId(visible[0]!)).toBe(id);

    a.destroy();
    b.destroy();
  });

  it('converges when a card is moved on one side and edited on the other', () => {
    const a = replica('a');
    const b = replica('b');

    compose(a, { date: TODAY, section: 'next' }, 'call the dentist');
    sync(a.doc, b.doc);

    const id = cardId(cardsIn(a.doc, TODAY, 'next')[0]!);
    const text = (cardsIn(b.doc, TODAY, 'next')[0] as Y.Map<unknown>).get('text') as Y.Text;
    b.doc.transact(() => text.insert(text.length, ' about the crown'), b.origin);
    moveCard(a, { date: TODAY, section: 'next' }, id, { date: TODAY, section: 'done' });

    sync(a.doc, b.doc);
    sync(b.doc, a.doc);
    sync(a.doc, b.doc);

    expect(snapshot(a.doc)).toEqual(snapshot(b.doc));
    expect(cardsIn(a.doc, TODAY, 'done').map(cardBody)).toEqual([
      'call the dentist about the crown',
    ]);

    a.destroy();
    b.destroy();
  });

  it('converges under random concurrent movement, in either order', () => {
    const replay = (seed: number): void => {
      const a = replica('a');
      const b = replica('b');
      const random = prng(seed);

      for (let index = 0; index < 6; index++) {
        compose(a, { date: TODAY, section: SECTIONS[index % 3] as Section }, `card ${index}`);
      }
      sync(a.doc, b.doc);

      const updatesA: Uint8Array[] = [];
      const updatesB: Uint8Array[] = [];
      a.doc.on('update', (update: Uint8Array) => updatesA.push(update));
      b.doc.on('update', (update: Uint8Array) => updatesB.push(update));

      for (let step = 0; step < 40; step++) {
        const side = random() < 0.5 ? a : b;
        const from = SECTIONS[Math.floor(random() * 3)] as Section;
        const to = SECTIONS[Math.floor(random() * 3)] as Section;
        const cards = cardsIn(side.doc, TODAY, from);
        if (cards.length === 0) continue;
        const card = cards[Math.floor(random() * cards.length)] as Y.Map<unknown>;
        moveCard(side, { date: TODAY, section: from }, cardId(card), { date: TODAY, section: to });
      }

      // Both orders, per §11.
      for (const update of updatesA) Y.applyUpdate(b.doc, update);
      for (const update of [...updatesB].reverse()) Y.applyUpdate(a.doc, update);
      for (const update of updatesA) Y.applyUpdate(b.doc, update);
      for (const update of updatesB) Y.applyUpdate(a.doc, update);

      expect(snapshot(a.doc)).toEqual(snapshot(b.doc));
      const ids = snapshot(a.doc).map((entry) => entry.split(':')[1]);
      expect(new Set(ids).size).toBe(ids.length);

      a.destroy();
      b.destroy();
    };

    for (const seed of [1, 7, 42, 20260805, 999983]) replay(seed);
  });
});

describe('concurrent journals', () => {
  it('keeps both sides of the conflict the architecture exists for', () => {
    const a = replica('a');
    const b = replica('b');

    // The same day's journal, edited on two devices, neither having seen the
    // other. A SQL sync engine resolves this by discarding one of them.
    compose(a, { date: TODAY, section: 'done' }, 'seed');
    sync(a.doc, b.doc);

    const journalOf = (doc: Y.Doc): Y.Text =>
      (doc.getMap('days').get(TODAY) as Y.Map<unknown>).get('journal') as Y.Text;

    a.doc.transact(() => journalOf(a.doc).insert(0, 'Reviewed the deploy\n'), a.origin);
    sync(a.doc, b.doc);

    a.doc.transact(() => journalOf(a.doc).insert(20, 'Called the dentist\n'), a.origin);
    b.doc.transact(() => journalOf(b.doc).insert(20, 'Wrote the migration plan\n'), b.origin);

    sync(a.doc, b.doc);
    sync(b.doc, a.doc);

    const merged = journalOf(a.doc).toString();
    expect(merged).toBe(journalOf(b.doc).toString());
    expect(merged).toContain('Called the dentist');
    expect(merged).toContain('Wrote the migration plan');

    a.destroy();
    b.destroy();
  });
});
