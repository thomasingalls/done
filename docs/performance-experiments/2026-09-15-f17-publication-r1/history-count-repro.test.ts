// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { Y, createHistoryDoc, workspaceUndo, forkWorkspaceHistory, newText } from '../src/crdt/yjs';
import {
  createWorkspacePublication,
  readWorkspaceSnapshot,
  recordPublicationChanges,
  type PublicationChanges,
} from '../src/crdt/workspacePublication';
import { createArchiveProjection } from '../src/crdt/archiveProjection';
import {
  runWorkspaceCommand,
  type WorkspaceIntent,
  type RelativeSelection,
} from '../src/crdt/workspaceCommands';
import * as days from '../src/crdt/days';
import { serializeCollections } from '../src/crdt/serialize';
const identity = {
  id: 'alice',
  actor: { kind: 'human' as const, name: 'Alice', color: '#123456' },
  device: { id: 'device', name: 'Device' },
};
const human = { actor: identity.id, kind: 'human' as const, device: identity.device.id };
const system = { actor: 'system', kind: 'system' as const, device: identity.device.id };
const context = { identity, human, system, today: '2026-09-08' };
const next = { date: context.today, section: 'scheduled' as const };
const archiveDate = '2026-08-01';
const fixture = () => {
  const doc = createHistoryDoc();
  let history = workspaceUndo(doc, human),
    revision = 1;
  runWorkspaceCommand(history, { group: 0, command: { kind: 'initialize' } }, context, new Map());
  doc.transact(() => {
    const day = days.ensureDay(doc, human, next.date);
    for (let i = 0; i < 8; i++) {
      const id = 'card-' + i;
      days.registerCard(
        doc,
        id,
        days.newCard('text ' + i, identity.id, { id, createdAt: '2026-09-08T00:00:00Z' }),
        next,
      );
      days.collectionOf(day, next.section)!.push([id]);
    }
  }, human);
  const archives = createArchiveProjection(),
    projection = createWorkspacePublication(identity, archives);
  const read = () => projection.read(history, revision);
  const full = () => readWorkspaceSnapshot(history, identity, createArchiveProjection());
  const prepare = (change: (h: typeof history) => void, basis = revision) => {
    const fork = forkWorkspaceHistory(history, human);
    fork.doc.clientID = 777;
    fork.stopCapturing();
    const changes: PublicationChanges = { basis, full: false, master: false, cards: new Set() };
    const record = (transaction: Y.Transaction) =>
      recordPublicationChanges(fork.doc, changes, transaction);
    fork.doc.on('afterTransaction', record);
    try {
      change(fork);
    } finally {
      fork.doc.off('afterTransaction', record);
    }
    return { fork, changes };
  };
  const adopt = (
    { fork, changes }: ReturnType<typeof prepare>,
    plan: PublicationChanges | undefined = changes,
  ) => {
    const old = history;
    projection.advance(fork, ++revision, plan);
    history = fork;
    old.destroy();
    old.doc.destroy();
  };
  const step = (change: (h: typeof history) => void) => adopt(prepare(change));
  return {
    doc,
    read,
    full,
    prepare,
    adopt,
    step,
    projection,
    get history() {
      return history;
    },
    get revision() {
      return revision;
    },
    close() {
      projection.clear();
      archives.clear();
      history.destroy();
      history.doc.destroy();
    },
  };
};
const edit = (id: string, text: string) => (history: ReturnType<typeof workspaceUndo>) =>
  history.doc.transact(() => days.cardText(days.cardAt(history.doc, id)!).insert(0, text), human);
afterEach(() => vi.restoreAllMocks());

it('refreshes only the changed card and sensitive fields, while every public read stays detached', () => {
  const f = fixture();
  try {
    f.doc.transact(() => days.cardText(days.cardAt(f.doc, 'card-1')!).insert(0, '🙂'), human);
    const old = f.read(),
      poisoned = f.read();
    poisoned.cards[0]!.text = 'poison';
    poisoned.cards[0]!.location!.date = '2030-01-01';
    (poisoned.days[0]!.scheduled as string[]).length = 0;
    poisoned.actors[0]!.name = 'poison';
    poisoned.settings.rolloverHour = 9;
    expect(f.read()).toEqual(old);
    const spy = vi.spyOn(days, 'cardBody');
    f.step(edit('card-0', '!'));
    const actual = f.read();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(actual.cards.find((c) => c.id === 'card-0')!.text).toBe('!text 0');
    expect(actual.cards.find((c) => c.id === 'card-1')!.text).toBe('🙂text 1');
    expect(old.cards.find((c) => c.id === 'card-0')!.text).toBe('text 0');
    f.read();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(actual).toEqual(f.full());
  } finally {
    f.close();
  }
});

