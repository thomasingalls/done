import { historyAuthority, verifyHistoryDecision } from '../../account-protocol/admissionHistory';
/** Private v8 delivery ledger. Status is derived from authenticated proof bytes, never a stored setter. */
import { hex, utf8, type Bytes } from './custodyCrypto';
import type { VerificationMemo } from './verificationMemo';
import { MAX_BATCH_BYTES, type OpenedRecord } from './contentRecord';
import { captureError, captureRouteAt, type CaptureRoute } from './sourceCapture';
import { inspectSpool, decodeSpoolEntry, networkRoute, type SpoolState } from './spoolRecord';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
import { decodeSubmission, verifySubmission } from '../../account-protocol/submission';
import {
  acceptanceLink,
  refusalId,
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
  entries: { record: OpenedRecord; entry: DeliveryEntry; epoch: number }[];
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
    v[7] !== a.lineage
  )
    captureError('Delivery authority changed');
  const historical = captureRouteAt(r, v[5]);
  if (v[6] !== historical.generation) captureError('Delivery generation changed');
  const issuance = r.history ? historyAuthority(r.history, { ...a, tip: v[5], head: v[8] }) : a;
  if (v[8] !== issuance.head) captureError('Delivery head changed');
  const e: DeliveryEntry = {
    type: v[9],
    position: v[10],
    wire: bytes(v[11], v[9] === 'response' ? RESPONSE_LIMIT : MAX_BATCH_BYTES / 2),
  };
  if (hex(encodeDeliveryEntry(e, historical, issuance)) !== hex(b))
    captureError('Noncanonical delivery record');
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
      entries.push({
        record: r,
        entry,
        epoch: route.history ? JSON.parse(new TextDecoder().decode(r.bytes))[5] : route.epoch,
      });
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
    if (p.position === position) {
      const proof = p.retries?.at(-1)?.refusal;
      const decoded = proof ? decodePositionResponse(proof) : null;
      const parent =
        decoded?.kind === 'refused' ? await refusalId(decoded.refusal, subtle) : ZERO_REFUSAL;
      return { ...subject, previous, parent };
    }
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
  reuse?: { memo: VerificationMemo; current(): void },
  continuation?: {
    state: DeliveryState;
    spool: SpoolState;
    envelopes: Map<number, number>;
    expected: Map<
      number,
      NonNullable<Awaited<ReturnType<typeof expectedPosition>>> & { next: string }
    >;
  },
): Promise<DeliveryState> {
  const state = continuation?.state ?? emptyDelivery(),
    entries = new Map(c.entries.map((e) => [e.record.seq, e])),
    envelopes = continuation?.envelopes ?? new Map<number, number>();
  // Replay each attempt at its own point in the append-only ledger, not using its final successor.
  const active: SpoolState = {
    ...c.spool,
    positions: c.spool.positions.map((p, i) =>
      continuation?.spool.positions[i]
        ? {
            ...continuation.spool.positions[i]!,
            attempts: [...continuation.spool.positions[i]!.attempts],
            ...(continuation.spool.positions[i]!.retries
              ? { retries: [...continuation.spool.positions[i]!.retries!] }
              : {}),
          }
        : {
            position: p.position,
            source: p.source,
            ...(p.additional ? { additional: p.additional } : {}),
            attempts: [],
          },
    ),
  };
  const expectedCache: Map<
    number,
    NonNullable<Awaited<ReturnType<typeof expectedPosition>>> & { next: string }
  > = continuation?.expected ?? new Map();
  const expectedAt = async (position: number) => {
    if (!reuse && !continuation) return expectedPosition(active, position, subtle);
    for (let n = expectedCache.size + 1; n <= position; n++) {
      const p = active.positions[n - 1];
      if (!p?.wire) return null;
      const e = decodeNetworkEnvelope(p.wire),
        subject = {
          workspace: e.workspace_id,
          credential: e.credential_id,
          position: e.seq,
          digest: hex(e.digest),
          epoch: e.epoch,
        },
        previous = expectedCache.get(n - 1)?.next ?? ZERO_REFUSAL,
        proof = p.retries?.at(-1)?.refusal,
        closed = proof ? decodePositionResponse(proof) : null,
        parent =
          closed?.kind === 'refused' ? await refusalId(closed.refusal, subtle) : ZERO_REFUSAL,
        next = reuse
          ? await reuse.memo.check(
              'link:' + n,
              JSON.stringify([subject, previous]),
              [],
              () => acceptanceLink(subject, previous, subtle),
              reuse.current,
            )
          : await acceptanceLink(subject, previous, subtle);
      expectedCache.set(n, { ...subject, previous, parent, next });
    }
    return expectedCache.get(position) ?? null;
  };
  for (const row of c.ledger) {
    const retained = entries.get(row.seq),
      entry = retained?.entry;
    if (!entry) {
      const event = decodeSpoolEntry(row.bytes, r),
        p = active.positions.find((p) => p.position === event.position)!;
      if (event.type === 'retry') {
        const proof = decodePositionResponse(event.refusal);
        if (
          state.conflict ||
          state.finalThrough !== null ||
          event.position !== state.acceptedThrough + 1 ||
          proof.kind !== 'refused' ||
          proof.refusal.reason !== 'retired-generation' ||
          state.refusals.get(event.position) !== (await refusalId(proof.refusal, subtle)) ||
          !p.wire
        )
          captureError('Retry lacks the retained closing decision');
        (p.retries ??= []).push({ wire: p.wire!, refusal: event.refusal });
        delete p.wire;
        state.refusals.delete(event.position);
        state.submissions.delete(event.position);
        envelopes.delete(event.position);
        for (const n of expectedCache.keys()) if (n >= event.position) expectedCache.delete(n);
      } else {
        if (publicationState(state) !== 'ready') captureError('Allocation after delivery halt');
        if (event.type === 'envelope') {
          p.wire = event.wire;
          envelopes.set(event.position, row.seq);
        }
      }
      continue;
    }
    if (!envelopes.has(entry.position) || envelopes.get(entry.position)! >= row.seq)
      captureError('Delivery precedes its envelope');
    const p = active.positions.find((p) => p.position === entry.position)!;
    const authority = r.history
      ? historyAuthority(r.history, retained!.epoch === 1 ? r.history.first : a)
      : a;

    if (entry.type === 'submission') {
      if (
        publicationState(state) !== 'ready' ||
        entry.position !== state.acceptedThrough + 1 ||
        state.submissions.has(entry.position)
      )
        captureError('Submission order or eligibility changed');
      const epoch = decodeNetworkEnvelope(p.wire!).epoch;
      if (epoch > retained!.epoch) captureError('Submission precedes envelope authority');
      const issuance = r.history ? r.history.authorities.find((a) => a.tip === epoch)! : authority;
      const check = () =>
          verifySubmission(entry.wire, networkRoute(r, epoch), publicKey, issuance, subtle),
        opened = reuse
          ? await reuse.memo.check(
              'delivery:' + row.seq,
              JSON.stringify([r, authority, 'submission']),
              [entry.wire],
              check,
              reuse.current,
            )
          : await check();
      const expected = await expectedAt(entry.position);
      if (!expected || opened.parentId !== expected.parent || hex(opened.envelope) !== hex(p.wire!))
        captureError('Submission differs from persisted attempt');
      state.submissions.set(entry.position, entry.wire);
    } else {
      if (state.conflict) captureError('New response after contradictory evidence');
      const expected = await expectedAt(entry.position);
      if (!expected) captureError('Response without envelope');
      const check = () => verifyDeliveryDecision(entry.wire, expected!, authority, r, subtle),
        evidence = reuse
          ? await reuse.memo.check(
              'delivery:' + row.seq,
              JSON.stringify([expected, authority, r.history, 'response']),
              [entry.wire],
              check,
              reuse.current,
            )
          : await check();
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

/** Owner-resolved continuity only; legacy callers retain their exact-tip verifier. */
export const verifyDeliveryDecision = (
  bytes: Bytes,
  expected: Parameters<typeof verifyPositionResponse>[1],
  authority: DecisionAuthority,
  route: CaptureRoute,
  subtle: SubtleCrypto,
) =>
  route.history
    ? verifyHistoryDecision(bytes, expected, authority, route.history, subtle)
    : verifyPositionResponse(bytes, expected, authority, subtle);
