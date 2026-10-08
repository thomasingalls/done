/** Verify the latest connection against its exact prefix of the complete immutable history. */
import { verifyMembershipDelivery } from '../account-protocol/membershipDelivery.ts';
import { same } from '../account-protocol/admission.ts';
import {
  membershipState,
  parseMembershipCertification,
  verifyMembershipCertification,
  parseMembershipCancellation,
  verifyMembershipCancellation,
} from '../account-protocol/membership.ts';
import { historyMembership } from '../account-protocol/admissionHistory.ts';
import { verifyMembershipChain } from '../account-protocol/membershipLocator.ts';
import { membershipProofChain } from './membershipLocator.ts';
import { resolveMembershipDeliveryAuthority } from './membershipHistory.ts';
import type { WorkspaceAuthoritySnapshot, DeliveryIssuer } from './delivery.ts';

export async function verifyPendingMembership(
  snapshot: WorkspaceAuthoritySnapshot,
  issuer: Pick<DeliveryIssuer, 'pin' | 'check'>,
) {
  const row = snapshot.continuations?.at(-1);
  if (!row) throw Error('Missing continuation ceremony history');
  const anchor = await resolveMembershipDeliveryAuthority(snapshot, issuer);
  const proofs = membershipProofChain(snapshot);
  const index = proofs.continuations.findIndex((p) => p.head === row.head);
  const proof = proofs.continuations[index];
  if (!proof || proof.kind !== 'membership-admission') throw Error('Missing admission prefix');
  const base = { pin: issuer.pin, request: anchor.request, receipt: anchor.receipt };
  const prefix = await verifyMembershipChain(
    { ...proofs, continuations: proofs.continuations.slice(0, index + 1) },
    base,
  );
  const membership = historyMembership(prefix.history);
  const transfer = snapshot.membershipTransfers?.find(
    (r) => r.preparation_id === row.preparation_id,
  );
  let delivery = null,
    certification = null,
    cancellation = null,
    currentMembership = membership;
  if (transfer) {
    delivery = (await verifyMembershipDelivery(JSON.parse(transfer.delivery), membership)).delivery;
    if (transfer.artifact) {
      certification = parseMembershipCertification(JSON.parse(transfer.artifact));
      if (!same(certification.epoch.delivery, delivery))
        throw Error('Retained membership delivery changed');
      currentMembership = await verifyMembershipCertification(certification, membership);
    }
  }
  const cancelled = snapshot.membershipCancellations?.find(
    (r) => r.preparation_id === row.preparation_id,
  );
  if (cancelled) {
    cancellation = parseMembershipCancellation(JSON.parse(cancelled.artifact));
    currentMembership = await verifyMembershipCancellation(cancellation, membership);
  }
  // A later rotation can terminate an exposed connection. Never let an old ceremony mutate past it.
  if (membershipState(currentMembership).head !== snapshot.promotion.successor_head)
    throw Error('Connection is no longer the current membership');
  return { membership, currentMembership, anchor, proof, delivery, certification, cancellation };
}
