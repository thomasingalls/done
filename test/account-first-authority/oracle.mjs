// Reviewed private byte formats, encoded without production serializers or crypto helpers.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { hash, lp, ordered, message, schema } from '../account-crypto-prep/oracle.mjs';
export { hash, lp, ordered, message, schema };
export const key = (seed) =>
  createPrivateKey({
    key: Buffer.from('302e020100300506032b657004220420' + seed, 'hex'),
    type: 'pkcs8',
    format: 'der',
  });
export const publicHex = (k) =>
  createPublicKey(k).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
export const signed = (k, b) => sign(null, b, k).toString('hex');
export const checks = (k, b, s) => verify(null, b, createPublicKey(k), Buffer.from(s, 'hex'));
export const pinFields = (p) => [
  'done/service-authority-pin/v1',
  String(p.v),
  p.serviceId,
  p.origin,
  p.rpId,
  p.authRoot,
];
export const memberFields = (m) => ['done/certified-members/v1', m.id, m.wPub, m.sPub];
export const certFields = (r) => [
  'done/certified-set-approval/v1',
  r.certification.approver,
  'done/certified-set/v1',
  '1',
  r.candidate.workspaceId,
  r.candidate.lineageId,
  '0',
  '1',
  hash(lp(...memberFields(r.certification.members[0]))),
  r.certification.recoveryStateDigest,
];
export const manifestFields = (m) => [
  'done/cp-manifest/v2',
  String(m.v),
  m.workspaceId,
  String(m.epoch),
  m.epochHead,
  String(m.generation),
  m.checkpointDigest,
  hash(Buffer.from(m.sv, 'hex')),
  hash(Buffer.from(m.ds, 'hex')),
  m.headVectorDigest,
  m.producer,
];
export const semanticFields = (a) => [
  'done/cp-admit/v2',
  String(a.v),
  a.workspaceId,
  a.checkpointDigest,
  a.manifestDigest,
  hash(Buffer.from(a.derivedSv, 'hex')),
  hash(Buffer.from(a.derivedDs, 'hex')),
  a.headBaselineDigest,
  a.derivation,
  a.admittingCredential,
  String(a.selfAdmitted),
  a.decisionParent,
];
export const bindingFields = (b) => [
  'done/slotbind/v1',
  String(b.v),
  b.accountId,
  b.principalId,
  b.rpId,
  String(b.epoch),
  b.credId,
  b.publicKey,
];
export function pendingBody(s) {
  return {
    v: s.v,
    accountId: s.accountId,
    attemptId: s.attemptId,
    status: s.status,
    draft: s.draft === null ? null : ordered('recovery', s.draft),
    confirmation:
      s.confirmation === null
        ? null
        : {
            recoveryId: s.confirmation.recoveryId,
            receiptId: s.confirmation.receiptId,
            draftDigest: s.confirmation.draftDigest,
            recoveryStateDigest: s.confirmation.recoveryStateDigest,
          },
  };
}
const sort = (v) =>
  Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
