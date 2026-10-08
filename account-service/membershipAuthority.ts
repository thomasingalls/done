/** Ceremony authority only. Does not resolve delivery ledgers or grant continuation sync. */
import { verifyMembershipDelivery } from '../account-protocol/membershipDelivery.ts';
import { same } from '../account-protocol/admission.ts';
import {
  CONTENT_DELIVERY_LIMIT,
  parseCertificationSuccessor,
} from '../account-protocol/contentDelivery.ts';
import {
  membershipState,
  parseMembershipAdmission,
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  parseMembershipCertification,
  verifyMembershipCertification,
  parseMembershipCancellation,
  verifyMembershipCancellation,
} from '../account-protocol/membership.ts';
import {
  verifyWorkspaceAuthority,
  type WorkspaceAuthoritySnapshot,
  type DeliveryIssuer,
} from './delivery.ts';

export async function verifyPendingMembership(
  snapshot: WorkspaceAuthoritySnapshot,
  issuer: Pick<DeliveryIssuer, 'pin' | 'check'>,
) {
  const records = snapshot.continuations ?? [];
  if (records.length !== 1 || !snapshot.transfer?.artifact)
    throw Error('Unsupported continuation ceremony history');
  if (Buffer.byteLength(snapshot.transfer.artifact) > CONTENT_DELIVERY_LIMIT)
    throw Error('Oversized retained anchor certificate');
  const certificate = parseCertificationSuccessor(JSON.parse(snapshot.transfer.artifact));
  const anchor = await verifyWorkspaceAuthority(
    {
      ...snapshot,
      continuations: [],
      membershipTransfers: [],
      membershipCancellations: [],
      promotion: { ...snapshot.promotion, successor_head: certificate.head },
    },
    issuer,
  );
  let membership = await verifyMembershipAnchor(
    { pin: issuer.pin, request: anchor.request, receipt: anchor.receipt },
    anchor.successor,
    certificate,
    { epoch: 3, head: certificate.head },
  );
  const row = records[0]!,
    proof = parseMembershipAdmission(JSON.parse(row.artifact));
  if (
    !same(
      [row.workspace_id, row.epoch, row.parent, row.head, row.preparation_id],
      [
        proof.epoch.workspaceId,
        proof.epoch.epoch,
        proof.epoch.parent,
        proof.head,
        proof.epoch.preparation.context.attemptId,
      ],
    )
  )
    throw Error('Retained membership identity changed');
  membership = await verifyMembershipAdmission(proof, membership);
  const transfers = snapshot.membershipTransfers ?? [];
  if (transfers.length > 1) throw Error('Unsupported continuation transfer history');
  const transfer = transfers[0] ?? null;
  let delivery = null,
    certification = null,
    currentMembership = membership;
  if (transfer) {
    if (
      transfer.workspace_id !== proof.epoch.workspaceId ||
      transfer.parent !== proof.head ||
      transfer.preparation_id !== row.preparation_id ||
      (transfer.artifact === null) !== (transfer.boundaries === null)
    )
      throw Error('Retained membership transfer identity changed');
    delivery = (await verifyMembershipDelivery(JSON.parse(transfer.delivery), membership)).delivery;
    if (transfer.artifact) {
      certification = parseMembershipCertification(JSON.parse(transfer.artifact));
      if (!same(certification.epoch.delivery, delivery))
        throw Error('Retained membership delivery changed');
      currentMembership = await verifyMembershipCertification(certification, membership);
    }
  }
  const cancellations = snapshot.membershipCancellations ?? [];
  if (cancellations.length > 1) throw Error('Unsupported cancellation history');
  const rowCancellation = cancellations[0];
  let cancellation = null;
  if (rowCancellation) {
    cancellation = parseMembershipCancellation(JSON.parse(rowCancellation.artifact));
    if (
      transfer ||
      rowCancellation.workspace_id !== row.workspace_id ||
      rowCancellation.parent !== proof.head ||
      rowCancellation.preparation_id !== row.preparation_id ||
      cancellation.epoch.cancellation.preparationId !== row.preparation_id
    )
      throw Error('Retained cancellation scope changed');
    currentMembership = await verifyMembershipCancellation(cancellation, membership);
  }
  const current = membershipState(currentMembership);
  if (snapshot.promotion.successor_head !== current.head)
    throw Error('Current membership pointer changed');
  return { membership, currentMembership, anchor, proof, delivery, certification, cancellation };
}
