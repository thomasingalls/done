// @vitest-environment node
import { expect, it } from 'vitest';
import * as fc from 'fast-check';
import { Y } from '../src/crdt/yjs';
import { encodeImportSlice, importCursor, type ImportPlan } from '../src/crdt/legacyImportPlan';

it('bounds tiny slice output across thousands of restarted writer identities', () => {
  fc.assert(
    fc.property(fc.integer({ min: 2000, max: 4000 }), fc.nat(1000000), (count, offset) => {
      const actions: ImportPlan['actions'] = [{ kind: 'init' }];
      for (let i = 0; i < count; i++)
        actions.push({ kind: 'card', index: i, date: null, section: null });
      const plan: ImportPlan = {
        binding: {
          policy: 'markdown-system-v1',
          recoveryDigest: 'a'.repeat(64),
          sourceDigest: 'b'.repeat(64),
          sourceOrigin: 'https://example.test',
          planDigest: 'c'.repeat(64),
        },
        actions,
        entries: [],
        unfiled: [],
      };
      const doc = new Y.Doc({ gc: false }),
        receiver = new Y.Doc({ gc: false });
      try {
        for (let i = 0; i < actions.length; i++) {
          // Distinct client ids model a fresh runtime per one-slice invocation; no repeated mutable receipt.
          doc.clientID = 100000000 + offset + i;
          const bytes = encodeImportSlice(doc, plan, 'd'.repeat(32), '2026-09-09T00:00:00.000Z', i);
          expect(bytes.length).toBeLessThanOrEqual(16384);
          Y.applyUpdate(receiver, bytes);
          importCursor(receiver, 'd'.repeat(32), plan, i + 1);
        }
        expect(receiver.getMap('cards').size).toBe(count);
      } finally {
        doc.destroy();
        receiver.destroy();
      }
    }),
    { seed: 8941, numRuns: 5 },
  );
}, 60000);
