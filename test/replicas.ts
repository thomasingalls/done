/**
 * A relay and its replicas, for the property tests (TRD §11).
 *
 * `convergence.test.ts` exchanges updates between two documents and
 * `multiDevice.test.ts` puts two stores either side of a hub, both against
 * hand-written sequences. This module is the same shape generalised so that
 * *fast-check* can write the sequences instead: N stores, one relay, and the
 * invariants a converged network has to satisfy. The language those sequences
 * are written in lives in `operations.ts`.
 *
 * Three decisions are worth stating, because they are what makes the generated
 * cases mean anything:
 *
 * - **Whole stores, not bare documents.** `openStore` is what wires up the
 *   membership repair and the undo manager, and those are exactly the
 *   mechanisms that concurrency breaks. A property test against bare `Y.Doc`s
 *   would test Yjs rather than this app.
 * - **A hub, not pairwise exchange.** Devices only ever talk through the relay,
 *   which holds a replica of its own and forwards what it is given. Anything
 *   that converges pairwise but not through a hub passes the wrong test.
 * - **Every run is replayable.** Card ids and client ids both come from the
 *   property's seed, so a counterexample `fast-check` prints can be run again
 *   and stepped through rather than admired.
 */

import { setImmediate } from 'node:timers';
import {
  Y,
  cardId,
  cardBody,
  cardsIn,
  cardsMap,
  cardLocation,
  collectionOf,
  dayAt,
  listDays,
  openStore,
  SECTIONS,
  type Section,
  type Store,
  type Workspace,
} from '../src/crdt';
import { addDays, type ISODate } from '../src/lib/date';
import { prng } from './random';

export const TODAY: ISODate = '2026-08-05';

/* -------------------------------------------------------------------------- */
/* Determinism                                                                 */

/**
 * A counterexample nobody can replay is a bug report without a repro, and a
 * network of replicas draws on randomness twice: `newId` for card ids, and
 * `Y.Doc`'s client id, which is what breaks every tie Yjs has to break. Both
 * are pinned to the property's own seed here, so a failing case comes back
 * identically from the seed `fast-check` prints.
 *
 * Only the id generator is patched globally; client ids are assigned by
 * constructing the document rather than by intercepting anything, which is why
 * `openStore` takes one.
 */
let entropy: (() => number) | null = null;

const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);

Object.defineProperty(globalThis.crypto, 'getRandomValues', {
  configurable: true,
  writable: true,
  value: <T extends ArrayBufferView>(array: T): T => {
    const source = entropy;
    if (!source) return realGetRandomValues(array as never);
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(source() * 256);
    return array;
  },
});

export const seedEntropy = (seed: number): void => {
  entropy = prng(seed);
};

export const clearEntropy = (): void => {
  entropy = null;
};

/**
 * Three consecutive writable days. The freeze lands at three days (PRD §6), so
 * this window is entirely writable on every replica and the properties below
 * are about concurrency rather than about the freeze — which `freeze.test.ts`
 * already owns.
 */
export const DAYS: readonly ISODate[] = [addDays(TODAY, -2), addDays(TODAY, -1), TODAY];

/* -------------------------------------------------------------------------- */
/* Replicas                                                                    */

export interface Replica {
  name: string;
  store: Store;
  workspace: Workspace;
}

const workspaceFor = (store: Store): Workspace => ({
  doc: store.doc,
  origin: store.actor.origin,
  systemOrigin: store.actor.systemOrigin,
  author: store.actor.id,
  today: TODAY,
  undo: store.undo,
});

/**
 * A store with its own actor and device identity. Actor identity lives in
 * localStorage and does not sync (TRD §4.8), so two replicas sharing the test
 * process's storage would be the same person on the same device — which is the
 * one configuration none of these properties are about.
 */
export const openReplica = async (name: string, clientId: number): Promise<Replica> => {
  localStorage.clear();
  const doc = new Y.Doc();
  // Yjs breaks every concurrent tie by client id, so the fleet's client ids are
  // the other half of a reproducible case. Assigned before the document holds
  // anything, which is the only point at which it can be.
  doc.clientID = clientId;
  const store = await openStore({ persist: false, doc });
  return { name, store, workspace: workspaceFor(store) };
};

/**
 * The membership repair runs on a microtask, and its own writes can queue
 * another. A macrotask boundary drains the whole cascade rather than one link
 * of it, which `await Promise.resolve()` does not. These Node unit fixtures use
 * the check queue so every generated step need not wait for a timer threshold.
 */
