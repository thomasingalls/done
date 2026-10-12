// @vitest-environment node
import { it, expect } from 'vitest';
import { accountTextMode } from '../src/crdt/accountTextMode';
import * as fc from 'fast-check';
import {
  Y,
  createDoc,
  forkDoc,
  applyUpdate,
  encodeState,
  sameDocState,
  preparePlainTextUpdate,
} from '../src/crdt/yjs';

it('matches native Y.Text replacement across concurrent/deleted items without mutating its basis', () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.nat(100), fc.nat(20), fc.string({ maxLength: 12 })), {
        minLength: 1,
        maxLength: 40,
      }),
      (edits) => {
        const doc = createDoc();
        doc.gc = false;
        const text = doc.getText('master');
        text.insert(0, 'initial text');
        for (const [at, remove, inserted] of edits) {
          const from = at % (text.length + 1),
            to = Math.min(text.length, from + remove);
          const before = encodeState(doc),
            reference = forkDoc(doc);
          const writer = doc.clientID,
            clock = Y.getState(doc.store, writer);
          const update = preparePlainTextUpdate(text, writer, clock, from, to, inserted);
          expect(update).toBeDefined();
          expect(encodeState(doc)).toEqual(before);
          reference.clientID = writer;
          reference.transact(() => {
            reference.getText('master').delete(from, to - from);
            reference.getText('master').insert(from, inserted);
          });
          applyUpdate(doc, update!);
          expect(sameDocState(doc, reference)).toBe(true);
          reference.destroy();
          // Interleave another writer, retaining deleted links and concurrent origins.
          const peer = forkDoc(doc);
          peer.getText('master').insert(0, 'p');
          applyUpdate(doc, encodeState(peer));
          peer.destroy();
        }
        doc.destroy();
      },
    ),
    { numRuns: 160, seed: 12102026 },
  );
});

it('supports nested text and safe emoji boundaries; refuses formatting and unsafe splits', () => {
  const doc = createDoc();
  doc.gc = false;
  const text = new Y.Text();
  doc.getMap('cards').set('text', text);
  text.insert(0, 'a😀b');
  const writer = doc.clientID,
    clock = Y.getState(doc.store, writer);
  expect(preparePlainTextUpdate(text, writer, clock, 2, 2, 'x')).toBeUndefined();
  expect(preparePlainTextUpdate(text, writer, clock, 1, 1, '\ud800')).toBeUndefined();
  const update = preparePlainTextUpdate(text, writer, clock, 1, 3, '✅');
  expect(update).toBeDefined();
  applyUpdate(doc, update!);
  expect(text.toString()).toBe('a✅b');
  text.format(0, 1, { bold: true });
  expect(
    preparePlainTextUpdate(text, writer, Y.getState(doc.store, writer), 0, 0, 'x'),
  ).toBeUndefined();
  doc.destroy();
});

it('matches native edits after concurrent insert/delete delivery in either order', () => {
  for (const reverse of [false, true]) {
    const seed = createDoc();
    seed.getText('master').insert(0, 'abcdefgh');
    const a = forkDoc(seed),
      b = forkDoc(seed);
    a.gc = b.gc = false;
    a.getText('master').delete(2, 3);
    a.getText('master').insert(2, 'left');
    b.getText('master').insert(3, 'right');
    b.getText('master').delete(0, 1);
    const doc = forkDoc(seed);
    doc.gc = false;
    for (const peer of reverse ? [b, a] : [a, b]) applyUpdate(doc, encodeState(peer));
    for (let at = 0; at <= doc.getText('master').length; at++) {
      const native = forkDoc(doc),
        candidate = forkDoc(doc);
      const text = native.getText('master');
      native.clientID = doc.clientID;
      const end = Math.min(at + 3, text.length);
      const update = preparePlainTextUpdate(
        doc.getText('master'),
        doc.clientID,
        Y.getState(doc.store, doc.clientID),
        at,
        end,
        '🙂',
      );
      expect(update).toBeDefined();
      native.transact(() => {
        text.delete(at, end - at);
        text.insert(at, '🙂');
      });
      applyUpdate(candidate, update!);
      expect(sameDocState(candidate, native)).toBe(true);
      native.destroy();
      candidate.destroy();
    }
    for (const d of [seed, a, b, doc]) d.destroy();
  }
});
it('refuses unresolved dependencies rather than deriving writer clocks from visible text', () => {
  const source = createDoc(),
    destination = createDoc();
  const updates: Uint8Array[] = [];
  source.on('update', (u) => updates.push(u));
  source.getText('master').insert(0, 'parent');
  source.getText('master').insert(6, 'dependent');
  applyUpdate(destination, updates[1]!);
  expect(destination.store.pendingStructs).not.toBeNull();
  expect(
    preparePlainTextUpdate(destination.getText('master'), destination.clientID, 0, 0, 0, 'x'),
  ).toBeUndefined();
  source.destroy();
  destination.destroy();
});

it('selects direct Account text by default with an explicit reference rollback', () => {
  expect(accountTextMode(undefined)).toBe('account-text');
  expect(accountTextMode('')).toBe('account-text');
  expect(accountTextMode('direct')).toBe('account-text');
  expect(accountTextMode('reference')).toBe('account-snapshots');
  expect(() => accountTextMode('unknown')).toThrow();
});
