import { proofWork, type ProofCheckpoint } from './proofWork.ts';
/** Authenticated exchange bytes for one admitted child. No persistence, comparison or key release. */
import { closed, accountIdentifier } from './preparation.ts';
import { membershipState, type VerifiedMembership } from './membership.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { json, same, domainMessage, verifySignature } from './admission.ts';
import { digest, unhex } from './recovery.ts';
import { verifySuccessor, type SuccessorBase, type AuthorityAnchor } from './successor.ts';
import { ceremonyCommitment, deriveCeremonyOpening, type CeremonyRole } from './ceremony.ts';

export const CEREMONY_CONTEXT_LIMIT = 8192;
export const CEREMONY_COMMIT_LIMIT = 9216;
export const CEREMONY_REVEAL_LIMIT = 2048;
export const CEREMONY_EXCHANGE_LIFETIME_MS = 600_000;
export interface CeremonyParticipant {
  id: string;
  wPub: string;
  sPub: string;
}
export interface CeremonyContext {
  v: 1 | 2;
  pin: AuthorityPin;
  accountId: string;
  principalId: string;
  workspaceId: string;
  lineageId: string;
  epoch: number;
  head: string;
  certifiedSetDigest: string;
  recoveryStateDigest: string;
  existing: CeremonyParticipant;
  candidate: CeremonyParticipant;
  attemptId: string;
  createdAt: number;
  expiresAt: number;
}
export interface CeremonyCommit {
  v: 1 | 2;
  kind: 'ceremony-commitment';
  context: CeremonyContext;
  role: CeremonyRole;
  commitment: string;
  signature: string;
}
export interface CeremonyReveal {
  v: 1 | 2;
  kind: 'ceremony-reveal';
  contextHash: string;
  role: CeremonyRole;
  existingCommitHash: string;
  newCommitHash: string;
  nonce: string;
  signature: string;
}
export interface VerifiedCeremonyContext {
  readonly context: Readonly<CeremonyContext>;
  readonly localRole: CeremonyRole;
}
export interface VerifiedCeremonyPair {
  readonly authority: VerifiedCeremonyContext;
  readonly existing: Readonly<CeremonyCommit>;
  readonly candidate: Readonly<CeremonyCommit>;
  readonly contextHash: string;
  readonly existingCommitHash: string;
  readonly newCommitHash: string;
}
const contexts = new WeakSet<VerifiedCeremonyContext>();
const pairs = new WeakSet<VerifiedCeremonyPair>();
const h = (input: unknown, bytes = 32): string => {
  unhex(input, bytes);
  return input as string;
};
const bounded = (input: unknown, limit: number) => {
  if (json(input).length > limit) throw Error('Ceremony message too large');
};
const role = (input: unknown): CeremonyRole => {
  if (input !== 'existing' && input !== 'new') throw Error('Invalid ceremony role');
  return input;
};
const timestamp = (input: unknown): number => {
  if (!Number.isSafeInteger(input) || (input as number) < 0)
    throw Error('Invalid ceremony timestamp');
  return input as number;
};
function participant(input: unknown): CeremonyParticipant {
  const p = closed(input, ['id', 'wPub', 'sPub']);
  return { id: h(p['id'], 16), wPub: h(p['wPub']), sPub: h(p['sPub']) };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function live(c: CeremonyContext, now: number) {
  timestamp(now);
  if (now < c.createdAt || now >= c.expiresAt) throw Error('Ceremony expired or not yet live');
}
function requireContext(authority: VerifiedCeremonyContext, now: number) {
  if (!contexts.has(authority)) throw Error('Unverified ceremony authority');
  live(authority.context, now);
  return authority.context;
}
function requirePair(pair: VerifiedCeremonyPair, now: number) {
  if (!pairs.has(pair)) throw Error('Unverified ceremony commitment pair');
  return requireContext(pair.authority, now);
}
export function parseCeremonyContext(input: unknown): CeremonyContext {
  bounded(input, CEREMONY_CONTEXT_LIMIT);
  const c = closed(input, [
    'v',
    'pin',
    'accountId',
    'principalId',
    'workspaceId',
    'lineageId',
    'epoch',
    'head',
    'certifiedSetDigest',
    'recoveryStateDigest',
    'existing',
    'candidate',
    'attemptId',
    'createdAt',
    'expiresAt',
  ]);
  if (
    !(c['v'] === 1 && c['epoch'] === 2) &&
    !(c['v'] === 2 && Number.isSafeInteger(c['epoch']) && (c['epoch'] as number) >= 3)
  )
    throw Error('Unsupported ceremony authority');
  const existing = participant(c['existing']),
    candidate = participant(c['candidate']);
  if (existing.id === candidate.id) throw Error('Ceremony roles need distinct devices');
  const createdAt = timestamp(c['createdAt']),
    expiresAt = timestamp(c['expiresAt']);
  if (
    createdAt > Number.MAX_SAFE_INTEGER - CEREMONY_EXCHANGE_LIFETIME_MS ||
    expiresAt !== createdAt + CEREMONY_EXCHANGE_LIFETIME_MS
  )
    throw Error('Invalid ceremony lifetime');
  return {
    v: c['v'] as 1 | 2,
    pin: parseAuthorityPin(c['pin']),
    accountId: accountIdentifier(c['accountId']),
    principalId: h(c['principalId'], 16),
    workspaceId: h(c['workspaceId'], 16),
    lineageId: h(c['lineageId']),
    epoch: c['epoch'] as number,
    head: h(c['head']),
    certifiedSetDigest: h(c['certifiedSetDigest']),
    recoveryStateDigest: h(c['recoveryStateDigest']),
    existing,
    candidate,
    attemptId: h(c['attemptId']),
    createdAt,
    expiresAt,
  };
}

/** Current authority must already be held. Local keys come from the caller's owned device custody. */
export async function verifyCeremonyContext(
  input: unknown,
  base: SuccessorBase,
  successor: unknown,
  heldInput: AuthorityAnchor,
  localInput: CeremonyParticipant & { role: CeremonyRole },
  now: number,
  checkpoint?: ProofCheckpoint,
): Promise<VerifiedCeremonyContext> {
  const c = parseCeremonyContext(input),
    l = closed(localInput, ['role', 'id', 'wPub', 'sPub']),
    localRole = role(l['role']),
    local = participant({ id: l['id'], wPub: l['wPub'], sPub: l['sPub'] }),
    held = closed(heldInput, ['epoch', 'head']);
  live(c, now);
  if (held['epoch'] !== 2 || held['head'] !== c.head) throw Error('Ceremony needs held admission');
  // verifySuccessor captures all source objects before its first await.
  const s = await proofWork(
      checkpoint,
      verifySuccessor(successor, base, { epoch: 2, head: c.head }, checkpoint),
    ),
    e = s.epoch,
    admitted = e.preparation.context.candidate;
  const expected: CeremonyContext = {
    v: 1,
    pin: e.pin,
    accountId: e.accountId,
    principalId: e.principalId,
    workspaceId: e.workspaceId,
    lineageId: e.lineageId,
    epoch: 2,
    head: s.head,
    certifiedSetDigest: e.certified.digest,
    recoveryStateDigest: e.certified.value.recoveryStateDigest,
    existing: e.certified.value.members[0],
    candidate: { id: admitted.credentialId, wPub: admitted.wPub, sPub: admitted.sPub },
    attemptId: c.attemptId,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
  };
  if (!same(c, expected) || !same(local, localRole === 'existing' ? c.existing : c.candidate))
    throw Error('Ceremony context or local keys changed');
  const result = freeze({ context: c, localRole });
  contexts.add(result);
  return result;
}
/** A continuation context resolves the approver exclusively through its verified parent certificate. */
export function verifyMembershipCeremonyContext(
  input: unknown,
  parent: VerifiedMembership,
  localInput: CeremonyParticipant & { role: CeremonyRole },
  now: number,
): VerifiedCeremonyContext {
  const c = parseCeremonyContext(input),
    p = membershipState(parent);
  const l = closed(localInput, ['role', 'id', 'wPub', 'sPub']);
  const localRole = role(l['role']),
    local = participant({ id: l['id'], wPub: l['wPub'], sPub: l['sPub'] });
  live(c, now);
  const approver = p.certificate.members.find((m) => m.id === c.existing.id);
  const admitted = p.roster.find((m) => m.id === c.candidate.id);
  if (
    c.v !== 2 ||
    c.epoch !== p.epoch ||
    c.head !== p.head ||
    !same(c.pin, p.pin) ||
    c.accountId !== p.accountId ||
    c.principalId !== p.principalId ||
    c.workspaceId !== p.workspaceId ||
    c.lineageId !== p.lineageId ||
    c.certifiedSetDigest !== p.certifiedSetDigest ||
    c.recoveryStateDigest !== p.certificate.recoveryStateDigest ||
    !approver ||
    !same(c.existing, approver) ||
    p.roster.find((m) => m.id === approver.id)?.state !== 'certified' ||
    !admitted ||
    admitted.state !== 'pending' ||
    !same(c.candidate, { id: admitted.id, wPub: admitted.wPub, sPub: admitted.sPub }) ||
    !same(local, localRole === 'existing' ? c.existing : c.candidate)
  )
    throw Error('Continuation ceremony authority changed');
  const result = freeze({ context: c, localRole });
  contexts.add(result);
  return result;
}
export function parseCeremonyCommit(input: unknown): CeremonyCommit {
  bounded(input, CEREMONY_COMMIT_LIMIT);
  const c = closed(input, ['v', 'kind', 'context', 'role', 'commitment', 'signature']);
  const context = parseCeremonyContext(c['context']);
  if (c['v'] !== context.v || c['kind'] !== 'ceremony-commitment')
    throw Error('Invalid ceremony commitment');
  return {
    v: context.v,
    kind: 'ceremony-commitment',
    context,
    role: role(c['role']),
    commitment: h(c['commitment']),
    signature: h(c['signature'], 64),
  };
}
export function parseCeremonyReveal(input: unknown): CeremonyReveal {
  bounded(input, CEREMONY_REVEAL_LIMIT);
  const r = closed(input, [
    'v',
    'kind',
    'contextHash',
    'role',
    'existingCommitHash',
    'newCommitHash',
    'nonce',
    'signature',
  ]);
  if ((r['v'] !== 1 && r['v'] !== 2) || r['kind'] !== 'ceremony-reveal')
    throw Error('Invalid ceremony reveal');
  return {
    v: r['v'] as 1 | 2,
    kind: 'ceremony-reveal',
    contextHash: h(r['contextHash']),
    role: role(r['role']),
    existingCommitHash: h(r['existingCommitHash']),
    newCommitHash: h(r['newCommitHash']),
    nonce: h(r['nonce']),
    signature: h(r['signature'], 64),
  };
}
export const ceremonyContextMessage = (input: unknown) => {
  const c = parseCeremonyContext(input);
  return domainMessage(`done/enrollment-ceremony-context/v${c.v}`, c);
};
export const ceremonyContextHash = async (input: unknown) =>
  digest(await ceremonyContextMessage(input));
export const ceremonyCommitMessage = (input: unknown) => {
  const { signature: _signature, ...c } = parseCeremonyCommit(input);
  return domainMessage(`done/enrollment-ceremony-commitment/v${c.v}`, c);
};
export const ceremonyRevealMessage = (input: unknown) => {
  const { signature: _signature, ...r } = parseCeremonyReveal(input);
  return domainMessage(`done/enrollment-ceremony-reveal/v${r.v}`, r);
};
export async function verifyCeremonyCommit(
  authority: VerifiedCeremonyContext,
  input: unknown,
  expectedRole: CeremonyRole,
  now: number,
  subtle = crypto.subtle,
): Promise<Readonly<CeremonyCommit>> {
  const context = requireContext(authority, now),
    c = parseCeremonyCommit(input),
    ownRole = role(expectedRole);
  if (c.role !== ownRole || !same(c.context, context))
    throw Error('Ceremony commitment context changed');
  const key = ownRole === 'existing' ? context.existing.sPub : context.candidate.sPub;
  await verifySignature(key, c.signature, await ceremonyCommitMessage(c), subtle);
  return freeze(c);
}
export async function verifyCeremonyPair(
  authority: VerifiedCeremonyContext,
  existingInput: unknown,
  newInput: unknown,
  now: number,
  subtle = crypto.subtle,
  checkpoint?: ProofCheckpoint,
): Promise<VerifiedCeremonyPair> {
  const context = requireContext(authority, now),
    existing = parseCeremonyCommit(existingInput),
    candidate = parseCeremonyCommit(newInput);
  await proofWork(
    checkpoint,
    Promise.all([
      verifyCeremonyCommit(authority, existing, 'existing', now, subtle),
      verifyCeremonyCommit(authority, candidate, 'new', now, subtle),
    ]),
  );
  const pair = freeze({
    authority,
    existing,
    candidate,
    contextHash: await proofWork(checkpoint, ceremonyContextHash(context)),
    existingCommitHash: await proofWork(checkpoint, digest(json(existing))),
    newCommitHash: await proofWork(checkpoint, digest(json(candidate))),
  });
  pairs.add(pair);
  return pair;
}

/** Pure proposal; the owner must durably retain the pair before signing or dispatching this reveal. */
export async function prepareCeremonyReveal(
  pair: VerifiedCeremonyPair,
  nonceInput: unknown,
  now: number,
) {
  requirePair(pair, now);
  const nonce = h(nonceInput),
    ownRole = pair.authority.localRole,
    own = ownRole === 'existing' ? pair.existing : pair.candidate;
  if ((await ceremonyCommitment(ownRole, nonce)) !== own.commitment)
    throw Error('Local ceremony nonce changed');
  return freeze({
    v: pair.authority.context.v,
    kind: 'ceremony-reveal' as const,
    contextHash: pair.contextHash,
    role: ownRole,
    existingCommitHash: pair.existingCommitHash,
    newCommitHash: pair.newCommitHash,
    nonce,
    signature: '00'.repeat(64),
  });
}
export async function verifyCeremonyReveal(
  pair: VerifiedCeremonyPair,
  input: unknown,
  expectedRole: CeremonyRole,
  now: number,
  subtle = crypto.subtle,
): Promise<Readonly<CeremonyReveal>> {
  const context = requirePair(pair, now),
    r = parseCeremonyReveal(input),
    ownRole = role(expectedRole);
  if (
    r.v !== context.v ||
    r.role !== ownRole ||
    r.contextHash !== pair.contextHash ||
    r.existingCommitHash !== pair.existingCommitHash ||
    r.newCommitHash !== pair.newCommitHash
  )
    throw Error('Ceremony reveal pair changed');
  const key = ownRole === 'existing' ? context.existing.sPub : context.candidate.sPub,
    committed = ownRole === 'existing' ? pair.existing : pair.candidate;
  await verifySignature(key, r.signature, await ceremonyRevealMessage(r), subtle);
  if ((await ceremonyCommitment(ownRole, r.nonce, subtle)) !== committed.commitment)
    throw Error('Ceremony reveal opening changed');
  return freeze(r);
}

/** Both reveals are signed and open the exact pair. This still supplies no durable human approval. */
export async function deriveCeremonyExchange(
  pair: VerifiedCeremonyPair,
  existingInput: unknown,
  newInput: unknown,
  now: number,
  subtle = crypto.subtle,
  checkpoint?: ProofCheckpoint,
) {
  const c = requirePair(pair, now),
    existing = parseCeremonyReveal(existingInput),
    candidate = parseCeremonyReveal(newInput);
  await proofWork(
    checkpoint,
    Promise.all([
      verifyCeremonyReveal(pair, existing, 'existing', now, subtle),
      verifyCeremonyReveal(pair, candidate, 'new', now, subtle),
    ]),
  );
  return deriveCeremonyOpening(
    {
      workspaceId: c.workspaceId,
      epoch: c.epoch,
      head: c.head,
      existingCredentialId: c.existing.id,
      newCredentialId: c.candidate.id,
      wPub: c.candidate.wPub,
      sPub: c.candidate.sPub,
      recoveryStateDigest: c.recoveryStateDigest,
      nonceExisting: existing.nonce,
      nonceNew: candidate.nonce,
    },
    { existing: pair.existing.commitment, new: pair.candidate.commitment },
    subtle,
  );
}
