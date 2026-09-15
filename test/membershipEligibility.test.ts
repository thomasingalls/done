// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { createAdmittedWorkspace, type AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import { createAdmissionOwner, type AdmissionTicket } from '../src/crdt/admissionQueue';
import { localWorkspacePreparation } from '../src/crdt/workspacePreparation';
import type { JournalSession } from '../src/crdt/custody';
import {
  Y,
  createDoc,
  applyUpdate,
  workspaceUndo,
  forkWorkspaceHistory,
  sameDocState,
} from '../src/crdt/yjs';
import {
  createWorkspaceCommandRunner,
  runWorkspaceCommand,
  type WorkspaceIntent,
  type RelativeSelection,
} from '../src/crdt/workspaceCommands';
import * as days from '../src/crdt/days';

const identity = {
  id: 'human-one',
  actor: { kind: 'human' as const, name: 'Alice', color: '#123456' },
  device: { id: 'device-one', name: 'test' },
};
const human = { actor: identity.id, kind: 'human' as const, device: identity.device.id };
const system = { actor: 'system', kind: 'system' as const, device: identity.device.id };
const context = { identity, human, system, today: '2026-09-08' };
const next = { date: context.today, section: 'next' as const };
const insert = (text: string) => ({ name: 'insert' as const, text });
const master = (w: AdmittedWorkspace) => w.text({ kind: 'master' });
const selection = (n: number) => ({ ranges: [{ anchor: n, head: n }], main: 0 });
const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw Error('Condition not reached');
};
const remote = (w: AdmittedWorkspace, change: (d: Y.Doc) => void) => {
  const d = createDoc();
  applyUpdate(d, w.snapshot());
  const updates: Uint8Array<ArrayBuffer>[] = [];
  d.on('update', (u) => updates.push(u.slice()));
  try {
    d.transact(() => change(d));
    return new Uint8Array(Y.mergeUpdates(updates));
  } finally {
    d.destroy();
  }
};
const inspect = (bytes: Uint8Array) => {
  const d = createDoc();
  try {
    applyUpdate(d, bytes);
    return {
      issues: days.cardMembershipIssues(d),
      master: d.getText('master').toString(),
      json: d.toJSON(),
      pending: Boolean(d.store.pendingStructs || d.store.pendingDs),
    };
  } finally {
    d.destroy();
  }
};
const modeNames = ['reference', 'local-handoff', 'local-snapshots', 'account'] as const;
type Mode = (typeof modeNames)[number];
const fixture = async (mode: Mode) => {
  let refuse = false,
    fail = false;
  const disk: Uint8Array[] = [],
    wal: Uint8Array[] = [];
  const prepared: {
    kind: string;
    issues: unknown[];
    sources: { actor: string; kind: string; bytes: Uint8Array }[];
  }[] = [];
  const published: ReturnType<typeof inspect>[] = [];
  const carrier = {
    state: 'active',
    signal: new AbortController().signal,
    loadRecovery: async () => ({ records: [], journal: [] }),
    appendLocal(bytes: Uint8Array) {
      if (refuse) return { status: 'refused', reason: 'quota' };
      wal.push(bytes.slice());
      return { status: 'journalled' };
    },
    async appendBatch(records: { bytes: Uint8Array }[]) {
      if (fail) {
        fail = false;
        throw Error('disk fault');
      }
      disk.push(...records.map((r) => r.bytes.slice()));
      return {};
    },
    flushJournal: async () => {
      disk.push(...wal.splice(0));
      return { retained: 0 };
    },
    close: async () => {},
  } as unknown as JournalSession;
  const w = await createAdmittedWorkspace(
    (o) => {
      const local = o[localWorkspacePreparation];
      return createAdmissionOwner(carrier, {
        ...o,
        prepare(doc, input, basis) {
          const result = o.prepare(doc, input, basis);
          const sources = result?.sources ?? [];
          prepared.push({
            kind: JSON.parse(new TextDecoder().decode(input)).command.kind,
            issues: days.cardMembershipIssues(doc),
            sources: sources.map((s) => ({ ...s, bytes: s.bytes.slice() })),
          });
          return result;
        },
        ...(local
          ? {
              [localWorkspacePreparation]: {
                ...local,
                command(c, input, scope) {
                  let doc!: Y.Doc;
                  const result = local.command(c, input, {
                    ...scope,
                    ownState(state) {
                      scope.ownState(state);
                      doc = state.history.doc;
                    },
                  });
                  prepared.push({
                    kind: JSON.parse(new TextDecoder().decode(input)).command.kind,
                    issues: days.cardMembershipIssues(doc),
                    sources: [],
                  });
                  return result;
                },
              },
            }
          : {}),
      });
    },
    {
      identity,
      validateReceive: () => {},
      today: () => context.today,
      ...(mode === 'account' ? { captureSources: true, suppressEmptySources: true } : {}),
    },
    mode === 'account' ? 'reference' : mode,
  );
  w.outgoing(() => published.push(inspect(w.snapshot())));
  return {
    w,
    prepared,
    published,
    disk,
    wal,
    refuse() {
      refuse = true;
    },
    fail() {
      fail = true;
    },
    allow() {
      refuse = false;
    },
  };
};
const compose = async (w: AdmittedWorkspace) =>
  (await w.command({ kind: 'compose', to: next, text: 'card🙂' }).accepted).value as { id: string };
