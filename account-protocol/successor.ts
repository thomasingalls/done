import { proofWork, type ProofCheckpoint } from './proofWork.ts';
/** One private admission-only successor. Historical evidence, never a live consumption grant. */
import { closed, accountIdentifier } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import {
  certification,
  parseAdmissionRequest,
  parseReceipt,
  verifyReceipt,
  verifySignature,
  same,
  json,
  domainMessage,
  type AdmissionRequest,
  type AdmissionReceipt,
  type Certification,
} from './admission.ts';
import {
  parseEnrollmentReceipt,
  verifyEnrollmentReceipt,
  type EnrollmentReceipt,
} from './enrollment.ts';
import { digest, unhex } from './recovery.ts';

export const SUCCESSOR_LIMIT = 24 * 1024;
export const DISCOVERY_REQUEST_LIMIT = 4096;
export const DISCOVERY_RESPONSE_LIMIT = 32 * 1024;
export const DISCOVERY_LIFETIME_MS = 60_000;
export const EMPTY_LINK = '00'.repeat(32);
export interface SuccessorBase {
  pin: AuthorityPin;
  request: AdmissionRequest;
  receipt: AdmissionReceipt;
}
export interface AuthorityAnchor {
  epoch: 1 | 2;
  head: string;
}
export interface AdmissionMember {
  id: string;
  wPub: string;
  sPub: string;
  principalId: string;
  state: 'certified' | 'pending';
  capabilities: ['read', 'write', 'admit', 'manage'] | [];
}
export interface StreamHead {
  credentialId: string;
  position: number;
  link: string;
}
export interface AdmissionSuccessorEpoch {
  v: 1;
  kind: 'device-admission-epoch';
  pin: AuthorityPin;
  requestDigest: string;
  accountId: string;
  principalId: string;
  workspaceId: string;
  lineageId: string;
  epoch: 2;
  parent: string;
  generation: 1;
  acceptancePublicKey: string;
  preparation: EnrollmentReceipt;
  certified: { parentEpoch: 0; nextEpoch: 1; digest: string; value: Certification };
  roster: [AdmissionMember, AdmissionMember];
  heads: [StreamHead, StreamHead];
}
export interface AdmissionSuccessor {
  v: 1;
  kind: 'device-admission-successor';
  epoch: AdmissionSuccessorEpoch;
  head: string;
  signature: string;
}
export interface AuthorityDiscoveryRequest {
  v: 1;
  kind: 'authority-discovery-request';
  pin: AuthorityPin;
  workspaceId: string;
  lineageId: string;
  credentialId: string;
  epoch: 1 | 2;
  head: string;
  nonce: string;
  expiresAt: number;
  signature: string;
}
export interface AuthorityDiscoveryResponse {
  v: 1;
  kind: 'authority-discovery-response';
  requestHash: string;
  successor: AdmissionSuccessor | null;
  signature: string;
}
const h = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const bounded = (v: unknown, limit: number) => {
  if (json(v).length > limit) throw Error('Successor message too large');
};
const nonnegative = (v: unknown): number => {
  if (!Number.isSafeInteger(v) || (v as number) < 0) throw Error('Invalid successor integer');
  return v as number;
};
function anchor(input: AuthorityAnchor): AuthorityAnchor {
  const a = closed(input, ['epoch', 'head']);
  if (a['epoch'] !== 1 && a['epoch'] !== 2) throw Error('Unsupported authority anchor');
  return { epoch: a['epoch'], head: h(a['head']) };
}
function member(input: unknown): AdmissionMember {
  const m = closed(input, ['id', 'wPub', 'sPub', 'principalId', 'state', 'capabilities']);
  if (m['state'] !== 'certified' && m['state'] !== 'pending') throw Error('Invalid member state');
  const capabilities: AdmissionMember['capabilities'] =
    m['state'] === 'certified' ? ['read', 'write', 'admit', 'manage'] : [];
  if (!same(m['capabilities'], capabilities)) throw Error('Invalid member capabilities');
  return {
    id: h(m['id'], 16),
    wPub: h(m['wPub']),
    sPub: h(m['sPub']),
    principalId: h(m['principalId'], 16),
    state: m['state'],
    capabilities,
  };
}
function stream(input: unknown): StreamHead {
  const s = closed(input, ['credentialId', 'position', 'link']);
  const position = nonnegative(s['position']),
    link = h(s['link']);
  if ((position === 0) !== (link === EMPTY_LINK)) throw Error('Invalid empty stream');
  return { credentialId: h(s['credentialId'], 16), position, link };
}
function pair<T>(value: unknown, parse: (v: unknown) => T, id: (v: T) => string): [T, T] {
  if (!Array.isArray(value) || value.length !== 2) throw Error('Successor requires two entries');
  const entries: [T, T] = [parse(value[0]), parse(value[1])];
  if (id(entries[0]) >= id(entries[1])) throw Error('Duplicate or unordered successor entries');
  return entries;
}
export function parseSuccessorEpoch(input: unknown): AdmissionSuccessorEpoch {
  bounded(input, SUCCESSOR_LIMIT);
  const e = closed(input, [
    'v',
    'kind',
    'pin',
    'requestDigest',
    'accountId',
    'principalId',
    'workspaceId',
    'lineageId',
    'epoch',
    'parent',
    'generation',
    'acceptancePublicKey',
    'preparation',
    'certified',
    'roster',
    'heads',
  ]);
  const c = closed(e['certified'], ['parentEpoch', 'nextEpoch', 'digest', 'value']);
  if (
    e['v'] !== 1 ||
    e['kind'] !== 'device-admission-epoch' ||
    e['epoch'] !== 2 ||
    e['generation'] !== 1 ||
    c['parentEpoch'] !== 0 ||
    c['nextEpoch'] !== 1
  )
    throw Error('Unsupported successor transition');
  return {
    v: 1,
    kind: 'device-admission-epoch',
    pin: parseAuthorityPin(e['pin']),
    requestDigest: h(e['requestDigest']),
    accountId: accountIdentifier(e['accountId']),
    principalId: h(e['principalId'], 16),
    workspaceId: h(e['workspaceId'], 16),
    lineageId: h(e['lineageId']),
    epoch: 2,
    parent: h(e['parent']),
    generation: 1,
    acceptancePublicKey: h(e['acceptancePublicKey']),
    preparation: parseEnrollmentReceipt(e['preparation']),
    certified: {
      parentEpoch: 0,
      nextEpoch: 1,
      digest: h(c['digest']),
      value: certification(c['value']),
    },
    roster: pair(e['roster'], member, (m) => m.id),
    heads: pair(e['heads'], stream, (s) => s.credentialId),
  };
}
export function parseSuccessor(input: unknown): AdmissionSuccessor {
  bounded(input, SUCCESSOR_LIMIT);
  const s = closed(input, ['v', 'kind', 'epoch', 'head', 'signature']);
  if (s['v'] !== 1 || s['kind'] !== 'device-admission-successor') throw Error('Invalid successor');
  return {
    v: 1,
    kind: 'device-admission-successor',
    epoch: parseSuccessorEpoch(s['epoch']),
    head: h(s['head']),
    signature: h(s['signature'], 64),
  };
}
export const successorMessage = (input: AdmissionSuccessorEpoch) =>
  domainMessage('done/admission-successor/v1', parseSuccessorEpoch(input));
