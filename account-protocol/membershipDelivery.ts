/** Versioned delivery to one pending member of a verified continuation parent. */
import { closed, accountIdentifier } from './preparation.ts';
import { domainMessage, json, same, verifySignature } from './admission.ts';
import { digest, unhex, parseDraft, recoveryStateDigest, type RecoveryDraft } from './recovery.ts';
import {
  membershipState,
  MEMBERSHIP_CREDENTIAL_LIMIT,
  MEMBERSHIP_PROOF_LIMIT,
  type VerifiedMembership,
} from './membership.ts';
import {
  parseCeremonyCommit,
  parseCeremonyReveal,
  verifyMembershipCeremonyContext,
  verifyCeremonyPair,
  deriveCeremonyExchange,
  type CeremonyCommit,
  type CeremonyReveal,
  type CeremonyParticipant,
} from './ceremonyExchange.ts';
import {
  parseCeremonyRequest,
  ceremonyRequestMessage,
  type CeremonyRequest,
} from './ceremonyRelay.ts';

export interface MembershipRecipientCertificate {
  v: 2;
  workspaceId: string;
  lineageId: string;
  parent: string;
  epoch: number;
  generation: number;
  members: CeremonyParticipant[];
  recoveryStateDigest: string;
  approver: string;
  signature: string;
}
export interface MembershipDelivery {
  v: 2;
  kind: 'membership-key-delivery';
  parent: string;
  preparationId: string;
  generation: number;
  transcriptHash: string;
  existing: CeremonyCommit;
  candidate: CeremonyCommit;
  existingReveal: CeremonyReveal;
  newReveal: CeremonyReveal;
  decision: CeremonyRequest;
  certificate: MembershipRecipientCertificate;
  recovery: RecoveryDraft;
  wrap: { enc: string; ct: string };
  signature: string;
}
export interface MembershipInstallation {
  v: 2;
  kind: 'membership-key-installed';
  deliveryHash: string;
  credentialId: string;
  signature: string;
}
const h = (v: unknown, n = 32) => {
  unhex(v, n);
  return v as string;
};
const integer = (v: unknown, minimum: number) => {
  if (
    !Number.isSafeInteger(v) ||
    (v as number) < minimum ||
    (v as number) >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Invalid continuation integer');
  return v as number;
};
const bounded = (v: unknown) => {
  if (json(v).length > MEMBERSHIP_PROOF_LIMIT) throw Error('Oversized membership delivery');
};
export function parseMembershipCertificate(input: unknown): MembershipRecipientCertificate {
  bounded(input);
  const c = closed(input, [
    'v',
    'workspaceId',
    'lineageId',
    'parent',
    'epoch',
    'generation',
    'members',
    'recoveryStateDigest',
    'approver',
    'signature',
  ]);
  if (
    c['v'] !== 2 ||
    !Array.isArray(c['members']) ||
    c['members'].length < 3 ||
    c['members'].length > MEMBERSHIP_CREDENTIAL_LIMIT
  )
    throw Error('Invalid continuation recipients');
  const members = c['members'].map((input) => {
    const m = closed(input, ['id', 'wPub', 'sPub']);
    return { id: h(m['id'], 16), wPub: h(m['wPub']), sPub: h(m['sPub']) };
  });
  for (let i = 1; i < members.length; i++)
    if (members[i - 1]!.id >= members[i]!.id) throw Error('Duplicate or unordered recipients');
  return {
    v: 2,
    workspaceId: h(c['workspaceId'], 16),
    lineageId: h(c['lineageId']),
    parent: h(c['parent']),
    epoch: integer(c['epoch'], 5),
    generation: integer(c['generation'], 1),
    members,
    recoveryStateDigest: h(c['recoveryStateDigest']),
    approver: h(c['approver'], 16),
    signature: h(c['signature'], 64),
  };
}
export const membershipCertificateMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipCertificate(input);
  return domainMessage('done/membership-recipient-certificate/v2', body);
};
export function parseMembershipDelivery(input: unknown): MembershipDelivery {
  bounded(input);
  const d = closed(input, [
    'v',
    'kind',
    'parent',
    'preparationId',
    'generation',
    'transcriptHash',
    'existing',
    'candidate',
    'existingReveal',
    'newReveal',
    'decision',
    'certificate',
    'recovery',
    'wrap',
    'signature',
  ]);
  if (d['v'] !== 2 || d['kind'] !== 'membership-key-delivery')
    throw Error('Invalid membership delivery');
  const w = closed(d['wrap'], ['enc', 'ct']);
  return {
    v: 2,
    kind: 'membership-key-delivery',
    parent: h(d['parent']),
    preparationId: accountIdentifier(d['preparationId']),
    generation: integer(d['generation'], 1),
    transcriptHash: h(d['transcriptHash']),
    existing: parseCeremonyCommit(d['existing']),
    candidate: parseCeremonyCommit(d['candidate']),
    existingReveal: parseCeremonyReveal(d['existingReveal']),
    newReveal: parseCeremonyReveal(d['newReveal']),
    decision: parseCeremonyRequest(d['decision']),
    certificate: parseMembershipCertificate(d['certificate']),
    recovery: parseDraft(d['recovery']),
    wrap: { enc: h(w['enc']), ct: h(w['ct'], 48) },
    signature: h(d['signature'], 64),
  };
}
export const membershipDeliveryMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipDelivery(input);
  return domainMessage('done/membership-key-delivery/v2', body);
};
export const membershipDeliveryHash = (input: unknown) =>
  digest(json(parseMembershipDelivery(input)));

