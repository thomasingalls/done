/** Genuine current membership/baseline, for internal continuation/witness contracts, not native MACs. */
import { membershipPageFixture } from './membership-fixtures';
import { eraseMembershipReading, membershipReadingPrefix } from '../../src/crdt/membershipReading';
import { inspectInbound, verifyInboundLedger } from '../../src/crdt/inboundLedger';
import { emptyDelivery } from '../../src/crdt/deliveryRecord';
import {
  emptySpoolWitness,
  type OpenedRecord,
  type ContentCounter,
} from '../../src/crdt/contentRecord';
import { extendSpoolWitness } from '../../src/crdt/spoolRecord';
import { createVerificationMemo } from '../../src/crdt/verificationMemo';
import {
  indexVerifiedLedger,
  type AccountLedgerView,
} from '../../src/crdt/incrementalAccountLedger';
export async function appendPageFixture() {
  const f = await membershipPageFixture();
  let replay;
  try {
    replay = await f.replay();
    const held = replay;
    const own = held.contexts.find((c) => c.publisher.id === f.who.id)!;
    const base = { ...own, prefix: membershipReadingPrefix(f.reading, f.who.id) };
    const route = {
      workspace: f.history.current.workspace,
      credential: f.who.id,
      principal: f.history.principal,
      epoch: f.history.current.tip,
      generation: 2,
      history: base.history!,
    };
    const lifetime = { assertCurrent() {}, now: () => 90000 };
    const signer = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(Buffer.from(base.reader.publicKey, 'hex')),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const counter = async (records: readonly OpenedRecord[]): Promise<ContentCounter> => {
      let spool = emptySpoolWitness();
      for (const row of records)
        if (row.kind === 'heads') spool = await extendSpoolWitness(spool, row.bytes, crypto.subtle);
      return {
        v: 2,
        store_id: 'ef'.repeat(32),
        intent: '04'.repeat(16),
        active_gen: 2,
        next_seq: (records.at(-1)?.seq ?? 0) + 1,
        reserved: { 2: records.length },
        spool,
        mac: new Uint8Array(32),
      };
    };
    const full = async (records: OpenedRecord[]): Promise<AccountLedgerView> => {
      const census = inspectInbound(records, route, base);
      return {
        census,
        inbound: await verifyInboundLedger(census, records, base, lifetime),
        delivery: emptyDelivery(),
      };
    };
    const rows: OpenedRecord[] = [{ seq: 1, gen: 2, kind: 'state', bytes: held.initial }];
    const memo = createVerificationMemo();
    const indexed = async (records = rows) => {
      const value = await full(records);
      const indexes = await indexVerifiedLedger(
        value,
        records,
        route,
        await counter(records),
        crypto.subtle,
        memo.ownedBytes(),
      );
      if (!indexes) throw Error('Fixture initial index unavailable');
      return { ...value, indexes };
    };
    const add = (records: OpenedRecord[], original: Uint8Array) => {
      const event = held.records.find((e) => Buffer.from(e.record).equals(Buffer.from(original)));
      if (!event) throw Error('Missing genuine fixture event');
      const next = [...records];
      for (const bytes of event.updates)
        next.push({ seq: next.length + 1, gen: 2, kind: 'update', bytes });
      next.push({ seq: next.length + 1, gen: 2, kind: 'heads', bytes: event.record });
      return next;
    };
    return {
      f,
      base,
      route,
      lifetime,
      signer,
      rows,
      memo,
      full,
      counter,
      indexed,
      add,
      cleanup() {
        memo.clear();
        eraseMembershipReading(held);
        f.cleanup();
      },
    };
  } catch (cause) {
    if (replay) eraseMembershipReading(replay);
    f.cleanup();
    throw cause;
  }
}