export const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/* -------------------------------------------------------------------------- */
/* The relay                                                                   */

/**
 * The relay as `relay/src/server.ts` implements it: a document that applies
 * what a connection sends and broadcasts the result to the others. A
 * disconnected client is not forwarded to; reconnecting exchanges state vectors
 * both ways, which is what y-websocket's sync step 1/2 does and the only reason
 * a device that has been away catches up.
 */
export interface Network {
  relay: Y.Doc;
  attach: (doc: Y.Doc) => void;
  connect: (doc: Y.Doc) => void;
  disconnect: (doc: Y.Doc) => void;
  isOnline: (doc: Y.Doc) => boolean;
  destroy: () => void;
}

export const relayNetwork = (): Network => {
  const relay = new Y.Doc();
  const nodes = new Map<Y.Doc, { online: boolean }>();
  const RELAY = Symbol('relay');

  relay.on('update', (update: Uint8Array, origin: unknown) => {
    for (const [doc, node] of nodes) {
      if (!node.online || doc === origin) continue;
      Y.applyUpdate(doc, update, RELAY);
    }
  });

  return {
    relay,
    attach: (doc) => {
      nodes.set(doc, { online: false });
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin === RELAY || !nodes.get(doc)?.online) return;
        Y.applyUpdate(relay, update, doc);
      });
    },
    connect: (doc) => {
      const node = nodes.get(doc);
      if (!node || node.online) return;
      node.online = true;
      Y.applyUpdate(relay, Y.encodeStateAsUpdate(doc, Y.encodeStateVector(relay)), doc);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(relay, Y.encodeStateVector(doc)), RELAY);
    },
    disconnect: (doc) => {
      const node = nodes.get(doc);
      if (node) node.online = false;
    },
    isOnline: (doc) => nodes.get(doc)?.online ?? false,
    destroy: () => relay.destroy(),
  };
};

export interface Fleet {
  replicas: Replica[];
  net: Network;
  /**
   * Every update any replica emitted, in the order this run produced them.
   * Applying an update twice is a no-op in Yjs, so the log is deliberately not
   * deduplicated — it is a recording of the wire, and a permutation of it is a
   * different delivery order rather than a different document.
   */
  updates: Uint8Array[];
  /**
   * Reconnects everybody and keeps doing it until a round changes nothing
   * anywhere, returning how many rounds that took. The count is part of the
   * result: a repair that provokes a repair on the far side would show up as a
   * network that takes several rounds to go quiet, and one that never does
   * would show up as the bound.
   */
  converge: (maxRounds?: number) => Promise<number>;
  destroy: () => void;
}

/**
 * `seed` fixes both the card ids and the client ids, so the fleet a property
 * builds from a given seed is the same fleet every time. Client ids are drawn
 * rather than numbered 1, 2, 3 because their *order* decides which side wins a
 * conflict, and a fixed order would test only one of the two directions.
 */
export const openFleet = async (size: number, seed = 1): Promise<Fleet> => {
  seedEntropy(seed);

  const clientIds = new Set<number>();
  const draw = prng(seed ^ 0x5bf03635);
  while (clientIds.size < size) clientIds.add(1 + Math.floor(draw() * 0xffff_ff));

  const replicas: Replica[] = [];
  let index = 0;
  for (const clientId of clientIds) {
    replicas.push(await openReplica(String.fromCodePoint(97 + index), clientId));
    index++;
  }

  const net = relayNetwork();
  const updates: Uint8Array[] = [];
  for (const replica of replicas) {
    net.attach(replica.store.doc);
    replica.store.doc.on('update', (update: Uint8Array) => updates.push(update));
    net.connect(replica.store.doc);
  }

  return {
    replicas,
    net,
    updates,
    converge: async (maxRounds = 8) => {
      // A state vector says everything about what a document has integrated, so
      // a round in which no vector anywhere moved is a fixpoint — including the
      // repairs, which are ordinary updates like any other.
      const fingerprint = (): string =>
        [net.relay, ...replicas.map((replica) => replica.store.doc)]
          .map((doc) => [...Y.encodeStateVector(doc)].join('.'))
          .join('|');

      for (let round = 1; round <= maxRounds; round++) {
        const before = fingerprint();
        // Disconnect first: a link that is already up exchanges nothing, and
        // the point of a round is to hand each side what the other has.
        for (const replica of replicas) {
          net.disconnect(replica.store.doc);
          net.connect(replica.store.doc);
        }
        await settle();
        if (fingerprint() === before) return round;
      }
      return maxRounds;
    },
    destroy: () => {
      clearEntropy();
      net.destroy();
      for (const replica of replicas) replica.store.destroy();
    },
  };
};

