// @vitest-environment node
import type { Bytes } from '../src/crdt/custodyCrypto';
import { expect, it, vi } from 'vitest';
import { fixture } from './local-baseline/preparation-protocol-fixture';
import {
  createPreparationJournal,
  PreparationPause,
  authenticatePreparationReceipts,
  disposePreparationReceipts,
} from '../src/crdt/retentionPreparation';
import { inspectRetentionPlan, disposeRetentionPlan } from '../src/crdt/localRetentionPlan';
import { eraseVerified } from '../src/crdt/verifiedRecords';
import * as spool from '../src/crdt/spoolRecord';
const context = 'ce'.repeat(32);
it('reconstructs the same mixed own/peer/history frontier across fresh authenticated preparation slices', async () => {
  const f = await fixture(),
    normal = await f.plan();
  if (normal.kind === 'skipped') throw Error(normal.reason);
  const expected = inspectRetentionPlan(normal),
    deltas: { payload: Bytes; mac: Bytes }[] = [];
  let completed = false,
    misses = 0,
    hits = 0;
  try {
    for (let slice = 0; slice < 100; slice++) {
      let clock = 0;
      const j = createPreparationJournal({
        context,
        current: f.context.assertCurrent,
        now: () => clock++,
        sliceMs: 1,
      });
      for (const d of deltas) {
        const proof = await authenticatePreparationReceipts(
          context,
          d.payload,
          d.mac,
          f.auth,
          f.context.assertCurrent,
        );
        try {
          j.import(proof);
        } finally {
          disposePreparationReceipts(proof);
        }
      }
      try {
        const p = await f.plan(async () => j);
        if (p.kind === 'skipped') throw Error(p.reason);
        const actual = inspectRetentionPlan(p);
        expect(actual.deleteRows).toEqual(expected.deleteRows);
        expect(actual.candidate.baseline.payload).not.toEqual(new Uint8Array());
        // Era is deliberately fresh; compare the complete logical reference and cut instead.
        const { decodeLocalBaseline } = await import('../src/crdt/localBaselineRecord');
        const a = decodeLocalBaseline(actual.candidate.baseline.payload),
          b = decodeLocalBaseline(expected.candidate.baseline.payload);
        expect({ ...a, journalEra: undefined }).toEqual({ ...b, journalEra: undefined });
        eraseVerified(actual);
        disposeRetentionPlan(p);
        completed = true;
        break;
      } catch (e) {
        if (!(e instanceof PreparationPause)) throw e;
        deltas.push(await j.delta(f.auth));
      } finally {
        misses += j.statistics.pending;
        hits += j.statistics.hits;
        j.dispose();
      }
    }
    expect(completed).toBe(true);
    expect(deltas.length).toBeGreaterThan(5);
    expect(hits).toBeGreaterThan(misses);
  } finally {
    deltas.forEach(eraseVerified);
    eraseVerified(expected);
  }
});
it('receipt hits never waive the fresh completeness witness or turn corrupted original rows into a deletion plan', async () => {
  const f = await fixture(),
    j = createPreparationJournal({ context, current: f.context.assertCurrent, sliceMs: 1e9 });
  try {
    const p = await f.plan(async () => j);
    if (p.kind === 'skipped') throw Error(p.reason);
    disposeRetentionPlan(p);
    const witness = vi.spyOn(spool, 'verifySpoolWitness');
    if (f.counter.v !== 2) throw Error('Account required');
    f.counter.spool.events++;
    const { counterPayload } = await import('../src/crdt/contentRecord');
    f.counter.mac = await f.crypt.sign(
      (await import('./local-baseline/one-shot-fixture')).task,
      counterPayload(f.context.identity, f.counter),
    );
    await expect(f.plan(async () => j)).rejects.toThrow('incomplete');
    expect(witness).toHaveBeenCalled();
    witness.mockRestore();
  } finally {
    j.dispose();
  }
});
it('an integrity failure after reusable progress remains a failure and produces no candidate', async () => {
  const f = await fixture(),
    j = createPreparationJournal({ context, current: f.context.assertCurrent, sliceMs: 1e9 });
  try {
    const p = await f.plan(async () => j);
    if (p.kind === 'skipped') throw Error(p.reason);
    disposeRetentionPlan(p);
    (f.inventory.rows[0]!.value as { ct: Uint8Array }).ct[0]! ^= 1;
    await expect(f.plan(async () => j)).rejects.toThrow();
  } finally {
    j.dispose();
  }
});
