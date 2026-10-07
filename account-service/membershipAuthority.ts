/** Ceremony authority only. Does not resolve delivery ledgers or grant continuation sync. */
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
  const current = membershipState(membership);
  if (snapshot.promotion.successor_head !== current.head)
    throw Error('Current membership pointer changed');
  return { membership, anchor, proof };
}
