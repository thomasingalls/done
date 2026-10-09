/** Verified membership ancestry, including a recovery anchored in the first admission. */
import { verifyRecoverySuccessorState } from './recoveryTransition.ts';
import { closed, accountIdentifier } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import {
  domainMessage,
  json,
  same,
  verifySignature,
  parseAdmissionRequest,
  parseReceipt,
  verifyReceipt,
  type Certification,
} from './admission.ts';
import { digest, unhex, parseDraft, type RecoveryDraft } from './recovery.ts';
import {
  parseRotationRequest,
  parseRotationOutcome,
  parseRemovalFinalization,
  verifyRotationRequest,
  verifyRemovalFinalization,
  type RotationRequest,
  type RotationOutcome,
} from './rotation.ts';
import type { AcceptedHead } from './positionDecision.ts';
import {
  parseEnrollmentReceipt,
  verifyEnrollmentReceipt,
  type EnrollmentReceipt,
} from './enrollment.ts';
import {
  parseSuccessor,
  verifySuccessor,
  EMPTY_LINK,
  type SuccessorBase,
  type AdmissionMember,
  type StreamHead,
} from './successor.ts';
import {
  parseCertificationSuccessor,
  verifyCertificationSuccessor,
  type RecipientCertificate,
} from './contentDelivery.ts';

import {
  parseMembershipDelivery,
  verifyMembershipDelivery,
  parseMembershipInstallation,
  verifyMembershipInstallation,
  type MembershipDelivery,
  type MembershipInstallation,
  type MembershipRecipientCertificate,
} from './membershipDelivery.ts';

export const MEMBERSHIP_PROOF_LIMIT = 64 * 1024;
export const MEMBERSHIP_CREDENTIAL_LIMIT = 64;
export interface RotatedRecipientCertificate {
  v: 1;
  kind: 'rotation-recipient-certificate' | 'recovery-recipient-certificate';
  members: { id: string; wPub: string; sPub: string }[];
  recoveryStateDigest: string;
  approver: string;
  intentId: string;
}
export interface MembershipState {
  pin: AuthorityPin;
  accountId: string;
  principalId: string;
  workspaceId: string;
  lineageId: string;
  passkeyId: string;
  epoch: number;
  head: string;
  generation: number;
  acceptancePublicKey: string;
  certifiedSetDigest: string;
  certificate:
    | Certification
    | RecipientCertificate
    | MembershipRecipientCertificate
    | RotatedRecipientCertificate;
  finalized: AcceptedHead[];
  preparations: { credentialId: string; attemptId: string }[];
  roster: AdmissionMember[];
  heads: StreamHead[];
}
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export interface VerifiedMembership {
  readonly state: Immutable<MembershipState>;
}
const verified = new WeakSet<VerifiedMembership>();
const admittedCandidate = new WeakMap<VerifiedMembership, string>();
/** The exact admission transition, not a later state which happens to retain a pending candidate. */
export function membershipAdmissionCandidate(parent: VerifiedMembership): string {
  membershipState(parent);
  const candidate = admittedCandidate.get(parent);
  if (!candidate) throw Error('Membership is not an admission boundary');
  return candidate;
}
const freeze = <T>(value: T): Immutable<T> => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
};
function retain(state: MembershipState): VerifiedMembership {
  const result = Object.freeze({ state: freeze(state) });
  verified.add(result);
  return result;
}
export function membershipState(parent: VerifiedMembership) {
  if (!verified.has(parent)) throw Error('Unverified membership parent');
  return parent.state;
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
    throw Error('Invalid membership integer');
  return v as number;
};
const bounded = (v: unknown) => {
  if (json(v).length > MEMBERSHIP_PROOF_LIMIT) throw Error('Oversized membership proof');
};
function entries<T>(input: unknown, read: (v: unknown) => T, id: (v: T) => string): T[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MEMBERSHIP_CREDENTIAL_LIMIT)
    throw Error('Invalid membership vector');
  const result = input.map(read);
  for (let i = 1; i < result.length; i++)
    if (id(result[i - 1]!) >= id(result[i]!))
      throw Error('Unordered or duplicate membership entry');
  return result;
}
const parseMember = (input: unknown): AdmissionMember => {
  const m = closed(input, ['id', 'wPub', 'sPub', 'principalId', 'state', 'capabilities']);
  if (m['state'] !== 'certified' && m['state'] !== 'pending')
    throw Error('Unsupported member state');
  const capabilities: AdmissionMember['capabilities'] =
    m['state'] === 'certified' ? ['read', 'write', 'admit', 'manage'] : [];
  if (!same(capabilities, m['capabilities'])) throw Error('Member capabilities changed');
  return {
    id: h(m['id'], 16),
    wPub: h(m['wPub']),
    sPub: h(m['sPub']),
    principalId: h(m['principalId'], 16),
    state: m['state'],
    capabilities,
  };
};
const parseHead = (input: unknown): StreamHead => {
  const s = closed(input, ['credentialId', 'position', 'link']);
  const position = integer(s['position'], 0),
    link = h(s['link']);
  if ((position === 0) !== (link === EMPTY_LINK)) throw Error('Invalid empty member stream');
  return { credentialId: h(s['credentialId'], 16), position, link };
};

