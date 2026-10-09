/** Independent Node/OpenSSL oracle for the private v2 key-domain correction. */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  hkdfSync,
  sign,
  verify,
} from 'node:crypto';
import { deepStrictEqual } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { aadFields, assertedNames, refuses, reportAudit } from './lib/aad-coverage.mjs';
const old = JSON.parse(readFileSync(new URL('../test/vectors/envelope.json', import.meta.url)));
const lp = (...fields) =>
  Buffer.concat(
    fields.map((s) => {
      const body = Buffer.from(s),
        length = Buffer.alloc(2);
      length.writeUInt16BE(body.length);
      return Buffer.concat([length, body]);
    }),
  );
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const privateKey = createPrivateKey({
  format: 'der',
  type: 'pkcs8',
  key: Buffer.from('302e020100300506032b657004220420' + old.keys.device.seed, 'hex'),
});
const header = (i) => ({
  v: String(i.v),
  workspace_id: i.workspace_id,
  credential_id: i.credential_id,
  epoch: String(i.epoch),
  gen: String(i.gen),
  seq: String(i.seq),
});
const bindings = (i, digest) => ({
  aad: { label: 'done/env/v2', ...header(i) },
  hkdf_info: {
    label: 'done/envelope/v2',
    workspace_id: i.workspace_id,
    credential_id: i.credential_id,
    gen: String(i.gen),
  },
  signature_message: { label: 'done/env-sig/v2', ...header(i), nonce: i.nonce, digest },
});
const encode = (construction, named) => lp(...aadFields('private envelope ' + construction, named));
const derive = (i, info) =>
  Buffer.from(hkdfSync('sha256', Buffer.from(i.k_g, 'hex'), Buffer.alloc(0), info, 32));
const vectors = [
  ...old.vectors,
  {
    ...old.vectors[0],
    name: 'other-credential',
    inputs: { ...old.vectors[0].inputs, credential_id: 'cred_other' },
  },
].map((v) => {
  const i = { ...v.inputs, v: 2 },
    fields = Object.values(header(i)),
    info = encode('hkdf_info', bindings(i).hkdf_info);
  const key = derive(i, info);
  const aad = encode('aad', bindings(i).aad),
    body = Buffer.from(v.derived.body, 'hex'),
    cipher = createCipheriv('aes-256-gcm', key, Buffer.from(i.nonce, 'hex'));
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]),
    digest = createHash('sha256').update(ct).digest(),
    message = encode('signature_message', bindings(i, digest.toString('hex')).signature_message),
    sig = sign(null, message, privateKey),
    wire = Buffer.concat([
      lp('done/envelope-wire/v2', ...fields),
      Buffer.from(i.nonce, 'hex'),
      digest,
      u32(ct.length),
      ct,
      sig,
    ]);
  return {
    name: v.name,
    inputs: i,
    derived: {
      hkdf_info: info.toString('hex'),
      aad: aad.toString('hex'),
      body: body.toString('hex'),
      signature_message: message.toString('hex'),
    },
    expected: {
      ciphertext: ct.toString('hex'),
      digest: digest.toString('hex'),
      signature: sig.toString('hex'),
      wire: wire.toString('hex'),
    },
  };
});
// Change only one construction at a time. In particular, AAD changes retain
// the baseline key even when that header field also occurs in HKDF info.
// Re-sealing above under each audit elision makes a missing binding observable.
const base = vectors[0],
  named = bindings(base.inputs, base.expected.digest);
const must_fail = [];
for (const [construction, values] of Object.entries(named)) {
  for (const [field, value] of Object.entries(values)) {
    const changed =
      field === 'nonce' || field === 'digest'
        ? (value[0] === '0' ? '1' : '0') + value.slice(1)
        : value + '-changed';
    const encoded = encode(construction, { ...values, [field]: changed });
    const negative = {
      name: `${construction}-${field}`,
      base: base.name,
      isolates: `private envelope ${construction}.${field}`,
      construction,
      field,
      value: changed,
      encoded: encoded.toString('hex'),
    };
    must_fail.push(negative);
    await refuses(negative.name, () => {
      if (construction === 'signature_message') {
        if (!verify(null, encoded, privateKey, Buffer.from(base.expected.signature, 'hex')))
          throw Error('Signature mismatch');
        return;
      }
      const info =
        construction === 'hkdf_info' ? encoded : Buffer.from(base.derived.hkdf_info, 'hex');
      const aad = construction === 'aad' ? encoded : Buffer.from(base.derived.aad, 'hex');
      const cipher = createDecipheriv(
        'aes-256-gcm',
        derive(base.inputs, info),
        Buffer.from(base.inputs.nonce, 'hex'),
      );
      const ct = Buffer.from(base.expected.ciphertext, 'hex');
      cipher.setAAD(aad);
      cipher.setAuthTag(ct.subarray(-16));
      cipher.update(ct.subarray(0, -16));
      cipher.final();
    });
  }
}
deepStrictEqual(assertedNames().sort(), must_fail.map((v) => v.name).sort());
reportAudit(must_fail);
const output =
  JSON.stringify(
    {
      version: 2,
      generated_by: 'scripts/generate-private-envelope-vectors.mjs',
      contract: 'docs/account-outbound.md',
      keys: old.keys,
      vectors,
      must_fail,
    },
    null,
    2,
  ) + '\n';
const path = new URL('../test/vectors/private-envelope.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw Error('Private envelope vectors are stale');
} else writeFileSync(path, output);
console.log(
  `Private envelope vectors checked: five independent Node/OpenSSL cases and ${must_fail.length} isolating negatives.`,
);
