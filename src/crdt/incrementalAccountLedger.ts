/** Private append continuation. A complete physical census is still required on every load. */
import {
  type OpenedRecord,
  type ContentCounter,
  type SpoolWitness,
  sameSpoolWitness,
} from './contentRecord';
import { sameBytes } from './verifiedRecords';
import {
  captureError,
  decodeSourceCapsule,
  eraseCapsule,
  type CaptureRoute,
} from './sourceCapture';
import {
  decodeSpoolEntry,
  extendSpoolWitness,
  verifySpool,
  positionSources,
  MAX_POSITION_BYTES,
  NET_SEAL_LIMIT,
  type SpoolState,
} from './spoolRecord';
import {
  decodeDeliveryEntry,
  verifyDelivery,
  expectedPosition,
  type DeliveryState,
} from './deliveryRecord';
import { type InboundState, type inspectInbound } from './inboundLedger';
import { type InboundContext } from './accountInbound';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
import {
  acceptanceLink,
  decodePositionResponse,
  refusalId,
  ZERO_REFUSAL,
} from '../../account-protocol/positionDecision';
import { historyMinimumGeneration } from '../../account-protocol/admissionHistory';
import { captureRouteAt } from './sourceCapture';
import { decodeInboundRequest } from '../../account-protocol/inboundTransport';
import { decodeInboundRecord } from './inboundRecord';
import { isHistoryInstallTag } from './historyInstall';
import { hex, type Bytes } from './custodyCrypto';
import type { VerificationMemo } from './verificationMemo';
import { countLedger } from './accountLedgerMetrics';

type Expected = NonNullable<Awaited<ReturnType<typeof expectedPosition>>> & { next: string };
type SourceIndex = {
  seq: number;
  epoch: number;
  sources: { actor: string; kind: string; length: number }[];
};
export interface AccountLedgerIndexes {
  sources: Map<string, SourceIndex>;
  sourceCount: number;
  used: Set<string>;
  expected: Map<number, Expected>;
  envelopes: Map<number, number>;
  witness: SpoolWitness;
  epoch: number;
}
export interface AccountLedgerView {
  census: ReturnType<typeof inspectInbound>;
  delivery: DeliveryState;
  inbound: InboundState;
  indexes?: AccountLedgerIndexes;
}
// Bound the additional semantic indexes. The existing byte-owning carrier/view remains unchanged.
// Large views use the reference, rather than accumulate an additional unbounded cache.
const INDEX_MAX_ROWS = 32768,
  INDEX_MAX_BYTES = 32 * 1024 * 1024;
