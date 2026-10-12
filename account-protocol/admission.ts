import { proofWork, type ProofCheckpoint } from './proofWork.ts';
import {
  parseActivationAuthorization,
  requireActivationTarget,
  type ActivationAuthorization,
} from './activation.ts';
/** Private first-epoch admission. Client certification and row-7 semantic evidence remain separate
 * from the service's serialization authority. No transport-supplied verification key is trusted. */
import { closed, parsePendingState, type PendingState } from './preparation.ts';
import { parseGenesis, genesisMessage, GENESIS_LIMIT, type GenesisCandidate } from './genesis.ts';
import { parseAuthorityPin, pinBytes, type AuthorityPin } from './authority.ts';
import {
  unhex,
  hex,
  lp,
  digest,
  parseDraft,
  recoveryStateDigest,
  rootCommitment,
  type RecoveryDraft,
} from './recovery.ts';
export const ADMISSION_LIMIT = 72 * 1024 * 1024;
// Raw bytes in one SV/DS pair; four hex fields in completion fit ADMISSION_LIMIT.
export const COVERAGE_LIMIT = GENESIS_LIMIT;
export const ZERO_HEAD = '00'.repeat(32);
export const DERIVATION = 'yjs-13.6.31-sv-ds-v1';
type Member = { id: string; wPub: string; sPub: string };
export interface Certification {
  members: [Member];
  recoveryStateDigest: string;
  approver: string;
  signature: string;
}
export interface AdmissionRequest {
  v: 1;
  candidate: GenesisCandidate;
  certification: Certification;
  recovery: RecoveryDraft;
  originSignature: string;
}
export interface FirstEpoch {
  v: 1;
  kind: 'first-authorization-epoch';
  pin: AuthorityPin;
  requestDigest: string;
  accountId: string;
  principalId: string;
  workspaceId: string;
  lineageId: string;
  epoch: 1;
  parent: string;
  generation: 1;
  certification: Certification;
  owner: string;
  capabilities: ['read', 'write', 'admit', 'manage'];
  acceptancePublicKey: string;
  heads: [];
}
export interface AdmissionOffer {
  v: 1;
  kind: 'promotion-offer';
  epoch: FirstEpoch;
  head: string;
  signature: string;
}
export interface CoverageParts {
  sv: string;
  ds: string;
}
export interface CheckpointManifest extends CoverageParts {
  v: 2;
  workspaceId: string;
  epoch: 1;
  epochHead: string;
  generation: 1;
  checkpointDigest: string;
  headVectorDigest: string;
  producer: string;
  signature: string;
}
export interface SemanticAdmission {
  v: 2;
  workspaceId: string;
  checkpointDigest: string;
  manifestDigest: string;
  derivedSv: string;
  derivedDs: string;
  headBaselineDigest: string;
  derivation: typeof DERIVATION;
  admittingCredential: string;
  selfAdmitted: 1;
  decisionParent: string;
  signature: string;
}
export interface AdmissionCompletion {
  manifest: CheckpointManifest;
  admission: SemanticAdmission;
}
export interface AdmissionReceipt {
  v: 2;
  kind: 'promotion-receipt';
  offer: AdmissionOffer;
  completion: AdmissionCompletion;
  epochSignature: string;
  activation: ActivationAuthorization;
  signature: string;
}
export const json = (input: unknown) => new TextEncoder().encode(JSON.stringify(input));
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const h = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const opaque = (v: unknown): string => {
  if (
    typeof v !== 'string' ||
    !v.length ||
    v.length > 2 * COVERAGE_LIMIT ||
    v.length % 2 ||
    !/^[0-9a-f]+$/.test(v)
  )
    throw Error('Invalid coverage bytes');
  return v;
};
/** Validate before decoding/hashing, on both local and service paths. */
export function coverageParts(input: CoverageParts): CoverageParts {
  const sv = opaque(input.sv),
    ds = opaque(input.ds);
  if ((sv.length + ds.length) / 2 > COVERAGE_LIMIT)
    throw Error('Admission coverage exceeds byte bound');
  return { sv, ds };
}
async function coverageDigests(parts: CoverageParts) {
  const { sv, ds } = coverageParts(parts);
  return { sv: await digest(unhex(sv, sv.length / 2)), ds: await digest(unhex(ds, ds.length / 2)) };
}
export function certification(input: unknown): Certification {
  const c = closed(input, ['members', 'recoveryStateDigest', 'approver', 'signature']);
  if (!Array.isArray(c['members']) || c['members'].length !== 1)
    throw Error('Genesis requires one certified client');
  const m = closed(c['members'][0], ['id', 'wPub', 'sPub']);
  const member = { id: h(m['id'], 16), wPub: h(m['wPub']), sPub: h(m['sPub']) };
  if (c['approver'] !== member.id) throw Error('Creating approver changed');
  return {
    members: [member],
    recoveryStateDigest: h(c['recoveryStateDigest']),
    approver: member.id,
    signature: h(c['signature'], 64),
  };
}
export function parseAdmissionRequest(input: unknown): AdmissionRequest {
  const r = closed(input, ['v', 'candidate', 'certification', 'recovery', 'originSignature']);
  if (r['v'] !== 1) throw Error('Unsupported admission');
  const candidate = parseGenesis(r['candidate']),
    cert = certification(r['certification']);
  if (
    cert.members[0].id !== candidate.signer ||
    cert.members[0].wPub !== candidate.wraps[0]!.publicKey
  )
    throw Error('Candidate recipient changed');
  return {
    v: 1,
    candidate,
    certification: cert,
    recovery: parseDraft(r['recovery']),
    originSignature: h(r['originSignature'], 64),
  };
}
export const requestDigest = (request: AdmissionRequest) =>
  digest(json(parseAdmissionRequest(request)));
