import {
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  createHmac,
  hkdfSync,
  createDecipheriv,
} from 'node:crypto';
const b = (v) => Buffer.from(v, 'hex');
const cat = (...v) => Buffer.concat(v);
const ascii = (v) => Buffer.from(v);
export const lp = (...values) =>
  cat(
    ...values.flatMap((v) => {
      const s = ascii(String(v)),
        n = Buffer.alloc(2);
      n.writeUInt16BE(s.length);
      return [n, s];
    }),
  );
export const privateX = (raw) =>
  createPrivateKey({
    key: cat(b('302e020100300506032b656e04220420'), raw),
    format: 'der',
    type: 'pkcs8',
  });
export function gcm(key, nonce, ct, aad = Buffer.alloc(0)) {
  const d = createDecipheriv('aes-256-gcm', key, nonce);
  d.setAAD(aad);
  d.setAuthTag(ct.subarray(-16));
  return cat(d.update(ct.subarray(0, -16)), d.final());
}
// Independent Node/OpenSSL implementation, also checked against the existing published AES-256 vector.
export function unwrap(wrap, raw, pub, info) {
  const enc = b(wrap.enc),
    peer = createPublicKey({
      key: cat(b('302a300506032b656e032100'), enc),
      format: 'der',
      type: 'spki',
    });
  const dh = diffieHellman({ privateKey: privateX(raw), publicKey: peer });
  const kem = cat(ascii('KEM'), b('0020')),
    suite = cat(ascii('HPKE'), b('002000010002'));
  const extract = (s, salt, label, ikm) =>
    createHmac('sha256', salt)
      .update(cat(ascii('HPKE-v1'), s, ascii(label), ikm))
      .digest();
  const expand = (s, prk, label, context, n) =>
    createHmac('sha256', prk)
      .update(
        cat(Buffer.from([0, n]), ascii('HPKE-v1'), s, ascii(label), context, Buffer.from([1])),
      )
      .digest()
      .subarray(0, n);
  const empty = Buffer.alloc(0),
    shared = expand(kem, extract(kem, empty, 'eae_prk', dh), 'shared_secret', cat(enc, pub), 32);
  const ctx = cat(
    Buffer.from([0]),
    extract(suite, empty, 'psk_id_hash', empty),
    extract(suite, empty, 'info_hash', info),
  );
  const secret = extract(suite, shared, 'secret', empty);
  return gcm(
    expand(suite, secret, 'key', ctx, 32),
    expand(suite, secret, 'base_nonce', ctx, 12),
    b(wrap.ct),
  );
}
export function openCandidate(candidate, draft, code) {
  const factor = code.replaceAll('-', '');
  const payload = gcm(
    Buffer.from(
      hkdfSync(
        'sha256',
        ascii(factor),
        b(draft.envelope.salt),
        lp('done/recovery/v1', draft.principalId),
        32,
      ),
    ),
    b(draft.envelope.nonce),
    b(draft.envelope.ct),
    lp('done/recovery/v1', draft.principalId, '1', draft.rPub),
  );
  const key = unwrap(
    candidate.wraps[1],
    payload.subarray(0, 32),
    b(draft.rPub),
    lp(
      'done/gen-wrap/v1',
      candidate.workspaceId,
      candidate.lineageId,
      candidate.authRoot,
      candidate.generation,
    ),
  );
  const cp = candidate.checkpoint;
  return gcm(
    Buffer.from(
      hkdfSync('sha256', key, b(cp.salt), lp('done/checkpoint/v1', candidate.workspaceId), 32),
    ),
    b(cp.nonce),
    b(cp.ct),
    lp('done/cp/v1', '1', candidate.workspaceId, candidate.generation, candidate.proposedEpoch),
  );
}
