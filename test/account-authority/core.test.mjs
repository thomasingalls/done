import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createPublicKey, verify } from 'node:crypto';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { verifyPinnedAuthority, parseAuthorityPin } from '../../account-protocol/authority.ts';
import { authorityFixture, nonce, policy } from './fixtures.mjs';

test('durable encrypted root, independent proof bytes and close/restart', async (t) => {
  const f = authorityFixture(t),
    n = nonce(),
    proof = f.owner.prove({ nonce: n });
  const lp = (...values) =>
    Buffer.concat(
      values.map((s) => {
        const value = Buffer.from(s),
          size = Buffer.alloc(2);
        size.writeUInt16BE(value.length);
        return Buffer.concat([size, value]);
      }),
    );
  const message = lp(
    'done/service-authority-bootstrap/v1',
    '1',
    f.pin.serviceId,
    f.pin.origin,
    f.pin.rpId,
    f.pin.authRoot,
    n,
  );
  const pub = createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(f.pin.authRoot, 'hex'),
    ]),
    format: 'der',
    type: 'spki',
  });
  assert(verify(null, message, pub, Buffer.from(proof.signature, 'hex')));
  assert.deepEqual(await verifyPinnedAuthority(f.pin, n, proof), f.pin);
  assert(!readFileSync(f.path).includes(f.key));
  assert.throws(() => PrivateAuthority.initialize(f.path, policy, f.key), /EEXIST/);
  f.owner.close();
  assert.throws(() => f.owner.prove({ nonce: n }), /closed/);
  f.restart();
  assert.deepEqual(f.owner.prove({ nonce: n }), proof);
  assert.deepEqual(PrivateAuthority.recoverPin(f.path, f.key), f.pin);
});

test('missing, damaged, wrong-factor, substituted-root and unknown-version states never create a new root', async (t) => {
  const f = authorityFixture(t),
    missing = join(f.dir, 'missing.sqlite');
  assert.throws(() => PrivateAuthority.open(missing, f.pin, f.key));
  assert.equal(existsSync(missing), false);
  assert.throws(() => PrivateAuthority.open(f.path, f.pin, randomBytes(32)));
  assert.throws(
    () => PrivateAuthority.open(f.path, { ...f.pin, authRoot: 'ab'.repeat(32) }, f.key),
    /pin changed/,
  );
  const db = new DatabaseSync(f.path),
    row = db.prepare('SELECT * FROM authority').get();
  db.prepare('UPDATE authority SET ct=?').run('00'.repeat(48));
  assert.throws(() => PrivateAuthority.open(f.path, f.pin, f.key));
  db.prepare('UPDATE authority SET ct=?').run(row.ct);
  db.exec('PRAGMA user_version=999');
  assert.throws(() => PrivateAuthority.open(f.path, f.pin, f.key), /Unsupported/);
  db.exec('PRAGMA user_version=1');
  db.close();
  f.restart();
  assert.deepEqual(f.owner.pin, f.pin);
});

test('root proof refuses changed nonce, policy, pin and signature; service accepts only a nonce request', async (t) => {
  const f = authorityFixture(t),
    g = authorityFixture(t),
    n = nonce(),
    proof = f.owner.prove({ nonce: n });
  for (const bad of [
    { ...proof, nonce: nonce() },
    { ...proof, signature: '00'.repeat(64) },
    { ...proof, pin: { ...proof.pin, serviceId: 'ab'.repeat(16) } },
    g.owner.prove({ nonce: n }),
    { ...proof, grant: true },
  ])
    await assert.rejects(verifyPinnedAuthority(f.pin, n, bad));
  for (const input of [{ nonce: n, operation: 'sign' }, { nonce: 'ab' }, { nonce: 42 }, null])
    assert.throws(() => f.owner.prove(input));
  for (const bad of [
    { ...f.pin, v: 2 },
    { ...f.pin, origin: 'https://evil.invalid' },
    { ...f.pin, authRoot: f.pin.authRoot.toUpperCase() },
  ])
    assert.throws(() => parseAuthorityPin(bad));
});

test('private files only and initialization failures preserve a classified prior outcome', async (t) => {
  const f = authorityFixture(t),
    alias = join(f.dir, 'alias.sqlite');
  symlinkSync(f.path, alias);
  assert.throws(() => PrivateAuthority.open(alias, f.pin, f.key), /regular file/);
  chmodSync(f.path, 0o644);
  assert.throws(() => PrivateAuthority.open(f.path, f.pin, f.key), /private regular/);
  chmodSync(f.path, 0o600);
  for (const boundary of ['before-commit', 'after-commit']) {
    const path = join(f.dir, boundary + '.sqlite');
    assert.throws(() =>
      PrivateAuthority.initialize(path, policy, f.key, (point) => {
        if (point === boundary) throw Error('lost process');
      }),
    );
    assert.throws(() => PrivateAuthority.initialize(path, policy, f.key), /EEXIST/);
    if (boundary === 'before-commit') assert.throws(() => PrivateAuthority.recoverPin(path, f.key));
    else {
      const pin = PrivateAuthority.recoverPin(path, f.key),
        owner = PrivateAuthority.open(path, pin, f.key);
      const n = nonce();
      assert.deepEqual(await verifyPinnedAuthority(pin, n, owner.prove({ nonce: n })), pin);
      owner.close();
    }
  }
});
