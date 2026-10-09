import { parseRecoverySuccessor } from '../account-protocol/recoveryTransition.ts';
/** Current service authority plus every immutable publisher issuance boundary. */
import { closed } from '../account-protocol/preparation.ts';
import { same } from '../account-protocol/admission.ts';
import { unhex } from '../account-protocol/recovery.ts';
import {
  CONTENT_DELIVERY_LIMIT,
  parseCertificationSuccessor,
} from '../account-protocol/contentDelivery.ts';
import {
  parseMembershipAdmission,
  parseMembershipRotation,
  type VerifiedMembership,
  parseMembershipCertification,
  parseMembershipCancellation,
  membershipState,
} from '../account-protocol/membership.ts';
import { verifyMembershipDelivery } from '../account-protocol/membershipDelivery.ts';
import {
  verifyCertificationHistory,
  verifyEarlyHistory,
  extendMembershipHistory,
  historyMembership,
  historyPublisher,
} from '../account-protocol/admissionHistory.ts';
import {
  verifyWorkspaceAuthority,
  type WorkspaceAuthoritySnapshot,
  type DeliveryIssuer,
  type DeliveryAuthority,
  type LedgerBoundary,
} from './delivery.ts';
import { parseWitness } from './deliveryWitness.ts';

export async function resolveMembershipDeliveryAuthority(
  s: WorkspaceAuthoritySnapshot,
  issuer: Pick<DeliveryIssuer, 'pin' | 'check'>,
): Promise<DeliveryAuthority> {
  if (s.transfer?.artifact && Buffer.byteLength(s.transfer.artifact) > CONTENT_DELIVERY_LIMIT)
    throw Error('Oversized continuation anchor');
  const cert = s.transfer?.artifact
    ? parseCertificationSuccessor(JSON.parse(s.transfer.artifact))
    : null;
  const originalHead = cert?.head ?? (s.successor ? JSON.parse(s.successor.artifact).head : null);
  const anchor = await verifyWorkspaceAuthority(
    {
      ...s,
      recoveries: [],
      rotations: [],
      continuations: [],
      membershipTransfers: [],
      membershipCancellations: [],
      promotion: { ...s.promotion, successor_head: originalHead },
    },
    issuer,
  );
  const base = { pin: issuer.pin, request: anchor.request, receipt: anchor.receipt };
  let history = cert
    ? await verifyCertificationHistory(cert, anchor.successor, base, { epoch: 3, head: cert.head })
    : await verifyEarlyHistory(base, anchor.successor);
  const cuts = new Map<string, LedgerBoundary[]>();
  cuts.set(anchor.credential, [
    ...(anchor.successor
      ? [{ successor: anchor.successor, witness: anchor.boundaryWitness, authority: anchor.firstA }]
      : []),
    ...(cert
      ? [{ successor: cert, witness: anchor.certificationBoundary, authority: anchor.secondA }]
      : []),
  ]);
  for (const m of history.readers) if (!cuts.has(m.id)) cuts.set(m.id, []);
  const transfers = new Map((s.membershipTransfers ?? []).map((r) => [r.preparation_id, r]));
  const cancellations = new Map(
    (s.membershipCancellations ?? []).map((r) => [r.preparation_id, r]),
  );
  if (cancellations.size !== (s.membershipCancellations ?? []).length)
    throw Error('Repeated membership cancellation');
  if (transfers.size !== (s.membershipTransfers ?? []).length)
    throw Error('Repeated membership transfer');
  const append = (raw: string, proof: LedgerBoundary['successor'], parent: typeof history) => {
    const rows = JSON.parse(raw) as unknown;
    if (!Array.isArray(rows) || rows.length !== parent.readers.length)
      throw Error('Missing publisher boundaries');
    for (const [i, r] of rows.entries()) {
      const b = closed(r, ['credentialId', 'witness']),
        id = parent.readers[i]!.id;
      if (b['credentialId'] !== id) throw Error('Publisher boundary identity changed');
      const witness = b['witness'] === null ? null : parseWitness(b['witness']);
      const list = cuts.get(id);
      if (!list) throw Error('Unknown publisher boundary');
      list.push({ successor: proof, witness, authority: parent.current });
    }
  };
  const rotationParents = new Map<string, VerifiedMembership>();
  const rotations = [
    ...(s.rotations ?? []).map((row) => ({ row, recovery: false })),
    ...(s.recoveries ?? []).map((row) => ({ row, recovery: true })),
  ].sort((a, b) => a.row.epoch - b.row.epoch);
  const applyRotationsBefore = async (epoch: number) => {
    while (rotations.length && rotations[0]!.row.epoch < epoch) {
      const { row, recovery } = rotations.shift()!,
        proof = recovery
          ? parseRecoverySuccessor(JSON.parse(row.artifact))
          : parseMembershipRotation(JSON.parse(row.artifact));
      if (
        !same(
          [row.workspace_id, row.epoch, row.parent, row.head],
          [proof.epoch.workspaceId, proof.epoch.epoch, proof.epoch.parent, proof.head],
        ) ||
        rotationParents.has(row.parent)
      )
        throw Error('Retained rotation scope changed');
      const prior = history;
      if (!recovery) rotationParents.set(row.parent, historyMembership(prior));
      history = await extendMembershipHistory(proof, prior);
      append(row.boundaries, proof, prior);
      for (const m of history.readers) if (!cuts.has(m.id)) cuts.set(m.id, []);
    }
  };
  const seen = new Set<string>();
  for (const row of s.continuations ?? []) {
    await applyRotationsBefore(row.epoch);
    const before = history,
      state = membershipState(historyMembership(history));
    if (state.roster.some((m) => m.state === 'pending'))
      throw Error('Unfinished membership connection');
    const proof = parseMembershipAdmission(JSON.parse(row.artifact));
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
      ) ||
      seen.has(row.preparation_id)
    )
      throw Error('Retained membership identity changed');
    history = await extendMembershipHistory(proof, history);
    append(row.boundaries, proof, before);
    seen.add(row.preparation_id);
    const transfer = transfers.get(row.preparation_id);
    const cancelled = cancellations.get(row.preparation_id);
    if (cancelled) {
      const cancellation = parseMembershipCancellation(JSON.parse(cancelled.artifact));
      if (
        transfer ||
        cancelled.workspace_id !== row.workspace_id ||
        cancelled.parent !== proof.head ||
        cancellation.epoch.cancellation.preparationId !== row.preparation_id
      )
        throw Error('Retained cancellation scope changed');
      const prior = history;
      history = await extendMembershipHistory(cancellation, history);
      append(cancelled.boundaries, cancellation, prior);
      cancellations.delete(row.preparation_id);
      continue;
    }
    if (!transfer) continue;
    if (
      transfer.workspace_id !== row.workspace_id ||
      transfer.parent !== proof.head ||
      (transfer.artifact === null) !== (transfer.boundaries === null)
    )
      throw Error('Retained transfer scope changed');
    const { delivery } = await verifyMembershipDelivery(
      JSON.parse(transfer.delivery),
      historyMembership(history),
    );
    if (transfer.artifact) {
      const certification = parseMembershipCertification(JSON.parse(transfer.artifact)),
        prior = history;
      if (!same(certification.epoch.delivery, delivery)) throw Error('Retained delivery changed');
      history = await extendMembershipHistory(certification, history);
      append(transfer.boundaries!, certification, prior);
      for (const m of history.readers) if (!cuts.has(m.id)) cuts.set(m.id, []);
    }
    transfers.delete(row.preparation_id);
  }
  await applyRotationsBefore(Infinity);
  if (transfers.size || cancellations.size || history.current.head !== s.promotion.successor_head)
    throw Error('Current membership pointer changed');
  const state = membershipState(historyMembership(history));
  for (const member of history.readers) historyPublisher(history, member.id);
  const historicalMembers = await Promise.all(
    [...cuts.keys()]
      .map((id) => historyPublisher(history, id))
      .map(async (m) => ({
        id: m.credential,
        key: await crypto.subtle.importKey('raw', unhex(m.signingKey, 32), 'Ed25519', false, [
          'verify',
        ]),
      })),
  );
  return {
    ...anchor,
    a: history.current,
    scope: { ...anchor.scope, head: history.current.head },
    members: historicalMembers.filter((m) => history.readers.some((r) => r.id === m.id)),
    historicalMembers,
    rotationParents,
    certification: structuredClone(state.certificate) as DeliveryAuthority['certification'],
    generation: state.generation,
    history,
    ledgerBoundaries: cuts,
  };
}