it('refreshes unedited lone and split-pair text, card metadata and archived text after a fork', () => {
  for (const sensitive of ['\uD800', '\uDC00', '😀']) {
    const f = fixture();
    try {
      f.doc.transact(() => {
        f.doc.getText('master').insert(0, sensitive);
        days.cardText(days.cardAt(f.doc, 'card-1')!).insert(0, sensitive);
        days.cardAt(f.doc, 'card-2')!.set('author', sensitive);
        days.cardAt(f.doc, 'card-2')!.set('origin', sensitive);
        const day = days.ensureDay(f.doc, human, archiveDate);
        for (const section of days.SECTIONS) day.delete(section);
        day.set(
          'archive',
          newText(serializeCollections({ next: [sensitive], scheduled: [], done: [] })),
        );
      }, human);
      if (sensitive === '😀') {
        // Distinct writers prevent adjacent halves from merging. Splitting an existing
        // pair through a text edit would normalize it immediately inside Yjs.splice.
        const text = f.doc.getText('master'),
          writer = f.doc.clientID;
        text.delete(0, text.length);
        f.doc.clientID = 1001;
        text.insert(0, '\uD83D');
        f.doc.clientID = 1002;
        text.insert(1, '\uDE00');
        f.doc.clientID = writer;
        expect(text.toString()).toBe('😀');
      }
      const old = f.read();
      f.step(edit('card-0', '!'));
      const actual = f.read();
      expect(actual).toEqual(f.full());
      expect(actual.master).not.toBe(old.master);
      const value = actual.days.find((d) => d.date === archiveDate)!.archived!;
      (value.next as string[]).push('caller poison');
      expect(f.read()).toEqual(f.full());
      f.step(edit('card-0', '?'));
      expect(f.read()).toEqual(f.full());
    } finally {
      f.close();
    }
  }
});

it('reloads metadata normalization without rebuilding unrelated cards', () => {
  const f = fixture();
  try {
    const selections = new Map<string, RelativeSelection>();
    runWorkspaceCommand(
      f.history,
      { group: 1, command: { kind: 'actor', patch: { name: '\uD800' } } },
      context,
      selections,
    );
    runWorkspaceCommand(
      f.history,
      { group: 2, command: { kind: 'device-label', name: '\uDC00' } },
      context,
      selections,
    );
    f.read();
    const spy = vi.spyOn(days, 'cardBody');
    f.step(edit('card-0', '!'));
    const actual = f.read();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(actual).toEqual(f.full());
  } finally {
    f.close();
  }
});

it('falls back for structural and unknown transactions even with the normal human origin', () => {
  const f = fixture();
  try {
    f.read();
    f.step((h) =>
      h.doc.transact(() => {
        days.setCardLocation(h.doc, 'card-0', { ...next, section: 'done' });
        days.repairCardMemberships(h.doc, human);
        h.doc.getText('unprojected').insert(0, 'unknown');
      }, human),
    );
    expect(f.read()).toEqual(f.full());
    expect(f.read().days[0]!.done).toEqual(['card-0']);
    f.step((h) =>
      h.doc.transact(() => {
        days.cardsMap(h.doc).set('new', days.newCard('new', identity.id, { id: 'new' }));
      }, human),
    );
    expect(f.read()).toEqual(f.full());
    expect(f.read().cards).toHaveLength(9);
  } finally {
    f.close();
  }
});

it('falls back when normalized keys can change the snapshot shape', () => {
  const f = fixture();
  try {
    f.doc.transact(() => {
      const id = 'id-\uD800';
      days.registerCard(f.doc, id, days.newCard('key', identity.id, { id }), next);
      days.collectionOf(days.dayAt(f.doc, next.date), next.section)!.push([id]);
    }, human);
    const before = f.read();
    f.step(edit('card-0', '!'));
    const actual = f.read();
    expect(actual).toEqual(f.full());
    expect(actual.cards.map((c) => c.id)).not.toEqual(before.cards.map((c) => c.id));
  } finally {
    f.close();
  }
});