/** Captures every input before crypto; the anchor's original approval bytes are not reinterpreted. */
export async function verifyMembershipAnchor(
  baseInput: SuccessorBase,
  admissionInput: unknown,
  certificationInput: unknown,
  heldInput: { epoch: 3; head: string },
): Promise<VerifiedMembership> {
  const base = {
    pin: parseAuthorityPin(baseInput.pin),
    request: parseAdmissionRequest(baseInput.request),
    receipt: parseReceipt(baseInput.receipt),
  };
  const admission = parseSuccessor(admissionInput),
    certification = parseCertificationSuccessor(certificationInput);
  const held = closed(heldInput, ['epoch', 'head']);
  if (held['epoch'] !== 3 || held['head'] !== certification.head)
    throw Error('Membership anchor changed');
  await verifySuccessor(admission, base, { epoch: 2, head: admission.head });
  await verifyCertificationSuccessor(certification, base, admission);
  const e = admission.epoch,
    certificate = certification.epoch.delivery.certificate;
  return retain({
    pin: base.pin,
    accountId: e.accountId,
    principalId: e.principalId,
    workspaceId: e.workspaceId,
    lineageId: e.lineageId,
    passkeyId: base.receipt.activation.context.credentialId,
    epoch: 3,
    head: certification.head,
    generation: 1,
    acceptancePublicKey: e.acceptancePublicKey,
    certifiedSetDigest: await digest(json(certificate)),
    certificate,
    finalized: [],
    preparations: [],
    roster: certification.epoch.roster,
    heads: certification.epoch.heads,
  });
}

/** Early authority remains limited by its verified roster; this does not authorize ordinary
 * continuation before certification. It supplies the parent for a code-backed recovery. */
export async function verifyEarlyMembership(
  baseInput: SuccessorBase,
  admissionInput: unknown | null = null,
): Promise<VerifiedMembership> {
  const base = {
    pin: parseAuthorityPin(baseInput.pin),
    request: parseAdmissionRequest(baseInput.request),
    receipt: parseReceipt(baseInput.receipt),
  };
  const admission = admissionInput === null ? null : parseSuccessor(admissionInput);
  await verifyReceipt(base.receipt, base.request, base.pin);
  if (admission)
    await verifySuccessor(admission, base, { epoch: 1, head: base.receipt.offer.head });
  const e = base.receipt.offer.epoch,
    member = base.request.certification.members[0];
  return retain({
    pin: base.pin,
    accountId: e.accountId,
    principalId: e.principalId,
    workspaceId: e.workspaceId,
    lineageId: e.lineageId,
    passkeyId: base.receipt.activation.context.credentialId,
    epoch: admission ? 2 : 1,
    head: admission?.head ?? base.receipt.offer.head,
    generation: 1,
    acceptancePublicKey: e.acceptancePublicKey,
    certificate: base.request.certification,
    certifiedSetDigest: await digest(json(base.request.certification)),
    finalized: [],
    preparations: [],
    roster: admission?.epoch.roster ?? [
      {
        ...member,
        principalId: e.principalId,
        state: 'certified',
        capabilities: ['read', 'write', 'admit', 'manage'],
      },
    ],
    heads: admission?.epoch.heads ?? [{ credentialId: member.id, position: 0, link: EMPTY_LINK }],
  });
}
export async function verifyRecoverySuccessor(
  input: unknown,
  parent: VerifiedMembership,
): Promise<VerifiedMembership> {
  return retain(await verifyRecoverySuccessorState(input, parent));
}