export const canonical = (v) => JSON.stringify(sort(v));
export function recoveryDigests(d) {
  const root = hash(lp('done/pkg-root/v1', d.workspaceId, d.lineageId, d.authRoot));
  const envelope = lp(
    'done/recovery-envelope/v1',
    '1',
    d.envelope.salt,
    d.envelope.nonce,
    d.envelope.ct,
  );
  const state = hash(
    lp('done/recovery-state/v1', '0', d.rPub, hash(envelope), root, d.bootstrapSigner),
  );
  return {
    root,
    state,
    draft: hash(
      lp(
        'done/account-recovery-draft/v1',
        '1',
        d.principalId,
        d.workspaceId,
        d.lineageId,
        d.authRoot,
        state,
      ),
    ),
  };
}
export function fixedFixture() {
  const seeds = Object.fromEntries(
    ['authority', 'device', 'bootstrap', 'acceptance', 'passkey'].map((name, i) => [
      name,
      (i + 1).toString(16).padStart(2, '0').repeat(32),
    ]),
  );
  const keys = Object.fromEntries(Object.entries(seeds).map(([name, s]) => [name, key(s)]));
  const pub = Object.fromEntries(Object.entries(keys).map(([name, k]) => [name, publicHex(k)]));
  const b64 = (n) => Buffer.alloc(32, n).toString('base64url'),
    signature = '00'.repeat(64);
  const pin = {
    v: 1,
    serviceId: '10'.repeat(16),
    origin: 'https://app.done.invalid',
    rpId: 'app.done.invalid',
    authRoot: pub.authority,
  };
  const recovery = {
    principalId: '11'.repeat(16),
    workspaceId: '22'.repeat(16),
    lineageId: '33'.repeat(32),
    authRoot: pin.authRoot,
    v: 1,
    rootCommitment: '',
    rPub: '44'.repeat(32),
    bootstrapSigner: pub.bootstrap,
    envelope: { v: 1, salt: '45'.repeat(16), nonce: '46'.repeat(12), ct: '47'.repeat(112) },
  };
  const rd = recoveryDigests(recovery);
  recovery.rootCommitment = rd.root;
  const candidate = {
    v: 1,
    kind: 'promotion-genesis-candidate',
    preparation: '48'.repeat(32),
    accountId: b64(49),
    principalId: recovery.principalId,
    workspaceId: recovery.workspaceId,
    lineageId: recovery.lineageId,
    authRoot: pin.authRoot,
    generation: 1,
    proposedEpoch: 1,
    signer: '55'.repeat(16),
    actors: [
      { id: recovery.principalId, kind: 'human', credential: '55'.repeat(16) },
      { id: 'system', kind: 'system', credential: '55'.repeat(16) },
    ],
    coverage: { derivation: 'yjs-13.6.31-snapshot-v1', snapshot: '0000', heads: [] },
    checkpoint: { v: 1, salt: '66'.repeat(16), nonce: '67'.repeat(12), ct: '68'.repeat(18) },
    wraps: [
      {
        recipient: 'device',
        id: '69'.repeat(16),
        publicKey: '6a'.repeat(32),
        enc: '6b'.repeat(32),
        ct: '6c'.repeat(48),
      },
      {
        recipient: 'recovery',
        id: b64(50),
        publicKey: recovery.rPub,
        enc: '6d'.repeat(32),
        ct: '6e'.repeat(48),
      },
    ],
    signature,
  };
  candidate.signature = signed(keys.device, message('candidate', candidate));
  const request = {
    v: 1,
    candidate,
    certification: {
      members: [{ id: candidate.signer, wPub: candidate.wraps[0].publicKey, sPub: pub.device }],
      recoveryStateDigest: rd.state,
      approver: candidate.signer,
      signature,
    },
    recovery,
    originSignature: signature,
  };
  request.certification.signature = signed(keys.device, lp(...certFields(request)));
  request.originSignature = signed(keys.bootstrap, message('request', request));
  const epoch = {
    v: 1,
    kind: 'first-authorization-epoch',
    pin,
    requestDigest: hash(JSON.stringify(ordered('request', request))),
    accountId: candidate.accountId,
    principalId: candidate.principalId,
    workspaceId: candidate.workspaceId,
    lineageId: candidate.lineageId,
    epoch: 1,
    parent: '00'.repeat(32),
    generation: 1,
    certification: request.certification,
    owner: candidate.signer,
    capabilities: ['read', 'write', 'admit', 'manage'],
    acceptancePublicKey: pub.acceptance,
    heads: [],
  };
  const offer = {
    v: 1,
    kind: 'promotion-offer',
    epoch,
    head: hash(message('epoch', epoch)),
    signature,
  };
  offer.signature = signed(keys.authority, message('offer', offer));
  const head = hash(lp('done/headvec/v1'));
  const manifest = {
    v: 2,
    workspaceId: candidate.workspaceId,
    epoch: 1,
    epochHead: offer.head,
    generation: 1,
    checkpointDigest: hash(Buffer.from(candidate.checkpoint.ct, 'hex')),
    sv: '00',
    ds: '0000',
    headVectorDigest: head,
    producer: candidate.signer,
    signature,
  };
  manifest.signature = signed(keys.device, lp(...manifestFields(manifest)));
  const admission = {
    v: 2,
    workspaceId: manifest.workspaceId,
    checkpointDigest: manifest.checkpointDigest,
    manifestDigest: hash(lp(...manifestFields(manifest))),
    derivedSv: manifest.sv,
    derivedDs: manifest.ds,
    headBaselineDigest: head,
    derivation: 'yjs-13.6.31-sv-ds-v1',
    admittingCredential: candidate.signer,
    selfAdmitted: 1,
    decisionParent: '00'.repeat(32),
    signature,
  };
  admission.signature = signed(keys.device, lp(...semanticFields(admission)));
  const completion = { manifest, admission };
  const context = {
    v: 1,
    pin,
    accountId: candidate.accountId,
    requestDigest: epoch.requestDigest,
    offerHead: offer.head,
    completionDigest: hash(JSON.stringify(ordered('completion', completion))),
    credentialId: b64(51),
    nonce: '70'.repeat(32),
    expiresAt: 2000000000000,
  };
  const challenge = {
    v: 1,
    kind: 'promotion-activation-challenge',
    context,
    signature: signed(keys.authority, message('activationContext', context)),
  };
  const assertionNonce = hash(
    lp('done/promotion-activation/v1', hash(JSON.stringify(ordered('activationContext', context)))),
  );
  const cd = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: Buffer.from(assertionNonce, 'hex').toString('base64url'),
      origin: pin.origin,
      crossOrigin: false,
    }),
  );
  const auth = Buffer.concat([Buffer.from(hash(pin.rpId), 'hex'), Buffer.from([5, 0, 0, 0, 7])]);
  const assertion = {
    id: context.credentialId,
    rawId: context.credentialId,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: cd.toString('base64url'),
      authenticatorData: auth.toString('base64url'),
      signature: Buffer.from(
        signed(keys.passkey, Buffer.concat([auth, Buffer.from(hash(cd), 'hex')])),
        'hex',
      ).toString('base64url'),
      userHandle: candidate.accountId,
    },
  };
  const receipt = {
    v: 2,
    kind: 'promotion-receipt',
    offer,
    completion,
    epochSignature: signed(keys.authority, message('epoch', epoch)),
    activation: { context, proofHash: hash(canonical(assertion)) },
    signature,
  };
  receipt.signature = signed(keys.authority, message('receipt', receipt));
  const pending = {
    v: 1,
    accountId: candidate.accountId,
    attemptId: b64(52),
    status: 'eligible',
    draft: recovery,
    confirmation: {
      recoveryId: candidate.wraps[1].id,
      receiptId: b64(53),
      draftDigest: rd.draft,
      recoveryStateDigest: rd.state,
    },
  };
  const binding = {
    v: 1,
    accountId: candidate.accountId,
    principalId: candidate.principalId,
    rpId: pin.rpId,
    epoch: 1,
    credId: context.credentialId,
    publicKey: createPublicKey(keys.passkey)
      .export({ type: 'spki', format: 'der' })
      .toString('hex'),
  };
  return {
    seeds,
    keys,
    pub,
    pin,
    recovery,
    candidate,
    request,
    epoch,
    offer,
    completion,
    challenge,
    assertion,
    receipt,
    pending,
    binding,
    nonce: '71'.repeat(32),
  };
}

