/** Private other-device removal. Evidence only: no service commit, key installation or grant. */
import { closed } from './preparation.ts';
import { domainMessage, json, same, verifySignature } from './admission.ts';
import { digest, lp, unhex, parseDraft, recoveryStateDigest, rootCommitment } from './recovery.ts';
import {
  membershipState,
  MEMBERSHIP_CREDENTIAL_LIMIT,
  type VerifiedMembership,
} from './membership.ts';
import { EMPTY_LINK, type StreamHead } from './successor.ts';
import type { AcceptedHead } from './positionDecision.ts';

export const ROTATION_LIMIT = 64 * 1024;
const fixed = (v: unknown, size = 32): string => {
  unhex(v, size);
  return v as string;
};
const integer = (v: unknown, min = 1): number => {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) >= Number.MAX_SAFE_INTEGER)
    throw Error('Invalid rotation integer');
  return v as number;
};
const bound = (v: unknown) => {
  if (json(v).length > ROTATION_LIMIT) throw Error('Oversized rotation');
};
const vector = <T>(v: unknown, read: (v: unknown) => T, id: (v: T) => string): T[] => {
  if (!Array.isArray(v) || !v.length || v.length > MEMBERSHIP_CREDENTIAL_LIMIT)
    throw Error('Invalid rotation vector');
  const values = v.map(read);
  for (let i = 1; i < values.length; i++)
    if (id(values[i - 1]!) >= id(values[i]!)) throw Error('Unordered rotation vector');
  return values;
};
const parseHead = (v: unknown): StreamHead => {
  const h = closed(v, ['credentialId', 'position', 'link']);
  const position = integer(h['position'], 0),
    link = fixed(h['link']);
  if ((position === 0) !== (link === EMPTY_LINK)) throw Error('Invalid empty rotation head');
  return { credentialId: fixed(h['credentialId'], 16), position, link };
};
export interface GenerationWrap {
  enc: string;
  ct: string;
}
const parseWrap = (v: unknown): GenerationWrap => {
  const w = closed(v, ['enc', 'ct']);
  return { enc: fixed(w['enc']), ct: fixed(w['ct'], 48) };
};

export interface RemovalPreparationRequest {
  v: 1;
  kind: 'removal-preparation-request';
  workspaceId: string;
  lineageId: string;
  parent: string;
  epoch: number;
  actorId: string;
  targetId: string;
  nonce: string;
  signature: string;
}
export function parseRemovalPreparationRequest(input: unknown): RemovalPreparationRequest {
  bound(input);
  const r = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'parent',
    'epoch',
    'actorId',
    'targetId',
    'nonce',
    'signature',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'removal-preparation-request')
    throw Error('Invalid removal preparation request');
  return {
    v: 1,
    kind: 'removal-preparation-request',
    workspaceId: fixed(r['workspaceId'], 16),
    lineageId: fixed(r['lineageId']),
    parent: fixed(r['parent']),
    epoch: integer(r['epoch'], 3),
    actorId: fixed(r['actorId'], 16),
    targetId: fixed(r['targetId'], 16),
    nonce: fixed(r['nonce']),
    signature: fixed(r['signature'], 64),
  };
}
export const removalPreparationRequestMessage = (input: unknown) => {
  const { signature: _, ...r } = parseRemovalPreparationRequest(input);
  return domainMessage('done/removal-preparation-request/v1', r);
};
export async function verifyRemovalPreparationRequest(input: unknown, parent: VerifiedMembership) {
  const r = parseRemovalPreparationRequest(input),
    p = membershipState(parent);
  const actor = p.certificate.members.find((m) => m.id === r.actorId);
  if (
    r.workspaceId !== p.workspaceId ||
    r.lineageId !== p.lineageId ||
    r.parent !== p.head ||
    r.epoch !== p.epoch ||
    !actor ||
    r.actorId === r.targetId ||
    !p.roster.some((m) => m.id === r.targetId) ||
    p.roster.some((m) => m.state === 'pending' && m.id !== r.targetId)
  )
    throw Error('Removal authority changed');
  await verifySignature(actor.sPub, r.signature, await removalPreparationRequestMessage(r));
  return r;
}
export interface RemovalPreparation {
  v: 1;
  kind: 'removal-preparation';
  request: RemovalPreparationRequest;
  cutoff: StreamHead[];
  signature: string;
}
export function parseRemovalPreparation(input: unknown): RemovalPreparation {
  bound(input);
  const p = closed(input, ['v', 'kind', 'request', 'cutoff', 'signature']);
  if (p['v'] !== 1 || p['kind'] !== 'removal-preparation')
    throw Error('Invalid removal preparation');
  return {
    v: 1,
    kind: 'removal-preparation',
    request: parseRemovalPreparationRequest(p['request']),
    cutoff: vector(p['cutoff'], parseHead, (h) => h.credentialId),
    signature: fixed(p['signature'], 64),
  };
}
export const removalPreparationMessage = (input: unknown) => {
  const { signature: _, ...p } = parseRemovalPreparation(input);
  return domainMessage('done/removal-preparation/v1', p);
};
/** The producer must durably fence the target stream before signing this preparation. Other streams
 * may advance. This attests to the fence; it does not prove the service implemented it. */
