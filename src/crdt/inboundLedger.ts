/** Internal v9 census. Authority is supplied only after admission verification under the factor permit. */
import { parseReceipt } from '../../account-protocol/admission';
import { decodeInboundPage, decodeInboundRequest } from '../../account-protocol/inboundTransport';
import { ZERO_REFUSAL } from '../../account-protocol/positionDecision';
import { hex, utf8, type Bytes } from './custodyCrypto';
import type { PromotionRecord } from './promotionRecord';
import type { OpenedRecord } from './contentRecord';
import { captureError, captureRoute, type CaptureRoute } from './sourceCapture';
import { inspectDelivery } from './deliveryRecord';
import { decodeInboundRecord } from './inboundRecord';
import { verifyStoredInbound, type InboundContext, type InboundLifetime } from './accountInbound';
import { Y, forkDoc, sameDocState } from './yjs';

export async function heldInboundContext(
  marker: PromotionRecord,
  key: Bytes,
  subtle: SubtleCrypto,
): Promise<InboundContext> {
  const receipt = parseReceipt(marker.admission!.receipt),
    offer = receipt.offer,
    route = captureRoute(marker),
    member = marker.admission!.request.certification.members[0];
  if (
    offer.epoch.epoch !== 1 ||
    route.generation !== 1 ||
    marker.genesis!.signer !== route.credential ||
    member.sPub !== hex(marker.credentials![1].publicKey)
  )
    captureError('Unsupported inbound membership');
  return {
    baseline: {
      kind: 'promotion-genesis',
      id: hex(new Uint8Array(await subtle.digest('SHA-256', utf8(JSON.stringify(receipt))))),
    },
    service: { id: marker.pin.serviceId, origin: marker.pin.origin },
    authority: {
      workspace: route.workspace,
      lineage: offer.epoch.lineageId,
      tip: 1,
      head: offer.head,
      acceptanceKey: offer.epoch.acceptancePublicKey,
    },
    creatingCredential: route.credential,
    reader: { id: route.credential, publicKey: member.sPub, active: true },
    publisher: {
      id: route.credential,
      publicKey: member.sPub,
      principal: route.principal,
      system: marker.genesis!.actors.some(
        (a) => a.credential === route.credential && a.id === 'system' && a.kind === 'system',
      ),
      active: true,
    },
    generation: 1,
    generationKey: key,
    prefix: { position: 0, link: ZERO_REFUSAL, observedThrough: 0 },
  };
}
export function inspectInbound(
  records: readonly OpenedRecord[],
  route: CaptureRoute,
  context: InboundContext,
) {
  const prior: OpenedRecord[] = [],
    entries: { record: OpenedRecord; event: ReturnType<typeof decodeInboundRecord> }[] = [];
  for (const record of records) {
    let tag;
    if (record.kind === 'heads' || record.kind === 'outbound') {
      try {
        tag = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(record.bytes))[0];
      } catch {
        captureError('Unreadable inbound carrier');
      }
    }
    if (tag === 'done/account-inbound/v1') {
      if (record.kind !== 'heads') captureError('Inbound record misplaced');
      entries.push({ record, event: decodeInboundRecord(record.bytes) });
    } else prior.push(record);
  }
  const delivery = inspectDelivery(prior, route, context.authority);
  // Delivery's own transition order remains separate; the one completeness witness covers the union.
  const ledger = [...delivery.ledger, ...entries.map((e) => e.record)].sort(
    (a, b) => a.seq - b.seq,
  );
  delivery.spool.events = ledger.map((r) => r.bytes);
  return { delivery, entries: entries.sort((a, b) => a.record.seq - b.record.seq) };
}
export interface InboundState {
  prefix: InboundContext['prefix'];
  conflict: boolean;
  retained: Map<number, NonNullable<InboundContext['retained']>>;
}
export const emptyInbound = (): InboundState => ({
  prefix: { position: 0, link: ZERO_REFUSAL, observedThrough: 0 },
  conflict: false,
  retained: new Map(),
});
export function contextAt(
  base: InboundContext,
  state: InboundState,
  after: number,
): InboundContext {
  const retained = state.retained.get(after + 1);
  return { ...base, prefix: { ...state.prefix }, ...(retained ? { retained } : {}) };
}
/** A fork must be unchanged by each evidenced original; no vector-only or pending merge shortcut. */
export function verifyInboundCoverage(
  records: readonly OpenedRecord[],
  updates: readonly Bytes[],
): void {
  const content = records.filter((r) => r.kind === 'update' || r.kind === 'state'),
    doc = new Y.Doc({ gc: false });
  try {
    for (const r of [...content].sort((a, b) => a.seq - b.seq)) {
      Y.decodeUpdate(r.bytes);
      Y.applyUpdate(doc, r.bytes);
    }
    const originals = new Set(content.map((r) => hex(r.bytes)));
    for (const update of updates) {
      if (originals.has(hex(update))) continue;
      const copy = forkDoc(doc, false);
      try {
        Y.applyUpdate(copy, update);
        if (!sameDocState(doc, copy)) captureError('Inbound content coverage is missing');
      } finally {
        copy.destroy();
      }
    }
  } finally {
    doc.destroy();
  }
}
export async function verifyInboundLedger(
  census: ReturnType<typeof inspectInbound>,
  records: readonly OpenedRecord[],
  base: InboundContext,
  lifetime: InboundLifetime,
): Promise<InboundState> {
  const state = emptyInbound();
  for (const { record, event } of census.entries) {
    if (state.conflict) captureError('Inbound event after stream conflict');
    const request = decodeInboundRequest(event.request);
    const result = await verifyStoredInbound(
      contextAt(base, state, request.after),
      record.bytes,
      lifetime,
    );
    if (result.kind === 'conflict') state.conflict = true;
    else if (result.kind === 'received') {
      try {
        verifyInboundCoverage(records, result.updates);
      } finally {
        for (const b of result.updates) b.fill(0);
      }
      state.prefix = {
        position: result.position,
        link: result.link,
        observedThrough: result.through,
      };
      const entry = decodeInboundPage(event.page).entries[0]!;
      state.retained.set(result.position, {
        previous: event.previous,
        envelope: entry.envelope,
        proof: entry.proof,
      });
    } else captureError('Unexpected stored inbound observation');
  }
  lifetime.assertCurrent();
  return state;
}
