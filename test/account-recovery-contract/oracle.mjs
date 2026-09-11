// Independent Node/OpenSSL construction. No production encoders or WebCrypto calls.
import {
  createHash,
  hkdfSync,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  sign,
  createHmac,
  diffieHellman,
} from 'node:crypto';
export const bytes = (hex) => Buffer.from(hex, 'hex');
export const hash = (input) => createHash('sha256').update(input).digest('hex');
export const lp = (...fields) =>
  Buffer.concat(
    fields.map((value) => {
      const body = Buffer.from(value),
        size = Buffer.alloc(2);
      size.writeUInt16BE(body.length);
      return Buffer.concat([size, body]);
    }),
  );
export const privateKey = (raw, kind) =>
  createPrivateKey({
    key: Buffer.concat([
      bytes(
        kind === 'X25519' ? '302e020100300506032b656e04220420' : '302e020100300506032b657004220420',
      ),
      raw,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
export const publicRaw = (raw, kind) =>
  createPublicKey(privateKey(raw, kind))
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('hex');
export const signature = (message, seed) =>
  sign(null, message, privateKey(bytes(seed), 'Ed25519')).toString('hex');
export const canonical = (value) =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
          .join(',') +
        '}'
    : JSON.stringify(value);
export function seal(key, nonce, aad, payload) {
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  return Buffer.concat([cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
}
export function open(key, nonce, aad, ct) {
  const cipher = createDecipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  cipher.setAuthTag(ct.subarray(-16));
  return Buffer.concat([cipher.update(ct.subarray(0, -16)), cipher.final()]);
}
export function fixture(overrides = {}) {
  const f = {
    code: 'AZC52QK9FEHC6M7VS01JDA3NY',
    principalId: 'pr_01HZXQ7M4K9P2R6T8V0Y3B5N7D',
    workspaceId: 'workspace-recovery',
    lineageId: 'lineage-recovery',
    authRoot: 'ab'.repeat(32),
    salt: '9f3c1a70d4b28e6501fa47c39b0d5e82',
    nonce: '0b1d2e3f4a5b6c7d8e9fa0b1',
    rPrivate: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
    bootstrapSeed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    serviceNonce: Buffer.alloc(32, 0x73).toString('base64url'),
    attemptId: 'attempt-recovery',
    accountId: 'account-recovery',
    recoveryId: 'recovery-id',
    rpId: 'app.done.invalid',
    origin: 'https://app.done.invalid',
    generation: '1',
    generationKey: '42'.repeat(32),
    senderPrivate: '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
    ...overrides,
  };
  f.rPub = publicRaw(bytes(f.rPrivate), 'X25519');
  f.bootstrapSigner = publicRaw(bytes(f.bootstrapSeed), 'Ed25519');
  f.rootFields = ['done/pkg-root/v1', f.workspaceId, f.lineageId, f.authRoot];
  f.root = hash(lp(...f.rootFields));
  f.infoFields = ['done/recovery/v1', f.principalId];
  f.key = Buffer.from(
    hkdfSync('sha256', Buffer.from(f.code), bytes(f.salt), lp(...f.infoFields), 32),
  ).toString('hex');
  f.aadFields = ['done/recovery/v1', f.principalId, '1', f.rPub];
  f.payload = f.rPrivate + f.root + f.bootstrapSeed;
  f.ct = seal(bytes(f.key), bytes(f.nonce), lp(...f.aadFields), bytes(f.payload)).toString('hex');
  f.draft = {
    principalId: f.principalId,
    workspaceId: f.workspaceId,
    lineageId: f.lineageId,
    authRoot: f.authRoot,
    v: 1,
    rootCommitment: f.root,
    rPub: f.rPub,
    bootstrapSigner: f.bootstrapSigner,
    envelope: { v: 1, salt: f.salt, nonce: f.nonce, ct: f.ct },
  };
  f.envelopeFields = ['done/recovery-envelope/v1', '1', f.salt, f.nonce, f.ct];
  f.envelopeDigest = hash(lp(...f.envelopeFields));
  f.stateFields = [
    'done/recovery-state/v1',
    '0',
    f.rPub,
    f.envelopeDigest,
    f.root,
    f.bootstrapSigner,
  ];
  f.stateDigest = hash(lp(...f.stateFields));
  f.draftFields = [
    'done/account-recovery-draft/v1',
    '1',
    f.principalId,
    f.workspaceId,
    f.lineageId,
    f.authRoot,
    f.stateDigest,
  ];
  f.draftDigest = hash(lp(...f.draftFields));
  f.finalizeFields = [
    'done/account/finalize-recovery/v1',
    f.attemptId,
    f.accountId,
    f.recoveryId,
    f.draftDigest,
    f.rpId,
    f.origin,
    f.serviceNonce,
  ];
  f.challenge = bytes(hash(lp(...f.finalizeFields))).toString('base64url');
  f.confirmFields = ['done/account-recovery-confirm/v1', f.challenge, f.draftDigest];
  f.keyCheckFields = ['done/recovery-key-check/v1', f.root];
  f.generationFields = ['done/gen-wrap/v1', f.workspaceId, f.lineageId, f.authRoot, f.generation];
  return f;
}
export function hpke(f, info = lp(...f.generationFields)) {
  const sender = privateKey(bytes(f.senderPrivate), 'X25519');
  const recipient = createPublicKey(privateKey(bytes(f.rPrivate), 'X25519'));
  const enc = bytes(publicRaw(bytes(f.senderPrivate), 'X25519'));
  const dh = diffieHellman({ privateKey: sender, publicKey: recipient });
  const kem = Buffer.concat([Buffer.from('KEM'), bytes('0020')]),
    suite = Buffer.concat([Buffer.from('HPKE'), bytes('002000010002')]);
  const extract = (domain, salt, label, ikm) =>
    createHmac('sha256', salt)
      .update(Buffer.concat([Buffer.from('HPKE-v1'), domain, Buffer.from(label), ikm]))
      .digest();
  const expand = (domain, key, label, context, n) =>
    createHmac('sha256', key)
      .update(
        Buffer.concat([
          Buffer.from([0, n]),
          Buffer.from('HPKE-v1'),
          domain,
          Buffer.from(label),
          context,
          Buffer.from([1]),
        ]),
      )
      .digest()
      .subarray(0, n);
  const empty = Buffer.alloc(0);
  const shared = expand(
    kem,
    extract(kem, empty, 'eae_prk', dh),
    'shared_secret',
    Buffer.concat([enc, bytes(f.rPub)]),
    32,
  );
  const context = Buffer.concat([
    Buffer.from([0]),
    extract(suite, empty, 'psk_id_hash', empty),
    extract(suite, empty, 'info_hash', info),
  ]);
  const secret = extract(suite, shared, 'secret', empty),
    key = expand(suite, secret, 'key', context, 32),
    nonce = expand(suite, secret, 'base_nonce', context, 12);
  return {
    enc: enc.toString('hex'),
    ct: seal(key, nonce, empty, bytes(f.generationKey)).toString('hex'),
    key: key.toString('hex'),
    nonce: nonce.toString('hex'),
  };
}
export function cases(f) {
  const result = [];
  const add = (id, kind, fields, calculate, extra = {}) => {
    const message = lp(...fields),
      out = calculate(message);
    result.push({
      id,
      kind,
      signer: kind === 'signature' ? 'recovery-bootstrap' : null,
      fields,
      expected: {
        messageHex: message.toString('hex'),
        resultHex: out,
        ...(kind === 'signature' ? { signature: out } : {}),
        ...extra,
      },
      negatives: fields.map((value, i) => {
        const changed = fields.with(i, value + '~');
        return {
          field: i,
          fields: changed,
          messageHex: lp(...changed).toString('hex'),
          resultHex: calculate(lp(...changed)),
        };
      }),
      encodedBindingControls: fields.map((_, i) => {
        const removed = fields.filter((_, j) => j !== i),
          m = lp(...removed);
        return { omitted: i, messageHex: m.toString('hex'), resultHex: calculate(m) };
      }),
    });
  };
  add('recovery-kdf', 'kdf', f.infoFields, (info) =>
    Buffer.from(hkdfSync('sha256', Buffer.from(f.code), bytes(f.salt), info, 32)).toString('hex'),
  );
  add(
    'recovery-seal',
    'aead',
    f.aadFields,
    (aad) => seal(bytes(f.key), bytes(f.nonce), aad, bytes(f.payload)).toString('hex'),
    { payloadHex: f.payload },
  );
  for (const [id, fields] of [
    ['recovery-root', f.rootFields],
    ['recovery-envelope', f.envelopeFields],
    ['recovery-state', f.stateFields],
    ['recovery-draft', f.draftFields],
  ])
    add(id, 'digest', fields, hash);
  add('recovery-key-check', 'signature', f.keyCheckFields, (message) =>
    signature(message, f.bootstrapSeed),
  );
  add('recovery-confirm', 'signature', f.confirmFields, (message) =>
    signature(message, f.bootstrapSeed),
  );
  for (const op of ['register', 'confirm-registration', 'authenticate'])
    add(
      'account-challenge-' + op,
      'digest',
      ['done/account/' + op + '/v1', f.attemptId, f.accountId, f.rpId, f.origin, f.serviceNonce],
      hash,
    );
  add('account-challenge-finalize', 'digest', f.finalizeFields, hash);
  add('recovery-generation-wrap', 'aead', f.generationFields, (info) => hpke(f, info).ct, {
    ...hpke(f),
    generationKey: f.generationKey,
  });
  return result;
}
export function corpus() {
  const f = fixture();
  return {
    v: 1,
    scope:
      'Private v1 recovery preparation; synthetic secrets, not recovery replacement or total loss',
    fixture: f,
    vectors: cases(f),
  };
}
