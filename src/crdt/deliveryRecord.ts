/** Private v8 delivery ledger. Status is derived from authenticated proof bytes, never a stored setter. */
import { hex, utf8, type Bytes } from './custodyCrypto';
import { MAX_BATCH_BYTES, type OpenedRecord } from './contentRecord';
import { captureError, type CaptureRoute } from './sourceCapture';
import { inspectSpool, networkRoute, type SpoolState } from './spoolRecord';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
import { decodeSubmission, verifySubmission } from '../../account-protocol/submission';
import {
  acceptanceLink,
  decodePositionResponse,
  verifyPositionResponse,
  ZERO_REFUSAL,
  RESPONSE_LIMIT,
  type DecisionAuthority,
  type DecisionEvidence,
} from '../../account-protocol/positionDecision';
export interface DeliveryEntry {
  type: 'submission' | 'response';
  position: number;
  wire: Bytes;
}
export interface DeliveryCensus {
  spool: SpoolState;
  entries: { record: OpenedRecord; entry: DeliveryEntry }[];
  ledger: OpenedRecord[];
}
export interface DeliveryState {
  acceptedThrough: number;
  finalThrough: number | null;
  refusals: Map<number, string>;
  conflict: boolean;
  submissions: Map<number, Bytes>;
  responses: Map<number, Bytes[]>;
}
export const emptyDelivery = (): DeliveryState => ({
  acceptedThrough: 0,
  finalThrough: null,
  refusals: new Map(),
  conflict: false,
  submissions: new Map(),
  responses: new Map(),
});
export function publicationState(s: DeliveryState): 'ready' | 'closed' | 'finalized' | 'conflict' {
  return s.conflict
    ? 'conflict'
    : s.refusals.size
      ? 'closed'
      : s.finalThrough !== null
        ? 'finalized'
        : 'ready';
}
/** An acceptance head proves the whole retained prefix, not just its leaf. */
export function applyDecision(
  s: DeliveryState,
  e: Exclude<DecisionEvidence, { kind: 'unknown' }>,
): void {
  if (e.kind === 'conflict') s.conflict = true;
  else if (e.kind === 'refused') {
    const n = e.refusal.position,
      old = s.refusals.get(n);
    if (n <= s.acceptedThrough || (old !== undefined && old !== e.refusalId)) s.conflict = true;
    s.refusals.set(n, old ?? e.refusalId);
  } else {
    const n = e.head.position;
    if (s.finalThrough !== null && n > s.finalThrough) s.conflict = true;
    if (e.head.final) {
      if ((s.finalThrough !== null && s.finalThrough !== n) || s.acceptedThrough > n)
        s.conflict = true;
      s.finalThrough ??= n;
    }
    s.acceptedThrough = Math.max(s.acceptedThrough, n);
    for (const position of s.refusals.keys()) if (position <= s.acceptedThrough) s.conflict = true;
  }
}
const bytes = (v: unknown, max: number): Bytes => {
  if (typeof v !== 'string' || !v.length || v.length > max * 2 || !/^(?:[0-9a-f]{2})+$/.test(v))
    return captureError('Invalid delivery wire');
  return Uint8Array.from(v.match(/../g)!, (x) => parseInt(x, 16));
};
export function encodeDeliveryEntry(
  e: DeliveryEntry,
  r: CaptureRoute,
  a: DecisionAuthority,
): Bytes {
  if (!Number.isSafeInteger(e.position) || e.position < 1 || r.workspace !== a.workspace)
    captureError('Invalid delivery subject');
  if (e.type === 'response') {
    if (e.wire.length > RESPONSE_LIMIT) captureError('Delivery response size');
    decodePositionResponse(e.wire);
  } else if (e.type === 'submission') decodeSubmission(e.wire);
  else captureError('Unknown delivery type');
  const b = utf8(
    JSON.stringify([
      'done/account-delivery/v1',
      1,
      r.workspace,
      r.credential,
      r.principal,
      r.epoch,
      r.generation,
      a.lineage,
      a.head,
      e.type,
      e.position,
      hex(e.wire),
    ]),
  );
  if (b.length > MAX_BATCH_BYTES) captureError('Delivery record size');
  return b;
}
export function decodeDeliveryEntry(
  b: Bytes,
  r: CaptureRoute,
  a: DecisionAuthority,
): DeliveryEntry {
  if (b.length > MAX_BATCH_BYTES) captureError('Delivery record size');
  const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
  if (
    !Array.isArray(v) ||
    v.length !== 12 ||
    v[0] !== 'done/account-delivery/v1' ||
    v[1] !== 1 ||
    v[2] !== r.workspace ||
    v[3] !== r.credential ||
    v[4] !== r.principal ||
    v[5] !== r.epoch ||
    v[6] !== r.generation ||
    v[7] !== a.lineage ||
    v[8] !== a.head
  )
    captureError('Delivery authority changed');
  const e: DeliveryEntry = {
    type: v[9],
    position: v[10],
    wire: bytes(v[11], v[9] === 'response' ? RESPONSE_LIMIT : MAX_BATCH_BYTES / 2),
  };
  if (hex(encodeDeliveryEntry(e, r, a)) !== hex(b)) captureError('Noncanonical delivery record');
  return e;
}
export function inspectDelivery(
  records: readonly OpenedRecord[],
  route: CaptureRoute,
  authority: DecisionAuthority,
): DeliveryCensus {
  const prior: OpenedRecord[] = [],
    entries: DeliveryCensus['entries'] = [],
    ledger: OpenedRecord[] = [];
  for (const r of records) {
    let tag;
    if (r.kind === 'heads' || r.kind === 'outbound') {
      try {
        tag = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(r.bytes))[0];
      } catch {
        captureError('Unreadable delivery carrier');
      }
    }
    if (tag === 'done/account-delivery/v1') {
      const entry = decodeDeliveryEntry(r.bytes, route, authority);
      if ((entry.type === 'submission') !== (r.kind === 'outbound'))
        captureError('Delivery record misplaced');
      entries.push({ record: r, entry });
      ledger.push(r);
    } else {
      prior.push(r);
      if (tag === 'done/account-spool/v1') ledger.push(r);
    }
  }
  const spool = inspectSpool(prior, route);
  ledger.sort((a, b) => a.seq - b.seq);
  spool.events = ledger.map((r) => r.bytes);
  return { spool, entries: entries.sort((a, b) => a.record.seq - b.record.seq), ledger };
}
export async function expectedPosition(spool: SpoolState, position: number, subtle: SubtleCrypto) {
  let previous = ZERO_REFUSAL;
  for (const p of spool.positions) {
    if (!p.wire) return null;
    const e = decodeNetworkEnvelope(p.wire),
      subject = {
        workspace: e.workspace_id,
        credential: e.credential_id,
        position: e.seq,
        digest: hex(e.digest),
        epoch: e.epoch,
      };
    if (p.position === position) return { ...subject, previous, parent: ZERO_REFUSAL };
    previous = await acceptanceLink(subject, previous, subtle);
  }
  return null;
}
export async function verifyDelivery(
  c: DeliveryCensus,
  r: CaptureRoute,
  a: DecisionAuthority,
  publicKey: CryptoKey,
  subtle: SubtleCrypto,
): Promise<DeliveryState> {
  const state = emptyDelivery(),
    entries = new Map(c.entries.map((e) => [e.record.seq, e.entry])),
    envelopes = new Map<number, number>();
  for (const row of c.ledger) {
    const entry = entries.get(row.seq);
    if (!entry) {
      if (publicationState(state) !== 'ready') captureError('Allocation after delivery halt');
      const v = JSON.parse(new TextDecoder().decode(row.bytes));
      if (v[7] === 'envelope') envelopes.set(v[8], row.seq);
      continue;
    }
    if (!envelopes.has(entry.position) || envelopes.get(entry.position)! >= row.seq)
      captureError('Delivery precedes its envelope');
    const p = c.spool.positions.find((p) => p.position === entry.position)!;
    if (entry.type === 'submission') {
      if (
        publicationState(state) !== 'ready' ||
        entry.position !== state.acceptedThrough + 1 ||
        state.submissions.has(entry.position)
      )
        captureError('Submission order or eligibility changed');
      const opened = await verifySubmission(entry.wire, networkRoute(r), publicKey, a, subtle);
      if (opened.parent !== null || hex(opened.envelope) !== hex(p.wire!))
        captureError('Submission differs from persisted first attempt');
      state.submissions.set(entry.position, entry.wire);
    } else {
      if (state.conflict) captureError('New response after contradictory evidence');
      const expected = await expectedPosition(c.spool, entry.position, subtle);
      if (!expected) captureError('Response without envelope');
      const evidence = await verifyPositionResponse(entry.wire, expected!, a, subtle);
      if (evidence.kind === 'unknown') captureError('Unverified persisted response');
      const prior = state.responses.get(entry.position) ?? [];
      if (prior.some((b) => hex(b) === hex(entry.wire)))
        captureError('Duplicate persisted response');
      prior.push(entry.wire);
      state.responses.set(entry.position, prior);
      applyDecision(state, evidence as Exclude<DecisionEvidence, { kind: 'unknown' }>);
    }
  }
  return state;
}
