/**
 * Shrinkable histories across two Yjs replicas.
 *
 * Commands interleave user operations with delayed and duplicated update
 * delivery. Once the network quiesces, repair must converge without deleting
 * any card for which no remove command succeeded.
 */

import {
  assert as assertProperty,
  boolean,
  commands as commandSequence,
  constantFrom,
  modelRun,
  nat,
  property,
  record,
  type Command,
} from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  Y,
  cardBody,
  cardId,
  cardLocation,
  cardMembershipIssues,
  cardsIn,
  compose,
  moveCard,
  recoveryCards,
  removeCard,
  repairCardMemberships,
  type Section,
  type Workspace,
} from '../src/crdt';

const TODAY = '2026-08-05';
const SECTIONS: Section[] = ['next', 'scheduled', 'done'];
const REMOTE = Symbol('remote');

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

const sync = (from: Y.Doc, to: Y.Doc): void => {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from), REMOTE);
};

const visibleCards = (doc: Y.Doc) => SECTIONS.flatMap((section) => cardsIn(doc, TODAY, section));

interface NetworkModel {
  removed: Set<string>;
}

interface NetworkReal {
  a: ReturnType<typeof replica>;
  b: ReturnType<typeof replica>;
  initialBodies: Map<string, string>;
  updatesA: Uint8Array[];
  updatesB: Uint8Array[];
}

type Side = 0 | 1;
type Operation = 'move' | 'remove';

interface OperationInput {
  side: Side;
  operation: Operation;
  cardIndex: number;
  targetOffset: number;
}

const operationCommand = (input: OperationInput): Command<NetworkModel, NetworkReal> => ({
  check: () => true,
  run: (model, real) => {
    const workspace = input.side === 0 ? real.a : real.b;
    const cards = visibleCards(workspace.doc);
    if (cards.length === 0) return;
    const card = cards[input.cardIndex % cards.length]!;
    const id = cardId(card);
    const from = cardLocation(workspace.doc, id);
    if (!from) return;

    if (input.operation === 'remove') {
      if (removeCard(workspace, from, id)) model.removed.add(id);
      return;
    }

    const fromIndex = SECTIONS.indexOf(from.section);
    const section = SECTIONS[(fromIndex + 1 + (input.targetOffset % 2)) % SECTIONS.length]!;
    moveCard(workspace, from, id, { date: TODAY, section });
  },
  toString: () =>
    `${input.side === 0 ? 'a' : 'b'}:${input.operation}(card[${input.cardIndex}], +${input.targetOffset})`,
});

interface DeliveryInput {
  side: Side;
  updateIndex: number;
  duplicate: boolean;
}

const deliveryCommand = (input: DeliveryInput): Command<NetworkModel, NetworkReal> => ({
  check: () => true,
  run: (_model, real) => {
    const updates = input.side === 0 ? real.updatesA : real.updatesB;
    if (updates.length === 0) return;
    const target = input.side === 0 ? real.b.doc : real.a.doc;
    const update = updates[input.updateIndex % updates.length]!;
    Y.applyUpdate(target, update, REMOTE);
    if (input.duplicate) Y.applyUpdate(target, update, REMOTE);
  },
  toString: () =>
    `deliver(${input.side === 0 ? 'a→b' : 'b→a'}[${input.updateIndex}]${input.duplicate ? ' twice' : ''})`,
});

const network = (): NetworkReal => {
  const a = replica('a');
  const b = replica('b');
  for (let index = 0; index < 5; index++) {
    compose(a, { date: TODAY, section: SECTIONS[index % SECTIONS.length]! }, `card ${index}`);
  }
  sync(a.doc, b.doc);

  const updatesA: Uint8Array[] = [];
  const updatesB: Uint8Array[] = [];
  a.doc.on('update', (update: Uint8Array, updateOrigin: unknown) => {
    if (updateOrigin === a.origin) updatesA.push(update);
  });
  b.doc.on('update', (update: Uint8Array, updateOrigin: unknown) => {
    if (updateOrigin === b.origin) updatesB.push(update);
  });

  return {
    a,
    b,
    initialBodies: new Map(visibleCards(a.doc).map((card) => [cardId(card), cardBody(card)])),
    updatesA,
    updatesB,
  };
};

const converge = ({ a, b }: NetworkReal): void => {
  sync(a.doc, b.doc);
  sync(b.doc, a.doc);
  sync(a.doc, b.doc);
};

const settleMembership = (real: NetworkReal): void => {
  converge(real);
  for (let round = 0; round < 5; round++) {
    const changes =
      repairCardMemberships(real.a.doc, real.a.systemOrigin) +
      repairCardMemberships(real.b.doc, real.b.systemOrigin);
    converge(real);
    if (changes === 0) return;
  }
  throw new Error('membership repair did not settle within five rounds');
};

const snapshot = (doc: Y.Doc): string[] =>
  SECTIONS.flatMap((section) =>
    cardsIn(doc, TODAY, section).map((card) => `${section}:${cardId(card)}:${cardBody(card)}`),
  );

const operation = record({
  side: constantFrom<Side>(0, 1),
  operation: constantFrom<Operation>('move', 'remove'),
  cardIndex: nat(20),
  targetOffset: nat(20),
}).map((input) => operationCommand(input));

const delivery = record({
  side: constantFrom<Side>(0, 1),
  updateIndex: nat(50),
  duplicate: boolean(),
}).map((input) => deliveryCommand(input));

describe('membership invariants under generated concurrent edits', () => {
  it('converges without losing any card that was not removed', () => {
    assertProperty(
      property(commandSequence([operation, delivery], { maxCommands: 40 }), (commands) => {
        const real = network();
        const model: NetworkModel = { removed: new Set() };
        try {
          modelRun(() => ({ model, real }), commands);
          settleMembership(real);

          expect(cardMembershipIssues(real.a.doc)).toEqual([]);
          expect(cardMembershipIssues(real.b.doc)).toEqual([]);
          expect(recoveryCards(real.a.doc)).toEqual([]);
          expect(recoveryCards(real.b.doc)).toEqual([]);
          expect(snapshot(real.a.doc)).toEqual(snapshot(real.b.doc));

          const surviving = visibleCards(real.a.doc);
          const ids = surviving.map((card) => cardId(card));
          const expected = new Set(
            [...real.initialBodies.keys()].filter((id) => !model.removed.has(id)),
          );
          expect(new Set(ids)).toEqual(expected);
          expect(ids).toHaveLength(expected.size);
          for (const card of surviving) {
            expect(cardBody(card)).toBe(real.initialBodies.get(cardId(card)));
          }

          expect(repairCardMemberships(real.a.doc, real.a.systemOrigin)).toBe(0);
          expect(repairCardMemberships(real.b.doc, real.b.systemOrigin)).toBe(0);
        } finally {
          real.a.destroy();
          real.b.destroy();
        }
      }),
      { numRuns: 100 },
    );
  });
});