/* -------------------------------------------------------------------------- */
/* What a converged network has to look like                                   */

export interface Placement {
  date: ISODate;
  section: Section;
  id: string;
  body: string;
}

/** Every card the app would draw, in the order it would draw them. */
export const placements = (doc: Y.Doc): Placement[] =>
  listDays(doc).flatMap((date) =>
    SECTIONS.flatMap((section) =>
      cardsIn(doc, date, section).map((card) => ({
        date,
        section,
        id: cardId(card),
        body: cardBody(card),
      })),
    ),
  );

export const masterText = (replica: Replica): string => replica.store.master.toString();

/** Every card id the document holds, whether or not anything shows it. */
export const cardIdsOf = (doc: Y.Doc): Set<string> => new Set(cardsMap(doc).keys());

/**
 * The raw arrays, before `cardsIn` hides anything. The visible state can be
 * identical on two replicas while the stored membership underneath is a mess of
 * duplicates and dangling ids, and that mess is what `repairCardMemberships`
 * exists to clear — so the properties check it directly rather than through the
 * accessor that papers over it.
 */
export const storedMembership = (doc: Y.Doc): string[] =>
  listDays(doc).flatMap((date) =>
    SECTIONS.flatMap((section) => {
      const collection = collectionOf(dayAt(doc, date), section);
      return (collection?.toArray() ?? []).map((id) => `${date}:${section}:${id}`);
    }),
  );

/**
 * The ways a document can be wrong. Named individually because the properties
 * below do not all claim all of them: which defects a given sequence can and
 * cannot produce is the result, and a property that asserted "nothing is wrong"
 * would state it less precisely than one that names what it rules out.
 *
 * A Next holding more than three cards is deliberately **not** here. It is a
 * legal converged state (PRD §3): the cap refuses a fourth *addition*, and two
 * devices that each filled Next while apart have both added legally. The
 * property that replaces it is that nothing gets moved or dropped to tidy it up
 * — see "keep every device's Next items" in `syncProperties.test.ts`.
 */
export type Defect =
  /** One id twice in the same collection — a repair that did not run. */
  | 'duplicate membership'
  /** A collection holds an id whose canonical location says somewhere else. */
  | 'stale membership'
  /** A collection holds an id with no card behind it. */
  | 'dangling id'
  /** A registered card that no collection shows: written, kept, unreachable. */
  | 'orphaned card';

export const ALL_DEFECTS: readonly Defect[] = [
  'duplicate membership',
  'stale membership',
  'dangling id',
  'orphaned card',
];

export interface Violation {
  defect: Defect;
  detail: string;
}

/**
 * Everything wrong with one document once its repairs have run. Returned as a
 * list rather than asserted so a failing property reports every way the state
 * is broken at once, and filtered by `defects` so a property can claim exactly
 * what it has evidence for.
 */
export const violations = (doc: Y.Doc, defects: readonly Defect[] = ALL_DEFECTS): Violation[] => {
  const found: Violation[] = [];
  const report = (defect: Defect, detail: string): void => {
    if (defects.includes(defect)) found.push({ defect, detail });
  };

  for (const date of listDays(doc)) {
    for (const section of SECTIONS) {
      const collection = collectionOf(dayAt(doc, date), section);
      if (!collection) continue;
      const entries = collection.toArray();

      if (new Set(entries).size !== entries.length) {
        report('duplicate membership', `${date}:${section} holds ${entries.join(', ')}`);
      }

      for (const id of entries) {
        if (!cardsMap(doc).has(id)) {
          report('dangling id', `${date}:${section} holds ${id}, which has no card`);
          continue;
        }
        const location = cardLocation(doc, id);
        if (location?.date !== date || location.section !== section) {
          report(
            'stale membership',
            `${date}:${section} holds ${id}, whose location is ${JSON.stringify(location)}`,
          );
        }
      }
    }
  }

  const shown = new Set(placements(doc).map((placement) => placement.id));
  for (const [id] of cardsMap(doc).entries()) {
    if (shown.has(id)) continue;
    report(
      'orphaned card',
      `${id} is registered at ${JSON.stringify(cardLocation(doc, id))} but nothing shows it`,
    );
  }

  return found;
};