export async function verifyRemovalPreparation(input: unknown, parent: VerifiedMembership) {
  const prepared = parseRemovalPreparation(input),
    p = membershipState(parent);
  await verifyRemovalPreparationRequest(prepared.request, parent);
  if (
    !same(
      prepared.cutoff.map((h) => h.credentialId),
      p.roster.map((m) => m.id),
    )
  )
    throw Error('Removal cutoff coverage changed');
  for (const head of prepared.cutoff) {
    const before = p.heads.find((h) => h.credentialId === head.credentialId)!;
    if (
      head.position < before.position ||
      (head.position === before.position && head.link !== before.link) ||
      (p.roster.find((m) => m.id === head.credentialId)!.state === 'pending' && head.position !== 0)
    )
      throw Error('Removal cutoff regressed');
  }
  await verifySignature(
    p.pin.authRoot,
    prepared.signature,
    await removalPreparationMessage(prepared),
  );
  return prepared;
}

export interface RotationPayload {
  cutoff: StreamHead[];
  excluded: string[];
  recoveryWrap: GenerationWrap;
  wraps: (GenerationWrap & { credentialId: string })[];
}
export function parseRotationPayload(input: unknown): RotationPayload {
  bound(input);
  const p = closed(input, ['cutoff', 'excluded', 'recoveryWrap', 'wraps']);
  return {
    cutoff: vector(p['cutoff'], parseHead, (h) => h.credentialId),
    excluded: vector(
      p['excluded'],
      (id) => fixed(id, 16),
      (id) => id,
    ),
    recoveryWrap: parseWrap(p['recoveryWrap']),
    wraps: vector(
      p['wraps'],
      (input) => {
        const w = closed(input, ['credentialId', 'enc', 'ct']);
        return {
          credentialId: fixed(w['credentialId'], 16),
          enc: fixed(w['enc']),
          ct: fixed(w['ct'], 48),
        };
      },
      (w) => w.credentialId,
    ),
  };
}
/** Selected row-15 parts and ordering; wrap bytes are enc || ciphertext including its AEAD tag. */
export const rotationPayloadMessage = (input: unknown) => {
  const p = parseRotationPayload(input);
  return lp(
    'done/transition-payload/v1',
    'cutoff',
    p.cutoff.map((h) => `${h.credentialId}:${h.position}:${h.link}`).join('|'),
    'excluded',
    p.excluded.join('|'),
    'recovery-wrap',
    p.recoveryWrap.enc + p.recoveryWrap.ct,
    'wraps',
    p.wraps.map((w) => `${w.credentialId}:${w.enc}${w.ct}`).join('|'),
  );
};
export interface RotationRequest {
  v: 1;
  kind: 'rotation-request';
  preparation: RemovalPreparation;
  actorId: string;
  target: number;
  payload: RotationPayload;
  signature: string;
}
export function parseRotationRequest(input: unknown): RotationRequest {
  bound(input);
  const r = closed(input, [
    'v',
    'kind',
    'preparation',
    'actorId',
    'target',
    'payload',
    'signature',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'rotation-request') throw Error('Invalid rotation request');
  return {
    v: 1,
    kind: 'rotation-request',
    preparation: parseRemovalPreparation(r['preparation']),
    actorId: fixed(r['actorId'], 16),
    target: integer(r['target'], 2),
    payload: parseRotationPayload(r['payload']),
    signature: fixed(r['signature'], 64),
  };
}
export async function rotationIntentMessage(input: unknown) {
  const r = parseRotationRequest(input),
    p = r.preparation.request;
  return lp(
    'done/transition/v1',
    '1',
    'rotate',
    p.workspaceId,
    p.lineageId,
    String(p.epoch),
    String(r.target),
    await digest(rotationPayloadMessage(r.payload)),
  );
}
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export interface VerifiedRotation {
  readonly request: Immutable<RotationRequest>;
  readonly id: string;
}
const rotations = new WeakMap<VerifiedRotation, VerifiedMembership>();
function freeze<T>(v: T): Immutable<T> {
  if (v && typeof v === 'object') {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v as Immutable<T>;
}
/** Resolve encryption recipients before producing any new key material. */
export async function rotationRecipients(
  parent: VerifiedMembership,
  targetId: string,
  recoveryInput: unknown,
) {
  const p = membershipState(parent),
    recovery = parseDraft(recoveryInput);
  if (
    !p.roster.some((m) => m.id === targetId) ||
    p.roster.some((m) => m.state === 'pending' && m.id !== targetId) ||
    recovery.principalId !== p.principalId ||
    recovery.workspaceId !== p.workspaceId ||
    recovery.lineageId !== p.lineageId ||
    recovery.authRoot !== p.pin.authRoot ||
    recovery.rootCommitment !== (await rootCommitment(recovery)) ||
    (await recoveryStateDigest(recovery)) !== p.certificate.recoveryStateDigest
  )
    throw Error('Rotation recipients or parent changed');
  const members = p.certificate.members.filter((m) => m.id !== targetId);
  if (!members.length) throw Error('Rotation requires a remaining device');
  return { members, recovery };
}
/** Recovery public authority comes from the parent's certified digest, never a proposed wrap key. */
export async function verifyRotationRequest(
  input: unknown,
  parent: VerifiedMembership,
  recoveryInput: unknown,
): Promise<VerifiedRotation> {
  const r = parseRotationRequest(input),
    p = membershipState(parent),
    recovery = parseDraft(recoveryInput);
  await verifyRemovalPreparation(r.preparation, parent);
  const { members: expected } = await rotationRecipients(
    parent,
    r.preparation.request.targetId,
    recovery,
  );
  const actor = expected.find((m) => m.id === r.actorId);
  if (
    !actor ||
    r.target !== p.generation + 1 ||
    !same(r.payload.excluded, [r.preparation.request.targetId]) ||
    !same(r.payload.cutoff, r.preparation.cutoff) ||
    !same(
      r.payload.wraps.map((w) => w.credentialId),
      expected.map((m) => m.id),
    )
  )
    throw Error('Rotation recipients or parent changed');
  const message = await rotationIntentMessage(r);
  await verifySignature(actor.sPub, r.signature, message);
  const result = freeze({ request: r, id: await digest(message) });
  rotations.set(result, parent);
  return result;
}
const parentOf = (r: VerifiedRotation) => {
  const p = rotations.get(r);
  if (!p) throw Error('Unverified rotation request');
  return membershipState(p);
};
export interface RotationOutcome {
  v: 1;
  kind: 'rotate';
  workspaceId: string;
  lineageId: string;
  target: number;
  epoch: number;
  committedId: string;
  signature: string;
}
export function parseRotationOutcome(input: unknown): RotationOutcome {
  const o = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'target',
    'epoch',
    'committedId',
    'signature',
  ]);
  if (o['v'] !== 1 || o['kind'] !== 'rotate') throw Error('Invalid rotation outcome');
  return {
    v: 1,
    kind: 'rotate',
    workspaceId: fixed(o['workspaceId'], 16),
    lineageId: fixed(o['lineageId']),
    target: integer(o['target'], 2),
    epoch: integer(o['epoch'], 4),
    committedId: fixed(o['committedId']),
    signature: fixed(o['signature'], 64),
  };
}
export const rotationOutcomeMessage = (input: unknown) => {
  const o = parseRotationOutcome(input);
  return lp(
    'done/transition-out/v1',
    '1',
    'rotate',
    o.workspaceId,
    o.lineageId,
    String(o.target),
    String(o.epoch),
    o.committedId,
  );
};
/** Invalid/absent replies leave the exact request and pending key intact. A valid outcome alone
 * never installs a generation or licenses retirement of predecessor openers. */
