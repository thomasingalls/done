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
  parseMembershipCertification,
  membershipState,
} from '../account-protocol/membership.ts';
import { verifyMembershipDelivery } from '../account-protocol/membershipDelivery.ts';
import {
  verifyCertificationHistory,
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
  if (!s.transfer?.artifact || Buffer.byteLength(s.transfer.artifact) > CONTENT_DELIVERY_LIMIT)
    throw Error('Missing continuation anchor');
  const cert = parseCertificationSuccessor(JSON.parse(s.transfer.artifact));
  const anchor = await verifyWorkspaceAuthority(
    {
      ...s,
      continuations: [],
      membershipTransfers: [],
      promotion: { ...s.promotion, successor_head: cert.head },
    },
    issuer,
  );
  let history = await verifyCertificationHistory(
    cert,
    anchor.successor,
    { pin: issuer.pin, request: anchor.request, receipt: anchor.receipt },
    { epoch: 3, head: cert.head },
  );
  const cuts = new Map<string, LedgerBoundary[]>();
  cuts.set(anchor.credential, [
    { successor: anchor.successor!, witness: anchor.boundaryWitness, authority: anchor.firstA },
    { successor: cert, witness: anchor.certificationBoundary, authority: anchor.secondA },
  ]);
  for (const m of cert.epoch.roster) if (m.id !== anchor.credential) cuts.set(m.id, []);
  const transfers = new Map((s.membershipTransfers ?? []).map((r) => [r.preparation_id, r]));
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
  const seen = new Set<string>();
  for (const row of s.continuations ?? []) {
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
  if (transfers.size || history.current.head !== s.promotion.successor_head)
    throw Error('Current membership pointer changed');
  const state = membershipState(historyMembership(history));
  if (state.generation !== 1) throw Error('Rotation needs its generation owner');
  for (const member of history.readers) historyPublisher(history, member.id);
  const members = await Promise.all(
    history.readers.map(async (m) => ({
      id: m.id,
      key: await crypto.subtle.importKey('raw', unhex(m.publicKey, 32), 'Ed25519', false, [
        'verify',
      ]),
    })),
  );
  return {
    ...anchor,
    a: history.current,
    scope: { ...anchor.scope, head: history.current.head },
    members,
    certification: structuredClone(state.certificate) as DeliveryAuthority['certification'],
    generation: state.generation,
    history,
    ledgerBoundaries: cuts,
  };
}
