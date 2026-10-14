// @vitest-environment node
import { accountTextPreparation } from '../src/crdt/accountTextPreparation';
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  localWorkspacePreparation,
  type PreparedWorkspaceState,
  type PreparationScope,
} from '../src/crdt/workspacePreparation';
import { createAdmittedWorkspace, type AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import { createAdmissionOwner, type OwnedPreparedReceiveQueue } from '../src/crdt/admissionQueue';
import type { JournalSession } from '../src/crdt/custody';
import { Y, createDoc, applyUpdate, encodeState, newMap, newText, newArray } from '../src/crdt/yjs';
import { targetText } from '../src/crdt/workspaceCommands';
import { serializeCollections } from '../src/crdt/serialize';
import * as historySeam from '../src/crdt/yjs';
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
const makeFixture = async (
  seed?: Uint8Array,
  preparation:
    | 'reference'
    | 'local-handoff'
    | 'local-snapshots'
    | 'account-snapshots'
    | 'account-text' = 'reference',
  deviceLabelId?: string,
) => {
  let date = '2026-09-08';
  let refuse = false,
    fail = false,
    release: (() => void) | undefined,
    gate: Promise<void> | undefined;
  const account = preparation.startsWith('account-');
  const sources: import('../src/crdt/sourceCapture').SourceUpdate[][] = [];
  const direct: Uint8Array[] = [];
  let beforeAppend: (() => void) | undefined;
  const owned: { state: PreparedWorkspaceState; scope: PreparationScope }[] = [],
    retired: PreparedWorkspaceState[] = [];
  const preparations: number[] = [],
    writeReferences: Uint8Array[] = [];
  let corrupt = false;
  const abort = new AbortController(),
    disk: Uint8Array[] = seed ? [seed] : [],
    wal: Uint8Array[] = [];
  const carrier = {
    ...(account
      ? {
          captureLocal(
            update: Uint8Array,
            captured: import('../src/crdt/sourceCapture').SourceUpdate[],
          ) {
            sources.push(captured.map((s) => ({ ...s, bytes: s.bytes.slice() })));
            return update.slice();
          },
        }
      : {}),
    state: 'active',
    signal: abort.signal,
    loadRecovery: async () => ({
      records: disk.map((bytes) => ({ kind: 'update', bytes: bytes.slice() })),
      journal: wal.map((bytes) => ({ bytes: bytes.slice() })),
    }),
    appendLocal(bytes: Uint8Array) {
      beforeAppend?.();
      if (refuse) return { status: 'refused', reason: 'quota' };
      wal.push(bytes.slice());
      return { status: 'journalled' };
    },
    async appendBatch(records: { bytes: Uint8Array }[]) {
      writeReferences.push(...records.map((r) => r.bytes));
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
  let prepareRemote!: OwnedPreparedReceiveQueue;
  const doc = await createAdmittedWorkspace(
    (options) => {
      const local = options[localWorkspacePreparation];
      return createAdmissionOwner(
        carrier,
        {
          ...options,
          ...(options[accountTextPreparation]
            ? {
                [accountTextPreparation]: {
                  prepare(input, head) {
                    const result = options[accountTextPreparation]!.prepare(input, head);
                    if (result) {
                      preparations.push(head.writer);
                      direct.push(result.update);
                    }
                    return result;
                  },
                },
              }
            : {}),
          prepare: (...args) => {
            preparations.push(args[0].clientID);
            return options.prepare(...args);
          },
          ...(local
            ? {
                [localWorkspacePreparation]: {
                  ...local,
                  accept(state, revision) {
                    const previous = local.accept(state, revision);
                    if (previous) retired.push(previous);
                    return previous;
                  },
                  command(context, input, scope) {
                    preparations.push(context.writer);
                    let candidate: PreparedWorkspaceState | undefined;
                    const result = local.command(context, input, {
                      ...scope,
                      ownState(state) {
                        scope.ownState(state);
                        owned.push({ state, scope });
                        candidate = state;
                      },
                    });
                    if (corrupt) candidate!.history.doc.getText('uncovered').insert(0, 'drift');
                    return result;
                  },
                },
              }
            : {}),
        },
        (_receive, prepare) => {
          prepareRemote = prepare;
        },
      );
    },
    {
      identity,
      ...(deviceLabelId ? { deviceLabelId } : {}),
      ...(account ? { captureSources: true, suppressEmptySources: true } : {}),
      validateReceive: () => {},
      today: () => date,
    },
    preparation,
  );
  const emitted: Uint8Array[] = [];
  doc.outgoing((b) => emitted.push(b));
  return {
    doc,
    prepareRemote,
    sources,
    direct,
    beforeAppend: (fn: () => void) => {
      beforeAppend = fn;
    },
    owned,
    retired,
    preparations,
    writeReferences,
    corrupt: () => {
      corrupt = true;
    },
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
const referenceAndOptimizedWorkspacePreparations = [
  'reference',
  'local-handoff',
  'local-snapshots',
  'account-snapshots',
  'account-text',
] as const;
describe.each(referenceAndOptimizedWorkspacePreparations)(
  'workspace preparation %s',
  (preparation) => {
    const fixture = (seed?: Uint8Array) => makeFixture(seed, preparation);
    const insert = (text: string) => ({ name: 'insert' as const, text });
    describe('admitted workspace commands and history', () => {
      it('keeps line movement private until retry, then preserves undo/redo and cold text', async () => {
        const f = await fixture();
        try {
          const text = master(f.doc);
          await text.input(insert('one\ntwo\nthree')).accepted;
          const before = text.read();
          const sent = f.emitted.length;
          f.refuse();
          f.fail();
          const move = text.input({ name: 'moveLineUp' }, selection(5));
          await until(() => f.doc.status.state === 'blocked');
          expect(text.read()).toEqual(before);
          expect(f.emitted).toHaveLength(sent);
          f.doc.retry();
          await move.accepted;
          expect(text.read().text).toBe('two\none\nthree');
          expect(text.read().selection).toEqual(selection(1));
          await text.input({ name: 'moveLineDown' }).accepted;
          expect(text.read().text).toBe('one\ntwo\nthree');
          expect(text.read().selection).toEqual(selection(5));
          await text.input({ name: 'undo' }).accepted;
          expect(text.read().text).toBe('two\none\nthree');
          await text.input({ name: 'redo' }).accepted;
          expect(text.read().text).toBe('one\ntwo\nthree');
          await f.doc.whenDurable();
          const cold = createDoc();
          try {
            for (const bytes of [...f.disk, ...f.wal]) applyUpdate(cold, bytes);
            expect(cold.getText('master').toString()).toBe('one\ntwo\nthree');
          } finally {
            cold.destroy();
          }
        } finally {
          await f.doc.close();
        }
      });

      it.each(['next', 'scheduled', 'done'] as const)(
        'moves noncontiguous Goals lines to %s with one undo and durable replay',
        async (section) => {
          const f = await fixture();
          try {
            const text = '- first\nkeep\n- last';
            await master(f.doc).input(insert(text)).accepted;
            const before = f.doc.read().undo;
            const observed: { master: string; count: number }[] = [];
            const unsubscribe = f.doc.subscribe(() => {
              const view = f.doc.read();
              observed.push({ master: view.master, count: view.cards.length });
            });
            const moved = await f.doc.command({
              kind: 'move-from-master',
              to: { ...next, section },
              lines: [
                { line: 0, text: '- first' },
                { line: 2, text: '- last' },
              ],
            }).accepted;
            unsubscribe();
            expect(moved.value).toBe(2);
            expect(observed).toEqual([{ master: 'keep', count: 2 }]);
            expect(f.doc.read().undo).toBe(before + 1);
            const ids = f.doc.read().days.find((day) => day.date === next.date)![section];
            expect(
              ids.map((id) => f.doc.read().cards.find((card) => card.id === id)!.text),
            ).toEqual(section === 'done' ? ['last', 'first'] : ['first', 'last']);
            await f.doc.command({ kind: 'undo' }).accepted;
            expect(f.doc.read().master).toBe(text);
            expect(f.doc.read().cards).toHaveLength(0);
            await f.doc.command({ kind: 'redo' }).accepted;
            expect(f.doc.read().master).toBe('keep');
            expect(f.doc.read().cards).toHaveLength(2);
            const reopened = await fixture(f.doc.snapshot());
            try {
              expect(reopened.doc.read().master).toBe('keep');
              expect(reopened.doc.read().cards).toHaveLength(2);
            } finally {
              await reopened.doc.close();
            }
          } finally {
            await f.doc.close();
          }
        },
      );
      it('refuses an entire Goals move when Next has insufficient room or the day is frozen', async () => {
        const f = await fixture();
        try {
          await create(f.doc, 'existing one');
          await create(f.doc, 'existing two');
          await master(f.doc).input(insert('one\ntwo')).accepted;
          const lines = [
            { line: 0, text: 'one' },
            { line: 1, text: 'two' },
          ];
          const before = f.doc.read();
          for (const to of [next, { date: '2026-09-01', section: 'done' as const }]) {
            expect(
              (await f.doc.command({ kind: 'move-from-master', to, lines }).accepted).value,
            ).toBe(0);
            expect(f.doc.read()).toEqual(before);
          }
        } finally {
          await f.doc.close();
        }
      });
      it('retains blank and markup-only Goals lines that do not become cards', async () => {
        const f = await fixture();
        try {
          const rows = ['- [ ] ', '- item', '', 'keep'];
          await master(f.doc).input(insert(rows.join('\n'))).accepted;
          expect(
            (
              await f.doc.command({
                kind: 'move-from-master',
                to: done,
                lines: rows.slice(0, 3).map((text, line) => ({ line, text })),
              }).accepted
            ).value,
          ).toBe(1);
          expect(f.doc.read().master).toBe('- [ ] \n\nkeep');
          expect(f.doc.read().cards.map((card) => card.text)).toEqual(['item']);
        } finally {
          await f.doc.close();
        }
      });
      it.each([false, true])(
        'a queued Goals move handles edits inside its source: %s',
        async (inside) => {
          const f = await fixture();
          try {
            await master(f.doc).input(insert('keep\nmove')).accepted;
            f.pause();
            f.refuse();
            const editing = master(f.doc).input(
              insert(inside ? 'changed ' : 'prefix\n'),
              selection(inside ? 5 : 0),
            );
            const moving = f.doc.command({
              kind: 'move-from-master',
              to: done,
              lines: [{ line: 1, text: 'move' }],
            });
            f.resume();
            await editing.accepted;
            const result = await moving.accepted;
            expect(result.value).toBe(inside ? false : 1);
            expect(f.doc.read().master).toBe(inside ? 'keep\nchanged move' : 'prefix\nkeep');
            expect(f.doc.read().cards).toHaveLength(inside ? 0 : 1);
          } finally {
            f.resume();
            await f.doc.close();
          }
        },
      );
      it('projects retained legacy archives as read-only bodies without creating live cards', async () => {
        const seed = createDoc();
        const day = newMap();
        seed.getMap('days').set('2026-08-01', day);
        const archived = { next: ['old next'], scheduled: [], done: ['old done'] };
        day.set('archive', newText(serializeCollections(archived)));
        const f = await fixture(new Uint8Array(encodeState(seed)));
        seed.destroy();
        try {
          expect(f.doc.read().days.find((d) => d.date === '2026-08-01')?.archived).toEqual(
            archived,
          );
          expect(f.doc.read().cards).toEqual([]);
          expect(
            f.doc.exportEntries().find((entry) => entry.path === 'days/2026-08-01.md')?.content,
          ).toContain('old done');
        } finally {
          await f.doc.close();
        }
      });
      it('archive projection refreshes content and membership without lending cached arrays to callers', async () => {
        const seed = createDoc(),
          day = newMap();
        seed.getMap('days').set('2026-08-01', day);
        day.set(
          'archive',
          newText(serializeCollections({ next: ['old'], scheduled: [], done: ['kept'] })),
        );
        const f = await fixture(new Uint8Array(encodeState(seed)));
        seed.destroy();
        const archive = () => f.doc.read().days.find((d) => d.date === '2026-08-01')!.archived!;
        try {
          (archive().next as string[]).push('caller mutation');
          expect(archive().next).toEqual(['old']);
          await f.doc.receive(
            remote(f.doc, (d) => {
              const day = d.getMap('days').get('2026-08-01') as ReturnType<typeof newMap>;
              day.set('next', newArray());
            }),
          ).accepted;
          expect(archive().next).toEqual([]);
          await f.doc.receive(
            remote(f.doc, (d) => {
              const day = d.getMap('days').get('2026-08-01') as ReturnType<typeof newMap>;
              day.delete('next');
              day.set(
                'archive',
                newText(serializeCollections({ next: ['new'], scheduled: [], done: [] })),
              );
            }),
          ).accepted;
          expect(archive().next).toEqual(['new']);
          await f.doc.receive(
            remote(f.doc, (d) => {
              (d.getMap('days').get('2026-08-01') as ReturnType<typeof newMap>).delete('archive');
            }),
          ).accepted;
          expect(archive()).toBeUndefined();
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
      it('associates legacy names with verified device IDs and projects synced labels without changing provenance', async () => {
        const legacy = await fixture();
        let current: Awaited<ReturnType<typeof makeFixture>> | undefined;
        let reopened: Awaited<ReturnType<typeof makeFixture>> | undefined;
        try {
          await legacy.doc.command({ kind: 'device-label', name: 'Kitchen laptop' }).accepted;
          current = await makeFixture(legacy.doc.snapshot(), preparation, 'certified-device-one');
          expect(current.doc.read().deviceId).toBe('certified-device-one');
          expect(current.doc.read().deviceName).toBe('Kitchen laptop');
          expect(current.doc.read().deviceLabels['certified-device-one']).toBe('Kitchen laptop');
          await current.doc.receive(
            remote(current.doc, (doc) => {
              doc.getMap('meta').set('device-label:certified-device-two', 'Phone');
            }),
          ).accepted;
          await current.doc.command({ kind: 'device-label', name: 'Renamed laptop' }).accepted;
          expect(current.doc.read().deviceLabels).toMatchObject({
            'device-one': 'Renamed laptop',
            'certified-device-one': 'Renamed laptop',
            'certified-device-two': 'Phone',
          });
          await current.doc.receive(
            remote(current.doc, (doc) => {
              doc.getMap('meta').set('device-label:certified-device-one', 'Synced laptop');
            }),
          ).accepted;
          reopened = await makeFixture(current.doc.snapshot(), preparation, 'certified-device-one');
          expect(reopened.doc.read().deviceName).toBe('Synced laptop');
          expect(reopened.doc.read().deviceLabels['certified-device-two']).toBe('Phone');
          expect(reopened.doc.read().actors.find((actor) => actor.id === identity.id)?.name).toBe(
            'Alice',
          );
        } finally {
          await legacy.doc.close();
          await current?.doc.close();
          await reopened?.doc.close();
        }
      });
      it('publishes the current default device name and upgrades the old placeholder', async () => {
        const current = await makeFixture(undefined, preparation, 'certified-device-one');
        let reopened: Awaited<ReturnType<typeof makeFixture>> | undefined;
        try {
          expect(current.doc.read().deviceLabels['certified-device-one']).toBe('test device');
          await current.doc.receive(
            remote(current.doc, (doc) => {
              doc.getMap('meta').set('device-label:certified-device-one', 'This device');
            }),
          ).accepted;
          reopened = await makeFixture(current.doc.snapshot(), preparation, 'certified-device-one');
          expect(reopened.doc.read().deviceName).toBe('test device');
          expect(reopened.doc.read().deviceLabels['certified-device-one']).toBe('test device');
        } finally {
          await current.doc.close();
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
      it('keeps incremental text projections detached and falls back for structural and remote changes', async () => {
        const f = await fixture();
        try {
          const first = await create(f.doc, 'first');
          await create(f.doc, 'second');
          const pristine = f.doc.read();
          const poisoned = f.doc.read();
          (poisoned as { master: string }).master = 'caller mutation';
          poisoned.cards[0]!.text = 'caller mutation';
          poisoned.cards[0]!.location!.date = '2030-01-01';
          (poisoned.days[0]!.next as string[]).length = 0;
          poisoned.actors[0]!.name = 'caller mutation';
          poisoned.settings.rolloverHour = 13;
          expect(f.doc.read()).toEqual(pristine);
          const compareCold = async () => {
            const cold = await makeFixture(f.doc.snapshot(), 'reference');
            try {
              const { undo: _undo, redo: _redo, ...actual } = f.doc.read();
              const { undo: _coldUndo, redo: _coldRedo, ...expected } = cold.doc.read();
              expect(actual).toEqual(expected);
            } finally {
              await cold.doc.close();
            }
          };
          await f.doc.text({ kind: 'card', id: first }).input(insert('!'), selection(5)).accepted;
          await compareCold();
          expect(pristine.cards.find((card) => card.id === first)!.text).toBe('first');
          await master(f.doc).input(insert('master')).accepted;
          await compareCold();
          await f.doc.command({ kind: 'move', id: first, to: done }).accepted;
          await compareCold();
          await f.doc.command({ kind: 'undo' }).accepted;
          await compareCold();
          await f.doc.command({ kind: 'settings', rolloverHour: 4 }).accepted;
          await compareCold();
          await f.doc.command({ kind: 'actor', patch: { name: 'Renamed' } }).accepted;
          await compareCold();
          await f.doc.receive(
            remote(f.doc, (doc) => {
              doc.getText('master').insert(0, 'remote ');
              doc.getMap('meta').set('device-label:device-one', 'Remote label');
              doc.getText('unknown-extension').insert(0, 'not a projected field');
            }),
          ).accepted;
          await compareCold();
          expect(f.doc.read().deviceName).toBe('Remote label');
          await f.doc.text({ kind: 'card', id: first }).input(insert('?'), selection(6)).accepted;
          await compareCold();
        } finally {
          await f.doc.close();
        }
      });
      it('refreshes cached projections when a later history fork normalizes UTF-16 fields', async () => {
        const f = await fixture();
        try {
          const id = await create(f.doc);
          for (const text of ['\uD800', '\uDC00', '😀']) {
            await master(f.doc).input(insert(text)).accepted;
            f.doc.read();
            await f.doc.text({ kind: 'card', id }).input(insert('!')).accepted;
            expect(f.doc.read().master).toBe(master(f.doc).read().text);
            await f.doc.command({ kind: 'actor', patch: { name: text } }).accepted;
            await f.doc.command({ kind: 'device-label', name: text }).accepted;
            f.doc.read();
            await f.doc.text({ kind: 'card', id }).input(insert('?')).accepted;
            const cold = await makeFixture(f.doc.snapshot(), 'reference');
            try {
              expect(f.doc.read().actors).toEqual(cold.doc.read().actors);
              expect(f.doc.read().deviceName).toEqual(cold.doc.read().deviceName);
            } finally {
              await cold.doc.close();
            }
          }
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

    it.skipIf(preparation === 'account-text')(
      'private prepared histories remain unpublished under pressure and are disposed on discard and drained close',
      async () => {
        const histories = new Set<Y.Doc>(),
          original = Y.Doc.prototype.transact;
        const spy = vi.spyOn(Y.Doc.prototype, 'transact').mockImplementation(function <T>(
          this: Y.Doc,
          fn: (tr: Y.Transaction) => T,
          origin?: unknown,
        ): T {
          if (
            !this.gc &&
            origin &&
            typeof origin === 'object' &&
            'kind' in origin &&
            origin.kind === 'human'
          )
            histories.add(this);
          return original.call(this, fn, origin) as T;
        });
        let f: Awaited<ReturnType<typeof fixture>> | undefined;
        try {
          f = await fixture();
          await master(f.doc).input(insert('kept')).accepted;
          const accepted = [...histories].at(-1)!;
          expect(accepted).toBeDefined();
          f.refuse();
          f.fail();
          const refused = master(f.doc).input(insert('refused'));
          await until(() => f!.doc.status.state === 'blocked');
          const abandoned = [...histories].at(-1)!;
          expect(abandoned).not.toBe(accepted);
          expect(abandoned.isDestroyed).toBe(false);
          expect(f.doc.read().master, 'refused history must not be published').toBe('kept');
          expect(f.emitted).toHaveLength(1);
          f.doc.discardPending();
          await expect(refused.accepted).rejects.toHaveProperty('code', 'discarded');
          expect(abandoned.isDestroyed, 'discard must dispose its private history').toBe(true);
          expect(accepted.isDestroyed).toBe(false);
          f.pause();
          const late = master(f.doc).input(insert('late'));
          await until(() => [...histories].at(-1) !== abandoned);
          const closingHistory = [...histories].at(-1)!;
          expect(closingHistory.isDestroyed).toBe(false);
          expect(f.doc.read().master).toBe('kept');
          const closing = f.doc.close();
          f.resume();
          await closing;
          await expect(late.accepted).rejects.toHaveProperty('code', 'inactive-session');
          expect(f.emitted, 'close must not publish a late preparation').toHaveLength(1);
          expect(
            [...histories].every((d) => d.isDestroyed),
            'close must dispose every owned history',
          ).toBe(true);
        } finally {
          await f?.doc.close();
          for (const history of histories) history.destroy();
          spy.mockRestore();
        }
      },
    );
    it('no-op and remote writer collisions renew the verified preparation basis', async () => {
      const f = await fixture();
      try {
        await master(f.doc).input(insert('local')).accepted;
        const writer = f.preparations.at(-1)!;
        const revision = f.doc.status.revision;
        await f.doc.command({ kind: 'device-label', name: 'test device' }).accepted;
        expect(f.doc.status.revision).toBe(revision + 1);
        const peer = createDoc();
        let bytes: Uint8Array<ArrayBuffer> | undefined;
        try {
          applyUpdate(peer, f.doc.snapshot());
          peer.clientID = writer;
          peer.on('update', (update) => {
            bytes = new Uint8Array(update);
          });
          peer.getText('master').insert(5, 'remote');
        } finally {
          peer.destroy();
        }
        await f.doc.receive(bytes!).accepted;
        await master(f.doc).input(insert('next'), selection(0)).accepted;
        expect(f.preparations.at(-1)).not.toBe(writer);
        expect(f.doc.status.revision).toBe(revision + 3);
        expect(f.doc.read().master).toBe('nextlocalremote');
      } finally {
        await f.doc.close();
      }
    });
    it('reentrant observers enqueue against the next verified state after the current slice finishes', async () => {
      const f = await fixture();
      let queued = false,
        nested: Promise<unknown> | undefined;
      try {
        f.doc.subscribe(() => {
          if (queued) return;
          queued = true;
          expect(f.doc.read().master).toBe('first');
          nested = master(f.doc).input(insert('second'), selection(5)).accepted;
        });
        await master(f.doc).input(insert('first')).accepted;
        await nested;
        expect(f.doc.read().master).toBe('firstsecond');
        expect(f.doc.read().undo).toBe(2);
      } finally {
        await f.doc.close();
      }
    });
    it('generated histories retain command results, retry bytes, selections and cold replay', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.constantFrom('insert', 'retry', 'discard', 'remote', 'undo', 'redo', 'noop'),
            {
              minLength: 1,
              maxLength: 18,
            },
          ),
          async (steps) => {
            const f = await fixture();
            let local = '',
              remoteText = '',
              revision = f.doc.status.revision;
            const undo: string[] = [],
              redo: string[] = [];
            try {
              for (const step of steps) {
                if (step === 'insert' || step === 'retry' || step === 'discard') {
                  const beforeCalls = f.preparations.length;
                  if (step !== 'insert') {
                    f.refuse();
                    f.fail();
                  }
                  const ticket = master(f.doc).input(insert('x'), selection(0));
                  if (step !== 'insert') {
                    await until(() => f.doc.status.state === 'blocked');
                    expect(f.doc.read().master).toBe(local + remoteText);
                    expect(f.preparations.length).toBe(beforeCalls + 1);
                    if (step === 'discard') {
                      f.doc.discardPending();
                      await expect(ticket.accepted).rejects.toMatchObject({ code: 'discarded' });
                    } else {
                      f.doc.retry();
                      await ticket.accepted;
                      expect(f.preparations.length, 'retry must reuse the retained candidate').toBe(
                        beforeCalls + 1,
                      );
                    }
                  } else await ticket.accepted;
                  if (step !== 'discard') {
                    undo.push(local);
                    redo.length = 0;
                    local = 'x' + local;
                    revision++;
                    expect(master(f.doc).read().selection).toEqual(selection(1));
                  }
                } else if (step === 'remote') {
                  await f.doc.receive(
                    remote(f.doc, (d) => {
                      const text = d.getText('master');
                      text.insert(text.length, 'R');
                    }),
                  ).accepted;
                  remoteText += 'R';
                  revision++;
                } else {
                  const action = step === 'noop' ? 'device-label' : step;
                  await f.doc.command(
                    action === 'device-label'
                      ? { kind: action, name: 'test device' }
                      : { kind: action },
                  ).accepted;
                  revision++;
                  if (step === 'undo' && undo.length) {
                    redo.push(local);
                    local = undo.pop()!;
                  }
                  if (step === 'redo' && redo.length) {
                    undo.push(local);
                    local = redo.pop()!;
                  }
                }
                expect(f.doc.status.revision).toBe(revision);
                expect(f.doc.read().master).toBe(local + remoteText);
                expect(f.doc.read().undo).toBe(undo.length);
                expect(f.doc.read().redo).toBe(redo.length);
                const cold = createDoc();
                try {
                  for (const bytes of [...f.disk, ...f.wal]) applyUpdate(cold, bytes);
                  expect(cold.getText('master').toString()).toBe(local + remoteText);
                } finally {
                  cold.destroy();
                }
              }
            } finally {
              await f.doc.close();
            }
          },
        ),
        { numRuns: 80, seed: 140925 },
      );
    });
    it('generated master and card selection snapshots follow an independent undo and recovery ledger', async () => {
      const setup = await fixture();
      let seed: Uint8Array, id: string;
      try {
        id = await create(setup.doc, 'card');
        await master(setup.doc).input(insert('master')).accepted;
        seed = setup.doc.snapshot();
      } finally {
        await setup.doc.close();
      }
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              kind: fc.constantFrom('edit', 'retry', 'discard', 'undo', 'redo', 'remote'),
              card: fc.boolean(),
              at: fc.nat(40),
            }),
            { maxLength: 14 },
          ),
          async (suffix) => {
            const f = await fixture(seed);
            type State = { text: string[]; positions: (number | null)[] };
            let current: State = { text: ['master', 'card'], positions: [null, null] };
            const undo: { before: State; after: State }[] = [],
              redo: typeof undo = [];
            let revision = f.doc.status.revision;
            const targets = [{ kind: 'master' as const }, { kind: 'card' as const, id }];
            const observed = () => targets.map((target) => f.doc.text(target).read());
            const check = () => {
              const actual = observed();
              expect(
                actual.map((r) => r.text),
                'selection ledger text',
              ).toEqual(current.text);
              expect(
                actual.map((r) => r.selection),
                'selection snapshot restore must match the independent ledger',
              ).toEqual(current.positions.map((at) => selection(at ?? 0)));
              expect(f.doc.read().undo).toBe(undo.length);
              expect(f.doc.read().redo).toBe(redo.length);
              expect(f.doc.status.revision).toBe(revision);
              for (const r of actual)
                Object.assign(r.selection.ranges[0]!, { anchor: 9999, head: 9999 });
              expect(
                observed().map((r) => r.selection),
                'public reads must not lend selection state',
              ).toEqual(current.positions.map((at) => selection(at ?? 0)));
              const cold = createDoc();
              try {
                for (const bytes of [...f.disk, ...f.wal]) applyUpdate(cold, bytes);
                expect(targets.map((target) => targetText(cold, target).toString())).toEqual(
                  current.text,
                );
              } finally {
                cold.destroy();
              }
            };
            const prefix: typeof suffix = [
              { kind: 'edit', card: false, at: 2 },
              { kind: 'edit', card: true, at: 1 },
              { kind: 'retry', card: false, at: 3 },
              { kind: 'undo', card: false, at: 0 },
              { kind: 'redo', card: false, at: 0 },
              { kind: 'discard', card: true, at: 2 },
              { kind: 'remote', card: false, at: 0 },
              { kind: 'undo', card: false, at: 0 },
              { kind: 'redo', card: false, at: 0 },
            ];
            try {
              check();
              for (const step of [...prefix, ...suffix]) {
                if (['edit', 'retry', 'discard'].includes(step.kind)) {
                  const index = step.card ? 1 : 0,
                    before = structuredClone(current);
                  const at = step.at % (current.text[index]!.length + 1),
                    inputSelection = selection(at);
                  const preparations = f.preparations.length;
                  if (step.kind !== 'edit') {
                    f.refuse();
                    f.fail();
                  }
                  const ticket = f.doc.text(targets[index]!).input(insert('x'), inputSelection);
                  inputSelection.ranges[0]!.anchor = 9999;
                  inputSelection.ranges[0]!.head = 9999;
                  if (step.kind !== 'edit') {
                    await until(() => f.doc.status.state === 'blocked');
                    check();
                    expect(f.preparations.length).toBe(preparations + 1);
                    if (step.kind === 'discard') {
                      f.doc.discardPending();
                      await expect(ticket.accepted).rejects.toMatchObject({ code: 'discarded' });
                    } else {
                      f.doc.retry();
                      await ticket.accepted;
                    }
                  } else await ticket.accepted;
                  expect(
                    f.preparations.length,
                    'retry must retain the prepared selection snapshot',
                  ).toBe(preparations + 1);
                  if (step.kind !== 'discard') {
                    current.text[index] =
                      current.text[index]!.slice(0, at) + 'x' + current.text[index]!.slice(at);
                    current.positions[index] = at + 1;
                    undo.push({ before, after: structuredClone(current) });
                    redo.length = 0;
                    revision++;
                  }
                } else if (step.kind === 'remote') {
                  await f.doc.receive(
                    remote(f.doc, (d) => {
                      for (const target of targets) targetText(d, target).insert(0, 'R');
                    }),
                  ).accepted;
                  // Independent model: a remote prefix survives local undo and shifts every
                  // captured cursor that existed at that historical point. Unset stays unset.
                  const states = new Set([
                    current,
                    ...[...undo, ...redo].flatMap((frame) => [frame.before, frame.after]),
                  ]);
                  for (const state of states) {
                    state.text = state.text.map((s) => 'R' + s);
                    state.positions = state.positions.map((p) => (p === null ? null : p + 1));
                  }
                  revision++;
                } else {
                  await f.doc.command({ kind: step.kind as 'undo' | 'redo' }).accepted;
                  const frame = (step.kind === 'undo' ? undo : redo).pop();
                  if (frame) {
                    (step.kind === 'undo' ? redo : undo).push(frame);
                    current = structuredClone(step.kind === 'undo' ? frame.before : frame.after);
                  }
                  revision++;
                }
                check();
              }
            } finally {
              await f.doc.close();
            }
          },
        ),
        { seed: 150902, numRuns: 80 },
      );
    });
  },
);
const insert = (text: string) => ({ name: 'insert' as const, text });
it('Local leases preserve an in-flight write through close without late publication', async () => {
  const f = await makeFixture(undefined, 'local-handoff');
  f.refuse();
  f.pause();
  const ticket = master(f.doc).input(insert('unacknowledged write'));
  await until(() => f.writeReferences.length > 0);
  const reference = f.writeReferences.at(-1)!;
  const expected = reference.slice();
  const emitted = f.emitted.length;
  await f.doc.close();
  await expect(ticket.accepted).rejects.toMatchObject({ code: 'inactive-session' });
  expect(f.disk.at(-1), 'write must not observe erased handoff bytes').toEqual(expected);
  expect(reference.every((b) => b === 0)).toBe(true);
  expect(f.emitted.length).toBe(emitted);
});
it('Local post-promotion mismatch closes before publication and cannot be retried', async () => {
  const f = await makeFixture(undefined, 'local-handoff');
  let publications = 0;
  f.doc.subscribe(() => {
    try {
      f.doc.read();
      publications++;
    } catch {}
  });
  f.corrupt();
  const ticket = master(f.doc).input(insert('durable'));
  await expect(ticket.accepted).rejects.toMatchObject({ code: 'inactive-session' });
  await f.doc.close();
  expect(publications, 'unverified candidate must never be published').toBe(0);
  expect(() => f.doc.read()).toThrow('Prepared workspace adoption failed.');
  expect(f.emitted).toEqual([]);
  expect(() => f.doc.retry()).toThrow();
  const cold = createDoc();
  try {
    for (const bytes of [...f.disk, ...f.wal]) applyUpdate(cold, bytes);
    expect(cold.getText('master').toString()).toBe('durable');
    expect(cold.getText('uncovered').toString()).toBe('');
  } finally {
    cold.destroy();
  }
});

it('Selection snapshot post-promotion mismatch closes before publication and cannot be retried', async () => {
  const f = await makeFixture(undefined, 'local-snapshots');
  let publications = 0;
  f.doc.subscribe(() => {
    try {
      f.doc.read();
      publications++;
    } catch {}
  });
  f.corrupt();
  const ticket = master(f.doc).input(insert('durable'));
  await expect(ticket.accepted).rejects.toMatchObject({ code: 'inactive-session' });
  await f.doc.close();
  expect(publications, 'unverified candidate must never be published').toBe(0);
  expect(() => f.doc.read()).toThrow('Prepared workspace adoption failed.');
  expect(f.emitted).toEqual([]);
  expect(() => f.doc.retry()).toThrow();
  const cold = createDoc();
  try {
    for (const bytes of [...f.disk, ...f.wal]) applyUpdate(cold, bytes);
    expect(cold.getText('master').toString()).toBe('durable');
    expect(cold.getText('uncovered').toString()).toBe('');
  } finally {
    cold.destroy();
  }
});

it('selection history activates only by explicit Local selection and closes on failed startup', async () => {
  const original = historySeam.createSelectionHistory;
  let creates = 0,
    closes = 0,
    opens = 0;
  const spy = vi.spyOn(historySeam, 'createSelectionHistory').mockImplementation(() => {
    creates++;
    const owner = original();
    return Object.freeze({
      ...owner,
      close() {
        closes++;
        owner.close();
      },
    });
  });
  const options = { identity, validateReceive: () => {} };
  const open = async () => {
    opens++;
    throw Error('startup fault');
  };
  try {
    await expect(createAdmittedWorkspace(open, options)).rejects.toThrow('startup fault');
    await expect(createAdmittedWorkspace(open, options, 'local-handoff')).rejects.toThrow(
      'startup fault',
    );
    expect(creates, 'default and existing Local path must keep the reference metadata').toBe(0);
    await expect(
      createAdmittedWorkspace(open, { ...options, captureSources: true }, 'local-snapshots'),
    ).rejects.toThrow('Local preparation cannot capture Account sources');
    expect(opens).toBe(2);
    expect(creates).toBe(0);
    await expect(createAdmittedWorkspace(open, options, 'local-snapshots')).rejects.toThrow(
      'startup fault',
    );
    expect(creates).toBe(1);
    expect(closes, 'failed startup must close its selection owner').toBe(1);
    await expect(
      createAdmittedWorkspace(
        () => {
          throw Error('synchronous startup fault');
        },
        options,
        'local-snapshots',
      ),
    ).rejects.toThrow('synchronous startup fault');
    expect(closes, 'synchronous startup failure must close its selection owner').toBe(2);
  } finally {
    spy.mockRestore();
  }
});

it('selection owner outlives its retained write and closes only after all workspace histories are disposed', async () => {
  const original = historySeam.createSelectionHistory;
  const histories: historySeam.YUndoManager[] = [],
    closures: boolean[] = [];
  let owner: ReturnType<typeof original> | undefined;
  const spy = vi.spyOn(historySeam, 'createSelectionHistory').mockImplementation(() => {
    owner = original();
    const current = owner;
    return Object.freeze({
      ...current,
      create(...args: Parameters<typeof current.create>) {
        const h = current.create(...args);
        histories.push(h);
        return h;
      },
      fork(...args: Parameters<typeof current.fork>) {
        const h = current.fork(...args);
        histories.push(h);
        return h;
      },
      close() {
        closures.push(histories.every((h) => h.doc.isDestroyed));
        current.close();
      },
    });
  });
  let f: Awaited<ReturnType<typeof makeFixture>> | undefined;
  try {
    f = await makeFixture(undefined, 'local-snapshots');
    await master(f.doc).input(insert('kept')).accepted;
    f.refuse();
    f.pause();
    const pending = master(f.doc).input(insert('late'));
    await until(() => f!.writeReferences.length > 0);
    const bytes = f.writeReferences.at(-1)!,
      expected = bytes.slice(),
      emitted = f.emitted.length;
    const history = histories.at(-1)!,
      token = history.undoStack.at(-1)!.meta.get('after');
    expect(owner!.restore(history, token).size).toBe(1);
    const closing = f.doc.close();
    expect(closures, 'selection owner must remain live while its write drains').toEqual([]);
    await closing;
    await expect(pending.accepted).rejects.toMatchObject({ code: 'inactive-session' });
    expect(closures.length).toBeGreaterThan(0);
    expect(
      closures.every(Boolean),
      'workspace histories must be disposed before snapshot owner close',
    ).toBe(true);
    expect(() => owner!.restore(history, token)).toThrow('Selection history owner is closed');
    expect(f.disk.at(-1), 'write must not observe erased handoff bytes').toEqual(expected);
    expect(bytes.every((b) => b === 0)).toBe(true);
    expect(f.emitted.length).toBe(emitted);
  } finally {
    await f?.doc.close();
    spy.mockRestore();
  }
});

describe('persistent text buffers', () => {
  const insert = (text: string) => ({ name: 'insert' as const, text });
  it('alternates two actual histories, detaches ranges and erases consumed delta copies', async () => {
    const original = historySeam.createSelectionHistory,
      copies: Uint8Array[] = [];
    const spy = vi.spyOn(historySeam, 'createSelectionHistory').mockImplementation(() => {
      const owner = original();
      return {
        ...owner,
        catchUpText(target, source, update) {
          copies.push(update);
          return owner.catchUpText(target, source, update);
        },
      };
    });
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      const before = f.doc.read();
      for (let i = 0; i < 40; i++) {
        await master(f.doc).input(insert('x')).accepted;
        expect(f.doc.read().master).toBe('x'.repeat(i + 1));
        const current = f.owned.at(-1)!.state.history,
          other = f.retired.at(-1)!.history;
        expect(current).not.toBe(other);
        for (let j = 0; j < Math.min(current.undoStack.length, other.undoStack.length); j++) {
          const a = current.undoStack[j]!,
            b = other.undoStack[j]!;
          expect(a).not.toBe(b);
          expect(a.meta).not.toBe(b.meta);
          expect(a.insertions).not.toBe(b.insertions);
          for (const [client, ranges] of a.insertions.clients) {
            const old = b.insertions.clients.get(client);
            if (old?.length && ranges.length) expect(ranges[0]).not.toBe(old[0]);
          }
        }
      }
      expect(new Set(f.owned.map((x) => x.state.history.doc)).size).toBe(2);
      expect(copies).toHaveLength(39);
      expect(copies.every((b) => b.every((v) => v === 0))).toBe(true);
      expect(before.master).toBe('');
      const current = f.owned.at(-1)!.state;
      for (const old of f.owned.slice(0, -1)) {
        expect(() => old.scope.ownState(current)).toThrow(/already owned/);
        expect(current.history.doc.isDestroyed).toBe(false);
      }
      for (let i = 0; i < 40; i++) await f.doc.command({ kind: 'undo' }).accepted;
      expect(f.doc.read().master).toBe('');
      for (let i = 0; i < 40; i++) await f.doc.command({ kind: 'redo' }).accepted;
      expect(f.doc.read().master).toBe('x'.repeat(40));
    } finally {
      await f.doc.close();
      spy.mockRestore();
    }
    expect(f.owned.every((x) => x.state.history.doc.isDestroyed)).toBe(true);
  });

  it('reused candidates remain private under refusal, retry, discard and drained close', async () => {
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('kept')).accepted;
      const accepted = f.owned.at(-1)!.state,
        retired = f.retired.at(-1)!;
      f.refuse();
      f.fail();
      const ticket = master(f.doc).input(insert('later'));
      await until(() => f.doc.status.state === 'blocked');
      expect(f.owned.at(-1)!.state).toBe(retired);
      expect(f.doc.read().master).toBe('kept');
      expect(accepted.history.doc.getText('master').toString()).toBe('kept');
      const count = f.owned.length;
      f.doc.retry();
      await ticket.accepted;
      expect(f.owned).toHaveLength(count);
      expect(f.doc.read().master).toBe('keptlater');
      f.fail();
      const discarded = master(f.doc).input(insert('discarded'));
      await until(() => f.doc.status.state === 'blocked');
      const abandoned = f.owned.at(-1)!.state;
      f.doc.discardPending();
      await expect(discarded.accepted).rejects.toHaveProperty('code', 'discarded');
      expect(abandoned.history.doc.isDestroyed).toBe(true);
      expect(f.doc.read().master).toBe('keptlater');
      await master(f.doc).input(insert('new')).accepted;
      f.pause();
      const writes = f.writeReferences.length;
      const late = master(f.doc).input(insert('late'));
      await until(() => f.writeReferences.length > writes);
      const pending = f.owned.at(-1)!.state;
      const closing = f.doc.close();
      expect(pending.history.doc.isDestroyed).toBe(false);
      f.resume();
      await closing;
      await expect(late.accepted).rejects.toHaveProperty('code', 'inactive-session');
      expect(f.owned.every((x) => x.state.history.doc.isDestroyed)).toBe(true);
    } finally {
      f.resume();
      await f.doc.close();
    }
  });

  it('resets retired buffers before remote and structural changes, then rebuilds eligibility', async () => {
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('A')).accepted;
      let retired = f.retired.at(-1)!;
      await f.doc.receive(remote(f.doc, (d) => d.getText('master').insert(0, 'R'))).accepted;
      expect(retired.history.doc.isDestroyed).toBe(true);
      await master(f.doc).input(insert('B'), selection(2)).accepted;
      retired = f.retired.at(-1)!;
      await f.doc.command({ kind: 'device-label', name: 'updated' }).accepted;
      expect(retired.history.doc.isDestroyed).toBe(true);
      await master(f.doc).input(insert('C')).accepted;
      const nextSpare = f.retired.at(-1)!;
      await master(f.doc).input(insert('D')).accepted;
      expect(f.owned.at(-1)!.state).toBe(nextSpare);
      expect(f.doc.read().master).toBe('RABCD');
      expect(f.doc.read().deviceName).toBe('updated');
    } finally {
      await f.doc.close();
    }
  });

  it('surrogate bases retain fresh-fork normalization rather than reuse', async () => {
    for (const text of ['emoji \u{1f600}', 'lone \ud800', 'lone \udc00']) {
      const seed = createDoc();
      seed.getText('master').insert(0, text);
      const f = await makeFixture(new Uint8Array(encodeState(seed)), 'local-snapshots');
      seed.destroy();
      try {
        for (let i = 0; i < 4; i++) await master(f.doc).input(insert('x'), selection(0)).accepted;
        // Valid pairs remain excluded; native encoding already normalizes lone halves in seed.
        if (text.includes('\u{1f600}')) expect(f.retired).toHaveLength(0);
        expect(f.doc.read().master).toBe(
          'xxxx' + new TextDecoder().decode(new TextEncoder().encode(text)),
        );
      } finally {
        await f.doc.close();
      }
    }
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('A')).accepted;
      const old = f.retired.at(-1)!;
      await master(f.doc).input(insert('\ud800')).accepted;
      expect(old.history.doc.isDestroyed).toBe(true);
      await master(f.doc).input(insert('B')).accepted;
      expect(f.doc.read().master).toBe('A\ufffdB');
    } finally {
      await f.doc.close();
    }
  });

  it('idle transaction fence refuses corrupted retired content before another append', async () => {
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('A')).accepted;
      const spare = f.retired.at(-1)!,
        count = f.emitted.length;
      spare.history.doc.getMap('meta').set('uncovered', 'drift');
      const ticket = master(f.doc).input(insert('B'));
      await until(() => f.doc.status.state === 'blocked');
      expect(f.doc.read().master).toBe('A');
      expect(f.emitted).toHaveLength(count);
      expect(spare.history.doc.isDestroyed).toBe(true);
      f.doc.discardPending();
      await expect(ticket.accepted).rejects.toHaveProperty('code', 'discarded');
    } finally {
      await f.doc.close();
    }
  });

  it('idle no-op transactions refuse before append and release watchers on discard and reset', async () => {
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('A')).accepted;
      const old = f.retired.at(-1)!,
        writes = f.writeReferences.length;
      old.history.doc.transact(() => {});
      const ticket = master(f.doc).input(insert('B'));
      await until(() => f.doc.status.state === 'blocked');
      expect(f.writeReferences).toHaveLength(writes);
      expect(f.doc.read().master).toBe('A');
      f.doc.discardPending();
      await expect(ticket.accepted).rejects.toHaveProperty('code', 'discarded');
      expect(old.history.doc.isDestroyed).toBe(true);
      await master(f.doc).input(insert('C')).accepted;
      const next = f.retired.at(-1)!;
      await f.doc.receive(remote(f.doc, (d) => d.getText('master').insert(0, 'R'))).accepted;
      expect(next.history.doc.isDestroyed).toBe(true);
      expect(f.doc.read().master).toBe('RAC');
    } finally {
      await f.doc.close();
    }
  });

  it.each(['local-snapshots', 'account-text'] as const)(
    'generated %s histories match fresh forks through deletion, grouping, reset and refusal',
    async (mode) => {
      const actions = fc.array(
        fc.record({
          kind: fc.constantFrom(
            'insert',
            'delete',
            'undo',
            'redo',
            'remote',
            'metadata',
            'retry',
            'discard',
            'noop',
            'unicode',
            'sliced',
          ),
          n: fc.integer({ min: 0, max: 20 }),
        }),
        { minLength: 15, maxLength: 35 },
      );
      await fc.assert(
        fc.asyncProperty(actions, async (generated) => {
          const a = await makeFixture(
              undefined,
              mode === 'account-text' ? 'account-snapshots' : 'local-handoff',
            ),
            b = await makeFixture(undefined, mode);
          const prefix = [
            'insert',
            'insert',
            'delete',
            'undo',
            'redo',
            'retry',
            'discard',
            'remote',
            'metadata',
            'noop',
          ];
          try {
            for (const step of [...prefix.map((kind) => ({ kind, n: 1 })), ...generated]) {
              const outputs = [];
              for (const f of [a, b]) {
                const text = f.doc.read().master,
                  at = Math.min(step.n, text.length);
                if (
                  ['insert', 'delete', 'retry', 'discard', 'noop', 'unicode', 'sliced'].includes(
                    step.kind,
                  )
                ) {
                  if (step.kind === 'retry' || step.kind === 'discard') {
                    f.refuse();
                    f.fail();
                  }
                  const inserted =
                    step.kind === 'unicode'
                      ? '\u{1f600}'
                      : step.kind === 'sliced'
                        ? 'q'.repeat(1001)
                        : step.kind === 'noop'
                          ? ''
                          : 'x';
                  const action =
                    step.kind === 'delete' ? { name: 'backspace' as const } : insert(inserted);
                  const ticket = master(f.doc).input(action, selection(at));
                  if (step.kind === 'retry' || step.kind === 'discard') {
                    await until(() => f.doc.status.state === 'blocked');
                    expect(f.doc.read().master).toBe(text);
                    if (step.kind === 'discard') {
                      f.doc.discardPending();
                      await expect(ticket.accepted).rejects.toHaveProperty('code', 'discarded');
                      outputs.push('discarded');
                      continue;
                    }
                    const calls = f.preparations.length;
                    f.doc.retry();
                    await ticket.accepted;
                    expect(f.preparations).toHaveLength(calls);
                  }
                  outputs.push((await ticket.accepted).revision);
                } else if (step.kind === 'remote') {
                  await f.doc.receive(
                    remote(f.doc, (d) =>
                      d.getText('master').insert(d.getText('master').length, 'R'),
                    ),
                  ).accepted;
                  outputs.push('remote');
                } else
                  outputs.push(
                    (
                      await f.doc.command(
                        step.kind === 'metadata'
                          ? { kind: 'device-label', name: 'device' + step.n }
                          : { kind: step.kind as 'undo' | 'redo' },
                      ).accepted
                    ).value,
                  );
              }
              expect(outputs[1]).toEqual(outputs[0]);
              expect(b.doc.read()).toEqual(a.doc.read());
              expect(master(b.doc).read()).toEqual(master(a.doc).read());
              expect(b.doc.status.revision).toBe(a.doc.status.revision);
            }
            const replay = createDoc();
            try {
              for (const bytes of [...b.disk, ...b.wal]) applyUpdate(replay, bytes);
              expect(replay.getText('master').toString()).toBe(b.doc.read().master);
            } finally {
              replay.destroy();
            }
          } finally {
            await a.doc.close();
            await b.doc.close();
          }
          expect(b.owned.every((x) => x.state.history.doc.isDestroyed)).toBe(true);
        }),
        { seed: 171510, numRuns: 60 },
      );
    },
    30000,
  );
});

