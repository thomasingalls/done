// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { Y } from '../src/crdt/yjs';
import {
  verifyInboundCoverage,
  inspectInbound,
  verifyInboundLedger,
} from '../src/crdt/inboundLedger';
import { sources, entry, packet, A, ZERO } from './account-inbound/fixtures';
import { context, eventWire, live } from './account-inbound-codecs/oracle';
import type { OpenedRecord } from '../src/crdt/contentRecord';
const row = (
  bytes: Uint8Array<ArrayBuffer>,
  seq = 1,
  kind: OpenedRecord['kind'] = 'update',
): OpenedRecord => ({ bytes, seq, gen: 1, kind });
const route = {
  workspace: context().authority.workspace,
  credential: A,
  principal: A,
  epoch: 1,
  generation: 1,
};
it('requires pending originals and deletion coverage even when state vectors match', () => {
  const f = sources(),
    dep = f.entries[0]!.updates[0]!,
    pending = f.entries[2]!.updates[0]!,
    del = f.entries[3]!.updates[0]!;
  expect(() => verifyInboundCoverage([row(f.baseline)], [pending])).toThrow('coverage');
  expect(() => verifyInboundCoverage([row(f.baseline), row(pending, 2)], [pending])).not.toThrow();
  expect(() =>
    verifyInboundCoverage([row(f.baseline), row(dep, 2), row(pending, 3)], [del]),
  ).toThrow('coverage');
  expect(() =>
    verifyInboundCoverage([row(f.baseline), row(dep, 2), row(pending, 3), row(del, 4)], [del]),
  ).not.toThrow();
});
it('replays independent stored events, detects a gap, wrong baseline and events after conflict', async () => {
  const f = sources(),
    a = f.entries[0]!,
    b = f.entries[1]!,
    c = context();
  const rows = [
    row(f.baseline),
    row(a.updates[0]!, 2),
    row(eventWire(a), 3, 'heads'),
    row(b.updates[0]!, 4),
    row(eventWire(b), 5, 'heads'),
  ];
  const state = await verifyInboundLedger(inspectInbound(rows, route, c), rows, c, live);
  expect(state.prefix.position).toBe(2);
  expect(state.prefix.link).toBe(b.link);
  const missing = rows.filter((r) => r.seq !== 3);
  await expect(
    verifyInboundLedger(inspectInbound(missing, route, c), missing, c, live),
  ).rejects.toThrow();
  await expect(
    verifyInboundLedger(
      inspectInbound(rows, route, c),
      rows,
      { ...c, baseline: { ...c.baseline, id: 'ab'.repeat(32) } },
      live,
    ),
  ).rejects.toThrow('record');
  const other = entry({ publisher: A, updates: [new Uint8Array([0, 0])] }, 1, ZERO);
  const conflict = [
    ...rows,
    row(eventWire(other, undefined, packet(other, 2), 'conflict'), 6, 'heads'),
  ];
  expect(
    (await verifyInboundLedger(inspectInbound(conflict, route, c), conflict, c, live)).conflict,
  ).toBe(true);
  const late = [
    ...conflict,
    row(eventWire(other, undefined, packet(other, 2), 'conflict'), 7, 'heads'),
  ];
  await expect(verifyInboundLedger(inspectInbound(late, route, c), late, c, live)).rejects.toThrow(
    'after stream conflict',
  );
});
it('200 generated content/deletion histories remain covered after valid compaction; dropping the only content fails', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 70 }), fc.nat(60), (text, n) => {
      const doc = new Y.Doc({ gc: false });
      doc.clientID = 880;
      try {
        doc.getText('master').insert(0, text);
        const insert = new Uint8Array(Y.encodeStateAsUpdate(doc)),
          sv = Y.encodeStateVector(doc);
        doc.getText('master').delete(0, Math.min(text.length, n));
        const deletion = new Uint8Array(Y.encodeStateAsUpdate(doc, sv));
        const merged = new Uint8Array(Y.mergeUpdates([insert, deletion]));
        expect(() =>
          verifyInboundCoverage([row(merged, 3, 'state')], [insert, deletion]),
        ).not.toThrow();
        expect(() => verifyInboundCoverage([], [insert])).toThrow('coverage');
        if (n > 0)
          expect(() => verifyInboundCoverage([row(insert)], [deletion])).toThrow('coverage');
      } finally {
        doc.destroy();
      }
    }),
    { seed: 9172026, numRuns: 200 },
  );
});