export async function certificationMessage(request: AdmissionRequest) {
  const r = parseAdmissionRequest(request),
    c = r.candidate,
    m = r.certification.members[0];
  const md = await digest(lp('done/certified-members/v1', m.id, m.wPub, m.sPub));
  const prefix = lp('done/certified-set-approval/v1', r.certification.approver);
  const set = lp(
    'done/certified-set/v1',
    '1',
    c.workspaceId,
    c.lineageId,
    '0',
    '1',
    md,
    r.certification.recoveryStateDigest,
  );
  return new Uint8Array([...prefix, ...set]);
}
export async function verifySignature(
  publicKey: string,
  signature: string,
  message: Uint8Array<ArrayBuffer>,
  subtle = crypto.subtle,
) {
  const key = await subtle.importKey('raw', unhex(publicKey, 32), 'Ed25519', false, ['verify']);
  if (!(await subtle.verify('Ed25519', key, unhex(signature, 64), message)))
    throw Error('Invalid admission signature');
}
export async function verifyAdmissionRequest(
  input: unknown,
  expected: PendingState,
): Promise<AdmissionRequest> {
  const r = parseAdmissionRequest(input),
    s = parsePendingState(expected),
    c = r.candidate;
  if (
    s.status !== 'eligible' ||
    s.accountId !== c.accountId ||
    s.confirmation!.recoveryStateDigest !== r.certification.recoveryStateDigest ||
    s.confirmation!.recoveryId !== c.wraps[1]!.id ||
    s.draft!.rPub !== c.wraps[1]!.publicKey
  )
    throw Error('Recovery eligibility changed');
  for (const k of ['principalId', 'workspaceId', 'lineageId', 'authRoot'] as const)
    if (c[k] !== s.draft![k]) throw Error('Admission source changed');
  if (!same(r.recovery, s.draft)) throw Error('Recovery origin changed');
  await verifyCreatingProofs(r);
  return r;
}
export const originMessage = (request: AdmissionRequest) => {
  const { originSignature: _sig, ...body } = parseAdmissionRequest(request);
  return domainMessage('done/genesis-origin/v1', body);
};
async function verifyCreatingProofs(r: AdmissionRequest, checkpoint?: ProofCheckpoint) {
  const c = r.candidate,
    key = r.certification.members[0].sPub;
  for (const k of ['principalId', 'workspaceId', 'lineageId', 'authRoot'] as const)
    if (c[k] !== r.recovery[k]) throw Error('Genesis origin context changed');
  if (
    r.recovery.rPub !== c.wraps[1]!.publicKey ||
    (await proofWork(checkpoint, rootCommitment(r.recovery))) !== r.recovery.rootCommitment ||
    (await proofWork(checkpoint, recoveryStateDigest(r.recovery))) !==
      r.certification.recoveryStateDigest
  )
    throw Error('Genesis recovery binding changed');
  await proofWork(
    checkpoint,
    verifySignature(key, c.signature, await proofWork(checkpoint, genesisMessage(c))),
  );
  await proofWork(
    checkpoint,
    verifySignature(
      key,
      r.certification.signature,
      await proofWork(checkpoint, certificationMessage(r)),
    ),
  );
  await proofWork(
    checkpoint,
    verifySignature(
      r.recovery.bootstrapSigner,
      r.originSignature,
      await proofWork(checkpoint, originMessage(r)),
    ),
  );
}
export async function firstEpoch(
  request: AdmissionRequest,
  pin: AuthorityPin,
  acceptancePublicKey: string,
): Promise<FirstEpoch> {
  const r = parseAdmissionRequest(request),
    c = r.candidate,
    p = parseAuthorityPin(pin);
  if (c.authRoot !== p.authRoot) throw Error('Epoch root changed');
  return {
    v: 1,
    kind: 'first-authorization-epoch',
    pin: p,
    requestDigest: await requestDigest(r),
    accountId: c.accountId,
    principalId: c.principalId,
    workspaceId: c.workspaceId,
    lineageId: c.lineageId,
    epoch: 1,
    parent: ZERO_HEAD,
    generation: 1,
    certification: r.certification,
    owner: c.signer,
    capabilities: ['read', 'write', 'admit', 'manage'],
    acceptancePublicKey: h(acceptancePublicKey),
    heads: [],
  };
}
function parseEpoch(input: unknown): FirstEpoch {
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
    'certification',
    'owner',
    'capabilities',
    'acceptancePublicKey',
    'heads',
  ]);
  if (
    e['v'] !== 1 ||
    e['kind'] !== 'first-authorization-epoch' ||
    e['epoch'] !== 1 ||
    e['generation'] !== 1 ||
    e['parent'] !== ZERO_HEAD ||
    !same(e['capabilities'], ['read', 'write', 'admit', 'manage']) ||
    !same(e['heads'], [])
  )
    throw Error('Unsupported first epoch');
  if (
    typeof e['accountId'] !== 'string' ||
    !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(e['accountId'])
  )
    throw Error('Invalid epoch account');
  return {
    v: 1,
    kind: 'first-authorization-epoch',
    pin: parseAuthorityPin(e['pin']),
    requestDigest: h(e['requestDigest']),
    accountId: e['accountId'],
    principalId: h(e['principalId'], 16),
    workspaceId: h(e['workspaceId'], 16),
    lineageId: h(e['lineageId']),
    epoch: 1,
    parent: ZERO_HEAD,
    generation: 1,
    certification: certification(e['certification']),
    owner: h(e['owner'], 16),
    capabilities: ['read', 'write', 'admit', 'manage'],
    acceptancePublicKey: h(e['acceptancePublicKey']),
    heads: [],
  };
}
export const domainMessage = async (domain: string, body: unknown) =>
  lp(domain, await digest(json(body)));
