/**
 * TRD §4.8 and §6.1: attribution, undo scoping, and local persistence.
 *
 * The undo tests are what keep §4.8 honest as the codebase grows new system
 * operations. Phase 1 had none and stood in for them with a direct
 * system-origin write; Phase 2 has three real ones — compaction, the cap
 * repair, and bulk stale-item resolution — and the last of those is tested
 * here, where the undo scoping lives. The other two are tested beside the
 * mechanisms they belong to, in freeze.test.ts and cap.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCHEMA_VERSION,
  Y,
  actorById,
  cardBody,
  cardsIn,
  compose,
  exportEntries,
  listActors,
  moveAllNextTo,
  moveAllNextToMaster,
  newCard,
  openLocalStore,
  openStore,
  openTree,
  readSchemaVersion,
  readSettings,
  setRolloverHour,
  transact,
  updateActor,
  type Store,
  type Workspace,
} from '../src/crdt';

const fresh = async (dbName: string): Promise<Store> => openStore({ dbName });

const journalKeys = (name: string): string[] =>
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).flatMap(
    (key) => (key?.startsWith(`done.pending-update.${name}.`) ? [key] : []),
  );

const failStorageWrite = (): never => {
  throw new DOMException('storage full', 'QuotaExceededError');
};

beforeEach(() => {
  localStorage.clear();
});

describe('undo is scoped to the local human', () => {
  it('undoes what the human typed', async () => {
    const store = await openStore({ persist: false });
    transact(store.doc, store.actor.origin, () => store.master.insert(0, 'call the dentist'));
    expect(store.master.toString()).toBe('call the dentist');

    store.undo.undo();
    expect(store.master.toString()).toBe('');
    store.destroy();
  });

  it('never reverts a system-actor operation', async () => {
    const store = await openStore({ persist: false });

    transact(store.doc, store.actor.origin, () => store.master.insert(0, 'typed by me\n'));
    // Stands in for compaction: the app rewriting the document by itself.
    transact(store.doc, store.actor.systemOrigin, () => store.master.insert(0, 'system wrote\n'));

    store.undo.undo();

    const after = store.master.toString();
    expect(after).toContain('system wrote');
    expect(after).not.toContain('typed by me');
    store.destroy();
  });

  it('does not put the app running out of undo steps at the mercy of the system', async () => {
    const store = await openStore({ persist: false });

    transact(store.doc, store.actor.origin, () => store.master.insert(0, 'one\n'));
    transact(store.doc, store.actor.systemOrigin, () => store.master.insert(0, 'system\n'));
    transact(store.doc, store.actor.systemOrigin, () => store.master.insert(0, 'system\n'));

    // Two system operations later, undo still reaches the human's change.
    store.undo.undo();
    expect(store.master.toString()).toBe('system\nsystem\n');
    store.destroy();
  });
});

describe('bulk stale-item resolution stays out of the undo stack', () => {
  const YESTERDAY = '2026-08-04';
  const TODAY = '2026-08-05';

  const workspaces = (store: Store): { me: Workspace; system: Workspace; past: Workspace } => {
    const me: Workspace = {
      doc: store.doc,
      origin: store.actor.origin,
      systemOrigin: store.actor.systemOrigin,
      author: store.actor.id,
      today: TODAY,
      undo: store.undo,
    };
    return {
      me,
      system: { ...me, origin: store.actor.systemOrigin },
      past: { ...me, today: YESTERDAY },
    };
  };

  it('undo after moving a day of Next items reverts what was typed, not the move', async () => {
    const store = await openStore({ persist: false });
    const { me, system, past } = workspaces(store);

    compose(past, { date: YESTERDAY, section: 'next' }, 'unfinished one');
    compose(past, { date: YESTERDAY, section: 'next' }, 'unfinished two');
    compose(me, { date: TODAY, section: 'done' }, 'typed by me');

    expect(moveAllNextTo(system, YESTERDAY, { date: TODAY, section: 'scheduled' })).toBe(2);

    store.undo.undo();

    // The bulk move stands; the card the human typed is what came back.
    expect(cardsIn(store.doc, YESTERDAY, 'next')).toEqual([]);
    expect(cardsIn(store.doc, TODAY, 'scheduled').map(cardBody)).toEqual([
      'unfinished one',
      'unfinished two',
    ]);
    expect(cardsIn(store.doc, TODAY, 'done')).toEqual([]);
    store.destroy();
  });

  it('holds for the other bulk action too', async () => {
    const store = await openStore({ persist: false });
    const { me, system, past } = workspaces(store);

    compose(past, { date: YESTERDAY, section: 'next' }, 'unfinished');
    compose(me, { date: TODAY, section: 'done' }, 'typed by me');

    expect(moveAllNextToMaster(system, store.master, YESTERDAY)).toBe(1);

    store.undo.undo();

    expect(store.master.toString()).toBe('- [ ] unfinished\n');
    expect(cardsIn(store.doc, TODAY, 'done')).toEqual([]);
    store.destroy();
  });
});

describe('the actor roster', () => {
  it('registers the human and the system actor', async () => {
    const store = await openStore({ persist: false });
    const kinds = listActors(store.doc).map((actor) => actor.kind);
    expect(kinds).toContain('human');
    expect(kinds).toContain('system');
    store.destroy();
  });

  it('names an actor and a device on every human write', async () => {
    const store = await openStore({ persist: false });
    const origins: unknown[] = [];
    store.doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));

    transact(store.doc, store.actor.origin, () => store.master.insert(0, 'x'));

    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ kind: 'human', device: store.actor.device.id });
    store.destroy();
  });

  it('uses UUIDs for new actor and device identities', async () => {
    const store = await openStore({ persist: false });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

    expect(store.actor.id).toMatch(uuid);
    expect(store.actor.device.id).toMatch(uuid);
    store.destroy();
  });
});

describe('local persistence', () => {
  it('reads the document back after a reload', async () => {
    const first = await fresh('done-test-reload');
    transact(first.doc, first.actor.origin, () => first.master.insert(0, '# Master\n\n- one\n'));
    await first.local?.whenDurable();
    first.destroy();

    const second = await fresh('done-test-reload');
    expect(second.master.toString()).toBe('# Master\n\n- one\n');
    second.destroy();
  });

  it('keeps the same actor across reloads rather than re-registering one', async () => {
    const first = await fresh('done-test-actor');
    const id = first.actor.id;
    const color = first.actor.actor.color;
    await first.local?.whenDurable();
    first.destroy();

    const second = await fresh('done-test-actor');
    expect(second.actor.id).toBe(id);
    expect(second.actor.actor.color).toBe(color);

    expect(listActors(second.doc)).toHaveLength(2); // the human and the system actor, not four
    second.destroy();
  });

  it('does not add a full-document checkpoint during a clean open', async () => {
    const commit = vi.spyOn(IDBTransaction.prototype, 'commit');
    const doc = new Y.Doc();
    const local = openLocalStore(doc, 'done-test-clean-open');

    try {
      await local.whenSynced;
      await Promise.resolve();
      expect(commit).not.toHaveBeenCalled();
    } finally {
      commit.mockRestore();
      local.destroy();
      doc.destroy();
    }
  });

  it('keeps the in-memory store exportable when a durability batch aborts', async () => {
    const commit = vi
      .spyOn(IDBTransaction.prototype, 'commit')
      .mockImplementation(function (this: IDBTransaction) {
        this.abort();
      });
    let store: Store | undefined;

    try {
      const opened = await fresh('done-test-checkpoint-abort');
      store = opened;
      transact(opened.doc, opened.actor.origin, () => {
        opened.master.insert(0, 'still exportable');
      });

      expect(exportEntries(opened.doc, opened.master.toString())).toContainEqual({
        path: 'master.md',
        content: 'still exportable',
      });
      if (!opened.local) throw new Error('The persistence test opened without a local store.');
      await expect(opened.local.whenDurable()).rejects.toThrow(
        'IndexedDB persistence transaction failed.',
      );
    } finally {
      commit.mockRestore();
      store?.destroy();
    }
  });

  it('leaves a failed batch dormant until an explicit durability retry', async () => {
    const errors: Error[] = [];
    const originalCommit = IDBTransaction.prototype.commit;
    let attempts = 0;
    const name = 'done-test-no-automatic-retry';
    const doc = new Y.Doc();
    const local = openLocalStore(doc, name, { onPersistenceError: (error) => errors.push(error) });

    try {
      await local.whenSynced;
      const commit = vi
        .spyOn(IDBTransaction.prototype, 'commit')
        .mockImplementation(function (this: IDBTransaction) {
          attempts += 1;
          if (attempts === 1) this.abort();
          else originalCommit.call(this);
        });

      try {
        transact(doc, 'test', () => doc.getText('master').insert(0, 'retry me once asked'));

        await vi.waitFor(() => expect(errors).toHaveLength(1));
        expect(attempts).toBe(1);
        expect(journalKeys(name)).toHaveLength(1);

        // A re-armed flush would run after another 250 ms.
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        expect(attempts).toBe(1);
        expect(journalKeys(name)).toHaveLength(1);

        await expect(local.whenDurable()).resolves.toBeUndefined();
        expect(attempts).toBe(2);
        expect(journalKeys(name)).toEqual([]);
      } finally {
        commit.mockRestore();
      }
    } finally {
      local.destroy();
      doc.destroy();
    }
  });

  it('rejects durability when an observed update has no database connection', async () => {
    const doc = new Y.Doc();
    const local = openLocalStore(doc, 'done-test-checkpoint-without-db');
    await expect(local.whenSynced).resolves.toBeUndefined();
    local.provider.db = null;
    transact(doc, 'test', () => doc.getText('master').insert(0, 'not yet in IndexedDB'));
    await expect(local.whenDurable()).rejects.toThrow(
      'IndexedDB opened without a database connection.',
    );
    expect(journalKeys('done-test-checkpoint-without-db')).toHaveLength(1);

    local.destroy();
    doc.destroy();
  });

  it('replays the synchronous journal across repeated interrupted opens', async () => {
    const name = 'done-test-interrupted-write';
    const firstDoc = new Y.Doc();
    const first = openLocalStore(firstDoc, name);
    await first.whenSynced;

    // Fault injection for a page that cannot finish its asynchronous write.
    first.provider.db = null;
    transact(firstDoc, 'test', () => firstDoc.getText('master').insert(0, 'survived reload'));
    expect(journalKeys(name)).toHaveLength(1);
    first.destroy();
    firstDoc.destroy();

    const secondDoc = new Y.Doc();
    const second = openLocalStore(secondDoc, name);
    await second.whenSynced;
    expect(secondDoc.getText('master').toString()).toBe('survived reload');
    // A second interruption must not clear recovery data merely because loading finished.
    expect(journalKeys(name)).toHaveLength(1);
    second.destroy();
    secondDoc.destroy();

    const thirdDoc = new Y.Doc();
    const third = openLocalStore(thirdDoc, name);
    await third.whenSynced;
    expect(thirdDoc.getText('master').toString()).toBe('survived reload');
    await third.whenDurable();
    expect(journalKeys(name)).toEqual([]);
    third.destroy();
    thirdDoc.destroy();
  });

  it('journals immutable deltas and truncates them after one short batch', async () => {
    const name = 'done-test-delta-journal';
    const doc = new Y.Doc();
    const local = openLocalStore(doc, name);
    await local.whenSynced;

    transact(doc, 'test', () => doc.getText('master').insert(0, 'a'));
    transact(doc, 'test', () => doc.getText('master').insert(1, 'b'));

    expect(journalKeys(name)).toHaveLength(2);
    await vi.waitFor(() => expect(journalKeys(name)).toEqual([]), { timeout: 1000 });
    await expect(local.whenDurable()).resolves.toBeUndefined();

    local.destroy();
    doc.destroy();
  });

  it('commits a burst in one relaxed transaction', async () => {
    const commit = vi.spyOn(IDBTransaction.prototype, 'commit');
    const doc = new Y.Doc();
    const local = openLocalStore(doc, 'done-test-batched-transaction');

    try {
      await local.whenSynced;
      commit.mockClear();
      transact(doc, 'test', () => doc.getText('master').insert(0, 'a'));
      transact(doc, 'test', () => doc.getText('master').insert(1, 'b'));

      await local.whenDurable();

      expect(commit).toHaveBeenCalledTimes(1);
      expect((commit.mock.instances[0] as IDBTransaction | undefined)?.durability).toBe('relaxed');
    } finally {
      commit.mockRestore();
      local.destroy();
      doc.destroy();
    }
  });

  it('reports a synchronous journal failure while still allowing an IndexedDB flush', async () => {
    const errors: Error[] = [];
    const name = 'done-test-journal-failure';
    const doc = new Y.Doc();
    const local = openLocalStore(doc, name, { onPersistenceError: (error) => errors.push(error) });
    await local.whenSynced;
    const localSetItem = vi.spyOn(localStorage, 'setItem').mockImplementation(failStorageWrite);
    const prototypeSetItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(failStorageWrite);

    try {
      transact(doc, 'test', () => doc.getText('master').insert(0, 'still reaches IndexedDB'));
      expect(errors.map((error) => error.message)).toContain(
        'Could not write the synchronous recovery journal.',
      );
      await expect(local.whenDurable()).resolves.toBeUndefined();
    } finally {
      prototypeSetItem.mockRestore();
      localSetItem.mockRestore();
      local.destroy();
      doc.destroy();
    }
  });
});

describe('editable settings', () => {
  it('updates the rollover hour through an attributed mutation', async () => {
    const store = await openStore({ persist: false });
    expect(setRolloverHour(store.doc, store.meta, store.actor.origin, 4)).toBe(true);
    expect(readSettings(store.meta).rolloverHour).toBe(4);
    expect(setRolloverHour(store.doc, store.meta, store.actor.origin, 24)).toBe(false);
    store.destroy();
  });

  it('updates the local human name and color without permitting an empty name', async () => {
    const store = await openStore({ persist: false });
    expect(
      updateActor(store.doc, store.actor.origin, store.actor.id, { name: 'Thomas' }),
    ).toMatchObject({ name: 'Thomas' });
    expect(
      updateActor(store.doc, store.actor.origin, store.actor.id, { color: '#123abc' }),
    ).toMatchObject({ color: '#123abc' });
    expect(updateActor(store.doc, store.actor.origin, store.actor.id, { name: '   ' })).toBeNull();
    expect(actorById(store.doc, store.actor.id)).toMatchObject({
      name: 'Thomas',
      color: '#123abc',
    });
    store.destroy();
  });
});

describe('schema migration', () => {
  it('removes legacy caret markers once, then treats caret text literally', async () => {
    const doc = new Y.Doc();
    const meta = doc.getMap('meta');
    const master = doc.getText('master');
    doc.transact(() => {
      meta.set('schemaVersion', 3);
      master.insert(0, '- [ ] Draft the migration ^abc123\nMath uses 2 ^ 3\nUppercase ^ABC123\n');
    });

    const store = await openStore({ doc, persist: false });
    expect(master.toString()).toBe(
      '- [ ] Draft the migration\nMath uses 2 ^ 3\nUppercase ^ABC123\n',
    );

    transact(doc, store.actor.origin, () => master.insert(master.length, 'Literal ^def456\n'));
    openTree(doc, store.actor.systemOrigin);
    expect(master.toString()).toContain('Literal ^def456\n');
    store.destroy();
  });

  it('flattens schema-v2 actor and settings maps without losing values', async () => {
    const doc = new Y.Doc();
    const meta = doc.getMap('meta');
    const actors = new Y.Map<{ kind: 'human' | 'system'; name: string; color: string }>();
    const settings = new Y.Map<unknown>();
    doc.transact(() => {
      meta.set('schemaVersion', 2);
      actors.set('old-human', { kind: 'human', name: 'Thomas', color: '#123abc' });
      actors.set('system', { kind: 'system', name: 'done', color: '#8a8a8a' });
      settings.set('rolloverHour', 6);
      meta.set('actors', actors);
      meta.set('settings', settings);
    });
    localStorage.setItem('done.actor', 'old-human');

    const store = await openStore({ doc, persist: false });
    expect(readSchemaVersion(store.meta)).toBe(SCHEMA_VERSION);
    expect(actorById(doc, 'old-human')).toEqual({
      kind: 'human',
      name: 'Thomas',
      color: '#123abc',
    });
    expect(readSettings(store.meta).rolloverHour).toBe(6);
    expect(store.meta.get('actor:old-human')).toBeDefined();
    expect(store.meta.get('setting.rolloverHour')).toBe(6);
    store.destroy();
  });

  it('moves embedded v1 cards into the canonical registry without losing content', async () => {
    const doc = new Y.Doc();
    const meta = doc.getMap('meta');
    const days = doc.getMap('days');
    const day = new Y.Map<unknown>();
    const next = new Y.Array<Y.Map<unknown>>();
    const legacy = newCard('legacy card', 'human', { id: 'old001' });

    doc.transact(() => {
      meta.set('schemaVersion', 1);
      day.set('next', next);
      day.set('scheduled', new Y.Array());
      day.set('done', new Y.Array());
      days.set('2026-08-05', day);
      next.push([legacy]);
    });

    const store = await openStore({ doc, persist: false });
    expect(readSchemaVersion(store.meta)).toBe(SCHEMA_VERSION);
    expect(cardsIn(doc, '2026-08-05', 'next').map(cardBody)).toEqual(['legacy card']);
    const migrated = (store.days.get('2026-08-05') as Y.Map<unknown>).get(
      'next',
    ) as Y.Array<string>;
    expect(migrated.toArray()).toEqual(['old001']);
    store.destroy();
  });
});