const text = new TextDecoder('utf-8', { fatal: true });
const fields = (r: OpenedRecord): unknown[] => {
  try {
    return JSON.parse(text.decode(r.bytes));
  } catch {
    return captureError('Unreadable incremental carrier');
  }
};
const content = (r: OpenedRecord) => r.kind === 'update' || r.kind === 'state';
export function appendedRecords(before: readonly OpenedRecord[], after: readonly OpenedRecord[]) {
  // Never classify using a counter, event count, or high-water mark alone.
  if (after.length < before.length) return undefined;
  for (let i = 0; i < before.length; i++) {
    const a = before[i]!,
      b = after[i]!;
    if (a.seq !== b.seq || a.kind !== b.kind || a.gen !== b.gen || !sameBytes(a.bytes, b.bytes))
      return undefined;
  }
  const added = after.slice(before.length);
  let last = before.at(-1)?.seq ?? 0;
  for (const row of added) {
    if (row.seq <= last) return undefined;
    last = row.seq;
  }
  return added;
}
/** Only deletion of unchanged content rows is eligible for an independently proved replacement. */
export function contentReplacement(
  before: readonly OpenedRecord[],
  after: readonly OpenedRecord[],
) {
  const old = new Map(before.map((r) => [r.seq, r]));
  const added: OpenedRecord[] = [];
  let last = 0;
  for (const row of after) {
    if (row.seq <= last) return;
    last = row.seq;
    const previous = old.get(row.seq);
    if (previous) {
      if (
        previous.gen !== row.gen ||
        previous.kind !== row.kind ||
        !sameBytes(previous.bytes, row.bytes)
      )
        return;
      old.delete(row.seq);
    } else {
      if (row.seq <= (before.at(-1)?.seq ?? 0)) return;
      added.push(row);
    }
  }
  if (!old.size || [...old.values()].some((r) => !content(r))) return;
  return added;
}
function sourceIndex(bytes: Bytes, seq: number, route: CaptureRoute) {
  countLedger('sourceDecodes');
  const c = decodeSourceCapsule(bytes, route);
  try {
    return {
      id: c.id,
      index: {
        seq,
        epoch: c.epoch,
        sources: c.sources.map((s) => ({ actor: s.actor, kind: s.kind, length: s.bytes.length })),
      },
    };
  } finally {
    eraseCapsule(c);
  }
}
export async function indexVerifiedLedger(
  view: AccountLedgerView,
  records: readonly OpenedRecord[],
  route: CaptureRoute,
  counter: ContentCounter,
  subtle: SubtleCrypto,
): Promise<AccountLedgerIndexes | undefined> {
  if (
    counter.v !== 2 ||
    records.length > INDEX_MAX_ROWS ||
    records.reduce((n, r) => n + r.bytes.length, 0) > INDEX_MAX_BYTES
  )
    return;
  const spool = view.census.delivery.spool;
  const sources = new Map<string, SourceIndex>();
  let sourceCount = 0;
  for (const row of spool.sourceRecords)
    if (row.kind === 'outbound') {
      const x = sourceIndex(row.bytes, row.seq, route);
      if (!sources.has(x.id)) {
        sourceCount += x.index.sources.length;
        if (sourceCount > INDEX_MAX_ROWS) return;
        sources.set(x.id, x.index);
      }
    }
  const expected = new Map<number, Expected>(),
    envelopes = new Map<number, number>();
  for (const row of view.census.delivery.ledger) {
    const f = fields(row);
    if (f[0] === 'done/account-spool/v1') {
      const e = decodeSpoolEntry(row.bytes, route);
      if (e.type === 'envelope') envelopes.set(e.position, row.seq);
      else if (e.type === 'retry') envelopes.delete(e.position);
    }
  }
  let previous = ZERO_REFUSAL;
  for (const p of spool.positions) {
    if (!p.wire) break;
    const e = decodeNetworkEnvelope(p.wire),
      closed = p.retries?.at(-1)?.refusal;
    const proof = closed ? decodePositionResponse(closed) : undefined;
    const subject = {
      workspace: e.workspace_id,
      credential: e.credential_id,
      position: e.seq,
      digest: hex(e.digest),
      epoch: e.epoch,
    };
    const parent =
      proof?.kind === 'refused' ? await refusalId(proof.refusal, subtle) : ZERO_REFUSAL;
    const next = await acceptanceLink(subject, previous, subtle);
    expected.set(p.position, { ...subject, previous, parent, next });
    previous = next;
  }
  let epoch = 1;
  for (const row of records)
    if (!content(row)) {
      const f = fields(row);
      if (f[0] === 'done/account-inbound/v1')
        epoch = decodeInboundRequest(decodeInboundRecord(row.bytes).request).epoch;
      else if (
        f[0] === 'done/account-spool/v1' ||
        f[0] === 'done/account-delivery/v1' ||
        isHistoryInstallTag(f[0])
      )
        epoch = f[5] as number;
    }
  return {
    sources,
    sourceCount,
    used: new Set(
      spool.positions.flatMap((p) => positionSources(p).map((r) => r.id + ':' + r.index)),
    ),
    expected,
    envelopes,
    witness: { ...counter.spool },
    epoch,
  };
}

