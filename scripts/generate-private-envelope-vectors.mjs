/** Independent Node/OpenSSL oracle for the private v2 key-domain correction. */
import { createCipheriv, createHash, createPrivateKey, hkdfSync, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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
const vectors = [
  ...old.vectors,
  {
    ...old.vectors[0],
    name: 'other-credential',
    inputs: { ...old.vectors[0].inputs, credential_id: 'cred_other' },
  },
].map((v) => {
  const i = { ...v.inputs, v: 2 },
    fields = ['2', i.workspace_id, i.credential_id, String(i.epoch), String(i.gen), String(i.seq)],
    info = lp('done/envelope/v2', i.workspace_id, i.credential_id, String(i.gen));
  const key = Buffer.from(hkdfSync('sha256', Buffer.from(i.k_g, 'hex'), Buffer.alloc(0), info, 32));
  const aad = lp('done/env/v2', ...fields),
    body = Buffer.from(v.derived.body, 'hex'),
    cipher = createCipheriv('aes-256-gcm', key, Buffer.from(i.nonce, 'hex'));
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]),
    digest = createHash('sha256').update(ct).digest(),
    message = lp('done/env-sig/v2', ...fields, i.nonce, digest.toString('hex')),
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
const output =
  JSON.stringify(
    {
      version: 2,
      generated_by: 'scripts/generate-private-envelope-vectors.mjs',
      contract: 'docs/account-outbound.md',
      keys: old.keys,
      vectors,
    },
    null,
    2,
  ) + '\n';
const path = new URL('../test/vectors/private-envelope.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw Error('Private envelope vectors are stale');
} else writeFileSync(path, output);
console.log('Private envelope vectors checked: five independent Node/OpenSSL cases.');
