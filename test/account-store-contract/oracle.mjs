// Independent Node crypto/noble oracle. No production encoders, parsers or key helpers.
import { createHash, hkdfSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
export const bytes = (s) => new Uint8Array(Buffer.from(s, 'hex'));
export const hex = (b) => Buffer.from(b).toString('hex');
export const lp = (...values) =>
  Buffer.concat(
    values.map((s) => {
      if (!s.isWellFormed()) throw Error('Invalid Unicode');
      const b = Buffer.from(s, 'utf8'),
        n = Buffer.alloc(2);
      n.writeUInt16BE(b.length);
      return Buffer.concat([n, b]);
    }),
  );
export const digest = (b) => createHash('sha256').update(b).digest();
export const scope = {
  principalId: 'principal-é',
  workspaceId: 'workspace-🙂',
  storeId: '12'.repeat(16),
};
export const kg = 'a3'.repeat(32);
export const keyInfo = (s, journal = false) =>
  journal ? lp('done/journal/v1', s.workspaceId) : lp('done/store/v1', s.workspaceId, s.storeId);
export const key = (s, secret = kg, journal = false) =>
  new Uint8Array(hkdfSync('sha256', bytes(secret), Buffer.alloc(0), keyInfo(s, journal), 32));
export const nameMessage = (s) => lp('done/store-name/v1', s.principalId, s.workspaceId);
export const name = (s) => 'done.' + hex(digest(nameMessage(s)).subarray(0, 16));
export const storageKey = (s, writer = '34'.repeat(16), ordinal = 1) =>
  `done.pending-update.${encodeURIComponent(name(s))}.${s.storeId}.${writer}.${String(ordinal).padStart(16, '0')}`;
export const recordFields = (s, r) => [
  'done/store/v1',
  s.principalId,
  s.workspaceId,
  s.storeId,
  String(r.v),
  String(r.gen),
  String(r.seq),
  r.kind,
];
export const recordAAD = (s, r) => lp(...recordFields(s, r));
export const journalFields = (s, gen, sk) => ['done/jrnl/v1', s.workspaceId, String(gen), sk];
export const journalAAD = (s, gen, sk) => lp(...journalFields(s, gen, sk));
export function aes(k, nonce, aad, plain) {
  const c = createCipheriv('aes-256-gcm', k, nonce);
  c.setAAD(aad);
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}
export function openAES(k, nonce, aad, ct) {
  const c = createDecipheriv('aes-256-gcm', k, nonce);
  c.setAAD(aad);
  c.setAuthTag(ct.subarray(-16));
  return Buffer.concat([c.update(ct.subarray(0, -16)), c.final()]);
}
export const xseal = (k, nonce, aad, plain) => xchacha20poly1305(k, nonce, aad).encrypt(plain);
export const xopen = (k, nonce, aad, ct) => xchacha20poly1305(k, nonce, aad).decrypt(ct);
export const encode = (gen, nonce, ct) => {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(gen);
  return '2:' + Buffer.concat([header, nonce, ct]).toString('base64');
};
export const fixtures = () => [
  ...['update', 'state', 'heads', 'outbound'].map((kind, i) => ({
    id: 'store-record-' + kind,
    kind: 'aead',
    family: 'record',
    scope,
    kg,
    record: { v: 1, gen: 1, seq: i ? Number.MAX_SAFE_INTEGER - i : 1, kind },
    nonce: '02030405060708090a0b0c0d',
    plaintext: i ? '00ff0123456789ab' : '',
  })),
  ...[1, 256, 0xffffffff].map((gen, i) => ({
    id: 'journal-carrier-' + gen,
    kind: 'aead',
    family: 'journal',
    scope,
    kg,
    gen,
    storageKey: storageKey(scope, '34'.repeat(16), i + 1),
    nonce: '00'.repeat(23) + '01',
    plaintext: i ? '00ff0123456789ab' : '',
  })),
];
export function corpus() {
  const vectors = [];
  for (const [id, s] of [
    ['unicode', scope],
    ['boundary', { ...scope, principalId: 'ab', workspaceId: 'c' }],
  ]) {
    const message = nameMessage(s);
    vectors.push({
      id: 'store-name-' + id,
      kind: 'digest',
      signer: null,
      input: s,
      expected: { messageHex: hex(message), resultHex: hex(digest(message)), name: name(s) },
      negatives: ['principalId', 'workspaceId'].map((field) => ({
        field,
        scope: { ...s, [field]: s[field] + 'x' },
        name: name({ ...s, [field]: s[field] + 'x' }),
      })),
    });
  }
  for (const journal of [false, true]) {
    vectors.push({
      id: journal ? 'journal-key' : 'store-key',
      kind: 'kdf',
      signer: null,
      input: { scope, kg },
      expected: {
        messageHex: hex(keyInfo(scope, journal)),
        resultHex: hex(key(scope, kg, journal)),
      },
      negatives: [...(journal ? ['workspaceId'] : ['workspaceId', 'storeId']), 'kg'].map(
        (field) => {
          const s = field === 'kg' ? scope : { ...scope, [field]: scope[field] + 'x' },
            secret = field === 'kg' ? 'b4'.repeat(32) : kg;
          return { field, scope: s, kg: secret, resultHex: hex(key(s, secret, journal)) };
        },
      ),
    });
  }
  for (const f of fixtures()) {
    const journal = f.family === 'journal',
      values = journal
        ? journalFields(f.scope, f.gen, f.storageKey)
        : recordFields(f.scope, f.record),
      k = key(f.scope, f.kg, journal),
      n = bytes(f.nonce),
      p = bytes(f.plaintext),
      seal = journal ? xseal : aes,
      message = lp(...values),
      ct = seal(k, n, message, p);
    vectors.push({
      id: f.id,
      kind: f.kind,
      signer: null,
      input: f,
      expected: {
        messageHex: hex(message),
        resultHex: hex(ct),
        ...(journal ? { carrier: encode(f.gen, n, ct) } : {}),
      },
      negatives: values.map((v, index) => {
        const changed = values.with(index, v + 'x');
        return { index, fields: changed, messageHex: hex(lp(...changed)) };
      }),
      encodedBindingControls: values.map((v, index) => {
        const changed = values.with(index, v + 'x'),
          without = (a) => a.filter((_, i) => i !== index);
        return {
          index,
          omittedHex: hex(lp(...without(values))),
          changedOmittedHex: hex(lp(...without(changed))),
        };
      }),
    });
  }
  return {
    v: 1,
    scope: 'D5 store and journal bytes; inherited envelope/custody and WASM qualification excluded',
    inherited: ['record-format', 'journal-aead'].map((n) => ({
      path: `test/vectors/${n}.json`,
      sha256: hex(digest(readFileSync(`test/vectors/${n}.json`))),
    })),
    vectors,
  };
}
