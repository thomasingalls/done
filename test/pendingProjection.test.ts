// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  Y,
  createHistoryDoc,
  workspaceUndo,
  forkWorkspaceHistory,
  forkDoc,
  sameDocState,
} from '../src/crdt/yjs';
import { cloneDocument } from '../src/crdt/admissionDocument';
import {
  AdmissionError,
  createAdmissionOwner,
  type AdmissionSession,
} from '../src/crdt/admissionQueue';
import { createAdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import type { JournalSession } from '../src/crdt/custody';
import { startupRefusal } from '../src/crdt/ownedStartup';
import { makeSource } from './storage-properties/oracle';

const corpus = () =>
  makeSource([
    { lane: 0, actor: 1, at: 0, text: 'a', remove: 0 },
    ...Array.from({ length: 3 }, () => ({ lane: 0, actor: 0, at: 0, text: 'a', remove: 0 })),
  ]);
const view = (doc: Y.Doc) => [0, 1, 2].map((i) => doc.getText(`lane${i}`).toString());
const pending = (doc: Y.Doc) => ({
  missing: [...(doc.store.pendingStructs?.missing ?? [])].sort(([a], [b]) => a - b),
  update: doc.store.pendingStructs?.update,
  ds: doc.store.pendingDs,
});
describe('pending document forks', () => {
  it('classifies runtime projection mismatch separately from persisted corruption', () => {
    const error = new AdmissionError('projection-mismatch', 'mismatch');
    expect(startupRefusal(error)).toEqual({
      kind: 'unavailable',
      reason: 'runtime-projection-mismatch',
    });
    expect(startupRefusal(error, AbortSignal.abort())).toMatchObject({ kind: 'cancelled' });
  });
  it('preserves a projection failure raised during admitted initialization through lifecycle shutdown', async () => {
    let session: AdmissionSession | undefined,
      checks = 0;
    const carrier = {
      state: 'active',
      signal: new AbortController().signal,
      loadRecovery: async () => ({ records: [], journal: [] }),
      appendLocal: () => ({ status: 'journalled' }),
      flushJournal: async () => ({ retained: 0 }),
      close: async () => {},
    } as unknown as JournalSession;
    try {
      await expect(
        createAdmittedWorkspace(
          async (options) => {
            session = await createAdmissionOwner(carrier, options);
            return {
              ...session,
              get status() {
                return session!.status;
              },
              matches: () => ++checks === 1,
            };
          },
          {
            identity: {
              id: 'human',
              actor: { kind: 'human', name: 'test', color: '#3f8fd6' },
              device: { id: 'device', name: 'test' },
            },
            validateReceive: () => {},
            today: () => '2026-09-08',
          },
        ),
      ).rejects.toMatchObject({ code: 'projection-mismatch' });
    } finally {
      await session?.close();
    }
  });
  it.each(['draft', 'history'])(
    'preserves the saved pending corpus through a %s fork and later basis',
    (kind) => {
      const source = corpus(),
        original = createHistoryDoc(),
        manager = workspaceUndo(original, 'human');
      for (const id of [3, 1, 5]) Y.applyUpdate(original, Uint8Array.from(source.updates[id]!));
      const history = kind === 'history' ? forkWorkspaceHistory(manager, 'human') : undefined;
      const fork = history?.doc ?? cloneDocument(original);
      try {
        expect(pending(fork)).toEqual(pending(original));
        for (const id of [0, 2, 4, 6])
          for (const doc of [original, fork])
            Y.applyUpdate(doc, Uint8Array.from(source.updates[id]!));
        expect(view(original)).toEqual(source.final);
        expect(view(fork)).toEqual(source.final);
        expect(fork.store.pendingStructs).toBeNull();
        expect(fork.store.pendingDs).toBeNull();
      } finally {
        history?.destroy();
        manager.destroy();
        fork.destroy();
        original.destroy();
      }
    },
  );
  it('detaches pending structs, missing-clock maps and pending deletion bytes from the source', () => {
    const source = makeSource([{ lane: 0, actor: 1, at: 1, text: 'later', remove: 2 }]);
    const original = createHistoryDoc();
    Y.applyUpdate(original, Uint8Array.from(source.updates[3]!));
    expect(original.store.pendingStructs).not.toBeNull();
    expect(original.store.pendingDs).not.toBeNull();
    const before = structuredClone(pending(original)),
      fork = forkDoc(original, false);
    try {
      expect(sameDocState(original, fork)).toBe(true);
      fork.store.pendingStructs!.missing.set(999, 100);
      fork.store.pendingStructs!.update.fill(0);
      fork.store.pendingDs!.fill(0);
      expect(pending(original)).toEqual(before);
      expect(sameDocState(original, fork)).toBe(false);
    } finally {
      original.destroy();
      fork.destroy();
    }
  });
  it('compares actual content and deletions even when integrated state vectors agree', () => {
    const a = createHistoryDoc(),
      b = createHistoryDoc();
    a.clientID = b.clientID = 101;
    a.getText('master').insert(0, 'AA');
    b.getText('master').insert(0, 'BB');
    try {
      expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
      expect(sameDocState(a, b)).toBe(false);
      const c = forkDoc(a);
      try {
        expect(sameDocState(a, c)).toBe(true);
        a.getText('master').delete(0, 1);
        expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(c));
        expect(sameDocState(a, c)).toBe(false);
        Y.applyUpdate(c, Y.encodeStateAsUpdate(a));
        expect(sameDocState(a, c)).toBe(true);
      } finally {
        c.destroy();
      }
    } finally {
      a.destroy();
      b.destroy();
    }
  });
  it('preserves generated delivery histories across repeated detached forks and later dependencies', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lane: fc.nat(2),
            actor: fc.nat(2),
            at: fc.nat(40),
            remove: fc.nat(8),
            text: fc.string({ maxLength: 6 }),
          }),
          { maxLength: 22 },
        ),
        fc.array(fc.nat(100), { minLength: 1, maxLength: 30 }),
        fc.boolean(),
        (edits, keys, reorder) => {
          const source = makeSource(edits),
            original = createHistoryDoc();
          let fork = forkDoc(original, false);
          const order = source.updates.map((_, i) => i);
          if (reorder)
            order.sort((a, b) => keys[a % keys.length]! - keys[b % keys.length]! || a - b);
          try {
            for (const id of order) {
              for (const doc of [original, fork])
                Y.applyUpdate(doc, Uint8Array.from(source.updates[id]!));
              expect(view(fork)).toEqual(view(original));
              expect(sameDocState(original, fork)).toBe(true);
              const next = forkDoc(fork, false);
              fork.destroy();
              fork = next;
              expect(pending(fork)).toEqual(pending(original));
            }
            // Arbitrary original framing can itself strand in pinned Yjs; only source-ordered delivery
            // owns the complete external-string oracle here. Every schedule owns fork equivalence.
            if (!reorder) {
              expect(view(fork)).toEqual(source.final);
              expect(fork.store.pendingStructs).toBeNull();
              expect(fork.store.pendingDs).toBeNull();
            }
          } finally {
            original.destroy();
            fork.destroy();
          }
        },
      ),
      { seed: 8941, numRuns: 500 },
    );
  });
});