export interface MembershipAdmissionEpoch {
  v: 2;
  kind: 'membership-admission-epoch';
  workspaceId: string;
  lineageId: string;
  epoch: number;
  parent: string;
  generation: number;
  acceptancePublicKey: string;
  preparation: EnrollmentReceipt;
  certifiedSetDigest: string;
  roster: AdmissionMember[];
  heads: StreamHead[];
}
export interface MembershipAdmission {
  v: 2;
  kind: 'membership-admission';
  epoch: MembershipAdmissionEpoch;
  head: string;
  signature: string;
}
export function parseMembershipAdmissionEpoch(input: unknown): MembershipAdmissionEpoch {
  bounded(input);
  const e = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'epoch',
    'parent',
    'generation',
    'acceptancePublicKey',
    'preparation',
    'certifiedSetDigest',
    'roster',
    'heads',
  ]);
  if (e['v'] !== 2 || e['kind'] !== 'membership-admission-epoch')
    throw Error('Invalid membership admission');
  return {
    v: 2,
    kind: 'membership-admission-epoch',
    workspaceId: h(e['workspaceId'], 16),
    lineageId: h(e['lineageId']),
    epoch: integer(e['epoch'], 3),
    parent: h(e['parent']),
    generation: integer(e['generation'], 1),
    acceptancePublicKey: h(e['acceptancePublicKey']),
    preparation: parseEnrollmentReceipt(e['preparation']),
    certifiedSetDigest: h(e['certifiedSetDigest']),
    roster: entries(e['roster'], parseMember, (m) => m.id),
    heads: entries(e['heads'], parseHead, (s) => s.credentialId),
  };
}
export function parseMembershipAdmission(input: unknown): MembershipAdmission {
  bounded(input);
  const p = closed(input, ['v', 'kind', 'epoch', 'head', 'signature']);
  if (p['v'] !== 2 || p['kind'] !== 'membership-admission')
    throw Error('Invalid membership admission proof');
  return {
    v: 2,
    kind: 'membership-admission',
    epoch: parseMembershipAdmissionEpoch(p['epoch']),
    head: h(p['head']),
    signature: h(p['signature'], 64),
  };
}
export const membershipAdmissionMessage = (input: unknown) =>
  domainMessage('done/device-membership-admission/v2', parseMembershipAdmissionEpoch(input));

/** Historical continuity only. The service separately consumes a live receipt and checks ledger coverage. */
export async function verifyMembershipAdmission(
  input: unknown,
  parent: VerifiedMembership,
): Promise<VerifiedMembership> {
  const p = membershipState(parent),
    proof = parseMembershipAdmission(input),
    e = proof.epoch;
  const c = e.preparation.context,
    candidate = c.candidate;
  if (
    e.parent !== p.head ||
    e.epoch !== p.epoch + 1 ||
    e.workspaceId !== p.workspaceId ||
    e.lineageId !== p.lineageId ||
    e.generation !== p.generation ||
    e.acceptancePublicKey !== p.acceptancePublicKey ||
    e.certifiedSetDigest !== p.certifiedSetDigest ||
    e.preparation.v !== 2 ||
    c.v !== 2 ||
    c.epoch !== p.epoch ||
    !same(c.pin, p.pin) ||
    c.accountId !== p.accountId ||
    c.passkeyId !== p.passkeyId ||
    c.certifiedSetDigest !== p.certifiedSetDigest ||
    c.recoveryStateDigest !== p.certificate.recoveryStateDigest ||
    candidate.workspaceId !== p.workspaceId ||
    candidate.lineageId !== p.lineageId ||
    candidate.head !== p.head ||
    p.roster.some((m) => m.id === candidate.credentialId) ||
    p.finalized.some((h) => h.credential === candidate.credentialId)
  )
    throw Error('Membership continuity changed');
  const roster = [
    ...p.roster,
    {
      id: candidate.credentialId,
      wPub: candidate.wPub,
      sPub: candidate.sPub,
      principalId: p.principalId,
      state: 'pending',
      capabilities: [],
    },
  ].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (
    !same(e.roster, roster) ||
    !same(
      e.heads.map((s) => s.credentialId),
      roster.map((m) => m.id),
    )
  )
    throw Error('Membership coverage changed');
  for (const head of e.heads) {
    const before = p.heads.find((s) => s.credentialId === head.credentialId);
    const member = roster.find((m) => m.id === head.credentialId)!;
    if (
      (!before && head.position !== 0) ||
      (member.state === 'pending' && head.position !== 0) ||
      (before &&
        (head.position < before.position ||
          (head.position === before.position && head.link !== before.link)))
    )
      throw Error('Membership accepted boundary changed');
  }
  await verifyEnrollmentReceipt(e.preparation, p.pin, candidate);
  const message = await membershipAdmissionMessage(e);
  if (proof.head !== (await digest(message))) throw Error('Membership head changed');
  await verifySignature(p.pin.authRoot, proof.signature, message);
  // Carry the verified recipient object, with its original approval context, through admission.
  const result = retain({
    ...structuredClone(p),
    epoch: e.epoch,
    head: proof.head,
    preparations: [
      ...p.preparations,
      { credentialId: candidate.credentialId, attemptId: c.attemptId },
    ],
    roster: e.roster,
    heads: e.heads,
  } as MembershipState);
  admittedCandidate.set(result, candidate.credentialId);
  return result;
}

