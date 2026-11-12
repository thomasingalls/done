/** Phase 554 fixture: one publisher's own sent history, verified as the live owner verifies it.
 * Each position is a captured source (update + capsule), a position, an attempt, an envelope and
 * a signed acceptance, all from the independent Node wire oracle. `view()` runs the complete
 * check the owner runs before indexing (census, delivery, inbound, self-receive, indexes), and
 * `extend()` runs one continuation exactly as the owner's validate callback does, up to the
 * receipt turn's completion, which the caller owns. */
import { createHash } from 'node:crypto';
import { Y } from '../src/crdt/yjs';
import { encodeSpoolEntry, extendSpoolWitness, type SpoolEntry } from '../src/crdt/spoolRecord';
import { encodeDeliveryEntry, verifyDelivery } from '../src/crdt/deliveryRecord';
import { encodeSourceCapsule } from '../src/crdt/sourceCapture';
import {
  emptySpoolWitness,
  type ContentCounter,
  type OpenedRecord,
  type SpoolWitness,
} from '../src/crdt/contentRecord';
import {
  inspectInbound,
  verifyInboundLedger,
  createInboundCoverage,
} from '../src/crdt/inboundLedger';
import { advanceSelfReceive } from '../src/crdt/accountSyncState';
import * as ledger from '../src/crdt/incrementalAccountLedger';
import {
  extendAccountLedger,
  indexVerifiedLedger,
  type AccountLedgerView,
} from '../src/crdt/incrementalAccountLedger';
import { createVerificationMemo } from '../src/crdt/verificationMemo';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { InboundReceiptTurn } from '../src/crdt/accountInbound';
import { entry, A, ZERO } from './account-inbound/fixtures';
import { context } from './account-inbound-codecs/oracle';

const digest = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** The live owner's recheck after replay: the row-bounds gate since phase 554, before it the
 * reporting call. Resolved by name so the same fixture runs on the phase 553 source. */
