// Independent Node/OpenSSL byte construction; no production codec or owner is imported.
import { createPrivateKey, createPublicKey, createCipheriv, hkdfSync, sign } from 'node:crypto';
export const b = (h) => Buffer.from(h, 'hex');
export const hex = (bytes) => Buffer.from(bytes).toString('hex');
export const pkcs8 = '302e020100300506032b657004220420';
export const spki = '302a300506032b6570032100';
export const privateKey = (seed) =>
  createPrivateKey({ key: b(pkcs8 + seed), format: 'der', type: 'pkcs8' });
export const publicHex = (seed) =>
  hex(createPublicKey(privateKey(seed)).export({ format: 'der', type: 'spki' }).subarray(-32));
export const lp = (fields) =>
  Buffer.concat(
    fields.map((s) => {
      const value = Buffer.from(s),
        n = Buffer.alloc(2);
      n.writeUInt16BE(value.length);
      return Buffer.concat([n, value]);
    }),
  );
export const pinFields = (p) => [
  'done/service-authority-pin/v1',
  '1',
  p.serviceId,
  p.origin,
  p.rpId,
  p.authRoot,
];
export const rootInfo = (p) => [
  'done/service-authority-seal/v1',
  p.serviceId,
  p.origin,
  p.rpId,
  p.authRoot,
];
export const custodyInfo = (p) => ['done/acceptance-custody/v1', p.serviceId, p.authRoot];
export const acceptanceAAD = (p, id, pub) => [...pinFields(p), 'done/acceptance-seal/v1', id, pub];
export const derive = (i) => hex(hkdfSync('sha256', b(i.input), b(i.salt), lp(i.info), 32));
export const encrypt = (i) => {
  const c = createCipheriv('aes-256-gcm', b(i.key), b(i.nonce));
  c.setAAD(lp(i.aad));
  return hex(Buffer.concat([c.update(b(i.plaintext)), c.final(), c.getAuthTag()]));
};
export const rootSeal = (pin, operator, salt, nonce, seed) => ({
  pin,
  salt,
  nonce,
  ct: encrypt({
    key: derive({ input: operator, salt, info: rootInfo(pin) }),
    nonce,
    plaintext: seed,
    aad: pinFields(pin),
  }),
});
export const acceptanceSeal = (pin, operator, id, salt, nonce, seed, pub = publicHex(seed)) => ({
  v: 1,
  publicKey: pub,
  salt,
  nonce,
  ct: encrypt({
    key: derive({
      input: derive({ input: operator, salt: '', info: custodyInfo(pin) }),
      salt,
      info: ['done/acceptance-seal/v1'],
    }),
    nonce,
    plaintext: seed,
    aad: acceptanceAAD(pin, id, pub),
  }),
});
export const proof = (pin, seed, nonce) => ({
  v: 1,
  pin,
  nonce,
  signature: hex(
    sign(
      null,
      lp([
        'done/service-authority-bootstrap/v1',
        '1',
        pin.serviceId,
        pin.origin,
        pin.rpId,
        pin.authRoot,
        nonce,
      ]),
      privateKey(seed),
    ),
  ),
});
export function fixture() {
  const operator = '63'.repeat(32),
    rootSeed = '61'.repeat(32),
    acceptanceSeed = '62'.repeat(32);
  const pin = {
    v: 1,
    serviceId: '71'.repeat(16),
    origin: 'https://custody.done.invalid',
    rpId: 'custody.done.invalid',
    authRoot: publicHex(rootSeed),
  };
  const id = '72'.repeat(32),
    root = rootSeal(pin, operator, '73'.repeat(16), '74'.repeat(12), rootSeed),
    acceptance = acceptanceSeal(
      pin,
      operator,
      id,
      '75'.repeat(16),
      '76'.repeat(12),
      acceptanceSeed,
    );
  return {
    operator,
    rootSeed,
    acceptanceSeed,
    pin,
    id,
    root,
    acceptance,
    proof: proof(pin, rootSeed, '77'.repeat(32)),
  };
}
const change = (s) =>
  typeof s === 'number'
    ? s + 1
    : typeof s === 'string' && /^(?:[0-9a-f]{2})+$/.test(s)
      ? (s[0] === 'a' ? 'b' : 'a') + s.slice(1)
      : s + '~';
const paths = (value) =>
  Object.entries(value).flatMap(([k, v]) => (Array.isArray(v) ? v.map((_, i) => [k, i]) : [[k]]));
const alter = (input, path, omit = false) => {
  const result = structuredClone(input);
  if (path.length === 1) result[path[0]] = result[path[0]] === '' ? '01' : change(result[path[0]]);
  else if (omit) result[path[0]].splice(path[1], 1);
  else result[path[0]][path[1]] = change(result[path[0]][path[1]]);
  return result;
};
export function corpus() {
  const f = fixture(),
    vectors = [];
  function add(id, kind, inputs) {
    const result = (i) => (kind === 'kdf' ? derive(i) : kind === 'aead' ? encrypt(i) : i.bytes);
    const message = (i) =>
      kind === 'kdf' ? hex(lp(i.info)) : kind === 'aead' ? hex(lp(i.aad)) : i.bytes;
    const inputsPaths = paths(inputs);
    vectors.push({
      id,
      kind,
      signer: null,
      inputs,
      expected: { messageHex: message(inputs), resultHex: result(inputs) },
      negatives: inputsPaths.map((path) => {
        const value = alter(inputs, path);
        return {
          field: path.join('.'),
          inputs: value,
          messageHex: message(value),
          resultHex: result(value),
        };
      }),
      encodedBindingControls: inputsPaths
        .filter((p) => p.length === 2)
        .map((path) => {
          const value = alter(inputs, path, true);
          return {
            field: path.join('.'),
            inputs: value,
            messageHex: message(value),
            resultHex: result(value),
          };
        }),
    });
  }
  const rootKdf = { input: f.operator, salt: f.root.salt, info: rootInfo(f.pin) };
  const custodyKdf = { input: f.operator, salt: '', info: custodyInfo(f.pin) };
  const acceptanceKdf = {
    input: derive(custodyKdf),
    salt: f.acceptance.salt,
    info: ['done/acceptance-seal/v1'],
  };
  add('service-root-key', 'kdf', rootKdf);
  add('service-root-seal', 'aead', {
    key: derive(rootKdf),
    nonce: f.root.nonce,
    plaintext: f.rootSeed,
    aad: pinFields(f.pin),
  });
  add('service-acceptance-custody-key', 'kdf', custodyKdf);
  add('service-acceptance-seal-key', 'kdf', acceptanceKdf);
  add('service-acceptance-seal', 'aead', {
    key: derive(acceptanceKdf),
    nonce: f.acceptance.nonce,
    plaintext: f.acceptanceSeed,
    aad: acceptanceAAD(f.pin, f.id, f.acceptance.publicKey),
  });
  add('service-seed-export', 'carrier', { bytes: pkcs8 + f.rootSeed });
  add('service-public-export', 'carrier', { bytes: spki + f.pin.authRoot });
  add('service-acceptance-carrier', 'carrier', {
    bytes: hex(Buffer.from(JSON.stringify(f.acceptance))),
  });
  return {
    v: 1,
    scope:
      'D1 private service custody; synthetic keys only; carrier bytes are fixture representations, not new wire formats',
    fixture: f,
    vectors,
  };
}