export interface MembershipCertificationEpoch {
  v: 2;
  kind: 'membership-certification-epoch';
  workspaceId: string;
  lineageId: string;
  epoch: number;
  parent: string;
  generation: number;
  acceptancePublicKey: string;
  delivery: MembershipDelivery;
  installation: MembershipInstallation;
  roster: AdmissionMember[];
  heads: StreamHead[];
}
export interface MembershipCertification {
  v: 2;
  kind: 'membership-certification';
  epoch: MembershipCertificationEpoch;
  head: string;
  signature: string;
}
export function parseMembershipCertificationEpoch(input: unknown): MembershipCertificationEpoch {
  bounded(input);
  const e = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'epoch',
    'parent',
    'generation',
    'acceptancePublicKey',
    'delivery',
    'installation',
    'roster',
    'heads',
  ]);
  if (e['v'] !== 2 || e['kind'] !== 'membership-certification-epoch')
    throw Error('Invalid membership certification');
  return {
    v: 2,
    kind: 'membership-certification-epoch',
    workspaceId: h(e['workspaceId'], 16),
    lineageId: h(e['lineageId']),
    epoch: integer(e['epoch'], 4),
    parent: h(e['parent']),
    generation: integer(e['generation'], 1),
    acceptancePublicKey: h(e['acceptancePublicKey']),
    delivery: parseMembershipDelivery(e['delivery']),
    installation: parseMembershipInstallation(e['installation']),
    roster: entries(e['roster'], parseMember, (m) => m.id),
    heads: entries(e['heads'], parseHead, (s) => s.credentialId),
  };
}
export function parseMembershipCertification(input: unknown): MembershipCertification {
  bounded(input);
  const p = closed(input, ['v', 'kind', 'epoch', 'head', 'signature']);
  if (p['v'] !== 2 || p['kind'] !== 'membership-certification')
    throw Error('Invalid membership certification proof');
  return {
    v: 2,
    kind: 'membership-certification',
    epoch: parseMembershipCertificationEpoch(p['epoch']),
    head: h(p['head']),
    signature: h(p['signature'], 64),
  };
}
export const membershipCertificationMessage = (input: unknown) =>
  domainMessage(
    'done/device-membership-certification/v2',
    parseMembershipCertificationEpoch(input),
  );

export async function verifyMembershipCertification(
  input: unknown,
  parent: VerifiedMembership,
): Promise<VerifiedMembership> {
  const p = membershipState(parent),
    proof = parseMembershipCertification(input),
    e = proof.epoch;
  if (
    e.parent !== p.head ||
    e.epoch !== p.epoch + 1 ||
    e.workspaceId !== p.workspaceId ||
    e.lineageId !== p.lineageId ||
    e.generation !== p.generation ||
    e.acceptancePublicKey !== p.acceptancePublicKey
  )
    throw Error('Membership certification continuity changed');
  const { delivery } = await verifyMembershipDelivery(e.delivery, parent);
  await verifyMembershipInstallation(e.installation, delivery);
  const candidate = delivery.existing.context.candidate.id;
  const roster = p.roster.map((m) =>
    m.id === candidate
      ? { ...m, state: 'certified', capabilities: ['read', 'write', 'admit', 'manage'] }
      : m,
  );
  if (
    !same(e.roster, roster) ||
    !same(
      e.heads.map((h) => h.credentialId),
      p.heads.map((h) => h.credentialId),
    )
  )
    throw Error('Membership certification coverage changed');
  for (const head of e.heads) {
    const before = p.heads.find((h) => h.credentialId === head.credentialId)!;
    if (
      head.position < before.position ||
      (head.position === before.position && head.link !== before.link) ||
      (p.roster.find((m) => m.id === head.credentialId)!.state === 'pending' && head.position !== 0)
    )
      throw Error('Membership certification accepted boundary changed');
  }
  const message = await membershipCertificationMessage(e);
  if (proof.head !== (await digest(message))) throw Error('Membership certification head changed');
  await verifySignature(p.pin.authRoot, proof.signature, message);
  return retain({
    ...structuredClone(p),
    epoch: e.epoch,
    head: proof.head,
    certificate: delivery.certificate,
    certifiedSetDigest: await digest(json(delivery.certificate)),
    preparations: p.preparations.filter((entry) => entry.credentialId !== candidate),
    roster: e.roster,
    heads: e.heads,
  } as MembershipState);
}