afterEach(() => vi.restoreAllMocks());

describe.each(modeNames)('repair eligibility owner %s', (mode) => {
  it('skips repeated clean text and no-op scans, but retains structural and undo/redo repair', async () => {
    const f = await fixture(mode),
      spy = vi.spyOn(days, 'repairCardMemberships');
    try {
      await master(f.w).input(insert('a')).accepted;
      await master(f.w).input(insert('')).accepted;
      await master(f.w).input(insert('b')).accepted;
      expect(spy).toHaveBeenCalledTimes(0);
      await f.w.command({ kind: 'undo' }).accepted;
      expect(master(f.w).read().text).toBe('a');
      expect(spy).toHaveBeenCalledTimes(2);
      await f.w.command({ kind: 'redo' }).accepted;
      expect(master(f.w).read().text).toBe('ab');
      expect(spy).toHaveBeenCalledTimes(4);
      const { id } = await compose(f.w);
      expect(spy).toHaveBeenCalledTimes(6);
      spy.mockClear();
      await f.w.text({ kind: 'card', id }).input(insert('!'), selection(6)).accepted;
      expect(f.w.read().cards[0]!.text).toBe('card🙂!');
      expect(spy).toHaveBeenCalledTimes(0);
      await f.w.command({ kind: 'move', id, to: { ...next, section: 'done' } }).accepted;
      expect(spy).toHaveBeenCalledTimes(2);
      await f.w.command({ kind: 'remove', id }).accepted;
      await f.w.command({ kind: 'undo' }).accepted;
      expect(f.w.read().cards).toHaveLength(1);
      await f.w.close();
      expect(() => master(f.w).input(insert('closed'))).toThrow();
    } finally {
      await f.w.close();
    }
  });

  it('repairs a dirty remote basis before reentrant subscriber text and preserves system/human coverage', async () => {
    const f = await fixture(mode);
    try {
      const { id } = await compose(f.w);
      const beforeRemote = f.w.snapshot();
      const bytes = remote(f.w, (d) => days.cardLocationsMap(d).delete(id));
      let ticket: AdmissionTicket | undefined, observerError: unknown;
      const unsubscribe = f.w.subscribe(() => {
        if (ticket || observerError || f.w.read().cards[0]?.location) return;
        try {
          ticket = master(f.w).input(insert('subscriber'));
        } catch (error) {
          observerError = error;
        }
      });
      const at = f.prepared.length,
        publicationAt = f.published.length;
      await f.w.receive(bytes).accepted;
      await ticket?.accepted;
      await f.w.whenDurable();
      unsubscribe();
      expect(observerError).toBeUndefined();
      expect(ticket).toBeDefined();
      expect(f.prepared[at]!.kind).toBe('text');
      expect(f.prepared[at]!.issues).toEqual([]);
      expect(f.published[publicationAt]!.issues).toEqual([]);
      expect(f.published[publicationAt]!.master).toBe('subscriber');
      expect(f.w.read().cards[0]!.location).toEqual(next);
      if (mode === 'account') {
        const sources = f.prepared[at]!.sources;
        expect(sources.map((s) => [s.kind, s.actor])).toEqual([
          ['system', 'system'],
          ['human', identity.id],
        ]);
        const replay = createDoc(),
          accepted = createDoc();
        try {
          // Only the captured system/human transactions extend the dirty accepted basis.
          applyUpdate(replay, beforeRemote);
          applyUpdate(replay, bytes);
          for (const source of sources) {
            expect(source.bytes.length).toBeGreaterThan(2);
            applyUpdate(replay, source.bytes);
          }
          applyUpdate(accepted, f.w.snapshot());
          expect(sameDocState(replay, accepted)).toBe(true);
          expect(replay.getText('master').toString()).toBe('subscriber');
        } finally {
          replay.destroy();
          accepted.destroy();
        }
      }
    } finally {
      await f.w.close();
    }
  });

  it('does not transfer unaccepted cleanliness after refusal and discard; retry reuses the repaired candidate', async () => {
    const f = await fixture(mode);
    try {
      const { id } = await compose(f.w);
      const bytes = remote(f.w, (d) =>
        days.collectionOf(days.dayAt(d, next.date), 'next')!.delete(0, 1),
      );
      let ticket: AdmissionTicket | undefined;
      const unsub = f.w.subscribe(() => {
        if (ticket || f.w.read().days[0]?.next.length) return;
        f.refuse();
        f.fail();
        ticket = master(f.w).input(insert('refused'));
      });
      await f.w.receive(bytes).accepted;
      await until(() => f.w.status.state === 'blocked');
      unsub();
      expect(ticket).toBeDefined();
      expect(f.w.read().master).toBe('');
      expect(f.w.read().days[0]!.next).toEqual([]);
      expect(f.prepared.at(-1)!.issues).toEqual([]);
      f.w.discardPending();
      await expect(ticket!.accepted).rejects.toMatchObject({ code: 'discarded' });
      // A later attempt forks the still-dirty accepted history, never the discarded repair.
      f.fail();
      const retry = master(f.w).input(insert('kept'));
      await until(() => f.w.status.state === 'blocked');
      expect(f.prepared.at(-1)!.kind).toBe('text');
      expect(f.prepared.at(-1)!.issues).toEqual([]);
      const count = f.prepared.length;
      f.allow();
      f.w.retry();
      await retry.accepted;
      await f.w.whenDurable();
      expect(f.prepared.length).toBe(count);
      expect(f.w.read().master).toBe('kept');
      expect(f.w.read().days[0]!.next).toEqual([id]);
      expect(inspect(f.w.snapshot()).issues).toEqual([]);
    } finally {
      await f.w.close();
    }
  });

  it('invalidates even a text-only remote and a later update that wakes pending membership dependencies', async () => {
    const f = await fixture(mode);
    try {
      const spy = vi.spyOn(days, 'repairCardMemberships');
      await f.w.receive(remote(f.w, (d) => d.getText('master').insert(0, 'remote'))).accepted;
      spy.mockClear();
      await master(f.w).input(insert('!')).accepted;
      expect(spy).toHaveBeenCalledTimes(1);
      const peer = createDoc();
      applyUpdate(peer, f.w.snapshot());
      const updates: Uint8Array<ArrayBuffer>[] = [];
      peer.on('update', (u) => updates.push(u.slice()));
      peer.transact(() => peer.getText('master').insert(0, 'basis'));
      peer.transact(() => {
        const card = days.newCard('pending', identity.id, { id: 'pending-card' });
        days.cardsMap(peer).set('pending-card', card);
        days.ensureDay(peer, system, next.date);
        days.collectionOf(days.dayAt(peer, next.date), 'next')!.push(['pending-card']);
      });
      peer.destroy();
      await f.w.receive(updates[1]!).accepted;
      expect(inspect(f.w.snapshot()).pending).toBe(true);
      await master(f.w).input(insert('local')).accepted;
      let ticket: AdmissionTicket | undefined;
      const unsub = f.w.subscribe(() => {
        if (ticket || !f.w.read().cards.some((c) => c.id === 'pending-card')) return;
        ticket = master(f.w).input(insert('woken'));
      });
      const at = f.prepared.length;
      await f.w.receive(updates[0]!).accepted;
      await ticket?.accepted;
      await f.w.whenDurable();
      unsub();
      expect(ticket).toBeDefined();
      expect(f.prepared[at]!.kind).toBe('text');
      expect(f.prepared[at]!.issues).toEqual([]);
      expect(f.w.read().cards.find((c) => c.id === 'pending-card')!.location).toEqual(next);
      expect(inspect(f.w.snapshot()).pending).toBe(false);
    } finally {
      await f.w.close();
    }
  });
});

