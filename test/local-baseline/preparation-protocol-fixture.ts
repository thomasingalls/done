// @vitest-environment node
import { afterEach } from 'vitest';
import { cryptFor, keys } from './anchor-fixture';
import { task } from './one-shot-fixture';
import * as spool from '../../src/crdt/spoolRecord';
import { inspectInbound } from '../../src/crdt/inboundLedger';
import {
  counterPayload,
  emptySpoolWitness,
  recordStore,
  type ContentCounter,
  type OpenedRecord,
} from '../../src/crdt/contentRecord';
import {
  planLocalRetention,
  disposeRetentionPlan,
  type RetentionInventory,
} from '../../src/crdt/localRetentionPlan';
import type { LocalBaselineContext } from '../../src/crdt/localBaselineReplay';
import type { Bytes } from '../../src/crdt/custodyCrypto';
// @ts-expect-error Shared independent protocol fixture.
import { memberFixture } from './fixtures.mjs';
const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
});

export async function fixture() {
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
  const plan = async (preparation?: Parameters<typeof planLocalRetention>[7]) => {
    const p = await planLocalRetention(
      task,
      inventory,
      context,
      { open: (r) => crypt.open(task, r), verify: auth.verify, auth },
      { lifetime: {}, intent: counter.intent, allowReduced: true },
      undefined,
      undefined,
      preparation,
    );
    if (p.kind !== 'skipped') clean.push(() => disposeRetentionPlan(p));
    return p;
  };
  return { context, records, counter, crypt, inventory, auth, plan };
}