describe('direct Account text boundary', () => {
  it('journals before changing the visible document or its undo history', async () => {
    const f = await makeFixture(undefined, 'account-text');
    try {
      const before = master(f.doc).read();
      let observed = false;
      f.beforeAppend(() => {
        observed = true;
        expect(master(f.doc).read()).toEqual(before);
        expect(f.emitted).toHaveLength(0);
      });
      await master(f.doc).input({ name: 'insert', text: 'durable first' }).accepted;
      expect(observed).toBe(true);
      expect(f.direct).toHaveLength(1);
      expect(f.wal.at(-1)).toEqual(f.emitted.at(-1));
    } finally {
      await f.doc.close();
    }
  });
  it('drains a forced write on close without applying it late and clears retained plaintext', async () => {
    const f = await makeFixture(undefined, 'account-text');
    await master(f.doc).input({ name: 'insert', text: 'kept' }).accepted;
    f.refuse();
    f.pause();
    const ticket = master(f.doc).input({ name: 'insert', text: 'late' });
    await until(() => f.direct.length === 2 && f.writeReferences.length > 0);
    const bytes = f.direct.at(-1)!;
    expect(bytes.some((v) => v !== 0)).toBe(true);
    const closing = f.doc.close();
    // Account carriers copy their input synchronously; unlike Local buffer leases,
    // the ordinary byte preparation can be erased as soon as the owner closes.
    expect(bytes.every((v) => v === 0)).toBe(true);
    f.resume();
    await closing;
    await expect(ticket.accepted).rejects.toHaveProperty('code', 'inactive-session');
    expect(bytes.every((v) => v === 0)).toBe(true);
    expect(f.emitted).toHaveLength(1);
  });
  it('refuses changed projection state between preparation and durable promotion', async () => {
    const original = historySeam.createSelectionHistory;
    let projection: Y.Doc | undefined;
    const spy = vi.spyOn(historySeam, 'createSelectionHistory').mockImplementation((reuse) => {
      const owner = original(reuse);
      return {
        ...owner,
        create(doc, origin) {
          projection = doc;
          return owner.create(doc, origin);
        },
        fork(history, origin) {
          const next = owner.fork(history, origin);
          projection = next.doc;
          return next;
        },
      };
    });
    const f = await makeFixture(undefined, 'account-text');
    try {
      f.beforeAppend(() => {
        projection!.getText('master').insert(0, 'unowned');
      });
      const ticket = master(f.doc).input({ name: 'insert', text: 'journalled' });
      await expect(ticket.accepted).rejects.toThrow();
      expect(f.emitted).toHaveLength(0);
      expect(() => f.doc.read()).toThrow();
      const cold = createDoc();
      for (const bytes of [...f.disk, ...f.wal]) applyUpdate(cold, bytes);
      expect(cold.getText('master').toString()).toBe('journalled');
      cold.destroy();
    } finally {
      spy.mockRestore();
      await f.doc.close();
    }
  });

  it('does not fork or compare on eligible text; refused text leaves undo and outgoing unchanged', async () => {
    const f = await makeFixture(undefined, 'account-text');
    const fork = vi.spyOn(historySeam, 'forkDoc');
    const compare = vi.spyOn(historySeam, 'sameDocState');
    try {
      const before = master(f.doc).read();
      f.refuse();
      f.pause();
      const pending = master(f.doc).input({ name: 'insert', text: 'private until durable' });
      expect(f.direct).toHaveLength(1);
      expect(master(f.doc).read()).toEqual(before);
      expect(f.emitted).toHaveLength(0);
      expect(fork).not.toHaveBeenCalled();
      expect(compare).not.toHaveBeenCalled();
      f.resume();
      await pending.accepted;
      expect(master(f.doc).read().text).toBe('private until durable');
      expect(f.sources.at(-1)).toHaveLength(1);
      expect(f.sources.at(-1)![0]!.actor).toBe(identity.id);
      expect(f.sources.at(-1)![0]!.bytes).toEqual(f.emitted.at(-1));
      expect(f.direct[0]!.every((v) => v === 0)).toBe(true);
      expect(fork).not.toHaveBeenCalled();
      expect(compare).not.toHaveBeenCalled();
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(master(f.doc).read().text).toBe('');
      await f.doc.command({ kind: 'redo' }).accepted;
      expect(master(f.doc).read().text).toBe('private until durable');
    } finally {
      fork.mockRestore();
      compare.mockRestore();
      await f.doc.close();
    }
  });
  it('erases a discarded failed candidate without consuming undo or writer clocks', async () => {
    const f = await makeFixture(undefined, 'account-text');
    try {
      await master(f.doc).input({ name: 'insert', text: 'accepted' }).accepted;
      const before = master(f.doc).read();
      f.refuse();
      f.fail();
      const ticket = master(f.doc).input({ name: 'insert', text: ' discard' });
      await until(() => f.doc.status.state === 'blocked');
      const retained = f.direct.at(-1)!;
      expect(retained.some((v) => v !== 0)).toBe(true);
      f.doc.discardPending();
      await expect(ticket.accepted).rejects.toThrow();
      expect(retained.every((v) => v === 0)).toBe(true);
      expect(master(f.doc).read()).toEqual(before);
      await master(f.doc).input({ name: 'insert', text: ' retry' }).accepted;
      expect(master(f.doc).read().text).toBe('accepted retry');
      await f.doc.command({ kind: 'undo' }).accepted;
      expect(master(f.doc).read().text).toBe('accepted');
    } finally {
      await f.doc.close();
    }
  });
});