const recheck = ((ledger as Record<string, unknown>)['accountLedgerIndexBounds'] ??
  ledger.accountLedgerIndexUsage) as (
  view: AccountLedgerView,
  records: readonly OpenedRecord[],
  proofBytes: number,
  mode: 'shared',
) => { eligible: boolean };
const lifetime = { assertCurrent() {} };
export async function sendHistory(positions: number) {
  const base = context(),
    route = {
      workspace: base.authority.workspace,
      credential: A,
      principal: A,
      epoch: 1,
      generation: 1,
    };
  const signer = await crypto.subtle.importKey(
    'raw',
    Buffer.from(base.publisher.publicKey, 'hex'),
    'Ed25519',
    false,
    ['verify'],
  );
  const doc = new Y.Doc({ gc: false });
  let seq = 0,
    attempts = 0,
    previous = ZERO,
    position = 0;
  const row = (kind: OpenedRecord['kind'], bytes: Bytes): OpenedRecord => ({
    seq: ++seq,
    gen: 1,
    kind,
    bytes,
  });
  const spool = (e: SpoolEntry) =>
    row(e.type === 'envelope' ? 'outbound' : 'heads', encodeSpoolEntry(e, route));
  /** One sent position as the owner appends it: capture, position, attempt, envelope, response. */
  const next = (): OpenedRecord[][] => {
    const updates: Bytes[] = [];
    const capture = (u: Uint8Array) => updates.push(new Uint8Array(u));
    doc.on('update', capture);
    doc.getText('t').insert(doc.getText('t').length, 'x' + (position + 1));
    doc.off('update', capture);
    const update = updates[0]!,
      id = (position + 1).toString(16).padStart(32, '0'),
      capsule = encodeSourceCapsule({
        ...route,
        v: 1,
        id,
        sources: [{ actor: A, kind: 'human', bytes: update }],
      });
    const n = ++position,
      e = entry({ publisher: A, updates: [update] }, n, previous);
    previous = e.link;
    proofs.set(n, e.proof);
    return [
      [row('update', update), row('outbound', capsule)],
      [spool({ type: 'position', position: n, source: { id, index: 0, hash: digest(capsule) } })],
      [spool({ type: 'attempt', position: n, attempt: ++attempts })],
      [spool({ type: 'envelope', position: n, attempt: attempts, wire: e.envelope })],
      [
        row(
          'heads',
          encodeDeliveryEntry(
            { type: 'response', position: n, wire: e.proof },
            route,
            base.authority,
          ),
        ),
      ],
    ];
  };
  const rows: OpenedRecord[] = [],
    proofs = new Map<number, Bytes>();
  for (let i = 0; i < positions; i++) for (const step of next()) rows.push(...step);
  // The spool witness commits every ledger event in order; extend it as rows are appended.
  let witness: SpoolWitness = emptySpoolWitness();
  for (const b of inspectInbound(rows, route, base).delivery.spool.events)
    witness = await extendSpoolWitness(witness, b, crypto.subtle);
  const counter = (w: SpoolWitness, records: readonly OpenedRecord[]): ContentCounter => {
    const nextSeq = (records.at(-1)?.seq ?? 0) + 1;
    return {
      v: 2,
      spool: { ...w },
      store_id: '02'.repeat(16),
      intent: '04'.repeat(16),
      active_gen: 1,
      next_seq: nextSeq,
      reserved: { 1: nextSeq - 1 },
      mac: new Uint8Array(32),
    };
  };
  const memo = createVerificationMemo(),
    coverage = createInboundCoverage({ incremental: true, direct: true });
  /** The owner's complete check, then its index build, as accountReceive's checkFull. */
  const view = async (): Promise<AccountLedgerView> => {
    const census = inspectInbound(rows, route, base);
    const reuse = { memo, current() {} };
    const delivery = await verifyDelivery(
      census.delivery,
      route,
      base.authority,
      signer,
      crypto.subtle,
      reuse,
    );
    const checking = coverage.bind(rows);
    const inbound = await verifyInboundLedger(census, rows, base, lifetime, {
      memo,
      coverage: checking,
    });
    advanceSelfReceive(census.delivery, delivery, inbound, route, (u) => checking.check(rows, u));
    const result: AccountLedgerView = { census, delivery, inbound };
    const indexes = await indexVerifiedLedger(
      result,
      rows,
      route,
      counter(witness, rows),
      crypto.subtle,
      memo.ownedBytes(),
      'shared',
    );
    if (!indexes) throw Error('Fixture history must stay indexed');
    result.indexes = indexes;
    return result;
  };
  /** Append one step's rows and continue the verified view, as the validate callback does. */
  const extend = async (
    previous: AccountLedgerView,
    added: OpenedRecord[],
    turn: InboundReceiptTurn,
  ) => {
    const before = rows.slice();
    for (const r of added) {
      rows.push(r);
      // Every ledger row is a witness event; content and source capsules are not.
      const tag = new TextDecoder().decode(r.bytes.subarray(0, 32));
      if (r.kind !== 'update' && !tag.startsWith('["done/source-capture/v1"'))
        witness = await extendSpoolWitness(witness, r.bytes, crypto.subtle);
    }
    const records = rows.slice();
    const result = await extendAccountLedger(
      previous,
      before,
      records,
      route,
      counter(witness, records),
      base,
      signer,
      crypto.subtle,
      { memo, current() {}, recordOwnership: 'shared' },
      () => coverage.prepare(records) === 'equivalent',
      turn,
    );
    if (!result) throw Error('Fixture continuation fell back to the full check');
    const checking = coverage.bind(records);
    const inbound = await verifyInboundLedger(
      result.census,
      records,
      base,
      lifetime,
      { memo, coverage: checking },
      { state: previous.inbound, after: before.at(-1)?.seq ?? 0 },
      turn,
    );
    advanceSelfReceive(
      result.census.delivery,
      result.delivery,
      inbound,
      route,
      (u) => checking.check(records, u),
      previous.delivery.acceptedThrough,
    );
    const adopted: AccountLedgerView = { ...result, inbound };
    // The live owner's recheck after replay (accountReceive's validate callback).
    if (!recheck(adopted, records, memo.ownedBytes(), 'shared').eligible) delete adopted.indexes;
    return { view: adopted, records };
  };
  return {
    base,
    route,
    signer,
    rows,
    /** The service's signed acceptance of position n, as the submit reply carries it. */
    proof: (n: number) => proofs.get(n)!,
    witness: () => ({ ...witness }),
    memo,
    next,
    view,
    extend,
    cleanup() {
      doc.destroy();
      coverage.clear();
      memo.clear();
    },
  };
}
