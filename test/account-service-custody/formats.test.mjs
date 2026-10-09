import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import nodeCrypto, { createPublicKey, createDecipheriv } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import fc from 'fast-check';
import {
  b,
  hex,
  corpus,
  derive,
  encrypt,
  lp,
  publicHex,
  privateKey,
  rootSeal,
  acceptanceSeal,
  pkcs8,
  proof,
} from './oracle.mjs';
import {
  PrivateAuthority,
  AcceptanceCustody,
  bytes,
  rootSeams,
  row,
  temporary,
  install,
  deterministic,
} from './runtime.mjs';
import { assertEd25519SeedExport, ed25519PublicHex } from '../../account-service/keyEncoding.ts';
const saved = JSON.parse(readFileSync('test/vectors/account-service-custody.json')),
  f = saved.fixture;
export const report = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
};
const owned = () => new AcceptanceCustody(bytes(f.operator), f.pin);
const open = (root = f.root, pin = f.pin, key = f.operator) =>
  rootSeams.unlock(row(root), pin, bytes(key));
function rejectsSeal(
  value,
  context = { pin: f.pin, key: f.operator, id: f.id, pub: f.acceptance.publicKey },
) {
  const c = new AcceptanceCustody(bytes(context.key), context.pin);
  try {
    assert.throws(() => c.check(value, context.id, context.pub));
  } finally {
    c.close();
  }
}

test('eight fixed cases reproduce runtime root/acceptance creation, intermediate key derivation, cold opening and seed formats', (t) => {
  assert.deepEqual(corpus(), saved);
  const dir = temporary(t),
    path = join(dir, 'root.sqlite'),
    calls = [];
  const original = nodeCrypto.hkdfSync;
  const mock = t.mock.method(nodeCrypto, 'hkdfSync', (...args) => {
    const result = original(...args);
    calls.push({
      input: hex(args[1] instanceof nodeCrypto.KeyObject ? args[1].export() : args[1]),
      salt: hex(args[2]),
      messageHex: hex(args[3]),
      resultHex: hex(result),
    });
    return result;
  });
  syncBuiltinESMExports();
  let pin, seal;
  try {
    pin = deterministic(t, f.rootSeed, [f.pin.serviceId, f.root.salt, f.root.nonce], () =>
      PrivateAuthority.initialize(
        path,
        { origin: f.pin.origin, rpId: f.pin.rpId },
        bytes(f.operator),
      ),
    );
    assert.deepEqual(pin, f.pin);
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const { id, ...actual } = db.prepare('SELECT * FROM authority').get();
      assert.equal(id, 1);
      assert.deepEqual({ ...actual }, row(f.root));
    } finally {
      db.close();
    }
    const owner = PrivateAuthority.open(path, pin, bytes(f.operator));
    try {
      assert.deepEqual(owner.prove({ nonce: f.proof.nonce }), f.proof);
    } finally {
      owner.close();
    }
    assert.deepEqual(PrivateAuthority.recoverPin(path, bytes(f.operator)), pin);
    const c = owned();
    try {
      seal = deterministic(t, f.acceptanceSeed, [f.acceptance.salt, f.acceptance.nonce], () =>
        c.create(f.id),
      );
      assert.deepEqual(seal, f.acceptance);
      c.check(seal, f.id, seal.publicKey);
    } finally {
      c.close();
    }
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
  }
  for (const v of saved.vectors.filter((v) => v.kind === 'kdf'))
    assert(
      calls.some(
        (c) =>
          c.input === v.inputs.input &&
          c.salt === v.inputs.salt &&
          c.messageHex === v.expected.messageHex &&
          c.resultHex === v.expected.resultHex,
      ),
      v.id,
    );
  assert.equal(
    hex(rootSeams.sealKey(bytes(f.operator), f.pin, f.root.salt)),
    saved.vectors[0].expected.resultHex,
  );
  assertEd25519SeedExport(b(pkcs8 + f.rootSeed));
  assert.equal(ed25519PublicHex(createPublicKey(privateKey(f.rootSeed))), f.pin.authRoot);
  assert.equal(
    hex(Buffer.from(JSON.stringify(seal))),
    saved.vectors.find((v) => v.id === 'service-acceptance-carrier').expected.messageHex,
  );
  report('fixed', {
    cases: 8,
    actualInitializers: true,
    actualKdfInputsAndOutputs: true,
    coldOpenAndProof: true,
    validStoredBytesChanged: false,
  });
});

