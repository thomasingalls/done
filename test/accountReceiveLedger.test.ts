import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @vitest-environment node
import { expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { Y } from '../src/crdt/yjs';
import {
  createInboundCoverage,
  verifyInboundCoverage,
  inspectInbound,
  inspectInboundCooperatively,
  verifyInboundLedger,
} from '../src/crdt/inboundLedger';
import { sources, entry, packet, A, ZERO } from './account-inbound/fixtures';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
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
  const histories: unknown[] = [];
  const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
  const save = (status: string) => {
    if (process.env['ACCOUNT_REPORT_DIR'])
      writeFileSync(
        join(process.env['ACCOUNT_REPORT_DIR'], 'unit-ledger-histories.json'),
        JSON.stringify({ status, seed: 9172026, histories }, null, 2) + '\n',
      );
  };
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
        const refused = (fn: () => unknown) => {
          let reason: string | undefined;
          try {
            fn();
          } catch (e) {
            reason = String(e);
          }
          expect(reason).toContain('coverage');
          return reason!;
        };
        const missing = refused(() => verifyInboundCoverage([], [insert])),
          withoutDeletion =
            n > 0 ? refused(() => verifyInboundCoverage([row(insert)], [deletion])) : null;
        histories.push({
          text,
          n,
          insert: hex(insert),
          deletion: hex(deletion),
          merged: hex(merged),
          missing,
          withoutDeletion,
        });
        save('running');
      } finally {
        doc.destroy();
      }
    }),
    { seed: 9172026, numRuns: 200 },
  );
  save('passed');
});

it('reference receipt checkpoints interrupt cached work, retry fully, and retain coverage failures', async () => {
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
  const census = inspectInbound(rows, route, c),
    memo = createVerificationMemo();
  const reference = createInboundCoverage();
  try {
    const expected = await verifyInboundLedger(census, rows, c, live, {
      memo,
      coverage: reference,
    });
    reference.clear();
    const check = vi.fn(reference.check);
    let checkpoints = 0;
    await expect(
      verifyInboundLedger(census, rows, c, live, {
        memo,
        coverage: { check },
        checkpoint: async () => {
          if (++checkpoints === 2) throw new MaintenanceInterrupted();
        },
      }),
    ).rejects.toBeInstanceOf(MaintenanceInterrupted);
    expect(checkpoints).toBe(2);
    expect(check).toHaveBeenCalledTimes(1);
    // A retry still walks every receipt, with an independent coverage baseline.
    reference.clear();
    check.mockClear();
    expect(
      await verifyInboundLedger(census, rows, c, live, {
        memo,
        coverage: { check },
        checkpoint: async () => {},
      }),
    ).toEqual(expected);
    expect(check).toHaveBeenCalledTimes(2);
    const missing = rows.filter((r) => r.seq !== 4);
    await expect(
      verifyInboundLedger(census, missing, c, live, {
        memo,
        coverage: reference,
        checkpoint: async () => {},
      }),
    ).rejects.toThrow('coverage');
  } finally {
    reference.clear();
    memo.clear();
  }
});

it('rechecks lifetime after a reference checkpoint before touching the next receipt', async () => {
  const f = sources(),
    a = f.entries[0]!,
    c = context();
  const rows = [row(f.baseline), row(a.updates[0]!, 2), row(eventWire(a), 3, 'heads')];
  const memo = createVerificationMemo(),
    coverage = { check: vi.fn() };
  let closed = false;
  try {
    await expect(
      verifyInboundLedger(
        inspectInbound(rows, route, c),
        rows,
        c,
        {
          assertCurrent() {
            if (closed) throw Error('closed owner');
          },
        },
        {
          memo,
          coverage,
          checkpoint: async () => {
            closed = true;
          },
        },
      ),
    ).rejects.toThrow('closed owner');
    expect(coverage.check).not.toHaveBeenCalled();
  } finally {
    memo.clear();
  }
});

it('cooperative and synchronous receipt censuses agree, and cancellation exposes no partial census', async () => {
  const f = sources(),
    a = f.entries[0]!,
    c = context();
  const rows = [row(f.baseline), row(a.updates[0]!, 2), row(eventWire(a), 3, 'heads')];
  const checkpoint = vi.fn(async () => {});
  expect(await inspectInboundCooperatively(rows, route, c, checkpoint)).toEqual(
    inspectInbound(rows, route, c),
  );
  expect(checkpoint).toHaveBeenCalledTimes(rows.length);
  await expect(
    inspectInboundCooperatively(rows, route, c, async () => {
      throw new MaintenanceInterrupted();
    }),
  ).rejects.toBeInstanceOf(MaintenanceInterrupted);
  const wrong = [...rows, row(new Uint8Array([255]), 4, 'heads')];
  expect(() => inspectInbound(wrong, route, c)).toThrow('Unreadable inbound');
  await expect(inspectInboundCooperatively(wrong, route, c, async () => {})).rejects.toThrow(
    'Unreadable inbound',
  );
});
