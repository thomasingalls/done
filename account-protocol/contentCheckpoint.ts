/** First certified-device catch-up baseline; subsequent writing uses ordinary v2 envelopes. */
import { closed } from './preparation.ts';
import { unhex, digest, lp } from './recovery.ts';
import { GENESIS_LIMIT } from './genesis.ts';
import {
  coverageParts,
  manifestMessage,
  semanticMessage,
  verifySignature,
  same,
  DERIVATION,
  type CheckpointManifest,
  type SemanticAdmission,
} from './admission.ts';
import { parseBindingProof, verifyBindingProof, type BindingProof } from './slot.ts';
import { verifyCertificationHistory } from './admissionHistory.ts';
import type { CertificationSuccessor } from './contentDelivery.ts';
import type { AdmissionSuccessor, SuccessorBase } from './successor.ts';
export const CONTENT_CHECKPOINT_LIMIT = 72 * 1024 * 1024;
export interface ContentCheckpoint {
  v: 1;
  kind: 'content-checkpoint';
  salt: string;
  nonce: string;
  ct: string;
  manifest: Omit<CheckpointManifest, 'epoch'> & { epoch: 3 };
  heads: CertificationSuccessor['epoch']['heads'];
  binding: BindingProof;
}
export type CheckpointAdmission = Omit<SemanticAdmission, 'selfAdmitted'> & { selfAdmitted: 0 };
export interface CheckpointAuthority {
  base: SuccessorBase;
  successor: AdmissionSuccessor;
  certification: CertificationSuccessor;
}
const h = (v: unknown, n = 32) => {
  unhex(v, n);
  return v as string;
};
export function parseContentCheckpoint(input: unknown): ContentCheckpoint {
  const r = closed(input, ['v', 'kind', 'salt', 'nonce', 'ct', 'manifest', 'heads', 'binding']);
  const m = closed(r['manifest'], [
    'v',
    'workspaceId',
    'epoch',
    'epochHead',
    'generation',
    'checkpointDigest',
    'sv',
    'ds',
    'headVectorDigest',
    'producer',
    'signature',
  ]);
  if (
    r['v'] !== 1 ||
    r['kind'] !== 'content-checkpoint' ||
    m['v'] !== 2 ||
    m['epoch'] !== 3 ||
    m['generation'] !== 1 ||
    typeof r['ct'] !== 'string' ||
    r['ct'].length < 32 ||
    r['ct'].length > (GENESIS_LIMIT + 16) * 2 ||
    !Array.isArray(r['heads']) ||
    r['heads'].length !== 2
  )
    throw Error('Invalid content checkpoint');
  const ct = h(r['ct'], r['ct'].length / 2);
  const heads = r['heads'].map((value) => {
    const head = closed(value, ['credentialId', 'position', 'link']);
    // This catch-up converts a local-only v5 writer. It cannot skip any accepted Account history.
    if (head['position'] !== 0 || head['link'] !== '00'.repeat(32))
      throw Error('Catch-up requires an empty accepted history');
    return { credentialId: h(head['credentialId'], 16), position: 0, link: head['link'] as string };
  }) as ContentCheckpoint['heads'];
  if (heads[0].credentialId >= heads[1].credentialId) throw Error('Unordered checkpoint heads');
  return {
    v: 1,
    kind: 'content-checkpoint',
    salt: h(r['salt'], 16),
    nonce: h(r['nonce'], 12),
    ct,
    manifest: {
      v: 2,
      workspaceId: h(m['workspaceId'], 16),
      epoch: 3,
      epochHead: h(m['epochHead']),
      generation: 1,
      checkpointDigest: h(m['checkpointDigest']),
      ...coverageParts({ sv: m['sv'] as string, ds: m['ds'] as string }),
      headVectorDigest: h(m['headVectorDigest']),
      producer: h(m['producer'], 16),
      signature: h(m['signature'], 64),
    },
    heads,
    binding: parseBindingProof(r['binding']),
  };
}
export const checkpointHeadDigest = (
  heads: readonly { credentialId: string; position: number; link: string }[],
) =>
  digest(
    new Uint8Array([
      ...lp('done/headvec/v1'),
      ...heads.flatMap((h) => [...lp(h.credentialId, String(h.position), h.link)]),
    ]),
  );