test('all primitive inputs and encoded fields have independent isolating negatives and AAD omission controls', () => {
  let negatives = 0,
    omissions = 0,
    aeadRefusals = 0;
  for (const v of saved.vectors) {
    for (const n of v.negatives) {
      assert.notEqual(n.resultHex, v.expected.resultHex, v.id + ':' + n.field);
      if (v.kind === 'aead') {
        const c = createDecipheriv('aes-256-gcm', b(v.inputs.key), b(v.inputs.nonce)),
          ct = b(n.resultHex);
        c.setAAD(lp(v.inputs.aad));
        c.setAuthTag(ct.subarray(-16));
        if (n.field === 'plaintext') {
          const plain = Buffer.concat([c.update(ct.subarray(0, -16)), c.final()]);
          assert.notEqual(hex(plain), v.inputs.plaintext);
        } else {
          assert.throws(() => Buffer.concat([c.update(ct.subarray(0, -16)), c.final()]));
          aeadRefusals++;
        }
      }
      negatives++;
    }
    for (const o of v.encodedBindingControls) {
      const n = v.negatives.find((n) => n.field === o.field),
        input = structuredClone(n.inputs),
        [field, index] = o.field.split('.');
      input[field].splice(Number(index), 1);
      assert.equal(v.kind === 'kdf' ? derive(input) : encrypt(input), o.resultHex);
      assert.notEqual(o.resultHex, v.expected.resultHex);
      omissions++;
    }
  }
  report('bindings', {
    negatives,
    omissions,
    aeadRefusals,
    note: 'Independent primitive controls; authentic plaintext differences require owner correspondence checks below.',
  });
});

test('root opening refuses altered expected pin and each stored field; genuine wrong-seed ciphertext reaches correspondence check', (t) => {
  const dir = temporary(t),
    path = join(dir, 'independent.sqlite');
  install(path, f.root);
  const owner = PrivateAuthority.open(path, f.pin, bytes(f.operator));
  owner.close();
  for (const key of ['serviceId', 'origin', 'rpId', 'authRoot']) {
    const pin = {
      ...f.pin,
      [key]:
        key === 'origin'
          ? 'https://other.done.invalid'
          : key === 'rpId'
            ? 'other.done.invalid'
            : 'ab'.repeat(key === 'serviceId' ? 16 : 32),
    };
    assert.throws(() => open(f.root, pin));
  }
  assert.throws(() => open(f.root, f.pin, 'ab'.repeat(32)));
  for (const field of ['salt', 'nonce', 'ct'])
    assert.throws(() =>
      open({
        ...f.root,
        [field]: 'ab'.repeat(field === 'salt' ? 16 : field === 'nonce' ? 12 : 48),
      }),
    );
  const wrong = rootSeal(f.pin, f.operator, f.root.salt, f.root.nonce, '64'.repeat(32));
  assert.throws(() => open(wrong), /private\/public mismatch/);
  for (const seed of ['65'.repeat(31), '65'.repeat(33)])
    assert.throws(() => open(rootSeal(f.pin, f.operator, f.root.salt, f.root.nonce, seed)));
  for (const version of [0, 2])
    assert.throws(() => open({ ...f.root, pin: { ...f.pin, v: version } }));
  report('root-refusals', {
    wrongOperator: true,
    expectedPinFields: 4,
    storedFields: 3,
    authenticatedWrongSeed: true,
    lengths: [31, 33],
    versions: [0, 2],
  });
});

test('acceptance opening binds operator, full pin, proposal and public key; valid tags do not excuse wrong seeds or invalid carriers', () => {
  const c = owned();
  try {
    c.check(f.acceptance, f.id, f.acceptance.publicKey);
    c.check(
      Object.fromEntries(Object.entries(f.acceptance).reverse()),
      f.id,
      f.acceptance.publicKey,
    );
    for (const changed of [
      { v: 2 },
      { extra: 1 },
      { publicKey: 'ab'.repeat(32) },
      { salt: 'ab'.repeat(16) },
      { nonce: 'ab'.repeat(12) },
      { ct: 'ab'.repeat(48) },
      { ct: f.acceptance.ct + '00' },
    ])
      rejectsSeal({ ...f.acceptance, ...changed });
    for (const key of ['serviceId', 'origin', 'rpId', 'authRoot']) {
      const pin = {
        ...f.pin,
        [key]:
          key === 'origin'
            ? 'https://other.done.invalid'
            : key === 'rpId'
              ? 'other.done.invalid'
              : 'ab'.repeat(key === 'serviceId' ? 16 : 32),
      };
      rejectsSeal(f.acceptance, { pin, key: f.operator, id: f.id, pub: f.acceptance.publicKey });
    }
    for (const changed of [
      { key: 'ab'.repeat(32) },
      { id: 'ab'.repeat(32) },
      { pub: 'ab'.repeat(32) },
    ])
      rejectsSeal(f.acceptance, {
        pin: f.pin,
        key: f.operator,
        id: f.id,
        pub: f.acceptance.publicKey,
        ...changed,
      });
    const wrong = acceptanceSeal(
      f.pin,
      f.operator,
      f.id,
      f.acceptance.salt,
      f.acceptance.nonce,
      '65'.repeat(32),
      f.acceptance.publicKey,
    );
    assert.throws(() => c.check(wrong, f.id, f.acceptance.publicKey), /key mismatch/);
    c.close();
    assert.throws(() => c.check(f.acceptance, f.id, f.acceptance.publicKey), /closed/);
  } finally {
    c.close();
  }
  report('acceptance-refusals', {
    operatorPinProposalPublicKey: true,
    authenticatedWrongSeed: true,
    closedCarrier: true,
    propertyOrderIrrelevant: true,
    closedOwner: true,
  });
});

