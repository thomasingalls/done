import {
  parseHistorySources,
  historySourcesDigest,
  requireHistorySourcesExtend,
  type HistorySourceRef,
} from './historySources.ts';
/** Repeatable content baseline, independent of enrollment. Admission is required before installation. */
import { closed } from './preparation.ts';
import {
  coverageParts,
  COVERAGE_LIMIT,
  DERIVATION,
  domainMessage,
  json,
  same,
  verifySignature,
} from './admission.ts';
import { digest, lp, unhex } from './recovery.ts';
import { GENESIS_LIMIT } from './genesis.ts';
import { checkpointHeadDigest } from './contentCheckpoint.ts';
import {
  membershipState,
  MEMBERSHIP_CREDENTIAL_LIMIT,
  type VerifiedMembership,
} from './membership.ts';

export const HISTORY_CHECKPOINT_LIMIT = 72 * 1024 * 1024;
export const HISTORY_ADMISSION_LIMIT = 2 * COVERAGE_LIMIT + 8192;
export const HISTORY_HEAD_LIMIT = 3 * MEMBERSHIP_CREDENTIAL_LIMIT;
export const EMPTY_HISTORY_CHECKPOINT = '00'.repeat(32);
export interface HistoryHead {
  credentialId: string;
  position: number;
  link: string;
}
export interface HistoryCheckpoint {
  v: 1;
  kind: 'history-checkpoint';
  salt: string;
  nonce: string;
  ct: string;
  manifest: {
    workspaceId: string;
    lineageId: string;
    epoch: number;
    epochHead: string;
    generation: number;
    sequence: number;
    parent: string;
    producer: string;
    checkpointDigest: string;
    sv: string;
    ds: string;
    headVectorDigest: string;
    sourcesDigest: string;
  };
  heads: HistoryHead[];
  sources: HistorySourceRef[];
  signature: string;
}
const h = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const integer = (v: unknown, min: number): number => {
  if (
    !Number.isSafeInteger(v) ||
    Object.is(v, -0) ||
    (v as number) < min ||
    (v as number) >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Invalid history checkpoint integer');
  return v as number;
};
export function parseHistoryHeads(input: unknown): HistoryHead[] {
  if (!Array.isArray(input) || !input.length || input.length > HISTORY_HEAD_LIMIT)
    throw Error('Invalid history publisher count');
  const heads = input.map((value) => {
    const r = closed(value, ['credentialId', 'position', 'link']);
    const position = integer(r['position'], 0),
      link = h(r['link']);
    if (position === 0 && link !== EMPTY_HISTORY_CHECKPOINT)
      throw Error('Invalid empty history prefix');
    return { credentialId: h(r['credentialId'], 16), position, link };
  });
  for (let i = 1; i < heads.length; i++)
    if (heads[i - 1]!.credentialId >= heads[i]!.credentialId)
      throw Error('Unordered history publishers');
  return heads;
}
export function parseHistoryCheckpoint(input: unknown): HistoryCheckpoint {
  if (json(input).length > HISTORY_CHECKPOINT_LIMIT) throw Error('History checkpoint too large');
  const c = closed(input, [
    'v',
    'kind',
    'salt',
    'nonce',
    'ct',
    'manifest',
    'heads',
    'sources',
    'signature',
  ]);
  const m = closed(c['manifest'], [
    'workspaceId',
    'lineageId',
    'epoch',
    'epochHead',
    'generation',
    'sequence',
    'parent',
    'producer',
    'checkpointDigest',
    'sv',
    'ds',
    'headVectorDigest',
    'sourcesDigest',
  ]);
  if (
    c['v'] !== 1 ||
    c['kind'] !== 'history-checkpoint' ||
    typeof c['ct'] !== 'string' ||
    c['ct'].length < 36 ||
    c['ct'].length % 2 ||
    c['ct'].length > (GENESIS_LIMIT + 16) * 2
  )
    throw Error('Invalid history checkpoint');
  const sequence = integer(m['sequence'], 1),
    parent = h(m['parent']),
    generation = integer(m['generation'], 1);
  if ((sequence === 1) !== (parent === EMPTY_HISTORY_CHECKPOINT) || generation > 0xffffffff)
    throw Error('Invalid history checkpoint ancestry');
  return {
    v: 1,
    kind: 'history-checkpoint',
    salt: h(c['salt'], 16),
    nonce: h(c['nonce'], 12),
    ct: h(c['ct'], c['ct'].length / 2),
    manifest: {
      workspaceId: h(m['workspaceId'], 16),
      lineageId: h(m['lineageId']),
      epoch: integer(m['epoch'], 1),
      epochHead: h(m['epochHead']),
      generation,
      sequence,
      parent,
      producer: h(m['producer'], 16),
      checkpointDigest: h(m['checkpointDigest']),
      ...coverageParts({ sv: m['sv'] as string, ds: m['ds'] as string }),
      headVectorDigest: h(m['headVectorDigest']),
      sourcesDigest: h(m['sourcesDigest']),
    },
    heads: parseHistoryHeads(c['heads']),
    sources: parseHistorySources(c['sources']),
    signature: h(c['signature'], 64),
  };
}
export const historyCheckpointHash = (input: unknown) =>
  digest(json(parseHistoryCheckpoint(input)));
export function historyCheckpointMessage(input: unknown) {
  const { ct: _ct, signature: _signature, ...body } = parseHistoryCheckpoint(input);
  return domainMessage('done/history-checkpoint/v1', body);
}
export const historyCheckpointAAD = (c: HistoryCheckpoint) =>
  lp(
    'done/history-checkpoint-aead/v1',
    c.manifest.workspaceId,
    c.manifest.lineageId,
    String(c.manifest.epoch),
    c.manifest.epochHead,
    String(c.manifest.generation),
    String(c.manifest.sequence),
    c.manifest.parent,
    c.manifest.producer,
    c.manifest.headVectorDigest,
    c.manifest.sourcesDigest,
  );
/** Roster cutoffs are lower bounds for live publishers, exact bounds for finalized/pending ones. */
export function verifyHistoryHeads(input: unknown, authority: VerifiedMembership) {
  const heads = parseHistoryHeads(input),
    p = membershipState(authority);
  const minimum = [
    ...p.heads,
    ...p.finalized.map((v) => ({ credentialId: v.credential, position: v.position, link: v.link })),
  ].sort((a, b) => (a.credentialId < b.credentialId ? -1 : 1));
  if (minimum.length !== heads.length) throw Error('History publisher omitted');
  for (let i = 0; i < minimum.length; i++) {
    const m = minimum[i]!,
      head = heads[i]!;
    const exact =
      p.finalized.some((f) => f.credential === m.credentialId) ||
      p.roster.some((r) => r.id === m.credentialId && r.state === 'pending');
    if (
      head.credentialId !== m.credentialId ||
      head.position < m.position ||
      (head.position === m.position && head.link !== m.link) ||
      (exact && !same(head, m))
    )
      throw Error('History checkpoint publisher cut changed');
  }
  return heads;
}
export async function verifyHistoryCheckpoint(input: unknown, authority: VerifiedMembership) {
  const c = parseHistoryCheckpoint(input),
    p = membershipState(authority),
    m = c.manifest;
  const producer = p.certificate.members.find((v) => v.id === m.producer);
  if (
    !producer ||
    m.workspaceId !== p.workspaceId ||
    m.lineageId !== p.lineageId ||
    m.epoch !== p.epoch ||
    m.epochHead !== p.head ||
    m.generation !== p.generation ||
    m.checkpointDigest !== (await digest(unhex(c.ct, c.ct.length / 2))) ||
    m.headVectorDigest !== (await checkpointHeadDigest(c.heads))
  )
    throw Error('History checkpoint authority changed');
  verifyHistoryHeads(c.heads, authority);
  if (
    c.manifest.sourcesDigest !== (await historySourcesDigest(c.sources)) ||
    c.sources.some((s) => s.epoch > c.manifest.epoch)
  )
    throw Error('History source inventory changed');
  await verifySignature(producer.sPub, c.signature, await historyCheckpointMessage(c));
  return c;
}
/** Also used before proposal creation. This does not prove that ciphertext covers these cuts. */
export async function verifyHistoryCheckpointParent(
  c: HistoryCheckpoint,
  previous: HistoryCheckpoint | null,
) {
  if (!previous) {
    if (c.manifest.sequence !== 1 || c.manifest.parent !== EMPTY_HISTORY_CHECKPOINT)
      throw Error('Missing history checkpoint parent');
    return;
  }
  if (
    c.manifest.sequence !== previous.manifest.sequence + 1 ||
    c.manifest.parent !== (await historyCheckpointHash(previous)) ||
    c.manifest.workspaceId !== previous.manifest.workspaceId ||
    c.manifest.lineageId !== previous.manifest.lineageId ||
    c.manifest.epoch < previous.manifest.epoch ||
    c.manifest.generation < previous.manifest.generation
  )
    throw Error('History checkpoint parent changed');
  requireHistorySourcesExtend(c.sources, previous.sources);
  for (const old of previous.heads) {
    const head = c.heads.find((v) => v.credentialId === old.credentialId);
    if (
      !head ||
      head.position < old.position ||
      (head.position === old.position && head.link !== old.link)
    )
      throw Error('History checkpoint coverage moved backward');
  }
}
export interface HistoryCheckpointAdmission {
  v: 1;
  kind: 'history-checkpoint-admission';
  checkpointHash: string;
  derivedSv: string;
  derivedDs: string;
  headBaselineDigest: string;
  derivation: typeof DERIVATION;
  admittingCredential: string;
  selfAdmitted: 0 | 1;
  decisionParent: string;
  signature: string;
}
export function parseHistoryCheckpointAdmission(input: unknown): HistoryCheckpointAdmission {
  if (json(input).length > HISTORY_ADMISSION_LIMIT) throw Error('History admission too large');
  const a = closed(input, [
    'v',
    'kind',
    'checkpointHash',
    'derivedSv',
    'derivedDs',
    'headBaselineDigest',
    'derivation',
    'admittingCredential',
    'selfAdmitted',
    'decisionParent',
    'signature',
  ]);
  if (
    a['v'] !== 1 ||
    a['kind'] !== 'history-checkpoint-admission' ||
    a['derivation'] !== DERIVATION ||
    (a['selfAdmitted'] !== 0 && a['selfAdmitted'] !== 1)
  )
    throw Error('Invalid history checkpoint admission');
  const parts = coverageParts({ sv: a['derivedSv'] as string, ds: a['derivedDs'] as string });
  return {
    v: 1,
    kind: 'history-checkpoint-admission',
    checkpointHash: h(a['checkpointHash']),
    derivedSv: parts.sv,
    derivedDs: parts.ds,
    headBaselineDigest: h(a['headBaselineDigest']),
    derivation: DERIVATION,
    admittingCredential: h(a['admittingCredential'], 16),
    selfAdmitted: a['selfAdmitted'],
    decisionParent: h(a['decisionParent']),
    signature: h(a['signature'], 64),
  };
}
export function historyCheckpointAdmissionMessage(input: unknown) {
  const { signature: _, ...body } = parseHistoryCheckpointAdmission(input);
  return domainMessage('done/history-checkpoint-admission/v1', body);
}
/** Call only after independently replaying coverage and the accepted prefix, never from a manifest alone. */
export async function historyCheckpointAdmissionBody(
  c: HistoryCheckpoint,
  credential: string,
): Promise<HistoryCheckpointAdmission> {
  return {
    v: 1,
    kind: 'history-checkpoint-admission',
    checkpointHash: await historyCheckpointHash(c),
    derivedSv: c.manifest.sv,
    derivedDs: c.manifest.ds,
    headBaselineDigest: c.manifest.headVectorDigest,
    derivation: DERIVATION,
    admittingCredential: credential,
    selfAdmitted: credential === c.manifest.producer ? 1 : 0,
    decisionParent: c.manifest.epochHead,
    signature: '00'.repeat(64),
  };
}
export async function verifyHistoryCheckpointAdmission(
  input: unknown,
  checkpoint: unknown,
  authority: VerifiedMembership,
) {
  const a = parseHistoryCheckpointAdmission(input),
    c = await verifyHistoryCheckpoint(checkpoint, authority),
    p = membershipState(authority);
  const member = p.certificate.members.find((v) => v.id === a.admittingCredential);
  if (
    !member ||
    (a.selfAdmitted === 1 && p.certificate.members.length !== 1) ||
    !same(a, {
      ...(await historyCheckpointAdmissionBody(c, a.admittingCredential)),
      signature: a.signature,
    })
  )
    throw Error('History checkpoint admission authority changed');
  await verifySignature(member.sPub, a.signature, await historyCheckpointAdmissionMessage(a));
  return a;
}
