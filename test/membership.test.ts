/**
 * Card membership invariants: registry, locations, and collection arrays must
 * agree. `cardsIn` is the triple intersection; repair heals skew where the
 * document supplies evidence and retains unplaced cards for recovery.
 */

import { describe, expect, it } from 'vitest';
import {
  Y,
  cardAt,
  cardBody,
  cardId,
  cardLocation,
  cardLocationsMap,
  cardMembershipIssues,
  cardsIn,
  cardsMap,
  collectionOf,
  compose,
  dayAt,
  ensureDay,
  moveCard,
  newCard,
  orphanCards,
  registerCard,
  removeCard,
  repairCardMemberships,
  setCardLocation,
  type Section,
  type Workspace,
} from '../src/crdt';

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

const sync = (from: Y.Doc, to: Y.Doc): void => Y.applyUpdate(to, Y.encodeStateAsUpdate(from));

const exchange = (a: Y.Doc, b: Y.Doc, runA: () => void, runB: () => void): void => {
  const updatesA: Uint8Array[] = [];
  const updatesB: Uint8Array[] = [];
  const onA = (update: Uint8Array) => updatesA.push(update);
  const onB = (update: Uint8Array) => updatesB.push(update);
  a.on('update', onA);
  b.on('update', onB);
  runA();
  runB();
  a.off('update', onA);
  b.off('update', onB);
  for (const update of updatesA) Y.applyUpdate(b, update);
  for (const update of updatesB) Y.applyUpdate(a, update);
  sync(a, b);
  sync(b, a);
};

/** Visible ids must equal registry ∩ locations ∩ matching arrays. */
const visibleIds = (doc: Y.Doc): string[] =>
  SECTIONS.flatMap((section) => cardsIn(doc, TODAY, section).map(cardId)).sort();

const intersectionIds = (doc: Y.Doc): string[] => {
  const ids: string[] = [];
  for (const [id] of cardsMap(doc).entries()) {
    const location = cardLocation(doc, id);
    if (!location || location.date !== TODAY) continue;
    const collection = collectionOf(dayAt(doc, location.date), location.section);
    if (!collection?.toArray().includes(id)) continue;
    ids.push(id);
  }
  return ids.sort();
};

const expectMembershipSound = (doc: Y.Doc, systemOrigin: unknown): void => {
  repairCardMemberships(doc, systemOrigin);
  expect(cardMembershipIssues(doc)).toEqual([]);
  expect(visibleIds(doc)).toEqual(intersectionIds(doc));
};

describe('card membership repair', () => {
  it('restores location from array evidence for a locationless card', () => {
    const workspace = replica('a');
    compose(workspace, { date: TODAY, section: 'next' }, 'visible once healed');
    const id = cardId(cardsIn(workspace.doc, TODAY, 'next')[0]!);

    workspace.doc.transact(() => setCardLocation(workspace.doc, id, null), workspace.systemOrigin);
    expect(
      cardMembershipIssues(workspace.doc).some((issue) => issue.kind === 'card-without-location'),
    ).toBe(true);
    expect(orphanCards(workspace.doc)).toEqual([]);
    expect(cardsIn(workspace.doc, TODAY, 'next')).toEqual([]);

    expect(repairCardMemberships(workspace.doc, workspace.systemOrigin)).toBeGreaterThan(0);
    expect(cardLocation(workspace.doc, id)).toEqual({ date: TODAY, section: 'next' });
    expect(cardsIn(workspace.doc, TODAY, 'next').map(cardBody)).toEqual(['visible once healed']);
    expect(cardMembershipIssues(workspace.doc)).toEqual([]);

    workspace.destroy();
  });

  it('retains a locationless card with no array evidence for recovery', () => {
    const workspace = replica('a');
    const id = 'orphan1';
    workspace.doc.transact(() => {
      const card = newCard('orphaned forever', workspace.author, { id });
      cardsMap(workspace.doc).set(id, card);
    }, workspace.systemOrigin);

    expect(cardAt(workspace.doc, id)).toBeDefined();
    expect(cardMembershipIssues(workspace.doc)).toEqual([{ kind: 'card-without-location', id }]);

    expect(repairCardMemberships(workspace.doc, workspace.systemOrigin)).toBe(0);
    expect(orphanCards(workspace.doc).map(({ card }) => cardBody(card))).toEqual([
      'orphaned forever',
    ]);
    expect(cardAt(workspace.doc, id)).toBeDefined();
    expect(cardMembershipIssues(workspace.doc)).toEqual([{ kind: 'card-without-location', id }]);

    workspace.destroy();
  });

  it('drops locations and array leftovers when the card is gone', () => {
    const workspace = replica('a');
    compose(workspace, { date: TODAY, section: 'done' }, 'ghost');
    const id = cardId(cardsIn(workspace.doc, TODAY, 'done')[0]!);

    workspace.doc.transact(() => {
      cardsMap(workspace.doc).delete(id);
    }, workspace.systemOrigin);

    expect(
      cardMembershipIssues(workspace.doc).some((issue) => issue.kind === 'location-without-card'),
    ).toBe(true);

    repairCardMemberships(workspace.doc, workspace.systemOrigin);
    expect(cardLocationsMap(workspace.doc).has(id)).toBe(false);
    expect(collectionOf(dayAt(workspace.doc, TODAY), 'done')?.toArray() ?? []).not.toContain(id);
    expect(cardMembershipIssues(workspace.doc)).toEqual([]);

    workspace.destroy();
  });

  it('re-inserts a located card that is missing from its collection array', () => {
    const workspace = replica('a');
    compose(workspace, { date: TODAY, section: 'scheduled' }, 'missing from array');
    const id = cardId(cardsIn(workspace.doc, TODAY, 'scheduled')[0]!);
    const collection = collectionOf(dayAt(workspace.doc, TODAY), 'scheduled')!;
    workspace.doc.transact(() => {
      const index = collection.toArray().indexOf(id);
      collection.delete(index, 1);
    }, workspace.systemOrigin);

    expect(cardsIn(workspace.doc, TODAY, 'scheduled')).toEqual([]);
    repairCardMemberships(workspace.doc, workspace.systemOrigin);
    expect(cardsIn(workspace.doc, TODAY, 'scheduled').map(cardBody)).toEqual([
      'missing from array',
    ]);
    expect(cardMembershipIssues(workspace.doc)).toEqual([]);

    workspace.destroy();
  });
});

