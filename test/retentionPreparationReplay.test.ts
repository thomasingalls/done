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
import { PREPARATION_VALUE_BYTES } from '../src/crdt/preparationValue';
// Pass-through unless a case asks the coverage basis (every content row in one value) to refuse,
// as the real encoder does once that content passes one preparation value.
const basis = vi.hoisted(() => ({ refuse: false }));
vi.mock('../src/crdt/preparationValue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/preparationValue')>();
  return {
    ...actual,
    encodePreparationValue(input: unknown) {
      if (
        basis.refuse &&
        Array.isArray(input) &&
        input.length > 0 &&
        input.every((r) => r && typeof r === 'object' && 'seq' in r && 'gen' in r && 'bytes' in r)
      )
        throw Error('Invalid preparation result encoding');
      return actual.encodePreparationValue(input);
    },
  };
});
const context = 'ce'.repeat(32);
async function samePlan(
  expected: ReturnType<typeof inspectRetentionPlan>,
  p: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['plan']>>,
) {
  if (p.kind === 'skipped') throw Error(p.reason);
  const actual = inspectRetentionPlan(p);
  expect(actual.deleteRows).toEqual(expected.deleteRows);
  const { decodeLocalBaseline } = await import('../src/crdt/localBaselineRecord');
  const a = decodeLocalBaseline(actual.candidate.baseline.payload),
    b = decodeLocalBaseline(expected.candidate.baseline.payload);
  expect({ ...a, journalEra: undefined }).toEqual({ ...b, journalEra: undefined });
  eraseVerified(actual);
  disposeRetentionPlan(p);
}
it('a journal already at capacity completes the same plan in one uncached pass, never slicing', async () => {
  const f = await fixture(),
    normal = await f.plan();
  if (normal.kind === 'skipped') throw Error(normal.reason);
  const expected = inspectRetentionPlan(normal);
  // Two real saved slices that together leave the cache 50 bytes, less than any receipt needs.
  const seed = async (slot: string, size: number) => {
    const s = createPreparationJournal({ context, current: f.context.assertCurrent });
    try {
      await s.memo.check(
        slot,
        'unrelated',
        [],
        async () => new Uint8Array(size),
        f.context.assertCurrent,
      );
      const d = await s.delta(f.auth);
      try {
        return await authenticatePreparationReceipts(
          context,
          d.payload,
          d.mac,
          f.auth,
          f.context.assertCurrent,
        );
      } finally {
        eraseVerified(d);
      }
    } finally {
      s.dispose();
    }
  };
  // Each receipt is charged its 13-byte slot, a 5-byte encoding prefix and 64 bytes.
  const half = PREPARATION_VALUE_BYTES / 2,
    proofs = [await seed('opened:999998', half), await seed('opened:999999', half - 2 * 82 - 50)];
  let clock = 0;
  const j = createPreparationJournal({
    context,
    current: f.context.assertCurrent,
    now: () => (clock += 10),
    sliceMs: 1,
  });
  try {
    for (const p of proofs) j.import(p);
    expect(j.statistics).toMatchObject({ entries: 2, full: false });
    await samePlan(expected, await f.plan(async () => j));
    expect(j.statistics).toMatchObject({ entries: 2, pending: 0, hits: 0, full: true });
  } finally {
    proofs.forEach(disposePreparationReceipts);
    j.dispose();
    eraseVerified(expected);
  }
});
it('content past one preparation value checks coverage uncached and completes the same plan', async () => {
  const f = await fixture(),
    normal = await f.plan();
  if (normal.kind === 'skipped') throw Error(normal.reason);
  const expected = inspectRetentionPlan(normal);
  const coverageSlots = async (refuse: boolean) => {
    const j = createPreparationJournal({ context, current: f.context.assertCurrent, sliceMs: 1e9 }),
      check = vi.spyOn(j.memo, 'check');
    basis.refuse = refuse;
    try {
      await samePlan(expected, await f.plan(async () => j));
      return check.mock.calls.filter(([slot]) => slot.startsWith('coverage:')).length;
    } finally {
      basis.refuse = false;
      j.dispose();
    }
  };
  try {
    expect(await coverageSlots(false)).toBeGreaterThan(0);
    expect(await coverageSlots(true)).toBe(0);
  } finally {
    eraseVerified(expected);
  }
});
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