export const successorHead = async (input: AdmissionSuccessorEpoch) =>
  digest(await successorMessage(input));
function captureBase(input: SuccessorBase): SuccessorBase {
  return {
    pin: parseAuthorityPin(input.pin),
    request: parseAdmissionRequest(input.request),
    receipt: parseReceipt(input.receipt),
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
async function verifyBase(base: SuccessorBase, checkpoint?: ProofCheckpoint) {
  await proofWork(
    checkpoint,
    verifyReceipt(base.receipt, base.request, base.pin, undefined, checkpoint),
  );
}
async function verifyCapturedSuccessor(
  s: AdmissionSuccessor,
  base: SuccessorBase,
  held: AuthorityAnchor,
  checkpoint?: ProofCheckpoint,
) {
  const e = s.epoch,
    first = base.receipt.offer,
    p = e.preparation,
    c = p.context;
  const old = first.epoch.certification.members[0],
    candidate = c.candidate;
  const expectedRoster: AdmissionMember[] = [
    {
      ...old,
      principalId: first.epoch.principalId,
      state: 'certified',
      capabilities: ['read', 'write', 'admit', 'manage'],
    },
    {
      id: candidate.credentialId,
      wPub: candidate.wPub,
      sPub: candidate.sPub,
      principalId: first.epoch.principalId,
      state: 'pending',
      capabilities: [],
    },
  ];
  expectedRoster.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (
    p.v !== 1 ||
    c.v !== 1 ||
    c.epoch !== 1 ||
    !same(e.pin, base.pin) ||
    e.requestDigest !== first.epoch.requestDigest ||
    e.accountId !== first.epoch.accountId ||
    e.principalId !== first.epoch.principalId ||
    e.workspaceId !== first.epoch.workspaceId ||
    e.lineageId !== first.epoch.lineageId ||
    e.parent !== first.head ||
    e.acceptancePublicKey !== first.epoch.acceptancePublicKey ||
    c.accountId !== e.accountId ||
    candidate.workspaceId !== e.workspaceId ||
    candidate.lineageId !== e.lineageId ||
    candidate.head !== e.parent ||
    candidate.credentialId === old.id ||
    c.passkeyId !== base.receipt.activation.context.credentialId ||
    !same(e.roster, expectedRoster)
  )
    throw Error('Successor continuity changed');
  // Recipient authority is the original client approval, never the new service roster.
  if (
    !same(e.certified.value, first.epoch.certification) ||
    e.certified.digest !== (await proofWork(checkpoint, digest(json(first.epoch.certification)))) ||
    c.certifiedSetDigest !== e.certified.digest ||
    c.recoveryStateDigest !== first.epoch.certification.recoveryStateDigest
  )
    throw Error('Certified set changed');
  if (
    !same(
      e.heads.map((v) => v.credentialId),
      e.roster.map((v) => v.id),
    ) ||
    e.heads.find((v) => v.credentialId === candidate.credentialId)!.position !== 0
  )
    throw Error('Successor stream coverage changed');
  await proofWork(checkpoint, verifyEnrollmentReceipt(p, base.pin, candidate));
  if (s.head !== (await proofWork(checkpoint, successorHead(e))))
    throw Error('Successor head changed');
  await proofWork(
    checkpoint,
    verifySignature(
      base.pin.authRoot,
      s.signature,
      await proofWork(checkpoint, successorMessage(e)),
    ),
  );
  if (held.epoch === 1 ? held.head !== first.head : held.head !== s.head)
    throw Error('Successor fork or rollback');
  return freeze(s);
}
/** Validates signed continuity only. Live preparation consumption and ledger-boundary comparison are owned elsewhere. */
export async function verifySuccessor(
  input: unknown,
  baseInput: SuccessorBase,
  heldInput: AuthorityAnchor,
  checkpoint?: ProofCheckpoint,
) {
  const s = parseSuccessor(input),
    base = captureBase(baseInput),
    held = anchor(heldInput);
  await proofWork(checkpoint, verifyBase(base, checkpoint));
  return verifyCapturedSuccessor(s, base, held, checkpoint);
}
export function parseDiscoveryRequest(input: unknown): AuthorityDiscoveryRequest {
  bounded(input, DISCOVERY_REQUEST_LIMIT);
  const r = closed(input, [
    'v',
    'kind',
    'pin',
    'workspaceId',
    'lineageId',
    'credentialId',
    'epoch',
    'head',
    'nonce',
    'expiresAt',
    'signature',
  ]);
  const a = anchor({ epoch: r['epoch'] as 1 | 2, head: r['head'] as string });
  if (r['v'] !== 1 || r['kind'] !== 'authority-discovery-request')
    throw Error('Invalid discovery request');
  return {
    v: 1,
    kind: 'authority-discovery-request',
    pin: parseAuthorityPin(r['pin']),
    workspaceId: h(r['workspaceId'], 16),
    lineageId: h(r['lineageId']),
    credentialId: h(r['credentialId'], 16),
    ...a,
    nonce: h(r['nonce']),
    expiresAt: nonnegative(r['expiresAt']),
    signature: h(r['signature'], 64),
  };
}
export function parseDiscoveryResponse(input: unknown): AuthorityDiscoveryResponse {
  bounded(input, DISCOVERY_RESPONSE_LIMIT);
  const r = closed(input, ['v', 'kind', 'requestHash', 'successor', 'signature']);
  if (r['v'] !== 1 || r['kind'] !== 'authority-discovery-response')
    throw Error('Invalid discovery response');
  return {
    v: 1,
    kind: 'authority-discovery-response',
    requestHash: h(r['requestHash']),
    successor: r['successor'] === null ? null : parseSuccessor(r['successor']),
    signature: h(r['signature'], 64),
  };
}
export const discoveryRequestMessage = (input: AuthorityDiscoveryRequest) => {
  const { signature: _signature, ...r } = parseDiscoveryRequest(input);
  return domainMessage('done/authority-discovery-request/v1', r);
};
export const discoveryResponseMessage = (input: AuthorityDiscoveryResponse) => {
  const { signature: _signature, ...r } = parseDiscoveryResponse(input);
  return domainMessage('done/authority-discovery-response/v1', r);
};
export const discoveryRequestHash = (input: AuthorityDiscoveryRequest) =>
  digest(json(parseDiscoveryRequest(input)));
async function verifyDiscovery(
  r: AuthorityDiscoveryRequest,
  base: SuccessorBase,
  s: AdmissionSuccessor | null,
  now: number,
) {
  const first = base.receipt.offer,
    old = first.epoch.certification.members[0];
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    r.expiresAt <= now ||
    r.expiresAt - now > DISCOVERY_LIFETIME_MS ||
    !same(r.pin, base.pin) ||
    r.workspaceId !== first.epoch.workspaceId ||
    r.lineageId !== first.epoch.lineageId ||
    r.credentialId !== old.id ||
    (r.epoch === 1 ? r.head !== first.head : !s || r.head !== s.head)
  )
    throw Error('Discovery scope or lifetime changed');
  await verifySignature(old.sPub, r.signature, await discoveryRequestMessage(r));
}
/** Service read-side verifier. A verified creating credential may discover from either retained head. */
export async function verifyDiscoveryRequest(
  input: unknown,
  baseInput: SuccessorBase,
  currentInput: unknown | null,
  now: number,
) {
  const r = parseDiscoveryRequest(input),
    base = captureBase(baseInput),
    s = currentInput === null ? null : parseSuccessor(currentInput);
  await verifyBase(base);
  if (s) await verifyCapturedSuccessor(s, base, { epoch: 1, head: base.receipt.offer.head });
  await verifyDiscovery(r, base, s, now);
  return freeze(r);
}
/** Caller supplies its saved signed request; a reply cannot select its own nonce or retained anchor. */
export async function verifyDiscoveryResponse(
  input: unknown,
  requestInput: AuthorityDiscoveryRequest,
  baseInput: SuccessorBase,
  now: number,
) {
  const answer = parseDiscoveryResponse(input),
    request = parseDiscoveryRequest(requestInput),
    base = captureBase(baseInput);
  await verifyBase(base);
  if (answer.successor)
    await verifyCapturedSuccessor(
      answer.successor,
      base,
      anchor({ epoch: request.epoch, head: request.head }),
    );
  await verifyDiscovery(request, base, answer.successor, now);
  if (answer.requestHash !== (await discoveryRequestHash(request)))
    throw Error('Discovery request changed');
  await verifySignature(
    base.pin.authRoot,
    answer.signature,
    await discoveryResponseMessage(answer),
  );
  return freeze(answer);
}
