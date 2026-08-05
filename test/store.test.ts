/**
 * TRD §4.8 and §6.1: attribution, undo scoping, and local persistence.
 *
 * The undo test is the one that keeps §4.8 honest as the codebase grows new
 * system operations. Phase 1 has none yet — compaction, import and bulk
 * resolution all arrive later — so it stands in for them with a direct
 * system-origin write, which is exactly what those will be.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { openStore, transact, type Store } from '../src/crdt';

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

describe('the actor roster', () => {
  it('registers the human and the system actor', async () => {
    const store = await openStore({ persist: false });
    const roster = store.meta.get('actors') as Map<string, { kind: string }>;
    const kinds = [...(roster as unknown as { values(): Iterable<{ kind: string }> }).values()].map(
      (actor) => actor.kind,
    );
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

    const roster = second.meta.get('actors') as unknown as { size: number };
    expect(roster.size).toBe(2); // the human and the system actor, not four
    second.destroy();
  });
});