/** A request to withdraw one still-pending connection. It does not attest that no key was exposed.
 * The service must atomically refuse this transition once approval or delivery exists; uncertain
 * outcomes require removal/rotation. A relay cancellation alone is not this committed successor. */
export interface MembershipCancellationRequest {
  v: 2;
  kind: 'membership-cancellation-request';
  workspaceId: string;
  lineageId: string;
  parent: string;
  epoch: number;
  preparationId: string;
  candidateId: string;
  actorId: string;
  nonce: string;
  signature: string;
}
export function parseMembershipCancellationRequest(input: unknown): MembershipCancellationRequest {
  if (json(input).length > 4096) throw Error('Oversized membership cancellation request');
  const r = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'parent',
    'epoch',
    'preparationId',
    'candidateId',
    'actorId',
    'nonce',
    'signature',
  ]);
  if (r['v'] !== 2 || r['kind'] !== 'membership-cancellation-request')
    throw Error('Invalid membership cancellation request');
  return {
    v: 2,
    kind: 'membership-cancellation-request',
    workspaceId: h(r['workspaceId'], 16),
    lineageId: h(r['lineageId']),
    parent: h(r['parent']),
    epoch: integer(r['epoch'], 3),
    preparationId: accountIdentifier(r['preparationId']),
    candidateId: h(r['candidateId'], 16),
    actorId: h(r['actorId'], 16),
    nonce: h(r['nonce']),
    signature: h(r['signature'], 64),
  };
}
export const membershipCancellationRequestMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipCancellationRequest(input);
  return domainMessage('done/membership-cancellation-request/v2', body);
};
export async function verifyMembershipCancellationRequest(
  input: unknown,
  parent: VerifiedMembership,
) {
  const p = membershipState(parent),
    r = parseMembershipCancellationRequest(input),
    candidate = p.roster.find((m) => m.id === r.candidateId),
    actor = p.roster.find((m) => m.id === r.actorId);
  if (
    r.workspaceId !== p.workspaceId ||
    r.lineageId !== p.lineageId ||
    r.parent !== p.head ||
    r.epoch !== p.epoch ||
    candidate?.state !== 'pending' ||
    !p.preparations.some(
      (a) => a.credentialId === r.candidateId && a.attemptId === r.preparationId,
    ) ||
    !actor ||
    (actor.id !== candidate.id && actor.state !== 'certified')
  )
    throw Error('Membership cancellation authority changed');
  await verifySignature(actor.sPub, r.signature, await membershipCancellationRequestMessage(r));
  return r;
}
export interface MembershipCancellationEpoch {
  v: 2;
  kind: 'membership-cancellation-epoch';
  workspaceId: string;
  lineageId: string;
  epoch: number;
  parent: string;
  generation: number;
  acceptancePublicKey: string;
  certifiedSetDigest: string;
  cancellation: MembershipCancellationRequest;
  roster: AdmissionMember[];
  heads: StreamHead[];
}
export interface MembershipCancellation {
  v: 2;
  kind: 'membership-cancellation';
  epoch: MembershipCancellationEpoch;
  head: string;
  signature: string;
}
export function parseMembershipCancellationEpoch(input: unknown): MembershipCancellationEpoch {
  bounded(input);
  const e = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'epoch',
    'parent',
    'generation',
    'acceptancePublicKey',
    'certifiedSetDigest',
    'cancellation',
    'roster',
    'heads',
  ]);
  if (e['v'] !== 2 || e['kind'] !== 'membership-cancellation-epoch')
    throw Error('Invalid membership cancellation epoch');
  return {
    v: 2,
    kind: 'membership-cancellation-epoch',
    workspaceId: h(e['workspaceId'], 16),
    lineageId: h(e['lineageId']),
    epoch: integer(e['epoch'], 4),
    parent: h(e['parent']),
    generation: integer(e['generation'], 1),
    acceptancePublicKey: h(e['acceptancePublicKey']),
    certifiedSetDigest: h(e['certifiedSetDigest']),
    cancellation: parseMembershipCancellationRequest(e['cancellation']),
    roster: entries(e['roster'], parseMember, (m) => m.id),
    heads: entries(e['heads'], parseHead, (s) => s.credentialId),
  };
}
export function parseMembershipCancellation(input: unknown): MembershipCancellation {
  bounded(input);
  const p = closed(input, ['v', 'kind', 'epoch', 'head', 'signature']);
  if (p['v'] !== 2 || p['kind'] !== 'membership-cancellation')
    throw Error('Invalid membership cancellation proof');
  return {
    v: 2,
    kind: 'membership-cancellation',
    epoch: parseMembershipCancellationEpoch(p['epoch']),
    head: h(p['head']),
    signature: h(p['signature'], 64),
  };
}
export const membershipCancellationMessage = (input: unknown) =>
  domainMessage('done/device-membership-cancellation/v2', parseMembershipCancellationEpoch(input));