test('each fixed-purpose acceptance method signs its reviewed bytes and every use refuses after close', () => {
  const transport = JSON.parse(readFileSync('test/vectors/account-transport.json')).fixture;
  const seed = transport.keys.acceptance.seed,
    pub = publicHex(seed),
    seal = acceptanceSeal(
      f.pin,
      f.operator,
      transport.scope.request,
      f.acceptance.salt,
      f.acceptance.nonce,
      seed,
    ),
    c = owned();
  const page = (p) => ({
    ...p,
    entries: p.entries.map((e) => ({ envelope: bytes(e.envelope), proof: bytes(e.proof) })),
  });
  const actions = [
    () => c.issue(seal, transport.scope.request, pub, transport.responses[0]),
    () => c.issue(seal, transport.scope.request, pub, transport.responses[1]),
    () => c.page(seal, transport.scope.request, pub, page(transport.pages[0][1])),
    () => c.inboundPage(seal, transport.scope.request, pub, page(transport.pages[1][1])),
    () => c.witness(seal, transport.scope.request, pub, transport.scope, transport.witness),
  ];
  try {
    const vectors = JSON.parse(readFileSync('test/vectors/account-transport.json')).vectors;
    const ids = [
      'transport-response-refused',
      'transport-response-accepted',
      'transport-page-v1-full-wire',
      'transport-page-v2-full-wire',
    ];
    for (const [i, id] of ids.entries())
      assert.equal(hex(actions[i]()), vectors.find((v) => v.id === id).expected.messageHex);
    assert.deepEqual(actions[4](), transport.witness);
    assert.throws(() =>
      c.issue(seal, transport.scope.request, pub, { kind: 'arbitrary-signature' }),
    );
    assert.throws(() =>
      c.witness(
        seal,
        transport.scope.request,
        pub,
        { ...transport.scope, request: f.id },
        transport.witness,
      ),
    );
    c.close();
    for (const call of actions) assert.throws(call, /closed/);
  } finally {
    c.close();
  }
});

test('200 shrinking-enabled synthetic key/scope histories cold-open independently sealed roots and reject authentic wrong-key payloads', async (t) => {
  const dir = temporary(t);
  let index = 0;
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      async (seed, key, salt) => {
        const pin = { ...f.pin, authRoot: publicHex(hex(seed)), serviceId: hex(salt) },
          r = rootSeal(pin, hex(key), hex(salt), f.root.nonce, hex(seed)),
          path = join(dir, ++index + '.sqlite');
        install(path, r);
        const expected = proof(pin, hex(seed), f.proof.nonce),
          owner = PrivateAuthority.open(path, pin, key);
        try {
          assert.deepEqual(owner.prove({ nonce: f.proof.nonce }), expected);
        } finally {
          owner.close();
        }
        const c = new AcceptanceCustody(key, pin),
          good = acceptanceSeal(pin, hex(key), f.id, hex(salt), f.acceptance.nonce, hex(seed));
        try {
          c.check(good, f.id, good.publicKey);
          const changed = seed.slice();
          changed[0] ^= 1;
          const wrong = acceptanceSeal(
            pin,
            hex(key),
            f.id,
            hex(salt),
            f.acceptance.nonce,
            hex(changed),
            good.publicKey,
          );
          assert.throws(() => c.check(wrong, f.id, good.publicKey), /key mismatch/);
          assert.throws(() => c.check(good, 'ab'.repeat(32), good.publicKey));
        } finally {
          c.close();
        }
      },
    ),
    { seed: 5110915, numRuns: 200 },
  );
  report('properties', {
    seed: 5110915,
    runs: 200,
    shrinkingEnabled: true,
    actualSqliteColdOpen: true,
    independentReencryption: true,
  });
});
