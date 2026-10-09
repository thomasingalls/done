/** Joining the creating member's two ledgers never manufactures a source or an acceptance decision. */
import type { DeliveryCensus, DeliveryState } from './deliveryRecord';
import type { InboundState } from './inboundLedger';
import { captureError } from './sourceCapture';
import { hex, type Bytes } from './custodyCrypto';
export function requireSelfEnvelope(census: DeliveryCensus, position: number, envelope: Bytes) {
  const local = census.spool.positions.find((p) => p.position === position)?.wire;
  if (!local || hex(local) !== hex(envelope))
    captureError('Unsupported branched or missing self-stream history');
}
export function verifySyncState(
  census: DeliveryCensus,
  delivery: DeliveryState,
  inbound: InboundState,
) {
  for (const [position, retained] of inbound.retained)
    requireSelfEnvelope(census, position, retained.envelope);
  const accepted = inbound.prefix.observedThrough;
  if (
    [...delivery.refusals.keys()].some((n) => n <= accepted) ||
    (delivery.finalThrough !== null && accepted > delivery.finalThrough)
  )
    captureError('Inbound acceptance contradicts outbound decision');
}