export const contentCheckpointHash = (input: unknown) =>
  digest(new TextEncoder().encode(JSON.stringify(parseContentCheckpoint(input))));
export const contentCheckpointAAD = (c: ContentCheckpoint) =>
  lp('done/cp/v1', '1', c.manifest.workspaceId, '1', '3');
export async function verifyContentCheckpoint(input: unknown, authority: CheckpointAuthority) {
  const c = parseContentCheckpoint(input),
    a = structuredClone(authority);
  const history = await verifyCertificationHistory(a.certification, a.successor, a.base, {
    epoch: 3,
    head: a.certification.head,
  });
  if (
    c.manifest.workspaceId !== history.current.workspace ||
    c.manifest.epochHead !== history.current.head ||
    c.manifest.producer !== history.credential ||
    !same(c.heads, a.certification.epoch.heads) ||
    c.manifest.checkpointDigest !== (await digest(unhex(c.ct, c.ct.length / 2))) ||
    c.manifest.headVectorDigest !== (await checkpointHeadDigest(c.heads))
  )
    throw Error('Checkpoint authority or coverage changed');
  await verifySignature(
    history.signingKey,
    c.manifest.signature,
    await manifestMessage(c.manifest),
  );
  await verifyBindingProof(c.binding, a.base.request, a.base.receipt, a.base.pin);
  return c;
}
export async function checkpointAdmissionBody(
  c: ContentCheckpoint,
  credential: string,
): Promise<CheckpointAdmission> {
  return {
    v: 2,
    workspaceId: c.manifest.workspaceId,
    checkpointDigest: c.manifest.checkpointDigest,
    manifestDigest: await digest(await manifestMessage(c.manifest)),
    derivedSv: c.manifest.sv,
    derivedDs: c.manifest.ds,
    headBaselineDigest: c.manifest.headVectorDigest,
    derivation: DERIVATION,
    admittingCredential: credential,
    selfAdmitted: 0,
    decisionParent: c.manifest.epochHead,
    signature: '00'.repeat(64),
  };
}
export async function verifyCheckpointAdmission(
  input: unknown,
  c: ContentCheckpoint,
  a: CheckpointAuthority,
) {
  const credential = a.certification.epoch.delivery.candidate.context.candidate;
  const value = closed(input, [
    'v',
    'workspaceId',
    'checkpointDigest',
    'manifestDigest',
    'derivedSv',
    'derivedDs',
    'headBaselineDigest',
    'derivation',
    'admittingCredential',
    'selfAdmitted',
    'decisionParent',
    'signature',
  ]);
  const expected = await checkpointAdmissionBody(c, credential.id);
  expected.signature = h(value['signature'], 64);
  if (!same(value, expected)) throw Error('Checkpoint admission changed');
  await verifySignature(credential.sPub, expected.signature, await semanticMessage(expected));
  return expected;
}
export interface CheckpointRequest {
  workspaceId: string;
  credentialId: string;
  head: string;
  nonce: string;
  action: 'read' | 'publish' | 'admit';
  payload: unknown;
  signature: string;
}
export function parseCheckpointRequest(input: unknown): CheckpointRequest {
  const r = closed(input, [
    'workspaceId',
    'credentialId',
    'head',
    'nonce',
    'action',
    'payload',
    'signature',
  ]);
  if (
    !['read', 'publish', 'admit'].includes(r['action'] as string) ||
    (r['action'] === 'read' && r['payload'] !== null)
  )
    throw Error('Invalid checkpoint request');
  return {
    workspaceId: h(r['workspaceId'], 16),
    credentialId: h(r['credentialId'], 16),
    head: h(r['head']),
    nonce: h(r['nonce']),
    action: r['action'] as CheckpointRequest['action'],
    payload: r['payload'],
    signature: h(r['signature'], 64),
  };
}
export const checkpointRequestMessage = async (r: CheckpointRequest) =>
  lp(
    'done/checkpoint-request/v1',
    r.workspaceId,
    r.credentialId,
    r.head,
    r.nonce,
    r.action,
    await digest(new TextEncoder().encode(JSON.stringify(r.payload))),
  );
