// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { appendedRecords, contentReplacement } from '../src/crdt/incrementalAccountLedger';
import { createVerifiedRecords } from '../src/crdt/verifiedRecords';
import { createInboundCoverage, verifyInboundCoverage } from '../src/crdt/inboundLedger';
import { Y, hasPendingUpdates } from '../src/crdt/yjs';
import type { OpenedRecord } from '../src/crdt/contentRecord';
const row = (seq: number, bytes = new Uint8Array([seq])): OpenedRecord => ({
  seq,
  gen: 1,
  kind: 'update',
  bytes,
});
const current = () => {};
it('classifies only exact prefixes; changed placement, bytes, deletions and late rows cannot become appends', () => {
  fc.assert(
    fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => {
      const before = [row(3, bytes)],
        after = [row(3, bytes.slice()), row(7)];
      expect(appendedRecords(before, after)).toEqual([after[1]]);
      after[0]!.bytes[0]! ^= 1;
      expect(appendedRecords(before, after)).toBeUndefined();
      expect(contentReplacement(before, after)).toBeUndefined();
      expect(appendedRecords(before, [row(2), ...before])).toBeUndefined();
      expect(appendedRecords(before, [])).toBeUndefined();
      expect(appendedRecords(before, [{ ...before[0]!, kind: 'outbound' }])).toBeUndefined();
      expect(appendedRecords(before, [{ ...before[0]!, gen: 2 }])).toBeUndefined();
    }),
    { seed: 101026, numRuns: 40 },
  );
  expect(
    contentReplacement(
      [row(1), { ...row(2), kind: 'heads' }],
      [{ ...row(2), kind: 'heads' }, row(3)],
    ),
  ).toEqual([row(3)]);
  expect(contentReplacement([{ ...row(1), kind: 'heads' }], [row(3)])).toBeUndefined();
});
it('failed speculative extension clears success and late extension cannot reinstall a closed view', async () => {
  const view = createVerifiedRecords<number>();
  const initial = [row(1)],
    next = [...initial, row(2)];
  await view.verify(initial, 1, async () => 1, current);
  await expect(
    view.verify(
      next,
      2,
      async () => 2,
      current,
      async () => {
        throw Error('abort');
      },
    ),
  ).rejects.toThrow('abort');
  expect(() => view.read(initial)).toThrow('No verified');
  await view.verify(initial, 1, async () => 1, current);
  let release!: () => void;
  const pending = view.verify(
    next,
    2,
    async () => 2,
    current,
    async (previous) => {
      await new Promise<void>((r) => (release = r));
      return previous + 1;
    },
  );
  view.clear();
  release();
  await expect(pending).rejects.toThrow('invalidated');
  expect(() => view.read(next)).toThrow('No verified');
});
const verdict = (fn: () => void) => {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
};
it('incremental coverage agrees with full replay through inserts, deletes, pending dependencies and exact compaction', () => {
  fc.assert(
    fc.property(fc.array(fc.nat(6), { minLength: 4, maxLength: 25 }), (actions) => {
      const a = new Y.Doc({ gc: false }),
        b = new Y.Doc({ gc: false });
      const updates: Uint8Array<ArrayBuffer>[] = [];
      const coverage = createInboundCoverage({ incremental: true });
      let records: OpenedRecord[] = [],
        seq = 0;
      const capture = (u: Uint8Array) => updates.push(new Uint8Array(u));
      a.on('update', capture);
      b.on('update', capture);
      try {
        for (const [i, op] of actions.entries()) {
          const d = op % 2 ? a : b,
            t = d.getText('t');
          if (op === 2 && t.length) t.delete(0, 1);
          else t.insert(t.length, String(i));
          const u = updates.at(-1)!;
          records.push(row(++seq, u));
          if (op === 4) {
            Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
            records.push(row(++seq, updates.at(-1)!));
          }
          for (const original of updates) {
            expect(verdict(() => coverage.check(records, [original]))).toBe(
              verdict(() => verifyInboundCoverage(records, [original])),
            );
          }
          if (op === 5) {
            const union = new Y.Doc({ gc: false });
            for (const r of records) Y.applyUpdate(union, r.bytes);
            if (!hasPendingUpdates(union)) {
              records = [
                {
                  ...row(++seq, new Uint8Array(Y.mergeUpdates(records.map((r) => r.bytes)))),
                  kind: 'state',
                },
              ];
              for (const original of updates)
                expect(verdict(() => coverage.check(records, [original]))).toBe(
                  verdict(() => verifyInboundCoverage(records, [original])),
                );
            }
            union.destroy();
          }
        }
        expect(coverage.positiveBytes()).toBeLessThanOrEqual(4 * 1024 * 1024);
      } finally {
        coverage.clear();
        a.destroy();
        b.destroy();
      }
    }),
    { seed: 101026, numRuns: 35 },
  );
});
it('a failed coverage check is reconsidered after its content arrives; stale bound checkers fail', () => {
  const d = new Y.Doc(),
    coverage = createInboundCoverage({ incremental: true });
  try {
    d.getText('t').insert(0, 'dependency');
    const u = new Uint8Array(Y.encodeStateAsUpdate(d));
    expect(() => coverage.check([], [u])).toThrow('coverage');
    const records = [row(1, u)];
    coverage.check(records, [u]);
    const bound = coverage.bind(records);
    coverage.clear();
    expect(() => bound.check(records, [u])).toThrow('invalidated');
    coverage.check(records, [u]);
  } finally {
    coverage.clear();
    d.destroy();
  }
});

it('rechecks positives across actual out-of-order dependencies and pending deletes', () => {
  const doc = new Y.Doc({ gc: false }),
    coverage = createInboundCoverage({ incremental: true });
  const frames: Uint8Array<ArrayBuffer>[] = [];
  doc.on('update', (u: Uint8Array) => frames.push(new Uint8Array(u)));
  try {
    doc.getText('t').insert(0, 'parent');
    doc.getText('t').insert(6, 'child');
    doc.getText('t').delete(0, 2);
    let rows: OpenedRecord[] = [];
    // Child and deletion reach the receiver before the parent's structs.
    for (const index of [1, 2, 0]) {
      rows.push(row(rows.length + 1, frames[index]!));
      for (const frame of frames) {
        expect(verdict(() => coverage.check(rows, [frame]))).toBe(
          verdict(() => verifyInboundCoverage(rows, [frame])),
        );
      }
    }
    rows = [{ ...row(4, new Uint8Array(Y.encodeStateAsUpdate(doc))), kind: 'state' }];
    for (const frame of frames) {
      expect(verdict(() => coverage.check(rows, [frame]))).toBe(true);
      expect(verdict(() => verifyInboundCoverage(rows, [frame]))).toBe(true);
    }
  } finally {
    coverage.clear();
    doc.destroy();
  }
});
