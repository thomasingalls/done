// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createAdmittedWorkspace, type AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import { createAdmissionOwner } from '../src/crdt/admissionQueue';
import type { JournalSession } from '../src/crdt/custody';
import { createDoc, applyUpdate, encodeState, newMap, newText } from '../src/crdt/yjs';
import { serializeCollections } from '../src/crdt/serialize';
const identity = {
  id: 'human-one',
  actor: { kind: 'human' as const, name: 'Alice', color: '#3f8fd6' },
  device: { id: 'device-one', name: 'test device' },
};
const next = { date: '2026-09-08', section: 'next' as const },
  done = { ...next, section: 'done' as const };
const selection = (anchor: number, head = anchor) => ({ ranges: [{ anchor, head }], main: 0 });
const master = (w: AdmittedWorkspace) => w.text({ kind: 'master' });
const create = async (w: AdmittedWorkspace, text = 'card', to = next) => {
  const receipt = await w.command({ kind: 'compose', to, text }).accepted;
  return (receipt.value as { id: string }).id;
};
const remote = (w: AdmittedWorkspace, fn: (d: ReturnType<typeof createDoc>) => void) => {
  const d = createDoc();
  applyUpdate(d, w.snapshot());
  let update!: Uint8Array;
  d.on('update', (u) => {
    update = u;
  });
  d.transact(() => fn(d));
  d.destroy();
  return new Uint8Array(update);
};
const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw Error('Condition not reached');
};
const fixture = async (seed?: Uint8Array) => {
  let date = '2026-09-08';
  let refuse = false,
    fail = false,
    release: (() => void) | undefined,
    gate: Promise<void> | undefined;
  const abort = new AbortController(),
    disk: Uint8Array[] = seed ? [seed] : [],
    wal: Uint8Array[] = [];
  const carrier = {
    state: 'active',
    signal: abort.signal,
    loadRecovery: async () => ({
      records: disk.map((bytes) => ({ kind: 'update', bytes: bytes.slice() })),
      journal: wal.map((bytes) => ({ bytes: bytes.slice() })),
    }),
    appendLocal(bytes: Uint8Array) {
      if (refuse) return { status: 'refused', reason: 'quota' };
      wal.push(bytes.slice());
      return { status: 'journalled' };
    },
    async appendBatch(records: { bytes: Uint8Array }[]) {
      await gate;
      if (fail) {
        fail = false;
        throw Error('disk fault');
      }
      disk.push(...records.map((r) => r.bytes.slice()));
      return {};
    },
    async flushJournal() {
      disk.push(...wal.splice(0));
      return { retained: 0 };
    },
    async close() {
      release?.();
    },
  } as unknown as JournalSession;
  const doc = await createAdmittedWorkspace((options) => createAdmissionOwner(carrier, options), {
    identity,
    validateReceive: () => {},
    today: () => date,
  });
  const emitted: Uint8Array[] = [];
  doc.outgoing((b) => emitted.push(b));
  return {
    doc,
    setDate: (value: string) => {
      date = value;
    },
    disk,
    wal,
    emitted,
    refuse: () => {
      refuse = true;
    },
    fail: () => {
      fail = true;
    },
    pause: () => {
      gate = new Promise((r) => {
        release = r;
      });
    },
    resume: () => {
      release?.();
      gate = undefined;
    },
  };
};
const insert = (text: string) => ({ name: 'insert' as const, text });
describe('admitted workspace commands and history', () => {
  it('projects retained legacy archives as read-only bodies without creating live cards', async () => {
    const seed = createDoc();
    const day = newMap();
    seed.getMap('days').set('2026-08-01', day);
    const archived = { next: ['old next'], scheduled: [], done: ['old done'] };
    day.set('archive', newText(serializeCollections(archived)));
    const f = await fixture(new Uint8Array(encodeState(seed)));
    seed.destroy();
    try {
      expect(f.doc.read().days.find((d) => d.date === '2026-08-01')?.archived).toEqual(archived);
      expect(f.doc.read().cards).toEqual([]);
      expect(
        f.doc.exportEntries().find((entry) => entry.path === 'days/2026-08-01.md')?.content,
      ).toContain('old done');
    } finally {
      await f.doc.close();
    }
  });
  it('admits device display labels into encrypted content and recovers them without changing identity', async () => {
    const f = await fixture();
    let reopened: Awaited<ReturnType<typeof fixture>> | undefined;
    try {
      expect(f.doc.read().deviceName).toBe('test device');
      await f.doc.command({ kind: 'device-label', name: 'Kitchen laptop' }).accepted;
      expect(f.doc.read().deviceName).toBe('Kitchen laptop');
      reopened = await fixture(f.doc.snapshot());
      expect(reopened.doc.read().deviceName).toBe('Kitchen laptop');
      expect(reopened.doc.read().actors.find((actor) => actor.id === identity.id)?.name).toBe(
        'Alice',
      );
      expect(f.doc.read().undo).toBe(0);
      expect((await f.doc.command({ kind: 'undo' }).accepted).value).toBe(false);
      expect(f.doc.read().deviceName).toBe('Kitchen laptop');
    } finally {
      await f.doc.close();
      await reopened?.doc.close();
    }
  });
  it('preserves null business results without treating them as a storage failure', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc);
      const result = await f.doc.command({ kind: 'merge', id }).accepted;
      expect(result.value).toBeNull();
      expect(f.doc.status.state).toBe('active');
      expect(f.doc.read().undo).toBe(1);
    } finally {
      await f.doc.close();
    }
  });
  it('refuses a future schema during initialization without modifying the source', async () => {
    const seed = createDoc();
    seed.getMap('meta').set('schemaVersion', 999);
    const bytes = new Uint8Array(encodeState(seed)),
      original = bytes.slice();
    seed.destroy();
    await expect(fixture(bytes)).rejects.toThrow();
    expect(bytes).toEqual(original);
  });
  it('keeps returned projections and submitted commands detached from the owner', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc);
      const snapshot = f.doc.read();
      snapshot.cards[0]!.text = 'tampered';
      f.refuse();
      f.pause();
      const command = { kind: 'move' as const, id, to: { ...done } };
      const pending = f.doc.command(command);
      command.to.date = '2030-01-01';
      f.resume();
      await pending.accepted;
      expect(f.doc.read().cards[0]!.text).toBe('card');
      expect(f.doc.read().cards[0]!.location).toEqual(done);
    } finally {
      await f.doc.close();
    }
  });
  it('follows local redone links when undoing an edit inside a restored parent', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc);
      await f.doc.text({ kind: 'card', id }).input(insert('!'), selection(4)).accepted;
      await f.doc.command({ kind: 'remove', id }).accepted;
      await f.doc.command({ kind: 'undo' }).accepted;
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(f.doc.read().cards[0]?.text).toBe('card');
      await f.doc.command({ kind: 'redo' }).accepted;
      expect(f.doc.read().cards[0]?.text).toBe('card!');
    } finally {
      await f.doc.close();
    }
  });
  it('durably initializes the actor and schema without adding human undo', async () => {
    const f = await fixture();
    try {
      expect(
        f.doc
          .read()
          .actors.map((a) => a.id)
          .sort(),
      ).toEqual(['human-one', 'system']);
      expect(f.doc.read().undo).toBe(0);
      expect(f.disk.length).toBeGreaterThan(0);
      expect(f.wal.length).toBe(0);
    } finally {
      await f.doc.close();
    }
  });
  it('shares human history across Goals, cards and movement', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc);
      const text = f.doc.text({ kind: 'card', id });
      await master(f.doc).input(insert('goals')).accepted;
      await text.input(insert('!'), selection(4)).accepted;
      await f.doc.command({ kind: 'move', id, to: done }).accepted;
      expect(f.doc.read().undo).toBe(4);
      await master(f.doc).input({ name: 'undo' }).accepted;
      expect(f.doc.read().cards[0]?.location).toEqual(next);
      await master(f.doc).input({ name: 'undo' }).accepted;
      expect(text.read().text).toBe('card');
      await text.input({ name: 'undo' }).accepted;
      expect(master(f.doc).read().text).toBe('');
      await text.input({ name: 'undo' }).accepted;
      expect(f.doc.read().cards).toHaveLength(0);
      expect(f.doc.read().days).toHaveLength(1);
    } finally {
      await f.doc.close();
    }
  });
  it('retains repeated undo/redo links through private history forks', async () => {
    const f = await fixture();
    try {
      const t = master(f.doc);
      t.input(insert('A'));
      t.input(insert('B'));
      for (let n = 0; n < 3; n++) {
        await t.input({ name: 'undo' }).accepted;
        expect(t.read().text).toBe('A');
        await t.input({ name: 'undo' }).accepted;
        expect(t.read().text).toBe('');
        await t.input({ name: 'redo' }).accepted;
        expect(t.read().text).toBe('A');
        await t.input({ name: 'redo' }).accepted;
        expect(t.read().text).toBe('AB');
      }
    } finally {
      await f.doc.close();
    }
  });
  it('restores a deleted nested card and its text through undo, redo, and undo', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc);
      await f.doc.command({ kind: 'remove', id }).accepted;
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(f.doc.read().cards[0]?.text).toBe('card');
      await f.doc.command({ kind: 'redo' }).accepted;
      expect(f.doc.read().cards).toHaveLength(0);
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(f.doc.read().cards[0]?.text).toBe('card');
    } finally {
      await f.doc.close();
    }
  });
  it('does not publish a failed move or advance its undo stack before forced retry', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc);
      f.refuse();
      f.fail();
      const move = f.doc.command({ kind: 'move', id, to: done });
      await until(() => f.doc.status.state === 'blocked');
      const type = master(f.doc).input(insert('later'));
      expect(f.doc.read().cards[0]?.location).toEqual(next);
      expect(f.doc.read().undo).toBe(1);
      expect(f.emitted).toHaveLength(1);
      f.doc.retry();
      await move.accepted;
      await type.accepted;
      expect(f.doc.read().cards[0]?.location).toEqual(done);
      expect(f.doc.read().master).toBe('later');
      expect(f.doc.read().undo).toBe(3);
    } finally {
      await f.doc.close();
    }
  });
  it('retries refused undo without making its history authoritative', async () => {
    const f = await fixture();
    try {
      await create(f.doc);
      f.refuse();
      f.fail();
      const undo = f.doc.command({ kind: 'undo' });
      await until(() => f.doc.status.state === 'blocked');
      expect(f.doc.read().undo).toBe(1);
      expect(f.doc.read().redo).toBe(0);
      expect(f.doc.read().cards).toHaveLength(1);
      f.doc.retry();
      await undo.accepted;
      expect(f.doc.read().cards).toHaveLength(0);
      expect(f.doc.read().redo).toBe(1);
    } finally {
      await f.doc.close();
    }
  });
  it('evaluates Next capacity at the head after earlier accepted commands', async () => {
    const f = await fixture();
    try {
      await create(f.doc, '1');
      await create(f.doc, '2');
      f.refuse();
      f.pause();
      const third = f.doc.command({ kind: 'compose', to: next, text: '3' }),
        fourth = f.doc.command({ kind: 'compose', to: next, text: '4' });
      expect(f.doc.read().cards).toHaveLength(2);
      f.resume();
      await third.accepted;
      expect((await fourth.accepted).value).toBe(false);
      expect(f.doc.read().cards).toHaveLength(3);
    } finally {
      await f.doc.close();
    }
  });
  it('excludes bulk, settings and actor housekeeping from human content undo', async () => {
    const f = await fixture();
    try {
      await create(f.doc);
      await f.doc.command({ kind: 'bulk', from: next.date, to: done }).accepted;
      await f.doc.command({ kind: 'settings', rolloverHour: 4 }).accepted;
      await f.doc.command({ kind: 'actor', patch: { name: 'Renamed' } }).accepted;
      expect(f.doc.read().undo).toBe(1);
      expect(f.doc.read().settings.rolloverHour).toBe(4);
      expect(f.doc.read().actors.find((a) => a.id === identity.id)?.name).toBe('Renamed');
    } finally {
      await f.doc.close();
    }
  });
  it('keeps the day container and a remote card when undoing the first human card', async () => {
    const f = await fixture();
    try {
      await create(f.doc, 'local');
      const g = await fixture(f.doc.snapshot());
      try {
        await create(g.doc, 'remote');
        await f.doc.receive(new Uint8Array(g.emitted.at(-1)!)).accepted;
      } finally {
        await g.doc.close();
      }
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(f.doc.read().cards.map((c) => c.text)).toEqual(['remote']);
      expect(f.doc.read().days[0]?.next).toHaveLength(1);
    } finally {
      await f.doc.close();
    }
  });
  it('does not undo a remote text insertion or remote location change', async () => {
    const f = await fixture();
    try {
      master(f.doc).input(insert('AB'));
      await f.doc.receive(remote(f.doc, (d) => d.getText('master').insert(1, 'R'))).accepted;
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(f.doc.read().master).toBe('R');
      const id = await create(f.doc);
      await f.doc.command({ kind: 'move', id, to: done }).accepted;
      const scheduled = { ...next, section: 'scheduled' };
      await f.doc.receive(
        remote(f.doc, (d) =>
          d.getMap('cardLocations').set(id, scheduled.date + ':' + scheduled.section),
        ),
      ).accepted;
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(f.doc.read().cards[0]?.location).toEqual(scheduled);
    } finally {
      await f.doc.close();
    }
  });
  it('splits and merges through existing card rules and export', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc, 'onetwo');
      const split = await f.doc.command({ kind: 'split', id, at: 3 }).accepted;
      expect(typeof split.value).toBe('string');
      expect(
        f.doc
          .read()
          .cards.map((c) => c.text)
          .sort(),
      ).toEqual(['one', 'two']);
      await f.doc.command({ kind: 'merge', id: split.value as string }).accepted;
      expect(f.doc.read().cards[0]?.text).toBe('onetwo');
      expect(f.doc.exportEntries().some((e) => e.content.includes('onetwo'))).toBe(true);
    } finally {
      await f.doc.close();
    }
  });
  it('rechecks freeze while preserving Goals editing', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc);
      f.setDate('2026-09-20');
      expect(f.doc.text({ kind: 'card', id }).read().editable).toBe(false);
      expect(() => f.doc.text({ kind: 'card', id }).input(insert('x'))).toThrow();
      expect((await f.doc.command({ kind: 'move', id, to: done }).accepted).value).toBe(false);
      await master(f.doc).input(insert('always')).accepted;
      expect(f.doc.read().master).toBe('always');
    } finally {
      await f.doc.close();
    }
  });
  it('slices Unicode text and groups the accepted paste in workspace history', async () => {
    const f = await fixture();
    try {
      const t = master(f.doc),
        source = '🙂'.repeat(1250);
      await t.input(insert(source)).accepted;
      expect(t.read().text).toBe(source);
      expect(f.doc.read().undo).toBe(1);
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(t.read().text).toBe('');
      await f.doc.command({ kind: 'redo' }).accepted;
      expect(t.read().text).toBe(source);
    } finally {
      await f.doc.close();
    }
  });
  it('discards an entire refused suffix and starts a fresh private candidate', async () => {
    const f = await fixture();
    try {
      const id = await create(f.doc);
      f.refuse();
      f.fail();
      const move = f.doc.command({ kind: 'move', id, to: done });
      await until(() => f.doc.status.state === 'blocked');
      const suffix = master(f.doc).input(insert('discard'));
      f.doc.discardPending();
      await expect(move.accepted).rejects.toHaveProperty('code', 'discarded');
      await expect(suffix.accepted).rejects.toHaveProperty('code', 'discarded');
      await master(f.doc).input(insert('keep')).accepted;
      expect(f.doc.read().cards[0]?.location).toEqual(next);
      expect(f.doc.read().master).toBe('keep');
      expect(f.doc.read().undo).toBe(2);
    } finally {
      await f.doc.close();
    }
  });
  it('drains close without late publication and does not persist runtime history', async () => {
    const f = await fixture();
    await create(f.doc);
    const saved = f.doc.snapshot();
    f.refuse();
    f.pause();
    const late = master(f.doc).input(insert('late'));
    const closing = f.doc.close();
    f.resume();
    await closing;
    await expect(late.accepted).rejects.toHaveProperty('code', 'inactive-session');
    expect(f.emitted).toHaveLength(1);
    expect(() => f.doc.read()).toThrow();
    const g = await fixture(saved);
    try {
      expect(g.doc.read().cards).toHaveLength(1);
      expect(g.doc.read().undo).toBe(0);
    } finally {
      await g.doc.close();
    }
  });
});
