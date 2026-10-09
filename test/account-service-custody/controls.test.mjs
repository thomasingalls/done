import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import nodeCrypto, { createPublicKey, verify } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import {
  PrivateAuthority,
  AcceptanceCustody,
  bytes,
  temporary,
  install,
  deterministic,
} from './runtime.mjs';
import { fixture, rootSeal, acceptanceSeal, privateKey, b, lp } from './oracle.mjs';
import { verifyPinnedAuthority } from '../../account-protocol/authority.ts';
const f = fixture();
const write = (name, evidence) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'control-' + name + '.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }
};
async function mutant(t, name, path, from, to) {
  const parent = resolve('test-results/account-service-custody-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, name + '-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['account-service', 'account-protocol']) {
    mkdirSync(join(dir, folder));
    for (const file of readdirSync(folder).filter((n) => n.endsWith('.ts'))) {
      let source = readFileSync(join(folder, file), 'utf8');
      if (join(folder, file) === path) {
        assert.equal(source.split(from).length, 2, 'Unique ' + name + ' guard');
        source = source.replace(from, to);
      }
      writeFileSync(join(dir, folder, file), source);
    }
  }
  const root = (await import(pathToFileURL(join(dir, 'account-service/authority.ts')).href))
    .PrivateAuthority;
  const acceptance = (await import(pathToFileURL(join(dir, 'account-service/acceptance.ts')).href))
    .AcceptanceCustody;
  return { root, acceptance };
}

test('omitting expected-root pin equality lets the same stored root sign for a different service identity', async (t) => {
  const m = await mutant(
    t,
    'expected-pin',
    'account-service/authority.ts',
    "if (canonical(pin) !== canonical(expected)) throw Error('Authority pin changed');",
    'void expected;',
  );
  const path = join(temporary(t), 'root.sqlite');
  install(path, f.root);
  const other = { ...f.pin, serviceId: 'ab'.repeat(16) };
  assert.throws(() => PrivateAuthority.open(path, other, bytes(f.operator)), /pin changed/);
  const owner = m.root.open(path, other, bytes(f.operator));
  try {
    const proof = owner.prove({ nonce: f.proof.nonce });
    assert.deepEqual(await verifyPinnedAuthority(other, f.proof.nonce, proof), other);
  } finally {
    owner.close();
  }
  write('expected-pin', {
    baseline: 'refused',
    mutant: 'valid proof for different expected service ID from original stored root',
    productionGuardRemoved: true,
  });
});

test('omitting root private/public correspondence releases an authentically encrypted wrong signing seed', async (t) => {
  const m = await mutant(
    t,
    'root-pair',
    'account-service/authority.ts',
    'if (ed25519PublicHex(createPublicKey(signing)) !== pin.authRoot)',
    'if (false)',
  );
  const path = join(temporary(t), 'root.sqlite'),
    seed = '65'.repeat(32);
  install(path, rootSeal(f.pin, f.operator, f.root.salt, f.root.nonce, seed));
  assert.throws(
    () => PrivateAuthority.open(path, f.pin, bytes(f.operator)),
    /private\/public mismatch/,
  );
  const owner = m.root.open(path, f.pin, bytes(f.operator));
  try {
    const p = owner.prove({ nonce: f.proof.nonce });
    await assert.rejects(verifyPinnedAuthority(f.pin, f.proof.nonce, p), /Invalid authority proof/);
    assert(
      verify(
        null,
        lp([
          'done/service-authority-bootstrap/v1',
          '1',
          f.pin.serviceId,
          f.pin.origin,
          f.pin.rpId,
          f.pin.authRoot,
          f.proof.nonce,
        ]),
        createPublicKey(privateKey(seed)),
        b(p.signature),
      ),
    );
  } finally {
    owner.close();
  }
  write('root-pair', {
    baseline: 'refused',
    mutant: 'wrong seed used for proof; client still rejects its signature',
    authenticatedPayload: true,
  });
});

test('omitting acceptance correspondence allows a valid tag with a wrong seed to pass custody', async (t) => {
  const m = await mutant(
    t,
    'acceptance-pair',
    'account-service/acceptance.ts',
    'if (ed25519PublicHex(createPublicKey(privateKey)) !== pub)',
    'if (false)',
  );
  const seal = acceptanceSeal(
    f.pin,
    f.operator,
    f.id,
    f.acceptance.salt,
    f.acceptance.nonce,
    '65'.repeat(32),
    f.acceptance.publicKey,
  );
  const good = new AcceptanceCustody(bytes(f.operator), f.pin),
    bad = new m.acceptance(bytes(f.operator), f.pin);
  try {
    assert.throws(() => good.check(seal, f.id, seal.publicKey), /key mismatch/);
    bad.check(seal, f.id, seal.publicKey);
  } finally {
    good.close();
    bad.close();
  }
  write('acceptance-pair', {
    baseline: 'refused',
    mutant: 'wrong seed passes actual custody callback',
    authenticatedPayload: true,
  });
});

