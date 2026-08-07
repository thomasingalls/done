/**
 * Two devices and a relay (PRD §13 phase 3, TRD §2, §11).
 *
 * The phase's exit criterion is "phone and laptop consistent across a week
 * including offline edits on both". That week is a thing only a real week can
 * establish, but every mechanism it depends on can be pinned down here, and the
 * shape it is pinned down in matters: not two replicas exchanging updates
 * pairwise — `convergence.test.ts` already does that — but two replicas that
 * only ever talk *through a third document*, which is what the relay is.
 *
 * The distinction is not academic. A relay holds a full replica of its own,
 * applies what it is given and forwards it on, and is the only participant that
 * both devices always talk to. Anything that converges pairwise but not through
 * a hub would pass the other file and fail in daily use.
 *
 * The system operations are the interesting ones. The cap repair and compaction
 * are the two things the *app* does to the document without being typed at, and
 * with two devices they run concurrently on both sides of the link.
 */

import { describe, expect, it } from 'vitest';
import {
  Y,
  archiveTextOf,
  cardAuthor,
  cardBody,
  cardsIn,
  compactDay,
  compose,
  listActors,
  openStore,
  readSettings,
  setRolloverHour,
  transact,
  type Store,
  type Workspace,
} from '../src/crdt';
import { settle } from './workspace';

const TODAY = '2026-08-05';

/**
 * The relay, as a document that clients talk to instead of to each other.
 * Modelled on what the real one does (`relay/src/server.ts` →
 * `@y/websocket-server`): apply what a connection sends, broadcast it to the
 * others, and hold the result for whoever connects next.
 */
const hub = () => {
  const relay = new Y.Doc();
  const nodes = new Map<Y.Doc, { online: boolean }>();

  /** The origin the relay's own writes carry, so nothing is echoed back. */
  const RELAY = Symbol('relay');

  relay.on('update', (update: Uint8Array, origin: unknown) => {
    for (const [doc, node] of nodes) {
      if (!node.online || doc === origin) continue;
      Y.applyUpdate(doc, update, RELAY);
    }
  });

  const attach = (doc: Y.Doc): void => {
    nodes.set(doc, { online: false });
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === RELAY || !nodes.get(doc)?.online) return;
      Y.applyUpdate(relay, update, doc);
    });
  };

  return {
    relay,
    attach,

    /** A connection: state vectors both ways, then updates flow as they happen. */
    connect: (doc: Y.Doc): void => {
      const node = nodes.get(doc);
      if (!node) throw new Error('connect() before attach()');
      node.online = true;
      Y.applyUpdate(relay, Y.encodeStateAsUpdate(doc, Y.encodeStateVector(relay)), doc);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(relay, Y.encodeStateVector(doc)), RELAY);
    },

    disconnect: (doc: Y.Doc): void => {
      const node = nodes.get(doc);
      if (node) node.online = false;
    },

    destroy: (): void => relay.destroy(),
  };
};

const workspaceFor = (store: Store, today: string = TODAY): Workspace => ({
  doc: store.doc,
  origin: store.actor.origin,
  systemOrigin: store.actor.systemOrigin,
  author: store.actor.id,
  today,
  undo: store.undo,
});

/** Two devices, one person, one relay. */
const devices = async (): Promise<{
  phone: Store;
  laptop: Store;
  net: ReturnType<typeof hub>;
  destroy: () => void;
}> => {
  const phone = await openStore({ persist: false });
  const laptop = await openStore({ persist: false });
  const net = hub();
  net.attach(phone.doc);
  net.attach(laptop.doc);
  return {
    phone,
    laptop,
    net,
    destroy: () => {
      net.destroy();
      phone.destroy();
      laptop.destroy();
    },
  };
};

const bodies = (store: Store, section: 'next' | 'scheduled' | 'done'): string[] =>
  cardsIn(store.doc, TODAY, section).map(cardBody);

