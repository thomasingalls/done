import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { AcceptanceCustody } from '../../account-service/acceptance.ts';
const operator = new Uint8Array(32).fill(31);
const policy = { origin: 'https://custody.done.invalid', rpId: 'custody.done.invalid' };
const pin = { v: 1, ...policy, serviceId: '11'.repeat(16), authRoot: '22'.repeat(32) };
const id = '33'.repeat(32);
const generate = nodeCrypto.generateKeyPairSync;
function mutatedPair(t, kind, fault) {
  const raw = [];
  const mock = t.mock.method(nodeCrypto, 'generateKeyPairSync', (...args) => {
    const pair = generate(...args),
      target = kind === 'private' ? pair.privateKey : pair.publicKey;
    const original = target.export.bind(target);
    t.mock.method(target, 'export', (options) => {
      let value = original(options);
      if (fault === 'oid') {
        value[kind === 'private' ? 11 : 8] ^= 1;
      }
      if (fault === 'prefix') {
        value[0] ^= 1;
      }
      if (fault === 'short') {
        value = value.subarray(1);
      }
      if (fault === 'extra') {
        value = Buffer.concat([Buffer.from([0]), value]);
      }
      if (kind === 'private') raw.push(value);
      return value;
    });
    if (kind === 'public') {
      const exportPrivate = pair.privateKey.export.bind(pair.privateKey);
      t.mock.method(pair.privateKey, 'export', (options) => {
        const value = exportPrivate(options);
        raw.push(value);
        return value;
      });
    }
    return pair;
  });
  syncBuiltinESMExports();
  return {
    raw,
    restore() {
      mock.mock.restore();
      syncBuiltinESMExports();
    },
  };
}
for (const owner of ['root', 'acceptance'])
  test(
    owner +
      ' creation refuses malformed PKCS#8/SPKI exports before sealing and clears private exports',
    (t) => {
      const dir = mkdtempSync(join(tmpdir(), 'done-custody-export-'));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      const custody = new AcceptanceCustody(operator, pin);
      t.after(() => custody.close());
      for (const kind of ['private', 'public'])
        for (const fault of ['oid', 'prefix', 'short', 'extra']) {
          const m = mutatedPair(t, kind, fault);
          let seals = 0;
          const cipher = nodeCrypto.createCipheriv;
          const mock = t.mock.method(nodeCrypto, 'createCipheriv', (...args) => {
            seals++;
            return cipher(...args);
          });
          syncBuiltinESMExports();
          try {
            assert.throws(
              () =>
                owner === 'root'
                  ? PrivateAuthority.initialize(
                      join(dir, kind + '-' + fault + '.sqlite'),
                      policy,
                      operator,
                    )
                  : custody.create(id),
              /Unexpected Ed25519 (PKCS#8|SPKI) export/,
              owner + ':' + kind + ':' + fault,
            );
            assert.equal(seals, 0);
            assert(
              m.raw.every((b) => b.every((v) => v === 0)),
              'export clearing ' + kind + ':' + fault,
            );
          } finally {
            mock.mock.restore();
            m.restore();
            syncBuiltinESMExports();
          }
        }
    },
  );
test('acceptance create refuses after close before generating or exporting a new seed', (t) => {
  const custody = new AcceptanceCustody(operator, pin);
  custody.close();
  let generated = 0;
  const mock = t.mock.method(nodeCrypto, 'generateKeyPairSync', (...args) => {
    generated++;
    return generate(...args);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => custody.create(id), /closed/);
    assert.equal(generated, 0);
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});
test('acceptance create clears an exported seed if randomness fails before derivation', (t) => {
  const custody = new AcceptanceCustody(operator, pin);
  t.after(() => custody.close());
  const m = mutatedPair(t, 'private', 'none');
  const mock = t.mock.method(nodeCrypto, 'randomBytes', () => {
    throw Error('synthetic RNG failure');
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => custody.create(id), /synthetic RNG failure/);
    assert.equal(m.raw.length, 1);
    assert(
      m.raw[0].every((v) => v === 0),
      'private export retained after failure',
    );
  } finally {
    mock.mock.restore();
    m.restore();
    syncBuiltinESMExports();
  }
});
