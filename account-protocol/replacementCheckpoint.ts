import {
  parseReplacementCheckpointAdmission,
  replacementCheckpointAdmissionMessage,
  type ReplacementCheckpointAdmission,
} from './replacementAcknowledgement.ts';
export {
  parseReplacementCheckpointAdmission,
  replacementCheckpointAdmissionMessage,
  type ReplacementCheckpointAdmission,
} from './replacementAcknowledgement.ts';
/** Current-generation replacement baseline. Verification authenticates a producer claim, not plaintext coverage. */
import { closed, accountIdentifier } from './preparation.ts';
import { coverageParts, domainMessage, json, same, verifySignature } from './admission.ts';
import { digest, unhex, lp } from './recovery.ts';
import { GENESIS_LIMIT } from './genesis.ts';
import {
  membershipState,
  membershipAdmissionCandidate,
  MEMBERSHIP_CREDENTIAL_LIMIT,
  type VerifiedMembership,
} from './membership.ts';
import { checkpointHeadDigest, CONTENT_CHECKPOINT_LIMIT } from './contentCheckpoint.ts';

export const REPLACEMENT_CHECKPOINT_LIMIT = CONTENT_CHECKPOINT_LIMIT;
// A bounded continuation can retire publishers in addition to its current roster.
export const REPLACEMENT_HEAD_LIMIT = 3 * MEMBERSHIP_CREDENTIAL_LIMIT;
export interface ReplacementCheckpoint {
  v: 1;
  kind: 'replacement-checkpoint';
  salt: string;
  nonce: string;
  ct: string;
  manifest: {
    workspaceId: string;
    lineageId: string;
    epoch: number;
    epochHead: string;
    generation: number;
    producer: string;
    candidate: string;
    preparationId: string;
    checkpointDigest: string;
    sv: string;
    ds: string;
    headVectorDigest: string;
  };
  heads: { credentialId: string; position: number; link: string }[];
  signature: string;
}
const h = (value: unknown, length = 32) => {
  unhex(value, length);
  return value as string;
};
const integer = (value: unknown, min: number) => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Invalid replacement checkpoint integer');
  return value as number;
};
export function parseReplacementCheckpoint(input: unknown): ReplacementCheckpoint {
  if (json(input).length > REPLACEMENT_CHECKPOINT_LIMIT)
    throw Error('Replacement checkpoint too large');
  const c = closed(input, ['v', 'kind', 'salt', 'nonce', 'ct', 'manifest', 'heads', 'signature']);
  const m = closed(c['manifest'], [
    'workspaceId',
    'lineageId',
    'epoch',
    'epochHead',
    'generation',
    'producer',
    'candidate',
    'preparationId',
    'checkpointDigest',
    'sv',
    'ds',
    'headVectorDigest',
  ]);
  if (
    c['v'] !== 1 ||
    c['kind'] !== 'replacement-checkpoint' ||
    typeof c['ct'] !== 'string' ||
    c['ct'].length % 2 !== 0 ||
    c['ct'].length < 36 ||
    c['ct'].length > (GENESIS_LIMIT + 16) * 2 ||
    !Array.isArray(c['heads']) ||
    !c['heads'].length ||
    c['heads'].length > REPLACEMENT_HEAD_LIMIT
  )
    throw Error('Invalid replacement checkpoint');
  const heads = c['heads'].map((value) => {
    const s = closed(value, ['credentialId', 'position', 'link']);
    const position = integer(s['position'], 0),
      link = h(s['link']);
    if (position === 0 && link !== '00'.repeat(32)) throw Error('Invalid empty checkpoint prefix');
    return { credentialId: h(s['credentialId'], 16), position, link };
  });
  for (let i = 1; i < heads.length; i++)
    if (heads[i - 1]!.credentialId >= heads[i]!.credentialId)
      throw Error('Unordered checkpoint publishers');
  const generation = integer(m['generation'], 2);
  if (generation > 0xffffffff) throw Error('Invalid checkpoint generation');
  return {
    v: 1,
    kind: 'replacement-checkpoint',
    salt: h(c['salt'], 16),
    nonce: h(c['nonce'], 12),
    ct: h(c['ct'], c['ct'].length / 2),
    manifest: {
      workspaceId: h(m['workspaceId'], 16),
      lineageId: h(m['lineageId']),
      epoch: integer(m['epoch'], 3),
      epochHead: h(m['epochHead']),
      generation,
      producer: h(m['producer'], 16),
      candidate: h(m['candidate'], 16),
      preparationId: accountIdentifier(m['preparationId']),
      checkpointDigest: h(m['checkpointDigest']),
      ...coverageParts({ sv: m['sv'] as string, ds: m['ds'] as string }),
      headVectorDigest: h(m['headVectorDigest']),
    },
    heads,
    signature: h(c['signature'], 64),
  };
}
/** Includes finalized publishers: excluding them would silently omit their already accepted writing. */
export function replacementCheckpointHeads(parent: VerifiedMembership) {
  membershipAdmissionCandidate(parent);
  const p = membershipState(parent);
  const heads = [
    ...p.heads.map((h) => ({ ...h })),
    ...p.finalized.map((h) => ({ credentialId: h.credential, position: h.position, link: h.link })),
  ].sort((a, b) => (a.credentialId < b.credentialId ? -1 : 1));
  if (
    heads.length > REPLACEMENT_HEAD_LIMIT ||
    heads.some((h, i) => i > 0 && h.credentialId === heads[i - 1]!.credentialId)
  )
    throw Error('Invalid replacement publisher coverage');
  return heads;
}
export function replacementCheckpointMessage(input: unknown) {
  const { signature: _, ct: _ct, ...body } = parseReplacementCheckpoint(input);
  // The authenticated digest binds ciphertext; salt, nonce, full manifest and exact cuts are signed too.
  return domainMessage('done/replacement-checkpoint/v1', body);
}
export const replacementCheckpointHash = (input: unknown) =>
  digest(json(parseReplacementCheckpoint(input)));