describe('through a relay', () => {
  it('merges metadata from independently initialized browser profiles', async () => {
    localStorage.clear();
    const phone = await openStore({ persist: false });
    expect(setRolloverHour(phone.doc, phone.meta, phone.actor.origin, 5)).toBe(true);
    compose(workspaceFor(phone), { date: TODAY, section: 'done' }, 'from the phone');

    // A second device has its own localStorage: actor and device identity do
    // not sync, so sharing the test process's storage would mask this race.
    localStorage.clear();
    const laptop = await openStore({ persist: false });
    compose(workspaceFor(laptop), { date: TODAY, section: 'done' }, 'from the laptop');
    expect(phone.actor.id).not.toBe(laptop.actor.id);
    expect(phone.actor.device.id).not.toBe(laptop.actor.device.id);

    const net = hub();
    net.attach(phone.doc);
    net.attach(laptop.doc);
    net.connect(phone.doc);
    net.connect(laptop.doc);
    await settle();
    await settle();

    const roster = new Set(listActors(phone.doc).map(({ id }) => id));
    const authors = cardsIn(phone.doc, TODAY, 'done').map(cardAuthor);
    expect(authors).toHaveLength(2);
    expect(authors.every((id) => roster.has(id))).toBe(true);
    expect(readSettings(phone.meta).rolloverHour).toBe(5);
    expect(readSettings(laptop.meta).rolloverHour).toBe(5);

    net.destroy();
    phone.destroy();
    laptop.destroy();
  });

  it('carries a card from one device to the other', async () => {
    const { phone, laptop, net, destroy } = await devices();
    net.connect(phone.doc);
    net.connect(laptop.doc);

    compose(workspaceFor(phone), { date: TODAY, section: 'done' }, 'called the dentist');
    await settle();

    expect(bodies(laptop, 'done')).toEqual(['called the dentist']);
    destroy();
  });

  it('keeps both sides of an edit made offline on each', async () => {
    const { phone, laptop, net, destroy } = await devices();
    net.connect(phone.doc);
    net.connect(laptop.doc);

    transact(phone.doc, phone.actor.origin, () => phone.master.insert(0, 'Reviewed the deploy\n'));
    await settle();
    expect(laptop.master.toString()).toBe('Reviewed the deploy\n');

    // A tunnel, a plane, a laptop lid. Both keep writing.
    net.disconnect(phone.doc);
    net.disconnect(laptop.doc);

    transact(phone.doc, phone.actor.origin, () => phone.master.insert(20, 'Called the dentist\n'));
    transact(laptop.doc, laptop.actor.origin, () =>
      laptop.master.insert(20, 'Wrote the migration plan\n'),
    );
    compose(workspaceFor(phone), { date: TODAY, section: 'done' }, 'from the phone');
    compose(workspaceFor(laptop), { date: TODAY, section: 'done' }, 'from the laptop');

    net.connect(phone.doc);
    net.connect(laptop.doc);
    await settle();

    expect(phone.master.toString()).toBe(laptop.master.toString());
    expect(phone.master.toString()).toContain('Called the dentist');
    expect(phone.master.toString()).toContain('Wrote the migration plan');
    expect(new Set(bodies(phone, 'done'))).toEqual(new Set(['from the phone', 'from the laptop']));
    expect(bodies(phone, 'done')).toEqual(bodies(laptop, 'done'));

    destroy();
  });

  it('hands a device that has been away everything it missed', async () => {
    const { phone, laptop, net, destroy } = await devices();
    net.connect(phone.doc);

    compose(workspaceFor(phone), { date: TODAY, section: 'next' }, 'draft the plan');
    transact(phone.doc, phone.actor.origin, () => phone.master.insert(0, 'a week of notes\n'));
    await settle();

    // The laptop was shut the whole time; the relay held it.
    net.connect(laptop.doc);
    await settle();

    expect(bodies(laptop, 'next')).toEqual(['draft the plan']);
    expect(laptop.master.toString()).toBe('a week of notes\n');

    destroy();
  });

  /**
   * TRD §11 lists "concurrent insert-from-two-devices" among the sequences the
   * cap must survive, and it is the one case no write path can refuse: both
   * devices are inside the cap when they write, and only the merge is over it
   * (see `enforceCap`). Both replicas then repair independently, and the repair
   * has to be deterministic enough that two of them are indistinguishable from
   * one.
   */
  it('repairs a cap broken by two devices, identically on both, losing nothing', async () => {
    const { phone, laptop, net, destroy } = await devices();
    net.connect(phone.doc);
    net.connect(laptop.doc);

    compose(workspaceFor(phone), { date: TODAY, section: 'next' }, 'one');
    compose(workspaceFor(phone), { date: TODAY, section: 'next' }, 'two');
    await settle();
    expect(bodies(laptop, 'next')).toHaveLength(2);

    net.disconnect(phone.doc);
    net.disconnect(laptop.doc);

    // Each device is within the cap at the moment it writes.
    expect(compose(workspaceFor(phone), { date: TODAY, section: 'next' }, 'from the phone')).toBe(
      true,
    );
    expect(compose(workspaceFor(laptop), { date: TODAY, section: 'next' }, 'from the laptop')).toBe(
      true,
    );

    net.connect(phone.doc);
    net.connect(laptop.doc);
    await settle();
    await settle();

    expect(bodies(phone, 'next')).toHaveLength(3);
    expect(bodies(phone, 'next')).toEqual(bodies(laptop, 'next'));
    expect(bodies(phone, 'scheduled')).toEqual(bodies(laptop, 'scheduled'));

    // Nothing the user wrote was deleted: the overflow moved to Scheduled.
    const everything = [...bodies(phone, 'next'), ...bodies(phone, 'scheduled')];
    expect(everything).toHaveLength(4);
    expect(new Set(everything)).toEqual(
      new Set(['one', 'two', 'from the phone', 'from the laptop']),
    );

    destroy();
  });

  /**
   * TRD §4.5: compaction "must be safe to run concurrently on two devices —
   * both produce identical archive text from identical source, and Yjs
   * converges". Both devices reach the same idle moment on the same day, so
   * this is the ordinary case rather than a race worth engineering against.
   */
  it('converges when both devices compact the same day', async () => {
    const { phone, laptop, net, destroy } = await devices();
    net.connect(phone.doc);
    net.connect(laptop.doc);

    const old = '2026-07-20';
    const past = { date: old, section: 'done' as const };
    compose({ ...workspaceFor(phone), today: old }, past, 'wrote the migration plan');
    compose({ ...workspaceFor(phone), today: old }, past, 'called the dentist');
    await settle();
    expect(cardsIn(laptop.doc, old, 'done')).toHaveLength(2);

    // Same source, two devices, no coordination.
    net.disconnect(phone.doc);
    net.disconnect(laptop.doc);
    expect(compactDay(phone.doc, phone.actor.systemOrigin, old, TODAY)).toBe('compacted');
    expect(compactDay(laptop.doc, laptop.actor.systemOrigin, old, TODAY)).toBe('compacted');
    expect(archiveTextOf(phone.doc, old)).toBe(archiveTextOf(laptop.doc, old));

    net.connect(phone.doc);
    net.connect(laptop.doc);
    await settle();

    expect(archiveTextOf(phone.doc, old)).toBe(archiveTextOf(laptop.doc, old));
    expect(archiveTextOf(phone.doc, old)).toContain('called the dentist');
    expect(archiveTextOf(phone.doc, old)).toContain('wrote the migration plan');
    expect(cardsIn(phone.doc, old, 'done')).toHaveLength(0);

    destroy();
  });

  /**
   * PRD §11.3: undo is scoped to your own changes. Phase 2 established that
   * against the system actor; sync introduces the other case, and it is the one
   * a person would actually notice — pressing undo on the laptop must not
   * silently retract something typed on the phone a minute ago.
   */
  it("keeps the other device's changes out of this one's undo stack", async () => {
    const { phone, laptop, net, destroy } = await devices();
    net.connect(phone.doc);
    net.connect(laptop.doc);

    transact(laptop.doc, laptop.actor.origin, () => laptop.master.insert(0, 'from the laptop\n'));
    await settle();
    transact(phone.doc, phone.actor.origin, () => phone.master.insert(0, 'from the phone\n'));
    await settle();

    expect(laptop.master.toString()).toBe('from the phone\nfrom the laptop\n');

    laptop.undo.undo();
    await settle();

    // The laptop took back its own line and left the phone's alone.
    expect(laptop.master.toString()).toBe('from the phone\n');
    expect(phone.master.toString()).toBe('from the phone\n');

    destroy();
  });

  it('leaves the app working when the relay never answers', async () => {
    const { phone, net, destroy } = await devices();
    // Attached but never connected: the shape of a configured relay that is
    // down, or a laptop that has not seen wifi since Tuesday.
    compose(workspaceFor(phone), { date: TODAY, section: 'done' }, 'still writing');
    transact(phone.doc, phone.actor.origin, () => phone.master.insert(0, 'still writing here too'));
    await settle();

    expect(bodies(phone, 'done')).toEqual(['still writing']);
    expect(phone.master.toString()).toBe('still writing here too');
    expect(net.relay.getText('master').toString()).toBe('');

    destroy();
  });
});