export const epochMessage = (epoch: FirstEpoch) =>
  domainMessage('done/first-epoch/v1', parseEpoch(epoch));
export const epochHead = async (epoch: FirstEpoch) => digest(await epochMessage(epoch));
export function parseOffer(input: unknown): AdmissionOffer {
  const o = closed(input, ['v', 'kind', 'epoch', 'head', 'signature']);
  if (o['v'] !== 1 || o['kind'] !== 'promotion-offer') throw Error('Unsupported offer');
  return {
    v: 1,
    kind: 'promotion-offer',
    epoch: parseEpoch(o['epoch']),
    head: h(o['head']),
    signature: h(o['signature'], 64),
  };
}
export const offerMessage = (offer: AdmissionOffer) => {
  const { signature: _sig, ...body } = parseOffer(offer);
  return domainMessage('done/promotion-offer/v1', body);
};
export async function verifyOffer(
  input: unknown,
  request: AdmissionRequest,
  pin: AuthorityPin,
  checkpoint?: ProofCheckpoint,
): Promise<AdmissionOffer> {
  await proofWork(checkpoint, verifyCreatingProofs(parseAdmissionRequest(request), checkpoint));
  const o = parseOffer(input),
    expected = await proofWork(checkpoint, firstEpoch(request, pin, o.epoch.acceptancePublicKey));
  if (
    !same(o.epoch, expected) ||
    o.head !== (await proofWork(checkpoint, epochHead(expected))) ||
    hex(pinBytes(o.epoch.pin)) !== hex(pinBytes(parseAuthorityPin(pin)))
  )
    throw Error('Offer target changed');
  await proofWork(
    checkpoint,
    verifySignature(pin.authRoot, o.signature, await proofWork(checkpoint, offerMessage(o))),
  );
  return o;
}
export function parseCompletion(input: unknown): AdmissionCompletion {
  const c = closed(input, ['manifest', 'admission']);
  const m = closed(c['manifest'], [
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
  const a = closed(c['admission'], [
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
  if (
    m['v'] !== 2 ||
    m['epoch'] !== 1 ||
    m['generation'] !== 1 ||
    a['v'] !== 2 ||
    a['derivation'] !== DERIVATION ||
    a['selfAdmitted'] !== 1 ||
    a['decisionParent'] !== ZERO_HEAD
  )
    throw Error('Unsupported semantic admission');
  const mp = coverageParts({ sv: m['sv'] as string, ds: m['ds'] as string });
  const ap = coverageParts({ sv: a['derivedSv'] as string, ds: a['derivedDs'] as string });
  return {
    manifest: {
      v: 2,
      workspaceId: h(m['workspaceId'], 16),
      epoch: 1,
      epochHead: h(m['epochHead']),
      generation: 1,
      checkpointDigest: h(m['checkpointDigest']),
      sv: mp.sv,
      ds: mp.ds,
      headVectorDigest: h(m['headVectorDigest']),
      producer: h(m['producer'], 16),
      signature: h(m['signature'], 64),
    },
    admission: {
      v: 2,
      workspaceId: h(a['workspaceId'], 16),
      checkpointDigest: h(a['checkpointDigest']),
      manifestDigest: h(a['manifestDigest']),
      derivedSv: ap.sv,
      derivedDs: ap.ds,
      headBaselineDigest: h(a['headBaselineDigest']),
      derivation: DERIVATION,
      admittingCredential: h(a['admittingCredential'], 16),
      selfAdmitted: 1,
      decisionParent: ZERO_HEAD,
      signature: h(a['signature'], 64),
    },
  };
}
export async function manifestMessage(m: Omit<CheckpointManifest, 'epoch'> & { epoch: number }) {
  if (m.v !== 2) throw Error('Unsupported checkpoint manifest');
  const hashes = await coverageDigests(m);
  return lp(
    'done/cp-manifest/v2',
    String(m.v),
    m.workspaceId,
    String(m.epoch),
    m.epochHead,
    String(m.generation),
    m.checkpointDigest,
    hashes.sv,
    hashes.ds,
    m.headVectorDigest,
    m.producer,
  );
}
export async function semanticMessage(
  a: Omit<SemanticAdmission, 'selfAdmitted'> & { selfAdmitted: 0 | 1 },
) {
  if (a.v !== 2) throw Error('Unsupported semantic admission');
  const hashes = await coverageDigests({ sv: a.derivedSv, ds: a.derivedDs });
  return lp(
    'done/cp-admit/v2',
    String(a.v),
    a.workspaceId,
    a.checkpointDigest,
    a.manifestDigest,
    hashes.sv,
    hashes.ds,
    a.headBaselineDigest,
    a.derivation,
    a.admittingCredential,
    String(a.selfAdmitted),
    a.decisionParent,
  );
}
export async function completionBodies(
  request: AdmissionRequest,
  offer: AdmissionOffer,
  parts: CoverageParts,
): Promise<AdmissionCompletion> {
  const c = request.candidate,
    head = await digest(lp('done/headvec/v1'));
  const bounded = coverageParts(parts);
  const manifest: CheckpointManifest = {
    v: 2,
    workspaceId: c.workspaceId,
    epoch: 1,
    epochHead: offer.head,
    generation: 1,
    checkpointDigest: await digest(unhex(c.checkpoint.ct, c.checkpoint.ct.length / 2)),
    sv: bounded.sv,
    ds: bounded.ds,
    headVectorDigest: head,
    producer: c.signer,
    signature: '00'.repeat(64),
  };
  return {
    manifest,
    admission: {
      v: 2,
      workspaceId: c.workspaceId,
      checkpointDigest: manifest.checkpointDigest,
      manifestDigest: await digest(await manifestMessage(manifest)),
      derivedSv: manifest.sv,
      derivedDs: manifest.ds,
      headBaselineDigest: head,
      derivation: DERIVATION,
      admittingCredential: c.signer,
      selfAdmitted: 1,
      decisionParent: ZERO_HEAD,
      signature: '00'.repeat(64),
    },
  };
}
export async function verifyCompletion(
  input: unknown,
  request: AdmissionRequest,
  offer: AdmissionOffer,
  parts?: CoverageParts,
  checkpoint?: ProofCheckpoint,
): Promise<AdmissionCompletion> {
  const c = parseCompletion(input),
    expected = await proofWork(checkpoint, completionBodies(request, offer, parts ?? c.manifest));
  expected.manifest.signature = c.manifest.signature;
  expected.admission.signature = c.admission.signature;
  if (!same(c, expected)) throw Error('Semantic coverage or manifest changed');
  const key = request.certification.members[0].sPub;
  await proofWork(
    checkpoint,
    verifySignature(
      key,
      c.manifest.signature,
      await proofWork(checkpoint, manifestMessage(c.manifest)),
    ),
  );
  await proofWork(
    checkpoint,
    verifySignature(
      key,
      c.admission.signature,
      await proofWork(checkpoint, semanticMessage(c.admission)),
    ),
  );
  return c;
}
export async function activationTarget(
  request: AdmissionRequest,
  offer: AdmissionOffer,
  completion: AdmissionCompletion,
) {
  return {
    accountId: request.candidate.accountId,
    requestDigest: await requestDigest(request),
    offerHead: offer.head,
    completionDigest: await digest(json(parseCompletion(completion))),
  };
}
export function parseReceipt(input: unknown): AdmissionReceipt {
  const r = closed(input, [
    'v',
    'kind',
    'offer',
    'completion',
    'epochSignature',
    'activation',
    'signature',
  ]);
  if (r['v'] !== 2 || r['kind'] !== 'promotion-receipt')
    throw Error('Unsupported admission receipt');
  return {
    v: 2,
    kind: 'promotion-receipt',
    offer: parseOffer(r['offer']),
    completion: parseCompletion(r['completion']),
    epochSignature: h(r['epochSignature'], 64),
    activation: parseActivationAuthorization(r['activation']),
    signature: h(r['signature'], 64),
  };
}
export const receiptMessage = (receipt: AdmissionReceipt) => {
  const { signature: _s, ...body } = parseReceipt(receipt);
  return domainMessage('done/promotion-receipt/v2', body);
};
export async function verifyReceipt(
  input: unknown,
  request: AdmissionRequest,
  pin: AuthorityPin,
  parts?: CoverageParts,
  checkpoint?: ProofCheckpoint,
): Promise<AdmissionReceipt> {
  const r = parseReceipt(input);
  await proofWork(checkpoint, verifyOffer(r.offer, request, pin, checkpoint));
  await proofWork(checkpoint, verifyCompletion(r.completion, request, r.offer, parts, checkpoint));
  requireActivationTarget(
    r.activation.context,
    await proofWork(checkpoint, activationTarget(request, r.offer, r.completion)),
    pin,
  );
  await proofWork(
    checkpoint,
    verifySignature(
      pin.authRoot,
      r.epochSignature,
      await proofWork(checkpoint, epochMessage(r.offer.epoch)),
    ),
  );
  await proofWork(
    checkpoint,
    verifySignature(pin.authRoot, r.signature, await proofWork(checkpoint, receiptMessage(r))),
  );
  return r;
}

/** Single-carrier authenticated local progress. The candidate remains in the enclosing marker. */
export interface RetainedAdmission {
  request: AdmissionRequest;
  offer: AdmissionOffer | null;
  completion: AdmissionCompletion | null;
  receipt: AdmissionReceipt | null;
}
export function parseRetainedAdmission(input: unknown, stage: string): RetainedAdmission {
  const r = closed(input, ['request', 'offer', 'completion', 'receipt']);
  const value = {
    request: parseAdmissionRequest(r['request']),
    offer: r['offer'] === null ? null : parseOffer(r['offer']),
    completion: r['completion'] === null ? null : parseCompletion(r['completion']),
    receipt: r['receipt'] === null ? null : parseReceipt(r['receipt']),
  };
  if (
    !(
      (stage === 'admission-requested' && !value.offer && !value.completion && !value.receipt) ||
      (stage === 'admission-offered' && value.offer && value.completion && !value.receipt) ||
      (stage === 'admission-receipted' && value.offer && value.completion && value.receipt)
    )
  )
    throw Error('Incomplete admission progress');
  if (
    value.receipt &&
    (!same(value.offer, value.receipt.offer) || !same(value.completion, value.receipt.completion))
  )
    throw Error('Receipt differs from retained completion');
  return value;
}