export async function extendAccountLedger(
  previous: Readonly<AccountLedgerView>,
  before: readonly OpenedRecord[],
  records: OpenedRecord[],
  route: CaptureRoute,
  counter: ContentCounter,
  base: InboundContext,
  signer: CryptoKey,
  subtle: SubtleCrypto,
  reuse: { memo: VerificationMemo; current(): void },
  equivalentContent?: () => boolean,
): Promise<Pick<AccountLedgerView, 'census' | 'delivery' | 'indexes'> | undefined> {
  let added = appendedRecords(before, records);
  if (!added) {
    added = contentReplacement(before, records);
    if (!added || !equivalentContent?.()) return;
  }
  const old = previous.indexes;
  if (
    !old ||
    !added ||
    counter.v !== 2 ||
    records.length > INDEX_MAX_ROWS ||
    records.reduce((n, r) => n + r.bytes.length, 0) > INDEX_MAX_BYTES
  )
    return;
  // History installations and legacy own-inbound writes take the full reference.
  for (const row of added)
    if (!content(row)) {
      const tag = fields(row)[0];
      if (tag === 'done/account-inbound/v1') {
        if (
          decodeInboundRequest(decodeInboundRecord(row.bytes).request).publisher ===
          base.publisher.id
        )
          return;
      } else if (
        !['done/source-capture/v1', 'done/account-spool/v1', 'done/account-delivery/v1'].includes(
          tag as string,
        )
      )
        return;
    }
  const indexes: AccountLedgerIndexes = {
    sources: new Map(old.sources),
    sourceCount: old.sourceCount,
    used: new Set(old.used),
    expected: new Map(old.expected),
    envelopes: new Map(old.envelopes),
    witness: { ...old.witness },
    epoch: old.epoch,
  };
  countLedger('incremental');
  const prior = previous.census.delivery;
  const spool: SpoolState = {
    ...prior.spool,
    sources: new Map(prior.spool.sources),
    positions: prior.spool.positions.map((p) => ({
      ...p,
      attempts: [...p.attempts],
      ...(p.retries ? { retries: [...p.retries] } : {}),
    })),
    sourceRecords: [...prior.spool.sourceRecords],
    events: [...prior.spool.events],
  };
  const ledger = [...prior.ledger],
    entries = [...prior.entries],
    newLedger: OpenedRecord[] = [],
    newEntries: typeof entries = [];
  const inbound = [...previous.census.entries];
  const kept = new Set(records.map((r) => r.seq));
  spool.sourceRecords = spool.sourceRecords.filter((r) => kept.has(r.seq));
  const touched = new Set<number>();
  for (const row of added) {
    if (content(row)) {
      spool.sourceRecords.push(row);
      continue;
    }
    const f = fields(row),
      tag = f[0];
    if (tag === 'done/source-capture/v1') {
      if (row.kind !== 'outbound') captureError('Source record misplaced');
      const x = sourceIndex(row.bytes, row.seq, route),
        found = spool.sources.get(x.id);
      if (found && !sameBytes(found, row.bytes))
        captureError('Conflicting source capsule identity');
      spool.sources.set(x.id, row.bytes);
      spool.sourceRecords.push(row);
      if (!indexes.sources.has(x.id)) {
        indexes.sourceCount += x.index.sources.length;
        if (indexes.sourceCount > INDEX_MAX_ROWS) return;
        indexes.sources.set(x.id, x.index);
      }
      continue;
    }
    const inboundEvent =
      tag === 'done/account-inbound/v1' ? decodeInboundRecord(row.bytes) : undefined;
    const epoch = inboundEvent
      ? decodeInboundRequest(inboundEvent.request).epoch
      : (f[5] as number);
    if (route.history && epoch < indexes.epoch) captureError('Account ledger authority regressed');
    indexes.epoch = epoch;
    countLedger('events');
    spool.events.push(row.bytes);
    indexes.witness = await extendSpoolWitness(indexes.witness, row.bytes, subtle);
    if (inboundEvent) {
      if (row.kind !== 'heads') captureError('Inbound record misplaced');
      inbound.push({ record: row, event: inboundEvent });
      continue;
    }
    ledger.push(row);
    newLedger.push(row);
    if (tag === 'done/account-delivery/v1') {
      const entry = decodeDeliveryEntry(row.bytes, route, base.authority);
      if ((entry.type === 'submission') !== (row.kind === 'outbound'))
        captureError('Delivery record misplaced');
      const e = { record: row, entry, epoch };
      entries.push(e);
      newEntries.push(e);
      continue;
    }
    const e = decodeSpoolEntry(row.bytes, route);
    if ((e.type === 'envelope') !== (row.kind === 'outbound'))
      captureError('Spool record misplaced');
    if (e.type === 'position' || e.type === 'position-batch') {
      if (e.position !== spool.positions.length + 1 || spool.positions.some((p) => !p.wire))
        captureError('Position sequence or unresolved predecessor');
      const refs = e.type === 'position' ? [e.source] : e.sources;
      let sequence = -1,
        index = -1,
        total = 0,
        actor = '',
        kind = '',
        sourceEpoch = 0;
      for (const ref of refs) {
        const meta = indexes.sources.get(ref.id),
          key = ref.id + ':' + ref.index;
        if (!meta || indexes.used.has(key) || meta.seq >= row.seq)
          return captureError('Missing, repeated or late source');
        if (meta.seq < sequence || (meta.seq === sequence && ref.index <= index))
          captureError('Source batch order changed');
        if (sourceEpoch && meta.epoch !== sourceEpoch)
          captureError('Source batch crosses authority');
        const s = meta.sources[ref.index];
        if (!s) return captureError('Missing source index');
        if (actor && (actor !== s.actor || kind !== s.kind))
          captureError('Source batch actor changed');
        total += s.length;
        if (refs.length > 1 && total > MAX_POSITION_BYTES) captureError('Source batch too large');
        sourceEpoch = meta.epoch;
        actor = s.actor;
        kind = s.kind;
        sequence = meta.seq;
        index = ref.index;
        indexes.used.add(key);
      }
      spool.positions.push({
        position: e.position,
        source: refs[0]!,
        ...(refs.length > 1 ? { additional: refs.slice(1) } : {}),
        attempts: [],
      });
    } else if (e.type === 'retry') {
      const p = spool.positions[e.position - 1];
      if (!p?.wire || !route.history) return captureError('Retry without retained envelope');
      const envelope = decodeNetworkEnvelope(p.wire),
        proof = decodePositionResponse(e.refusal);
      if (
        proof.kind !== 'refused' ||
        proof.refusal.reason !== 'retired-generation' ||
        proof.refusal.workspace !== route.workspace ||
        proof.refusal.credential !== route.credential ||
        proof.refusal.position !== e.position ||
        proof.refusal.digest !== hex(envelope.digest) ||
        proof.refusal.epoch !== envelope.epoch ||
        envelope.gen >= captureRouteAt(route, epoch).generation ||
        envelope.gen >= historyMinimumGeneration(route.history, epoch)
      )
        captureError('Retry does not close an older generation');
      (p.retries ??= []).push({ wire: p.wire, refusal: e.refusal });
      delete p.wire;
      p.attempts = [];
    } else {
      const p = spool.positions[e.position - 1];
      if (!p || p.wire || (p !== spool.positions.at(-1) && !p.retries?.length))
        return captureError('Spool transition without open position');
      if (e.type === 'attempt') {
        if (e.attempt !== spool.attempts + 1 || e.attempt >= NET_SEAL_LIMIT)
          captureError('Invocation sequence changed');
        spool.attempts = e.attempt;
        p.attempts.push(e.attempt);
      } else {
        if (!p.attempts.length || e.attempt !== p.attempts.at(-1))
          captureError('Envelope lacks latest invocation grant');
        if (
          p.retries?.length &&
          decodeNetworkEnvelope(e.wire).gen <= decodeNetworkEnvelope(p.retries.at(-1)!.wire).gen
        )
          captureError('Retry generation did not advance');
        p.wire = e.wire;
      }
    }
    touched.add(e.position);
  }
  if (!sameSpoolWitness(indexes.witness, counter.spool))
    captureError('Spool ledger commitment changed');
  await verifySpool(
    { ...spool, positions: spool.positions.filter((p) => touched.has(p.position)) },
    route,
    new Map([...(base.retainedGenerationKeys ?? []), [base.generation, base.generationKey]]),
    signer,
    subtle,
    reuse,
  );
  const state: DeliveryState = {
    ...previous.delivery,
    refusals: new Map(previous.delivery.refusals),
    submissions: new Map(previous.delivery.submissions),
    responses: new Map([...previous.delivery.responses].map(([n, r]) => [n, [...r]])),
  };
  const delivery = await verifyDelivery(
    { spool, entries: newEntries, ledger: newLedger },
    route,
    base.authority,
    signer,
    subtle,
    reuse,
    { state, spool: prior.spool, envelopes: indexes.envelopes, expected: indexes.expected },
  );
  reuse.current();
  return {
    census: { ...previous.census, entries: inbound, delivery: { spool, entries, ledger } },
    delivery,
    indexes,
  };
}

/** Compare the observable verified result, independently of continuation-only indexes. */
export function sameAccountLedger(a: AccountLedgerView, b: AccountLedgerView): boolean {
  const same = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (a instanceof Uint8Array && b instanceof Uint8Array) return sameBytes(a, b);
    if (a instanceof Map && b instanceof Map)
      return a.size === b.size && [...a].every(([k, v]) => b.has(k) && same(v, b.get(k)));
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ak = Object.keys(a),
      bk = Object.keys(b);
    return (
      ak.length === bk.length &&
      ak.every(
        (k) =>
          Object.hasOwn(b, k) &&
          same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
      )
    );
  };
  return same(a.census, b.census) && same(a.delivery, b.delivery) && same(a.inbound, b.inbound);
}