export function jsonBody(type, value) {
  const body = ordered(type, value),
    omit = schema.messages.find((m) => m.object === type)?.omit;
  if (omit) delete body[omit];
  return body;
}
export function traceJson(label, body) {
  const json = JSON.stringify(body),
    fields = [label, hash(json)];
  return { json, fields, messageHex: lp(...fields).toString('hex') };
}
export function traceFields(fields) {
  return { fields, messageHex: lp(...fields).toString('hex') };
}
export function leafPaths(value, path = []) {
  if (value && typeof value === 'object' && Object.keys(value).length)
    return Object.entries(value).flatMap(([k, v]) => leafPaths(v, [...path, k]));
  return [path];
}
export const at = (value, path) => path.reduce((v, k) => v[k], value);
export function replace(value, path, replacement) {
  const out = structuredClone(value);
  let v = out;
  for (const k of path.slice(0, -1)) v = v[k];
  v[path.at(-1)] = replacement;
  return out;
}
export const changed = (v) =>
  typeof v === 'number'
    ? v + 1
    : typeof v === 'string'
      ? v.length
        ? (v[0] === '0' ? '1' : '0') + v.slice(1)
        : 'x'
      : Array.isArray(v)
        ? ['changed']
        : v === null
          ? false
          : !v;
export function omit(value, path) {
  const out = structuredClone(value);
  let v = out;
  for (const k of path.slice(0, -1)) v = v[k];
  delete v[path.at(-1)];
  return out;
}