/** Historical verification: the live relay separately checks expiry and current authority at commit. */
export async function verifyMembershipDelivery(input: unknown, parent: VerifiedMembership) {
  const p = membershipState(parent),
    d = parseMembershipDelivery(input),
    c = d.existing.context;
  const authority = verifyMembershipCeremonyContext(
    c,
    parent,
    { role: 'existing', ...c.existing },
    c.createdAt,
  );
  const pair = await verifyCeremonyPair(authority, d.existing, d.candidate, c.createdAt);
  const opening = await deriveCeremonyExchange(pair, d.existingReveal, d.newReveal, c.createdAt);
  const preparation = p.preparations.find((entry) => entry.credentialId === c.candidate.id);
  const expectedMembers = [...p.certificate.members, c.candidate].sort((a, b) =>
    a.id < b.id ? -1 : 1,
  );
  const cert = d.certificate;
  if (
    d.parent !== p.head ||
    d.generation !== p.generation ||
    !preparation ||
    d.preparationId !== preparation.attemptId ||
    d.transcriptHash !== opening.transcriptHash ||
    d.decision.v !== 2 ||
    d.decision.head !== p.head ||
    d.decision.preparationId !== d.preparationId ||
    d.decision.action !== 'decide' ||
    d.decision.workspaceId !== p.workspaceId ||
    d.decision.credentialId !== c.existing.id ||
    !same(d.decision.payload, {
      contextHash: pair.contextHash,
      transcriptHash: opening.transcriptHash,
      outcome: 'approved',
    }) ||
    cert.workspaceId !== p.workspaceId ||
    cert.lineageId !== p.lineageId ||
    cert.parent !== p.head ||
    cert.epoch !== p.epoch + 1 ||
    cert.generation !== p.generation ||
    !same(cert.members, expectedMembers) ||
    cert.approver !== c.existing.id ||
    cert.recoveryStateDigest !== p.certificate.recoveryStateDigest ||
    (await recoveryStateDigest(d.recovery)) !== p.certificate.recoveryStateDigest
  )
    throw Error('Delivery differs from approved membership');
  const approver = p.certificate.members.find((m) => m.id === c.existing.id)!;
  await verifySignature(
    approver.sPub,
    d.decision.signature,
    await ceremonyRequestMessage(d.decision),
  );
  await verifySignature(approver.sPub, cert.signature, await membershipCertificateMessage(cert));
  await verifySignature(approver.sPub, d.signature, await membershipDeliveryMessage(d));
  return { delivery: d, opening };
}
export function parseMembershipInstallation(input: unknown): MembershipInstallation {
  const i = closed(input, ['v', 'kind', 'deliveryHash', 'credentialId', 'signature']);
  if (i['v'] !== 2 || i['kind'] !== 'membership-key-installed')
    throw Error('Invalid membership installation');
  return {
    v: 2,
    kind: 'membership-key-installed',
    deliveryHash: h(i['deliveryHash']),
    credentialId: h(i['credentialId'], 16),
    signature: h(i['signature'], 64),
  };
}
export const membershipInstallationMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipInstallation(input);
  return domainMessage('done/membership-key-installed/v2', body);
};
export async function verifyMembershipInstallation(input: unknown, delivery: MembershipDelivery) {
  const i = parseMembershipInstallation(input),
    d = parseMembershipDelivery(delivery),
    c = d.existing.context.candidate;
  if (i.credentialId !== c.id || i.deliveryHash !== (await membershipDeliveryHash(d)))
    throw Error('Membership installation target changed');
  await verifySignature(c.sPub, i.signature, await membershipInstallationMessage(i));
  return i;
}

export interface MembershipTransferRequest {
  v: 2;
  workspaceId: string;
  credentialId: string;
  parent: string;
  preparationId: string;
  action: 'read' | 'deliver' | 'install';
  payload: MembershipDelivery | MembershipInstallation | null;
  signature: string;
}
export function parseMembershipTransfer(input: unknown): MembershipTransferRequest {
  bounded(input);
  const r = closed(input, [
    'v',
    'workspaceId',
    'credentialId',
    'parent',
    'preparationId',
    'action',
    'payload',
    'signature',
  ]);
  if (r['v'] !== 2 || !['read', 'deliver', 'install'].includes(String(r['action'])))
    throw Error('Invalid membership transfer');
  const action = r['action'] as MembershipTransferRequest['action'];
  if (action === 'read' && r['payload'] !== null) throw Error('Invalid membership read');
  return {
    v: 2,
    workspaceId: h(r['workspaceId'], 16),
    credentialId: h(r['credentialId'], 16),
    parent: h(r['parent']),
    preparationId: accountIdentifier(r['preparationId']),
    action,
    payload:
      action === 'deliver'
        ? parseMembershipDelivery(r['payload'])
        : action === 'install'
          ? parseMembershipInstallation(r['payload'])
          : null,
    signature: h(r['signature'], 64),
  };
}
export const membershipTransferMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipTransfer(input);
  return domainMessage('done/membership-key-transfer/v2', body);
};