export async function resolveRotationOutcome(input: unknown, request: VerifiedRotation) {
  const p = parentOf(request);
  try {
    const o = parseRotationOutcome(input);
    if (
      o.workspaceId !== p.workspaceId ||
      o.lineageId !== p.lineageId ||
      o.target !== request.request.target ||
      o.epoch <= p.epoch ||
      (o.committedId === request.id && o.epoch !== p.epoch + 1)
    )
      throw Error('Rotation outcome scope changed');
    await verifySignature(p.pin.authRoot, o.signature, rotationOutcomeMessage(o));
    return {
      kind: o.committedId === request.id ? ('committed' as const) : ('superseded' as const),
      outcome: o,
    };
  } catch {
    return { kind: 'pending' as const };
  }
}
/** Unlike an accepted response for a particular envelope, finalization may name an empty stream. */
export function parseRemovalFinalization(input: unknown): AcceptedHead {
  const h = closed(input, [
    'workspace',
    'credential',
    'position',
    'link',
    'epoch',
    'final',
    'signature',
  ]);
  const position = integer(h['position'], 0),
    link = fixed(h['link']);
  if (h['final'] !== true || (position === 0) !== (link === EMPTY_LINK))
    throw Error('Invalid removal finalization');
  return {
    workspace: fixed(h['workspace'], 16),
    credential: fixed(h['credential'], 16),
    position,
    link,
    epoch: integer(h['epoch'], 4),
    final: true,
    signature: fixed(h['signature'], 64),
  };
}
export const removalFinalizationMessage = (input: unknown) => {
  const h = parseRemovalFinalization(input);
  return lp(
    'done/accept-head/v1',
    h.workspace,
    h.credential,
    String(h.position),
    h.link,
    String(h.epoch),
    'true',
  );
};
/** Verifies the prepared final boundary, not a replayed prefix. Content admission must separately
 * compare it with the link computed from actual accepted envelopes. */
export async function verifyRemovalFinalization(
  input: unknown,
  request: VerifiedRotation,
  outcomeInput: unknown,
) {
  const p = parentOf(request),
    h = parseRemovalFinalization(input);
  const result = await resolveRotationOutcome(outcomeInput, request);
  const cut = request.request.payload.cutoff.find(
    (h) => h.credentialId === request.request.preparation.request.targetId,
  )!;
  if (
    result.kind !== 'committed' ||
    h.workspace !== p.workspaceId ||
    h.credential !== cut.credentialId ||
    h.position !== cut.position ||
    h.link !== cut.link ||
    h.epoch !== result.outcome.epoch
  )
    throw Error('Removal final boundary changed');
  await verifySignature(p.acceptancePublicKey, h.signature, removalFinalizationMessage(h));
  return h;
}
