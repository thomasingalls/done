import {
  generateKeyPairSync,
  randomBytes,
  sign,
  createHash,
  createPublicKey,
  verify,
} from 'node:crypto';
import assert from 'node:assert/strict';
import { ready as admitted } from '../account-service-delivery/fixtures.mjs';
export { mutate } from '../account-service-delivery/fixtures.mjs';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const lp = (...parts) =>
  Buffer.concat(
    parts.flatMap((v) => {
      const b = Buffer.from(v),
        n = Buffer.alloc(2);
      n.writeUInt16BE(b.length);
      return [n, b];
    }),
  );
export const nonce = (c) =>
  createHash('sha256')
    .update(lp('done/enrollment-preparation-assertion/v1', JSON.stringify(c)))
    .digest('base64url');
export const possessionMessage = (c) =>
  lp('done/enrollment-preparation-possession/v1', JSON.stringify(c));
export const fresh = () => randomBytes(32).toString('base64url');
export const canonical = (v) => JSON.stringify(sort(v));
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
export async function ready(t, options = {}) {
  const x = await admitted(t, options);
  const candidate = () => {
    const s = generateKeyPairSync('ed25519'),
      w = generateKeyPairSync('x25519');
    const pub = (key) => key.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
    return {
      key: s.privateKey,
      input: {
        retryKey: fresh(),
        candidate: {
          v: 1,
          workspaceId: x.workspace,
          lineageId: x.offer.epoch.lineageId,
          head: x.offer.head,
          credentialId: randomBytes(16).toString('hex'),
          sPub: pub(s.publicKey),
          wPub: pub(w.publicKey),
        },
      },
    };
  };
  const call = (op, input) => x.authority.owner.enrollment(x.f.core, op, input);
  const prove = (entry, view, edits = {}) => ({
    retryKey: entry.input.retryKey,
    attemptId: view.challenge.context.attemptId,
    response: x.account.key.assert(
      { options: { challenge: nonce(view.challenge.context) } },
      edits,
    ),
    possession: sign(null, possessionMessage(view.challenge.context), entry.key).toString('hex'),
  });
  return { ...x, candidate, enroll: call, prove };
}
export const census = (x) =>
  canonical(
    [
      'accounts',
      'attempts',
      'credentials',
      'ceremonies',
      'recovery',
      'promotions',
      'delivery_decisions',
    ].map((table) => [table, x.f.rows(table)]),
  );
export function inspect(view, x, entry) {
  const c = view.challenge.context;
  assert.deepEqual(c.pin, x.authority.pin);
  assert.deepEqual(c.candidate, entry.input.candidate);
  assert.equal(c.accountId, x.account.result.accountId);
  assert.equal(c.passkeyId, x.account.key.id);
  assert.equal(c.epoch, 1);
  assert.equal(c.certifiedSetDigest, hash(JSON.stringify(x.request.certification)));
  assert.equal(c.recoveryStateDigest, x.request.certification.recoveryStateDigest);
  const key = createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + c.pin.authRoot, 'hex'),
    type: 'spki',
    format: 'der',
  });
  assert(
    verify(
      null,
      lp('done/enrollment-preparation-challenge/v1', JSON.stringify(c)),
      key,
      Buffer.from(view.challenge.signature, 'hex'),
    ),
  );
  if (view.receipt) {
    const { signature, ...r } = view.receipt;
    assert.deepEqual(r.context, c);
    assert.equal(r.kind, 'enrollment-preparation-receipt');
    assert.equal(r.expiresAt - r.preparedAt, 600000);
    assert(
      verify(
        null,
        lp('done/enrollment-preparation-receipt/v1', JSON.stringify(r)),
        key,
        Buffer.from(signature, 'hex'),
      ),
    );
  }
}