/** Historical continuity. Approval/delivery absence is enforced by the atomic service producer. */
export async function verifyMembershipCancellation(
  input: unknown,
  parent: VerifiedMembership,
): Promise<VerifiedMembership> {
  const p = membershipState(parent),
    proof = parseMembershipCancellation(input),
    e = proof.epoch;
  if (
    e.parent !== p.head ||
    e.epoch !== p.epoch + 1 ||
    e.workspaceId !== p.workspaceId ||
    e.lineageId !== p.lineageId ||
    e.generation !== p.generation ||
    e.acceptancePublicKey !== p.acceptancePublicKey ||
    e.certifiedSetDigest !== p.certifiedSetDigest
  )
    throw Error('Membership cancellation continuity changed');
  const request = await verifyMembershipCancellationRequest(e.cancellation, parent),
    candidate = request.candidateId;
  if (
    !same(
      e.roster,
      p.roster.filter((m) => m.id !== candidate),
    ) ||
    !same(
      e.heads.map((s) => s.credentialId),
      p.heads.filter((s) => s.credentialId !== candidate).map((s) => s.credentialId),
    )
  )
    throw Error('Membership cancellation coverage changed');
  const pendingHead = p.heads.find((s) => s.credentialId === candidate);
  if (!pendingHead || pendingHead.position !== 0 || pendingHead.link !== EMPTY_LINK)
    throw Error('Pending member has accepted writing');
  for (const head of e.heads) {
    const before = p.heads.find((s) => s.credentialId === head.credentialId)!;
    if (
      head.position < before.position ||
      (head.position === before.position && head.link !== before.link)
    )
      throw Error('Membership cancellation accepted boundary changed');
  }
  const message = await membershipCancellationMessage(e);
  if (proof.head !== (await digest(message))) throw Error('Membership cancellation head changed');
  await verifySignature(p.pin.authRoot, proof.signature, message);
  return retain({
    ...structuredClone(p),
    epoch: e.epoch,
    head: proof.head,
    roster: e.roster,
    heads: e.heads,
    preparations: p.preparations.filter((a) => a.credentialId !== candidate),
  } as MembershipState);
}