describe('concurrent remove vs move', () => {
  it('repairs to a sound membership after remove wins the card and move wins the location', () => {
    const a = replica('a');
    const b = replica('b');
    compose(a, { date: TODAY, section: 'next' }, 'contested');
    sync(a.doc, b.doc);
    const id = cardId(cardsIn(a.doc, TODAY, 'next')[0]!);

    exchange(
      a.doc,
      b.doc,
      () => removeCard(a, { date: TODAY, section: 'next' }, id),
      () => moveCard(b, { date: TODAY, section: 'next' }, id, { date: TODAY, section: 'done' }),
    );

    expect(cardAt(a.doc, id)).toBeUndefined();
    expect(cardLocationsMap(a.doc).get(id)).toBe(`${TODAY}:done`);
    expect(collectionOf(dayAt(a.doc, TODAY), 'done')?.toArray()).toContain(id);

    expectMembershipSound(a.doc, a.systemOrigin);
    expectMembershipSound(b.doc, b.systemOrigin);
    expect(cardAt(a.doc, id)).toBeUndefined();
    expect(cardLocationsMap(a.doc).has(id)).toBe(false);
    expect(visibleIds(a.doc)).toEqual([]);

    a.destroy();
    b.destroy();
  });

  it('keeps a moved card visible when remove does not win the registry entry', () => {
    const a = replica('a');
    const b = replica('b');
    compose(a, { date: TODAY, section: 'next' }, 'survives');
    sync(a.doc, b.doc);
    const id = cardId(cardsIn(a.doc, TODAY, 'next')[0]!);

    // Location cleared on one side while the other moves — card remains.
    exchange(
      a.doc,
      b.doc,
      () =>
        a.doc.transact(() => {
          setCardLocation(a.doc, id, null);
          const next = collectionOf(dayAt(a.doc, TODAY), 'next');
          if (!next) return;
          const index = next.toArray().indexOf(id);
          if (index >= 0) next.delete(index, 1);
        }, a.origin),
      () =>
        moveCard(b, { date: TODAY, section: 'next' }, id, { date: TODAY, section: 'scheduled' }),
    );

    expectMembershipSound(a.doc, a.systemOrigin);
    expect(cardAt(a.doc, id)).toBeDefined();
    expect(cardLocation(a.doc, id)).toEqual({ date: TODAY, section: 'scheduled' });
    expect(cardsIn(a.doc, TODAY, 'scheduled').map(cardBody)).toEqual(['survives']);

    a.destroy();
    b.destroy();
  });
});

describe('dogfood membership recovery', () => {
  it('flags the orphan-card shape found in dogfood before repair', () => {
    const workspace = replica('a');
    ensureDay(workspace.doc, workspace.systemOrigin, TODAY);
    workspace.doc.transact(() => {
      registerCard(workspace.doc, 'mynkan', newCard('Test', workspace.author, { id: 'mynkan' }), {
        date: TODAY,
        section: 'next',
      });
      collectionOf(dayAt(workspace.doc, TODAY), 'next')!.push(['mynkan']);
      // Dogfood shape: registry entry survives, location and array membership do not.
      cardsMap(workspace.doc).set(
        'hlhtu5',
        newCard('PAV - Send out reminder emails', workspace.author, { id: 'hlhtu5' }),
      );
      setCardLocation(workspace.doc, 'mynkan', null);
      collectionOf(dayAt(workspace.doc, TODAY), 'next')!.delete(0, 1);
    }, workspace.systemOrigin);

    const kinds = cardMembershipIssues(workspace.doc)
      .map((issue) => issue.kind)
      .sort();
    expect(kinds).toEqual(['card-without-location', 'card-without-location']);

    repairCardMemberships(workspace.doc, workspace.systemOrigin);
    expect(
      cardMembershipIssues(workspace.doc)
        .map((issue) => issue.kind)
        .sort(),
    ).toEqual(['card-without-location', 'card-without-location']);
    expect(
      orphanCards(workspace.doc)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(['hlhtu5', 'mynkan']);
    expect(cardAt(workspace.doc, 'hlhtu5')).toBeDefined();
    expect(cardAt(workspace.doc, 'mynkan')).toBeDefined();

    workspace.destroy();
  });
});
