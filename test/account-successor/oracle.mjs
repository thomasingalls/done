// Independent fixed inputs and Node crypto; no production encoders or verifiers.
import {
  fixedFixture,
  key,
  publicHex,
  signed,
  hash,
  lp,
  leafPaths,
  at,
  changed,
  replace,
} from '../account-first-authority/oracle.mjs';
export { signed, hash, lp, leafPaths, at, changed, replace };
export const message = (purpose, value) => lp(purpose, hash(JSON.stringify(value)));
export const unsigned = (value) => {
  const { signature: _signature, ...body } = value;
  return body;
};
export function fixture(position = 0, link = '00'.repeat(32), options = {}) {
  const f = fixedFixture(options),
    nextKey = key('18'.repeat(32));
  const base = { pin: f.pin, request: f.request, receipt: f.receipt };
  const context = {
    v: 1,
    pin: f.pin,
    accountId: f.epoch.accountId,
    attemptId: Buffer.alloc(32, 91).toString('base64url'),
    candidate: {
      v: 1,
      workspaceId: f.epoch.workspaceId,
      lineageId: f.epoch.lineageId,
      head: f.offer.head,
      credentialId: '77'.repeat(16),
      sPub: publicHex(nextKey),
      wPub: options.joiningPublicKey ?? '78'.repeat(32),
    },
    epoch: 1,
    certifiedSetDigest: hash(JSON.stringify(f.request.certification)),
    recoveryStateDigest: f.request.certification.recoveryStateDigest,
    passkeyId: f.receipt.activation.context.credentialId,
    nonce: '79'.repeat(32),
    expiresAt: 601000,
  };
  const receiptBody = {
    v: 1,
    kind: 'enrollment-preparation-receipt',
    context,
    receiptId: Buffer.alloc(32, 92).toString('base64url'),
    preparedAt: 2000,
    expiresAt: 602000,
    assertionHash: '81'.repeat(32),
    possessionHash: '82'.repeat(32),
  };
  const preparation = {
    ...receiptBody,
    signature: signed(
      f.keys.authority,
      lp('done/enrollment-preparation-receipt/v1', JSON.stringify(receiptBody)),
    ),
  };
  const old = f.request.certification.members[0],
    c = context.candidate;
  const epoch = {
    v: 1,
    kind: 'device-admission-epoch',
    pin: f.pin,
    requestDigest: f.epoch.requestDigest,
    accountId: f.epoch.accountId,
    principalId: f.epoch.principalId,
    workspaceId: f.epoch.workspaceId,
    lineageId: f.epoch.lineageId,
    epoch: 2,
    parent: f.offer.head,
    generation: 1,
    acceptancePublicKey: f.epoch.acceptancePublicKey,
    preparation,
    certified: {
      parentEpoch: 0,
      nextEpoch: 1,
      digest: context.certifiedSetDigest,
      value: f.request.certification,
    },
    roster: [
      {
        ...old,
        principalId: f.epoch.principalId,
        state: 'certified',
        capabilities: ['read', 'write', 'admit', 'manage'],
      },
      {
        id: c.credentialId,
        wPub: c.wPub,
        sPub: c.sPub,
        principalId: f.epoch.principalId,
        state: 'pending',
        capabilities: [],
      },
    ].sort((a, b) => (a.id < b.id ? -1 : 1)),
    heads: [
      { credentialId: old.id, position, link },
      { credentialId: c.credentialId, position: 0, link: '00'.repeat(32) },
    ].sort((a, b) => (a.credentialId < b.credentialId ? -1 : 1)),
  };
  const seal = (e) => ({
    v: 1,
    kind: 'device-admission-successor',
    epoch: e,
    head: hash(message('done/admission-successor/v1', e)),
    signature: signed(f.keys.authority, message('done/admission-successor/v1', e)),
  });
  const successor = seal(epoch),
    held = { epoch: 1, head: f.offer.head };
  const discover = (a = held, nonce = '83'.repeat(32)) => {
    const b = {
      v: 1,
      kind: 'authority-discovery-request',
      pin: f.pin,
      workspaceId: f.epoch.workspaceId,
      lineageId: f.epoch.lineageId,
      credentialId: old.id,
      epoch: a.epoch,
      head: a.head,
      nonce,
      expiresAt: 61000,
    };
    return {
      ...b,
      signature: signed(f.keys.device, message('done/authority-discovery-request/v1', b)),
    };
  };
  const respond = (request, s = successor) => {
    const b = {
      v: 1,
      kind: 'authority-discovery-response',
      requestHash: hash(JSON.stringify(request)),
      successor: s,
    };
    return {
      ...b,
      signature: signed(f.keys.authority, message('done/authority-discovery-response/v1', b)),
    };
  };
  return {
    ...f,
    base,
    nextKey,
    context,
    preparation,
    epoch,
    successor,
    held,
    seal,
    discover,
    respond,
  };
}
export function published() {
  const f = fixture(),
    request = f.discover(),
    response = f.respond(request);
  const trace = (purpose, body) => ({
    purpose,
    body,
    json: JSON.stringify(body),
    bodyHash: hash(JSON.stringify(body)),
    messageHex: message(purpose, body).toString('hex'),
  });
  return {
    v: 1,
    note: 'Public test seeds only. Pure admission continuity, not live consumption or delivery evidence.',
    authoritySeed: f.seeds.authority,
    creatingSeed: f.seeds.device,
    candidateSeed: '18'.repeat(32),
    base: f.base,
    held: f.held,
    successor: f.successor,
    request,
    response,
    traces: [
      trace('done/admission-successor/v1', f.epoch),
      trace('done/authority-discovery-request/v1', unsigned(request)),
      trace('done/authority-discovery-response/v1', unsigned(response)),
    ],
  };
}
