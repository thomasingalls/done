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

import { beforeEach, describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  Y,
  actorById,
  cardBody,
  cardsIn,
  compose,
  listActors,
  moveAllNextTo,
  moveAllNextToMaster,
  newCard,
  openStore,
  readSchemaVersion,
  readSettings,
  setRolloverHour,
  transact,
  updateActor,
  type Store,
  type Workspace,
} from '../src/crdt';

const fresh = async (dbName: string): Promise<Store> => openStore({ dbName });

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
});

describe('local persistence', () => {
  it('reads the document back after a reload', async () => {
    const first = await fresh('done-test-reload');
    transact(first.doc, first.actor.origin, () => first.master.insert(0, '# Master\n\n- one\n'));
    await first.local?.provider.whenSynced;
    first.destroy();

    const second = await fresh('done-test-reload');
    expect(second.master.toString()).toBe('# Master\n\n- one\n');
    second.destroy();
  });

  it('keeps the same actor across reloads rather than re-registering one', async () => {
    const first = await fresh('done-test-actor');
    const id = first.actor.id;
    const color = first.actor.actor.color;
    await first.local?.provider.whenSynced;
    first.destroy();

    const second = await fresh('done-test-actor');
    expect(second.actor.id).toBe(id);
    expect(second.actor.actor.color).toBe(color);

    expect(listActors(second.doc)).toHaveLength(2); // the human and the system actor, not four
    second.destroy();
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