it('rejects missing, stale and absent-cache plans and does not expose a prepared candidate', () => {
  const f = fixture();
  try {
    const before = f.read(),
      pending = f.prepare(edit('card-0', 'pending'));
    expect(f.read()).toEqual(before);
    pending.fork.destroy();
    pending.fork.doc.destroy();
    const stale = f.prepare(edit('card-0', '!'), -99);
    f.adopt(stale);
    expect(f.read()).toEqual(f.full());
    const missing = f.prepare(edit('card-1', '?'));
    f.projection.advance(missing.fork, f.revision + 1); // A missing plan invalidates the cache.
    f.adopt(missing);
    expect(f.read()).toEqual(f.full());
    f.projection.clear();
    f.step(edit('card-2', '*'));
    expect(f.read()).toEqual(f.full());
  } finally {
    f.close();
  }
});

it('publishes no-op and text undo/redo counts without replaying unrelated card bodies', () => {
  const f = fixture();
  try {
    f.read();
    f.step(edit('card-0', '!'));
    f.read();
    const spy = vi.spyOn(days, 'cardBody');
    f.step(() => {});
    const noop = f.read();
    expect(spy).toHaveBeenCalledTimes(0);
    f.step((h) => {
      h.undo();
    });
    const undone = f.read();
    expect(undone.cards[0]!.text).toBe('text 0');
    expect(undone.redo).toBe(1);
    expect(undone.undo).toBe(noop.undo - 1);
    f.step((h) => {
      h.redo();
    });
    expect(f.read()).toEqual(f.full());
    expect(f.read().cards[0]!.text).toBe('!text 0');
  } finally {
    f.close();
  }
});

it('generated publication histories match full projections after edits, normalization, structural changes and abandoned drafts', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          kind: fc.constantFrom(
            'card',
            'master',
            'move',
            'undo',
            'redo',
            'discard',
            'unknown',
            'metadata',
            'noop',
          ),
          id: fc.integer({ min: 0, max: 7 }),
          text: fc.constantFrom('a', '🙂', '\uD800', '\uDC00', ''),
        }),
        { minLength: 15, maxLength: 45 },
      ),
      (steps) => {
        const f = fixture();
        try {
          let prior = f.read();
          for (const step of steps) {
            const id = 'card-' + step.id;
            const change = (h: typeof f.history) => {
              if (step.kind === 'undo') {
                h.undo();
                return;
              }
              if (step.kind === 'redo') {
                h.redo();
                return;
              }
              h.doc.transact(() => {
                if (step.kind === 'card' || step.kind === 'discard') {
                  const c = days.cardAt(h.doc, id);
                  if (c) days.cardText(c).insert(0, step.text);
                }
                if (step.kind === 'master') h.doc.getText('master').insert(0, step.text);
                if (step.kind === 'unknown') h.doc.getText('other').insert(0, 'x');
                if (step.kind === 'metadata')
                  h.doc.getMap('meta').set('device-label:device', step.text);
                if (step.kind === 'move' && days.cardAt(h.doc, id)) {
                  days.setCardLocation(h.doc, id, { ...next, section: 'done' });
                  days.repairCardMemberships(h.doc, human);
                }
              }, human);
            };
            const prepared = f.prepare(change);
            expect(f.read()).toEqual(prior);
            if (step.kind === 'discard') {
              prepared.fork.destroy();
              prepared.fork.doc.destroy();
            } else f.adopt(prepared);
            expect(f.read()).toEqual(f.full());
            prior = f.read();
            prior.cards[0] && (prior.cards[0].text = 'caller poison');
            expect(f.read()).toEqual(f.full());
            prior = f.read();
          }
        } finally {
          f.close();
        }
      },
    ),
    { seed: 171509, numRuns: 60 },
  );
});

it('reads current runtime undo counts after the existing out-of-band history-clear diagnostic', () => {
  const f = fixture();
  try {
    expect(f.read().undo).toBeGreaterThan(0);
    const spy = vi.spyOn(days, 'cardBody');
    f.history.clear();
    const cleared = f.read();
    expect(cleared.undo).toBe(0); expect(cleared.redo).toBe(0);
    expect(spy).toHaveBeenCalledTimes(0);
    expect(cleared).toEqual(f.full());
  } finally { f.close(); }
});
