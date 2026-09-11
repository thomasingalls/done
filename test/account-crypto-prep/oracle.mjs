// Independently reconstruct the reviewed schema. No production parser/LP/hash helper is imported.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createHash,
  createPublicKey,
  createPrivateKey,
  hkdfSync,
  createDecipheriv,
} from 'node:crypto';
export const schema = JSON.parse(
  readFileSync(new URL('../../docs/account-crypto/first-authority.json', import.meta.url)),
);
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const lp = (...fields) =>
  Buffer.concat(
    fields.map((s) => {
      assert.match(s, /^[\x20-\x7e]*$/);
      const b = Buffer.from(s, 'ascii'),
        size = Buffer.alloc(2);
      size.writeUInt16BE(b.length);
      return Buffer.concat([size, b]);
    }),
  );
export function ordered(type, input) {
  const { fields, children } = schema.objects[type];
  assert.deepEqual(Object.keys(input).sort(), [...fields].sort(), type + ' closed fields');
  return Object.fromEntries(
    fields.map((field) => {
      const child = children[field],
        value = input[field];
      return [
        field,
        child
          ? child.endsWith('[]')
            ? value.map((v) => ordered(child.slice(0, -2), v))
            : ordered(child, value)
          : value,
      ];
    }),
  );
}
export function message(type, input) {
  const { label, omit } = schema.messages.find((m) => m.object === type);
  const body = ordered(type, input);
  if (omit) delete body[omit];
  return lp(label, hash(JSON.stringify(body)));
}
export function reverseProperties(value) {
  if (Array.isArray(value)) return value.map(reverseProperties);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reverseProperties(v)]),
    );
  return value;
}
export const edPublic = (hex) =>
  createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + hex, 'hex'),
    format: 'der',
    type: 'spki',
  });
export function derivePublic(raw, kind) {
  const prefix =
    kind === 'x25519' ? '302e020100300506032b656e04220420' : '302e020100300506032b657004220420';
  const key = createPrivateKey({
    key: Buffer.concat([Buffer.from(prefix, 'hex'), raw]),
    format: 'der',
    type: 'pkcs8',
  });
  return createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
}
export function openRecovery(code, principal, pub, seal) {
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(code, 'ascii'),
      Buffer.from(seal.salt, 'hex'),
      lp('done/recovery/v1', principal),
      32,
    ),
  );
  try {
    const ct = Buffer.from(seal.ct, 'hex'),
      d = createDecipheriv('aes-256-gcm', key, Buffer.from(seal.nonce, 'hex'));
    d.setAAD(lp('done/recovery/v1', principal, '1', pub));
    d.setAuthTag(ct.subarray(-16));
    return Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]);
  } finally {
    key.fill(0);
  }
}
