/** Bounded private continuation: one approved epoch-2 child, generation 1, certification at 3. */
import { closed } from './preparation.ts';
import { json, same, domainMessage, verifySignature } from './admission.ts';
import {
  lp,
  digest,
  unhex,
  parseDraft,
  recoveryStateDigest,
  type RecoveryDraft,
} from './recovery.ts';
import {
  verifySuccessor,
  type AdmissionSuccessor,
  type SuccessorBase,
  type StreamHead,
  type AdmissionMember,
} from './successor.ts';
import {
  parseCeremonyCommit,
  parseCeremonyReveal,
  verifyCeremonyContext,
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

export const CONTENT_DELIVERY_LIMIT = 48 * 1024;
export interface RecipientCertificate {
  members: [CeremonyParticipant, CeremonyParticipant];
  recoveryStateDigest: string;
  approver: string;
  signature: string;
}
export interface ContentDelivery {
  v: 1;
  kind: 'content-key-delivery';
  parent: string;
  generation: 1;
  transcriptHash: string;
  existing: CeremonyCommit;
  candidate: CeremonyCommit;
  existingReveal: CeremonyReveal;
  newReveal: CeremonyReveal;
  decision: CeremonyRequest;
  certificate: RecipientCertificate;
  recovery: RecoveryDraft;
  wrap: { enc: string; ct: string };
  signature: string;
}
export interface ContentInstallation {
  v: 1;
  kind: 'content-key-installed';
  deliveryHash: string;
  credentialId: string;
  signature: string;
}
export interface CertificationEpoch {
  v: 1;
  kind: 'device-certification-epoch';
  epoch: 3;
  parent: string;
  delivery: ContentDelivery;
  installation: ContentInstallation;
  roster: [AdmissionMember, AdmissionMember];
  heads: [StreamHead, StreamHead];
}
export interface CertificationSuccessor {
  v: 1;
  kind: 'device-certification-successor';
  epoch: CertificationEpoch;
  head: string;
  signature: string;
}
const h = (v: unknown, n = 32) => {
  unhex(v, n);
  return v as string;
};
const bounded = (v: unknown) => {
  if (json(v).length > CONTENT_DELIVERY_LIMIT) throw Error('Content delivery too large');
};
const member = (v: unknown): CeremonyParticipant => {
  const r = closed(v, ['id', 'wPub', 'sPub']);
  return { id: h(r['id'], 16), wPub: h(r['wPub']), sPub: h(r['sPub']) };
};
export function parseRecipientCertificate(v: unknown): RecipientCertificate {
  const r = closed(v, ['members', 'recoveryStateDigest', 'approver', 'signature']);
  if (!Array.isArray(r['members']) || r['members'].length !== 2)
    throw Error('Expected two recipients');
  const members = r['members'].map(member) as RecipientCertificate['members'];
  if (members[0].id >= members[1].id) throw Error('Unordered or duplicate recipients');
  return {
    members,
    recoveryStateDigest: h(r['recoveryStateDigest']),
    approver: h(r['approver'], 16),
    signature: h(r['signature'], 64),
  };
}
export async function recipientCertificateMessage(
  certificate: RecipientCertificate,
  workspace: string,
  lineage: string,
) {
  const c = parseRecipientCertificate(certificate);
  const md = await digest(
    lp('done/certified-members/v1', ...c.members.flatMap((m) => [m.id, m.wPub, m.sPub])),
  );
  return new Uint8Array([
    ...lp('done/certified-set-approval/v1', c.approver),
    ...lp('done/certified-set/v1', '1', workspace, lineage, '2', '3', md, c.recoveryStateDigest),
  ]);
}
export function parseContentDelivery(v: unknown): ContentDelivery {
  bounded(v);
  const r = closed(v, [
    'v',
    'kind',
    'parent',
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
  if (r['v'] !== 1 || r['kind'] !== 'content-key-delivery' || r['generation'] !== 1)
    throw Error('Invalid content delivery');
  const w = closed(r['wrap'], ['enc', 'ct']);
  return {
    v: 1,
    kind: 'content-key-delivery',
    parent: h(r['parent']),
    generation: 1,
    transcriptHash: h(r['transcriptHash']),
    existing: parseCeremonyCommit(r['existing']),
    candidate: parseCeremonyCommit(r['candidate']),
    existingReveal: parseCeremonyReveal(r['existingReveal']),
    newReveal: parseCeremonyReveal(r['newReveal']),
    decision: parseCeremonyRequest(r['decision']),
    certificate: parseRecipientCertificate(r['certificate']),
    recovery: parseDraft(r['recovery']),
    wrap: { enc: h(w['enc']), ct: h(w['ct'], 48) },
    signature: h(r['signature'], 64),
  };
}
export const contentDeliveryMessage = (v: unknown) => {
  const { signature: _signature, ...body } = parseContentDelivery(v);
  return domainMessage('done/content-key-delivery/v1', body);
};
export const contentDeliveryHash = (v: unknown) => digest(json(parseContentDelivery(v)));
export async function verifyContentDelivery(
  v: unknown,
  base: SuccessorBase,
  admission: AdmissionSuccessor,
) {
  const d = parseContentDelivery(v),
    c = d.existing.context;
  await verifySuccessor(admission, base, { epoch: 2, head: admission.head });
  const authority = await verifyCeremonyContext(
    c,
    base,
    admission,
    { epoch: 2, head: admission.head },
    { role: 'existing', ...c.existing },
    c.createdAt,
  );
  const pair = await verifyCeremonyPair(authority, d.existing, d.candidate, c.createdAt);
  const opening = await deriveCeremonyExchange(pair, d.existingReveal, d.newReveal, c.createdAt);
  const expectedMembers = [c.existing, c.candidate].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (
    d.parent !== admission.head ||
    d.transcriptHash !== opening.transcriptHash ||
    d.decision.v !== 1 ||
    d.decision.action !== 'decide' ||
    d.decision.workspaceId !== c.workspaceId ||
    d.decision.credentialId !== c.existing.id ||
    !same(d.decision.payload, {
      contextHash: pair.contextHash,
      transcriptHash: opening.transcriptHash,
      outcome: 'approved',
    }) ||
    !same(d.certificate.members, expectedMembers) ||
    d.certificate.approver !== c.existing.id ||
    d.certificate.recoveryStateDigest !== c.recoveryStateDigest ||
    !same(d.recovery, base.request.recovery) ||
    (await recoveryStateDigest(d.recovery)) !== c.recoveryStateDigest
  )
    throw Error('Delivery differs from approved ceremony');
  // Resolve the approver from the parent certified set, never a service-supplied key table.
  const approver = admission.epoch.certified.value.members[0];
  await verifySignature(
    approver.sPub,
    d.decision.signature,
    await ceremonyRequestMessage(d.decision),
  );
  await verifySignature(
    approver.sPub,
    d.certificate.signature,
    await recipientCertificateMessage(d.certificate, c.workspaceId, c.lineageId),
  );
  await verifySignature(approver.sPub, d.signature, await contentDeliveryMessage(d));
  return { delivery: d, opening };
}
export function parseContentInstallation(v: unknown): ContentInstallation {
  const r = closed(v, ['v', 'kind', 'deliveryHash', 'credentialId', 'signature']);
  if (r['v'] !== 1 || r['kind'] !== 'content-key-installed') throw Error('Invalid installation');
  return {
    v: 1,
    kind: 'content-key-installed',
    deliveryHash: h(r['deliveryHash']),
    credentialId: h(r['credentialId'], 16),
    signature: h(r['signature'], 64),
  };
}
export const contentInstallationMessage = (v: unknown) => {
  const { signature: _signature, ...body } = parseContentInstallation(v);
  return domainMessage('done/content-key-installed/v1', body);
};
export async function verifyContentInstallation(v: unknown, d: ContentDelivery) {
  const i = parseContentInstallation(v),
    member = d.existing.context.candidate;
  if (i.credentialId !== member.id || i.deliveryHash !== (await contentDeliveryHash(d)))
    throw Error('Installation target changed');
  await verifySignature(member.sPub, i.signature, await contentInstallationMessage(i));
  return i;
}
export function parseCertificationEpoch(v: unknown): CertificationEpoch {
  bounded(v);
  const r = closed(v, [
    'v',
    'kind',
    'epoch',
    'parent',
    'delivery',
    'installation',
    'roster',
    'heads',
  ]);
  if (
    r['v'] !== 1 ||
    r['kind'] !== 'device-certification-epoch' ||
    r['epoch'] !== 3 ||
    !Array.isArray(r['heads']) ||
    r['heads'].length !== 2
  )
    throw Error('Invalid certification epoch');
  const heads = r['heads'].map((v) => {
    const r = closed(v, ['credentialId', 'position', 'link']);
    if (
      !Number.isSafeInteger(r['position']) ||
      (r['position'] as number) < 0 ||
      (r['position'] === 0) !== (r['link'] === '00'.repeat(32))
    )
      throw Error('Invalid stream head');
    return {
      credentialId: h(r['credentialId'], 16),
      position: r['position'] as number,
      link: h(r['link']),
    };
  }) as CertificationEpoch['heads'];
  if (heads[0].credentialId >= heads[1].credentialId) throw Error('Unordered stream heads');
  if (!Array.isArray(r['roster']) || r['roster'].length !== 2)
    throw Error('Invalid certified roster');
  const roster = r['roster'].map((v) => {
    const m = closed(v, ['id', 'wPub', 'sPub', 'principalId', 'state', 'capabilities']);
    if (
      m['state'] !== 'certified' ||
      !same(m['capabilities'], ['read', 'write', 'admit', 'manage'])
    )
      throw Error('Invalid certified capabilities');
    return {
      ...member({ id: m['id'], wPub: m['wPub'], sPub: m['sPub'] }),
      principalId: h(m['principalId'], 16),
      state: 'certified',
      capabilities: ['read', 'write', 'admit', 'manage'],
    };
  }) as CertificationEpoch['roster'];
  if (roster[0].id >= roster[1].id) throw Error('Unordered certified roster');
  return {
    v: 1,
    kind: 'device-certification-epoch',
    epoch: 3,
    parent: h(r['parent']),
    delivery: parseContentDelivery(r['delivery']),
    installation: parseContentInstallation(r['installation']),
    roster,
    heads,
  };
}
export const certificationEpochMessage = (v: unknown) =>
  domainMessage('done/device-certification-epoch/v1', parseCertificationEpoch(v));
export function parseCertificationSuccessor(v: unknown): CertificationSuccessor {
  bounded(v);
  const r = closed(v, ['v', 'kind', 'epoch', 'head', 'signature']);
  if (r['v'] !== 1 || r['kind'] !== 'device-certification-successor')
    throw Error('Invalid certification successor');
  return {
    v: 1,
    kind: 'device-certification-successor',
    epoch: parseCertificationEpoch(r['epoch']),
    head: h(r['head']),
    signature: h(r['signature'], 64),
  };
}
export async function verifyCertificationSuccessor(
  v: unknown,
  base: SuccessorBase,
  admission: AdmissionSuccessor,
  expectedDelivery?: ContentDelivery,
) {
  const s = parseCertificationSuccessor(v),
    e = s.epoch;
  const { delivery: d } = await verifyContentDelivery(e.delivery, base, admission);
  await verifyContentInstallation(e.installation, d);
  if (e.parent !== admission.head || (expectedDelivery && !same(d, expectedDelivery)))
    throw Error('Competing certification');
  if (
    !same(
      e.roster,
      admission.epoch.roster.map((m) => ({
        ...m,
        state: 'certified',
        capabilities: ['read', 'write', 'admit', 'manage'],
      })),
    )
  )
    throw Error('Certification roster changed');
  for (const prior of admission.epoch.heads) {
    const next = e.heads.find((h) => h.credentialId === prior.credentialId);
    if (
      !next ||
      next.position < prior.position ||
      (next.position === prior.position && next.link !== prior.link) ||
      (prior.credentialId === d.existing.context.candidate.id && next.position !== 0)
    )
      throw Error('Certification history changed');
  }
  const message = await certificationEpochMessage(e);
  if (s.head !== (await digest(message))) throw Error('Certification head changed');
  await verifySignature(base.pin.authRoot, s.signature, message);
  return s;
}
export interface ContentTransferRequest {
  v: 1;
  workspaceId: string;
  credentialId: string;
  parent: string;
  action: 'read' | 'deliver' | 'install';
  payload: ContentDelivery | ContentInstallation | null;
  signature: string;
}
export function parseContentTransferRequest(v: unknown): ContentTransferRequest {
  bounded(v);
  const r = closed(v, [
    'v',
    'workspaceId',
    'credentialId',
    'parent',
    'action',
    'payload',
    'signature',
  ]);
  if (r['v'] !== 1 || !['read', 'deliver', 'install'].includes(r['action'] as string))
    throw Error('Invalid transfer request');
  const action = r['action'] as ContentTransferRequest['action'];
  if (action === 'read' && r['payload'] !== null) throw Error('Invalid transfer read');
  return {
    v: 1,
    workspaceId: h(r['workspaceId'], 16),
    credentialId: h(r['credentialId'], 16),
    parent: h(r['parent']),
    action,
    payload:
      action === 'read'
        ? null
        : action === 'deliver'
          ? parseContentDelivery(r['payload'])
          : parseContentInstallation(r['payload']),
    signature: h(r['signature'], 64),
  };
}
export const contentTransferMessage = (v: unknown) => {
  const { signature: _signature, ...body } = parseContentTransferRequest(v);
  return domainMessage('done/content-transfer/v1', body);
};