it('prepared remote frames preserve intervening direct text, structural commands and undo history', async () => {
  const f = await makeFixture(undefined, 'account-text');
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const ready = new Promise<void>((r) => {
    started = r;
  });
  try {
    const update = remote(f.doc, (d) => d.getText('master').insert(0, 'REMOTE'));
    const receiving = f.prepareRemote(update, async (input, stage) => {
      started();
      await gate;
      f.disk.push(input.slice());
      stage([input], async (apply) => {
        apply();
      });
    });
    await ready;
    await f.doc
      .text({ kind: 'master' })
      .input({ name: 'insert', text: 'LOCAL' }, { ranges: [{ anchor: 0, head: 0 }], main: 0 })
      .accepted;
    await create(f.doc, 'intervening card');
    await f.doc.command({ kind: 'undo' }).accepted;
    await f.doc.command({ kind: 'redo' }).accepted;
    expect(f.doc.read().master).toBe('LOCAL');
    release();
    await receiving;
    expect(f.doc.read().master).toContain('LOCAL');
    expect(f.doc.read().master).toContain('REMOTE');
    expect(f.doc.read().cards.map((c) => c.text)).toEqual(['intervening card']);
    await f.doc.command({ kind: 'undo' }).accepted;
    expect(f.doc.read().cards).toHaveLength(0);
    await f.doc.command({ kind: 'undo' }).accepted;
    expect(f.doc.read().master).toBe('REMOTE');
    await f.doc.command({ kind: 'redo' }).accepted;
    await f.doc.command({ kind: 'redo' }).accepted;
    const snapshot = f.doc.snapshot();
    const cold = createDoc();
    for (const bytes of [...f.disk, ...f.wal]) applyUpdate(cold, bytes);
    const reopened = createDoc();
    applyUpdate(reopened, snapshot);
    expect(historySeam.sameDocState(cold, reopened)).toBe(true);
    reopened.destroy();
    cold.destroy();
  } finally {
    release?.();
    await f.doc.close();
  }
});
