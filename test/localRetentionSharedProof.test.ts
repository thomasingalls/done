// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { cryptFor, keys } from './local-baseline/anchor-fixture';
import { task } from './local-baseline/one-shot-fixture';
import * as spool from '../src/crdt/spoolRecord';
import { inspectInbound } from '../src/crdt/inboundLedger';
import {
  counterPayload,
  emptySpoolWitness,
  recordStore,
  type ContentCounter,
  type OpenedRecord,
} from '../src/crdt/contentRecord';
import {
  planLocalRetention,
  disposeRetentionPlan,
  retentionPlanReport,
  type RetentionInventory,
} from '../src/crdt/localRetentionPlan';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import type { Bytes } from '../src/crdt/custodyCrypto';
import {
  LocalBaselineError,
  prepareLocalBaselineWithReference,
  replayLocalBaseline,
} from '../src/crdt/localBaselineReplay';
// @ts-expect-error Shared independent protocol fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';
const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
});

async function fixture() {
  const f = await memberFixture();
  clean.push(f.clear);
  await f.appendOwn();
  await f.appendPeer();
  await f.appendHistory();
  const context: LocalBaselineContext = f.ctx,
    records: OpenedRecord[] = f.rows;
  let witness = emptySpoolWitness();
  for (const e of inspectInbound(records, context.route, context.inbound).delivery.spool.events)
    witness = await spool.extendSpoolWitness(witness, e, crypto.subtle);
  const next = records.at(-1)!.seq + 1;
  const counter: ContentCounter = {
    v: 2,
    spool: witness,
    store_id: context.identity.storeId,
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: next,
    reserved: { 1: next - 1 },
    mac: new Uint8Array(32),
  };
  const crypt = cryptFor(context.identity, await keys());
  counter.mac = await crypt.sign(task, counterPayload(context.identity, counter));
  const inventory: RetentionInventory = {
    metadata: [{ key: 'counter', value: counter }],
    rows: [],
  };
  for (const row of records)
    inventory.rows.push({
      key: row.seq,
      store: recordStore(row.kind),
      value: await crypt.seal(
        task,
        { v: 1, seq: row.seq, gen: row.gen, kind: row.kind },
        row.bytes,
      ),
    });
  const auth = {
    sign: (b: Bytes) => crypt.sign(task, b),
    verify: (b: Bytes, m: Bytes) => crypt.verify(task, b, m),
  };
  const plan = async () => {
    const p = await planLocalRetention(
      task,
      inventory,
      context,
      { open: (r) => crypt.open(task, r), verify: auth.verify, auth },
      { lifetime: {}, intent: counter.intent, allowReduced: true },
    );
    if (p.kind !== 'skipped') clean.push(() => disposeRetentionPlan(p));
    return p;
  };
  return { context, records, counter, crypt, inventory, auth, plan };
}

it('first conversion verifies the full immutable history once while retaining candidate and survivor proofs', async () => {
  const x = await fixture(),
    witness = vi.spyOn(spool, 'verifySpoolWitness');
  const p = await x.plan();
  expect(p.kind).toBe('local-retention-dry-run');
  expect(witness).toHaveBeenCalledTimes(1);
  if (p.kind === 'skipped') throw Error(p.reason);
  expect(retentionPlanReport(p).rows).toBe(x.inventory.rows.length);
  expect(retentionPlanReport(p).survivors).toBe(0);
});

it('corrupt original ciphertext is rejected before any compact candidate can be signed', async () => {
  const x = await fixture(),
    sign = vi.spyOn(x.auth, 'sign');
  (x.inventory.rows[0]!.value as { ct: Uint8Array }).ct[0]! ^= 1;
  await expect(x.plan()).rejects.toThrow();
  expect(sign).not.toHaveBeenCalled();
});

it('a validly authenticated counter with an incorrect spool witness still refuses before signing', async () => {
  const x = await fixture();
  if (x.counter.v !== 2) throw Error('Account counter required');
  x.counter.spool.events++;
  x.counter.mac = await x.crypt.sign(task, counterPayload(x.context.identity, x.counter));
  const sign = vi.spyOn(x.auth, 'sign');
  await expect(x.plan()).rejects.toThrow();
  expect(sign).not.toHaveBeenCalled();
});

it('reference failures retain their failure classification instead of becoming a candidate skip', async () => {
  const x = await fixture(),
    sign = vi.spyOn(x.auth, 'sign');
  vi.spyOn(spool, 'verifySpoolWitness').mockRejectedValueOnce(new LocalBaselineError('ineligible'));
  await expect(x.plan()).rejects.toThrow('ineligible');
  expect(sign).not.toHaveBeenCalled();
});

it('paired reference and candidate own detached bytes independent of each other and original input', async () => {
  const x = await fixture();
  const pair = await prepareLocalBaselineWithReference(
    { records: x.records, counter: x.counter },
    x.context,
    x.auth,
  );
  const payload = pair.candidate.baseline.payload.slice(),
    reference = pair.reference.snapshot.slice();
  x.records.forEach((r) => r.bytes.fill(0));
  expect(pair.reference.snapshot).toEqual(reference);
  pair.reference.snapshot.fill(0);
  expect(pair.candidate.baseline.payload).toEqual(payload);
  const replay = await replayLocalBaseline(
    pair.candidate.baseline,
    pair.candidate.anchor,
    { records: [], counter: x.counter },
    x.context,
    x.auth,
  );
  expect(replay.snapshot).toEqual(reference);
});

it('authority invalidation during candidate construction cannot return paired proof or a deletion plan', async () => {
  const x = await fixture();
  let live = true;
  x.context.assertCurrent = () => {
    if (!live) throw Error('obsolete owner');
  };
  const sign = x.auth.sign;
  vi.spyOn(x.auth, 'sign').mockImplementation(async (b) => {
    const mac = await sign(b);
    live = false;
    return mac;
  });
  await expect(x.plan()).rejects.toThrow('obsolete owner');
});