it('keeps repair facts private to a runner and clears eligibility after a throwing command', () => {
  const d = createDoc(),
    history = workspaceUndo(d, human),
    runner = createWorkspaceCommandRunner(),
    selections = new Map<string, RelativeSelection>();
  const intent = (command: WorkspaceIntent['command']): WorkspaceIntent => ({ group: 1, command });
  try {
    runner.run(history, intent({ kind: 'initialize' }), context, selections);
    const spy = vi.spyOn(days, 'repairCardMemberships');
    expect(() =>
      runner.run(
        history,
        intent({ kind: 'text', target: { kind: 'master' }, action: { name: 'undo' } }),
        context,
        selections,
      ),
    ).toThrow('Undo is workspace-scoped');
    runner.run(
      history,
      intent({ kind: 'text', target: { kind: 'master' }, action: insert('ok') }),
      context,
      selections,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    createWorkspaceCommandRunner().run(
      history,
      intent({ kind: 'text', target: { kind: 'master' }, action: insert('other owner') }),
      context,
      selections,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(() => runner.inherit(history, history)).toThrow('detached history');
  } finally {
    history.destroy();
    d.destroy();
  }
});

it('generated command histories match the unconditional runner across forks, dirty bases, undo and discard', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('text', 'noop', 'dirty', 'undo', 'redo', 'discard', 'throw'), {
        minLength: 15,
        maxLength: 50,
      }),
      (steps) => {
        const runner = createWorkspaceCommandRunner();
        const seed = createDoc(),
          root = workspaceUndo(seed, human),
          empty = new Map<string, RelativeSelection>();
        runWorkspaceCommand(root, { group: 0, command: { kind: 'initialize' } }, context, empty);
        const card = days.newCard('x', identity.id, { id: 'one' });
        seed.transact(() => {
          days.registerCard(seed, 'one', card, next);
          days.ensureDay(seed, human, next.date);
          days.collectionOf(days.dayAt(seed, next.date), 'next')!.push(['one']);
        }, human);
        let reference = forkWorkspaceHistory(root, human),
          candidate = forkWorkspaceHistory(root, human);
        const refSelections = new Map<string, RelativeSelection>(),
          canSelections = new Map<string, RelativeSelection>();
        root.destroy();
        seed.destroy();
        try {
          let group = 0;
          for (const step of steps) {
            if (step === 'dirty') {
              for (const h of [reference, candidate])
                h.doc.transact(() => days.cardLocationsMap(h.doc).delete('one'), 'received');
              runner.invalidate(candidate);
            } else {
              const r = forkWorkspaceHistory(reference, human),
                c = forkWorkspaceHistory(candidate, human);
              runner.inherit(candidate, c);
              r.doc.clientID = c.doc.clientID = 333;
              r.stopCapturing();
              c.stopCapturing();
              const intent: WorkspaceIntent = {
                group: ++group,
                command:
                  step === 'undo' || step === 'redo'
                    ? { kind: step }
                    : {
                        kind: 'text',
                        target: { kind: 'master' },
                        action:
                          step === 'throw' ? { name: 'undo' } : insert(step === 'noop' ? '' : '🙂'),
                      },
              };
              const rs = structuredClone(refSelections),
                cs = structuredClone(canSelections);
              try {
                if (step === 'throw') {
                  expect(() => runWorkspaceCommand(r, intent, context, rs)).toThrow();
                  expect(() => runner.run(c, intent, context, cs)).toThrow();
                } else {
                  expect(runner.run(c, intent, context, cs)).toEqual(
                    runWorkspaceCommand(r, intent, context, rs),
                  );
                  expect(sameDocState(r.doc, c.doc)).toBe(true);
                  expect(cs).toEqual(rs);
                  expect(c.undoStack.length).toBe(r.undoStack.length);
                  expect(c.redoStack.length).toBe(r.redoStack.length);
                  if (step !== 'discard') {
                    reference.destroy();
                    reference.doc.destroy();
                    candidate.destroy();
                    candidate.doc.destroy();
                    reference = r;
                    candidate = c;
                    refSelections.clear();
                    for (const [k, v] of rs) refSelections.set(k, v);
                    canSelections.clear();
                    for (const [k, v] of cs) canSelections.set(k, v);
                  }
                }
              } finally {
                if (r !== reference) {
                  r.destroy();
                  r.doc.destroy();
                  c.destroy();
                  c.doc.destroy();
                }
              }
            }
          }
        } finally {
          reference.destroy();
          reference.doc.destroy();
          candidate.destroy();
          candidate.doc.destroy();
        }
      },
    ),
    { seed: 170915, numRuns: 60 },
  );
});
