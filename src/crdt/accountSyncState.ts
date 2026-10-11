/** Joining the creating member's two ledgers never manufactures a source or an acceptance decision. */
import type { DeliveryCensus, DeliveryState } from './deliveryRecord';
import type { InboundState } from './inboundLedger';
import { captureError } from './sourceCapture';
import { hex, type Bytes } from './custodyCrypto';
import { decodePositionResponse, ZERO_REFUSAL } from '../../account-protocol/positionDecision';
import { decodeSourceCapsule, eraseCapsule, type CaptureRoute } from './sourceCapture';
import { positionSources } from './spoolRecord';
export function requireSelfEnvelope(census: DeliveryCensus, position: number, envelope: Bytes) {
  const local = census.spool.positions.find((p) => p.position === position)?.wire;
  if (!local || hex(local) !== hex(envelope))
    captureError('Unsupported branched or missing self-stream history');
}
export function verifySyncState(
  census: DeliveryCensus,
  delivery: DeliveryState,
  inbound: InboundState,
  after = 0,
) {
  for (const [position, retained] of inbound.retained)
    if (position > after) requireSelfEnvelope(census, position, retained.envelope);
  const accepted = inbound.prefix.observedThrough;
  if (
    [...delivery.refusals.keys()].some((n) => n <= accepted) ||
    (delivery.finalThrough !== null && accepted > delivery.finalThrough)
  )
    captureError('Inbound acceptance contradicts outbound decision');
}

/**
 * Internal composition over an already verified spool, delivery ledger and inbound ledger.
 * No new durable cursor: cold open derives the same prefix from the retained signed decisions.
 * Coverage must be checked against actual content (including pending deletions), not a state vector.
 * Legacy self-inbound events are verified independently before this projection is applied.
 */
export function advanceSelfReceive(
  census: DeliveryCensus,
  delivery: DeliveryState,
  inbound: InboundState,
  route: CaptureRoute,
  checkCoverage: (updates: readonly Bytes[]) => void,
  after = 0,
): void {
  verifySyncState(census, delivery, inbound, after);
  if (after > delivery.acceptedThrough) captureError('Accepted self prefix regressed');
  // A later conflict blocks use of the stream, but must not erase its already retained
  // accepted prefix (or make the scheduler observe progress going backwards).
  const conflict = delivery.conflict || inbound.conflict;
  const capsules = new Map<string, ReturnType<typeof decodeSourceCapsule>>();
  const updates: Bytes[] = [];
  const prior = after
    ? delivery.responses
        .get(after)
        ?.map(decodePositionResponse)
        .find((r) => r.kind === 'accepted')
    : undefined;
  if (after && prior?.kind !== 'accepted') captureError('Missing previous self acceptance');
  let previous = prior?.kind === 'accepted' ? prior.head.link : ZERO_REFUSAL,
    position = after;
  try {
    for (const entry of census.spool.positions.slice(after)) {
      if (entry.position > delivery.acceptedThrough) break;
      if (entry.position !== position + 1 || !entry.wire)
        return captureError('Accepted self stream has a gap');
      const proof = delivery.responses.get(entry.position)?.find((bytes) => {
        const response = decodePositionResponse(bytes);
        return response.kind === 'accepted' && response.head.position === entry.position;
      });
      if (!proof) return captureError('Accepted self stream is missing its decision');
      const response = decodePositionResponse(proof);
      if (response.kind !== 'accepted') return captureError('Missing self acceptance');
      const link = response.head.link;
      const retained = inbound.retained.get(entry.position);
      if (retained && retained.previous !== previous)
        captureError('Self acceptance chain differs from received history');
      if (entry.position === inbound.prefix.position && inbound.prefix.link !== link)
        captureError('Self acceptance head differs from received history');
      if (entry.position === inbound.startingPoint?.position && inbound.startingPoint.link !== link)
        captureError('Self acceptance head differs from checkpoint');
      for (const ref of positionSources(entry)) {
        let capsule = capsules.get(ref.id);
        if (!capsule) {
          const bytes = census.spool.sources.get(ref.id);
          if (!bytes) return captureError('Accepted self stream is missing its source');
          capsule = decodeSourceCapsule(bytes, route);
          capsules.set(ref.id, capsule);
        }
        const source = capsule.sources[ref.index];
        if (!source) return captureError('Accepted self stream source index is missing');
        updates.push(source.bytes);
      }
      // Retain the exact evidence for a read that was already in flight before acceptance.
      if (!retained)
        inbound.retained.set(entry.position, { previous, envelope: entry.wire, proof });
      previous = link;
      position = entry.position;
    }
    if (position !== delivery.acceptedThrough) captureError('Accepted self stream is incomplete');
    if (updates.length) checkCoverage(updates);
    if (position > inbound.prefix.position)
      inbound.prefix = {
        position,
        link: previous,
        observedThrough: Math.max(inbound.prefix.observedThrough, position),
      };
    inbound.conflict = conflict;
  } finally {
    for (const capsule of capsules.values()) eraseCapsule(capsule);
  }
}