export const replacementCheckpointAAD = (c: ReplacementCheckpoint) =>
  lp(
    'done/replacement-checkpoint-aead/v1',
    c.manifest.workspaceId,
    c.manifest.lineageId,
    String(c.manifest.epoch),
    c.manifest.epochHead,
    String(c.manifest.generation),
    c.manifest.producer,
    c.manifest.candidate,
    c.manifest.preparationId,
    c.manifest.headVectorDigest,
  );
export async function verifyReplacementCheckpoint(input: unknown, parent: VerifiedMembership) {
  const c = parseReplacementCheckpoint(input),
    p = membershipState(parent),
    m = c.manifest;
  const candidate = p.roster.find((r) => r.id === m.candidate && r.state === 'pending');
  const producer = p.certificate.members.find((r) => r.id === m.producer);
  const preparation = p.preparations.find((r) => r.credentialId === m.candidate);
  if (
    !candidate ||
    membershipAdmissionCandidate(parent) !== m.candidate ||
    !producer ||
    !preparation ||
    m.workspaceId !== p.workspaceId ||
    m.lineageId !== p.lineageId ||
    m.epoch !== p.epoch ||
    m.epochHead !== p.head ||
    m.generation !== p.generation ||
    m.preparationId !== preparation.attemptId ||
    !same(c.heads, replacementCheckpointHeads(parent)) ||
    m.checkpointDigest !== (await digest(unhex(c.ct, c.ct.length / 2))) ||
    m.headVectorDigest !== (await checkpointHeadDigest(c.heads))
  )
    throw Error('Replacement checkpoint authority or coverage changed');
  await verifySignature(producer.sPub, c.signature, await replacementCheckpointMessage(c));
  return c;
}

/** Construct only after decrypting and replaying the snapshot; this alone grants no authority. */
export async function replacementCheckpointAdmissionBody(
  input: unknown,
): Promise<ReplacementCheckpointAdmission> {
  const c = parseReplacementCheckpoint(input);
  return {
    v: 1,
    kind: 'replacement-checkpoint-admission',
    checkpointHash: await replacementCheckpointHash(c),
    candidate: c.manifest.candidate,
    parent: c.manifest.epochHead,
    signature: '00'.repeat(64),
  };
}
export async function verifyReplacementCheckpointAdmission(
  input: unknown,
  checkpoint: unknown,
  parent: VerifiedMembership,
) {
  const a = parseReplacementCheckpointAdmission(input),
    c = await verifyReplacementCheckpoint(checkpoint, parent),
    expected = { ...(await replacementCheckpointAdmissionBody(c)), signature: a.signature };
  if (!same(a, expected)) throw Error('Replacement checkpoint admission changed');
  const candidate = membershipState(parent).roster.find((r) => r.id === a.candidate)!;
  await verifySignature(
    candidate.sPub,
    a.signature,
    await replacementCheckpointAdmissionMessage(a),
  );
  return a;
}