test('omitting the proposal ID from actual acceptance AAD permits cross-proposal reuse', async (t) => {
  const m = await mutant(
    t,
    'proposal',
    'account-service/acceptance.ts',
    "lp('done/acceptance-seal/v1', id, pub)",
    "lp('done/acceptance-seal/v1', pub)",
  );
  const good = new AcceptanceCustody(bytes(f.operator), f.pin),
    bad = new m.acceptance(bytes(f.operator), f.pin);
  try {
    const seal = deterministic(t, f.acceptanceSeed, [f.acceptance.salt, f.acceptance.nonce], () =>
      bad.create(f.id),
    );
    assert.throws(() => good.check(seal, 'ab'.repeat(32), seal.publicKey));
    bad.check(seal, 'ab'.repeat(32), seal.publicKey);
  } finally {
    good.close();
    bad.close();
  }
  write('proposal', {
    baseline: 'refused',
    mutant: 'seal opened under different proposal',
    actualAadOmission: true,
  });
});

for (const kind of ['private', 'public'])
  test(
    'omitting ' + kind + ' export-format assertion recreates suffix-only extraction',
    async (t) => {
      const from =
        kind === 'private'
          ? 'if (bytes.length !== 48 || !bytes.subarray(0, 16).equals(seedPrefix))'
          : 'if (bytes.length !== 44 || !bytes.subarray(0, 12).equals(publicPrefix))';
      const m = await mutant(
        t,
        'export-' + kind,
        'account-service/keyEncoding.ts',
        from,
        'if (false)',
      );
      for (const owner of [PrivateAuthority, m.root]) {
        const pair = {
            privateKey: privateKey(f.rootSeed),
            publicKey: createPublicKey(privateKey(f.rootSeed)),
          },
          target = kind === 'private' ? pair.privateKey : pair.publicKey,
          original = target.export.bind(target);
        const exported = t.mock.method(target, 'export', (options) => {
          const value = original(options);
          value[kind === 'private' ? 11 : 8] ^= 1;
          return value;
        });
        const generate = t.mock.method(nodeCrypto, 'generateKeyPairSync', () => pair);
        syncBuiltinESMExports();
        const path = join(temporary(t), 'root.sqlite');
        try {
          const fn = () =>
            owner.initialize(path, { origin: f.pin.origin, rpId: f.pin.rpId }, bytes(f.operator));
          if (owner === PrivateAuthority) assert.throws(fn, /Unexpected Ed25519/);
          else {
            const pin = fn(),
              opened = owner.open(path, pin, bytes(f.operator));
            opened.close();
          }
        } finally {
          exported.mock.restore();
          generate.mock.restore();
          syncBuiltinESMExports();
        }
      }
      write('export-' + kind, {
        baseline: 'refused',
        mutant: 'malformed provider OID accepted and root cold-opened',
        providerAssumption: true,
      });
    },
  );

test('omitting exported-seed cleanup recreates retention after a failed random draw', async (t) => {
  const m = await mutant(
    t,
    'cleanup',
    'account-service/acceptance.ts',
    'key?.fill(0);\n      raw.fill(0);',
    'key?.fill(0);',
  );
  for (const Owner of [AcceptanceCustody, m.acceptance]) {
    const c = new Owner(bytes(f.operator), f.pin),
      key = privateKey(f.acceptanceSeed),
      original = key.export.bind(key);
    let exported;
    const ex = t.mock.method(key, 'export', (options) => (exported = original(options))),
      gen = t.mock.method(nodeCrypto, 'generateKeyPairSync', () => ({
        privateKey: key,
        publicKey: createPublicKey(key),
      })),
      rng = t.mock.method(nodeCrypto, 'randomBytes', () => {
        throw Error('synthetic random failure');
      });
    syncBuiltinESMExports();
    try {
      assert.throws(() => c.create(f.id), /synthetic random failure/);
      assert.equal(
        exported.every((v) => v === 0),
        Owner === AcceptanceCustody,
      );
    } finally {
      c.close();
      ex.mock.restore();
      gen.mock.restore();
      rng.mock.restore();
      syncBuiltinESMExports();
    }
  }
  write('cleanup', {
    baseline: 'export buffer zeroed',
    mutant: 'export buffer retained after failure',
    boundedBufferClaim: true,
  });
});

test('omitting the early close guard recreates key generation after close', async (t) => {
  const m = await mutant(
    t,
    'closed',
    'account-service/acceptance.ts',
    "create(id: string): AcceptanceSeal {\n    if (!this.#key) throw Error('Acceptance custody closed');",
    'create(id: string): AcceptanceSeal {',
  );
  for (const Owner of [AcceptanceCustody, m.acceptance]) {
    const c = new Owner(bytes(f.operator), f.pin);
    c.close();
    let count = 0;
    const original = nodeCrypto.generateKeyPairSync,
      mock = t.mock.method(nodeCrypto, 'generateKeyPairSync', (...a) => {
        count++;
        return original(...a);
      });
    syncBuiltinESMExports();
    try {
      assert.throws(() => c.create(f.id), /closed/);
      assert.equal(count, Owner === AcceptanceCustody ? 0 : 1);
    } finally {
      mock.mock.restore();
      syncBuiltinESMExports();
    }
  }
  write('closed', {
    baseline: 'no new generation',
    mutant: 'new key generated then refused',
    noEscapedSignature: true,
  });
});