export interface MembershipRotationEpoch {
  v: 2;
  kind: 'membership-rotation-epoch';
  workspaceId: string;
  lineageId: string;
  epoch: number;
  parent: string;
  generation: number;
  acceptancePublicKey: string;
  rotation: RotationRequest;
  outcome: RotationOutcome;
  recovery: RecoveryDraft;
  heads: StreamHead[];
  finalization: AcceptedHead;
}
export interface MembershipRotation {
  v: 2;
  kind: 'membership-rotation';
  epoch: MembershipRotationEpoch;
  head: string;
  signature: string;
}
export function parseMembershipRotationEpoch(input: unknown): MembershipRotationEpoch {
  bounded(input);
  const e = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'epoch',
    'parent',
    'generation',
    'acceptancePublicKey',
    'rotation',
    'outcome',
    'recovery',
    'heads',
    'finalization',
  ]);
  if (e['v'] !== 2 || e['kind'] !== 'membership-rotation-epoch')
    throw Error('Invalid membership rotation epoch');
  return {
    v: 2,
    kind: 'membership-rotation-epoch',
    workspaceId: h(e['workspaceId'], 16),
    lineageId: h(e['lineageId']),
    epoch: integer(e['epoch'], 3),
    parent: h(e['parent']),
    generation: integer(e['generation'], 2),
    acceptancePublicKey: h(e['acceptancePublicKey']),
    rotation: parseRotationRequest(e['rotation']),
    outcome: parseRotationOutcome(e['outcome']),
    recovery: parseDraft(e['recovery']),
    heads: entries(e['heads'], parseHead, (h) => h.credentialId),
    finalization: parseRemovalFinalization(e['finalization']),
  };
}
export function parseMembershipRotation(input: unknown): MembershipRotation {
  bounded(input);
  const p = closed(input, ['v', 'kind', 'epoch', 'head', 'signature']);
  if (p['v'] !== 2 || p['kind'] !== 'membership-rotation')
    throw Error('Invalid membership rotation');
  return {
    v: 2,
    kind: 'membership-rotation',
    epoch: parseMembershipRotationEpoch(p['epoch']),
    head: h(p['head']),
    signature: h(p['signature'], 64),
  };
}
export const membershipRotationMessage = (input: unknown) =>
  domainMessage('done/device-membership-rotation/v2', parseMembershipRotationEpoch(input));
/** The one successor binds the client distribution, service outcome and final accepted boundary.
 * It establishes no local key installation or independent replay of those accepted prefixes. */
export async function verifyMembershipRotation(
  input: unknown,
  parent: VerifiedMembership,
): Promise<VerifiedMembership> {
  const p = membershipState(parent),
    proof = parseMembershipRotation(input),
    e = proof.epoch;
  if (
    e.parent !== p.head ||
    e.epoch !== p.epoch + 1 ||
    e.workspaceId !== p.workspaceId ||
    e.lineageId !== p.lineageId ||
    e.generation !== p.generation + 1 ||
    e.acceptancePublicKey !== p.acceptancePublicKey
  )
    throw Error('Membership rotation continuity changed');
  const rotation = await verifyRotationRequest(e.rotation, parent, e.recovery);
  const finalization = await verifyRemovalFinalization(e.finalization, rotation, e.outcome);
  if (
    e.outcome.epoch !== e.epoch ||
    !same(
      e.heads.map((h) => h.credentialId),
      p.heads.map((h) => h.credentialId),
    )
  )
    throw Error('Membership rotation coverage changed');
  for (const head of e.heads) {
    const before = e.rotation.preparation.cutoff.find((h) => h.credentialId === head.credentialId)!;
    if (
      head.position < before.position ||
      (head.position === before.position && head.link !== before.link) ||
      (head.credentialId === finalization.credential &&
        (head.position !== finalization.position || head.link !== finalization.link))
    )
      throw Error('Membership rotation accepted boundary changed');
  }
  const message = await membershipRotationMessage(e);
  if (proof.head !== (await digest(message))) throw Error('Membership rotation head changed');
  await verifySignature(p.pin.authRoot, proof.signature, message);
  const certificate: RotatedRecipientCertificate = {
    v: 1,
    kind: 'rotation-recipient-certificate',
    members: p.certificate.members
      .filter((m) => m.id !== finalization.credential)
      .map((m) => ({ ...m })),
    recoveryStateDigest: p.certificate.recoveryStateDigest,
    approver: e.rotation.actorId,
    intentId: rotation.id,
  };
  return retain({
    ...structuredClone(p),
    epoch: e.epoch,
    head: proof.head,
    generation: e.generation,
    certificate,
    certifiedSetDigest: await digest(json(certificate)),
    roster: p.roster.filter((m) => m.id !== finalization.credential).map((m) => structuredClone(m)),
    heads: e.heads.filter((h) => h.credentialId !== finalization.credential),
    finalized: [...p.finalized, finalization],
    preparations: p.preparations.filter((a) => a.credentialId !== finalization.credential),
  } as MembershipState);
}
