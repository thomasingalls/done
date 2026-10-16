import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from './runtime.mjs';
import * as o from './oracle.mjs';
export const report = (n, v) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, n + '.json'),
      JSON.stringify(v, null, 2) + '\n',
    );
  }
};
export const typed = (v) =>
  Array.isArray(v)
    ? v.map(typed)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k,
            ['nonce', 'ct', 'salt', 'publicKey', 'mac'].includes(k) && typeof x === 'string'
              ? o.bytes(x)
              : typed(x),
          ]),
        )
      : v;
const h = await load(),
  r = o.recordFixture('protected');

test('generated states preserve the closed primitive state domain at the structured-clone parser', async () => {
  let checked = 0;
  const result = await fc.check(
    fc.property(
      fc.constantFrom('primitive', 'array', 'boxed'),
      fc.integer({ min: 3, max: 99 }),
      (form, reserved) => {
        const record = typed(o.recordFixture('protected', reserved));
        record.state =
          form === 'primitive'
            ? 'protected'
            : form === 'array'
              ? ['protected']
              : Object('protected');
        const retained = structuredClone(record);
        if (form === 'primitive') assert.equal(h.parseRecord(retained, o.scope).state, 'protected');
        else assert.throws(() => h.parseRecord(retained, o.scope), { code: 'repair-required' });
        checked++;
      },
    ),
    { seed: 5110920, numRuns: 100 },
  );
  report('state-properties', {
    ...result,
    errorInstance: result.errorInstance ? String(result.errorInstance) : null,
    checked,
  });
  assert.equal(result.failed, false, String(result.errorInstance));
});

test('fixed factor, envelope, credential, key-correspondence and metadata vectors match actual native primitives', async () => {
  const vectors = o.corpus().vectors;
  for (const v of vectors) {
    if (v.id.startsWith('custody-factor-key-')) {
      const k = await h.factorKey(v.input.scope, o.bytes(v.input.ikm), typed(v.input.value));
      assert.equal(k.extractable, false);
      assert.deepEqual(k.usages, ['encrypt', 'decrypt']);
      const seal = v.input.value;
      assert.equal(
        o.hex(
          new Uint8Array(
            await crypto.subtle.encrypt(
              {
                name: 'AES-GCM',
                iv: o.bytes(seal.nonce),
                additionalData: h.sealAAD(v.input.scope, seal),
                tagLength: 128,
              },
              k,
              o.bytes(o.root),
            ),
          ),
        ),
        seal.ct,
      );
      for (const n of v.negatives) {
        const nk = await h.factorKey(n.scope, o.bytes(n.ikm), typed(n.value));
        assert.equal(
          o.hex(
            new Uint8Array(
              await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 },
                nk,
                new Uint8Array(),
              ),
            ),
          ),
          o.hex(
            o.aes(o.bytes(n.resultHex), new Uint8Array(12), new Uint8Array(), new Uint8Array()),
          ),
        );
        assert.notEqual(n.resultHex, v.expected.resultHex);
      }
    } else if (v.id.startsWith('custody-factor-seal-')) {
      assert.equal(o.hex(h.sealAAD(v.input.scope, v.input.value)), v.expected.messageHex);
      assert.equal(
        o.hex(await h.openFactor(v.input.scope, o.bytes(v.input.ikm), typed(v.input.value))),
        o.root,
      );
      const actual = await fixedRandom([v.input.value.salt, v.input.value.nonce], () =>
        h.sealFactor(
          v.input.scope,
          o.bytes(v.input.ikm),
          o.bytes(o.root),
          v.input.value.factor,
          v.input.value.id,
        ),
      );
      assert.equal(o.hex(actual.ct), v.expected.resultHex);
    } else if (v.id.startsWith('custody-envelope-')) {
      assert.equal(o.hex(h.envelopeAAD(v.input.scope, v.input.value.gen)), v.expected.messageHex);
      assert.equal(
        o.hex(await h.openEnvelope(v.input.scope, o.bytes(o.root), typed(v.input.value))),
        o.generation,
      );
      const actual = await fixedRandom([v.input.value.nonce], () =>
        h.sealEnvelope(v.input.scope, o.bytes(o.root), v.input.value.gen, o.bytes(o.generation)),
      );
      assert.equal(o.hex(actual.ct), v.expected.resultHex);
    } else if (v.id.startsWith('custody-credential-')) {
      const role = v.input.value.role,
        actual = await fixedRandom([v.input.value.sealed.nonce], () =>
          h.createCredential(
            o.scope,
            o.bytes(o.root),
            role,
            v.input.value.id,
            awaitableSubtle(role),
          ),
        );
      assert.equal(o.hex(actual.ct ?? actual.sealed.ct), v.expected.resultHex);
      assert.equal(o.hex(actual.publicKey), v.input.value.publicKey);
      const key = await h.openCredential(o.scope, o.bytes(o.root), actual);
      assert.equal(key.extractable, false);
      assert.deepEqual(key.usages, role === 'wrapping' ? ['deriveBits'] : ['sign']);
      if (role === 'signing')
        assert.equal(
          o.hex(new Uint8Array(await crypto.subtle.sign('Ed25519', key, o.signingProbe()))),
          o.hex(o.signature(o.seed(role), o.signingProbe())),
        );
      else {
        const pub = await crypto.subtle.importKey(
          'raw',
          o.publicBytes('wrapping', '77'.repeat(32)),
          'X25519',
          false,
          [],
        );
        assert.equal(
          o.hex(
            new Uint8Array(
              await crypto.subtle.deriveBits({ name: 'X25519', public: pub }, key, 256),
            ),
          ),
          o.hex(o.shared(o.seed(role), o.publicBytes('wrapping', '77'.repeat(32)))),
        );
      }
    } else if (v.id === 'custody-generated-code') {
      const display = await fixedRandom([v.input.entropyHex], () => h.generateDeviceCode());
      assert.equal(o.hex(Buffer.from(display)), v.expected.resultHex);
      assert.equal(h.normalizeDeviceCode(display), v.expected.normalized);
      assert.equal(
        h.normalizeDeviceCode(
          '  ' + o.codeDisplay.toLowerCase().replace('0', 'o').replace('1', 'l') + '\n',
        ),
        o.code,
      );
      for (const n of v.negatives) assert.throws(() => h.normalizeDeviceCode(n.input));
    } else if (v.id === 'custody-metadata-key') {
      const info = h.fields(
        'done/custody-metadata/v2',
        r.slot_id,
        r.principal_id,
        r.workspace_id,
        r.root_id,
      );
      assert.equal(o.hex(info), v.expected.messageHex);
      const traces = [];
      const subtle = spySubtle({
        deriveKey: async (original, args) => {
          const k = await original(...args);
          traces.push({
            info: o.hex(args[0].info),
            extractable: k.extractable,
            usages: k.usages,
            probe: o.hex(new Uint8Array(await crypto.subtle.sign('HMAC', k, o.json(['probe'])))),
          });
          return k;
        },
      });
      await h.signRecord(o.bytes(o.root), typed(v.input.value), subtle);
      assert.equal(traces[0].info, v.expected.messageHex);
      assert.equal(traces[0].extractable, false);
      assert.deepEqual(traces[0].usages, ['sign', 'verify']);
      assert.equal(traces[0].probe, o.hex(o.mac(o.bytes(v.expected.resultHex), o.json(['probe']))));
      for (const n of v.negatives) {
        assert.notEqual(n.resultHex, v.expected.resultHex);
        const signed = await h.signRecord(o.bytes(n.root), typed(n.value));
        assert.equal(
          o.hex(signed.mac),
          o.hex(o.mac(o.bytes(n.resultHex), o.json(o.metadataValues(n.value)))),
        );
      }
    } else if (v.kind === 'mac') {
      const parsed = h.parseRecord(typed(v.input.value), o.scope);
      assert.equal(o.hex(h.recordPayload(parsed)), v.expected.messageHex);
      await h.authenticateRecord(o.bytes(o.root), parsed);
      assert.equal(o.hex((await h.signRecord(o.bytes(o.root), parsed)).mac), v.expected.resultHex);
    } else if (v.id.endsWith('correspondence')) {
      const role = v.id.includes('signing') ? 'signing' : 'wrapping',
        traces = [];
      const subtle = spySubtle({
        sign: async (original, args) => {
          const sig = await original(...args);
          traces.push({ message: o.hex(args[2]), signature: o.hex(new Uint8Array(sig)) });
          return sig;
        },
      });
      await h.openCredential(o.scope, o.bytes(o.root), typed(o.credentialFixture(role)), subtle);
      if (role === 'signing') {
        assert.deepEqual(traces, [
          { message: v.expected.messageHex, signature: v.expected.resultHex },
        ]);
      } else
        assert.equal(
          o.hex(o.shared(v.input.peer, o.bytes(v.input.publicKey))),
          v.expected.resultHex,
        );
    }
  }
  report('fixed', {
    vectors: vectors.length,
    privateKeys: 'non-extractable, role-specific usages',
    actualBuilders: true,
  });
});

function spySubtle(overrides = {}) {
  return new Proxy(crypto.subtle, {
    get(target, p) {
      const fn = Reflect.get(target, p, target);
      if (typeof fn !== 'function') return fn;
      const original = fn.bind(target);
      return overrides[p] ? (...args) => overrides[p](original, args) : original;
    },
  });
}
function awaitableSubtle(role) {
  return spySubtle({
    generateKey: async () => ({
      privateKey: await crypto.subtle.importKey(
        'pkcs8',
        o.bytes(o.prefix(role) + o.seed(role)),
        role === 'wrapping' ? 'X25519' : 'Ed25519',
        true,
        role === 'wrapping' ? ['deriveBits'] : ['sign'],
      ),
      publicKey: await crypto.subtle.importKey(
        'raw',
        o.publicBytes(role),
        role === 'wrapping' ? 'X25519' : 'Ed25519',
        true,
        role === 'wrapping' ? [] : ['verify'],
      ),
    }),
  });
}
async function fixedRandom(draws, operation) {
  const original = crypto.getRandomValues;
  let at = 0;
  crypto.getRandomValues = function (out) {
    assert(at < draws.length, 'extra random draw');
    const b = o.bytes(draws[at++]);
    assert.equal(out.length, b.length);
    out.set(b);
    return out;
  };
  try {
    const r = await operation();
    assert.equal(at, draws.length);
    return r;
  } finally {
    crypto.getRandomValues = original;
  }
}

test('inherited factor and generation-envelope bytes agree without qualifying historical credential or PRF ceremonies', async () => {
  let seals = 0,
    envelopes = 0;
  for (const v of JSON.parse(readFileSync('test/vectors/device-lock.json')).seal_vectors) {
    const i = v.inputs,
      s = { principalId: i.principal_id, workspaceId: i.workspace_id },
      seal = { v: 1, factor: i.factor, id: i.id, salt: i.salt, nonce: i.nonce, ct: v.expected.ct };
    assert.equal(o.hex(o.factorKey(s, i.ikm, seal)), v.derived.k_factor);
    assert.equal(o.hex(o.lp(...o.factorFields(s, seal))), v.derived.aad);
    assert.equal(
      o.hex(
        o.aes(
          o.factorKey(s, i.ikm, seal),
          o.bytes(i.nonce),
          o.lp(...o.factorFields(s, seal)),
          o.bytes(i.l_lock),
        ),
      ),
      v.expected.ct,
    );
    assert.equal(o.hex(await h.openFactor(s, o.bytes(i.ikm), typed(seal))), i.l_lock);
    seals++;
  }
  for (const v of JSON.parse(readFileSync('test/vectors/record-format.json')).envelopes) {
    const i = v.inputs,
      s = { principalId: i.principal_id, workspaceId: i.workspace_id };
    assert.equal(o.hex(o.lp(...o.envelopeFields(s, i.gen))), v.derived.aad);
    assert.equal(
      o.hex(
        o.aes(
          o.bytes(i.l_local),
          o.bytes(i.nonce),
          o.lp(...o.envelopeFields(s, i.gen)),
          o.bytes(i.k_g),
        ),
      ),
      v.expected.ct,
    );
    assert.equal(
      o.hex(await h.openEnvelope(s, o.bytes(i.l_local), typed(v.expected.key_envelope))),
      i.k_g,
    );
    envelopes++;
  }
  report('inherited', {
    seals,
    envelopes,
    pins: o.corpus().inherited,
    excluded:
      'historical wrapping replacement seal and PRF ceremonies; later generation is byte syntax only',
  });
});

test('each factor, envelope, credential and metadata field binds; encoded omissions retain real AES/HMAC checks', async () => {
  let bound = 0,
    omissions = 0;
  for (const v of o.corpus().vectors.filter((v) => ['aead', 'mac'].includes(v.kind))) {
    const metadata = v.kind === 'mac',
      factor = v.id.includes('factor-seal'),
      k = metadata
        ? o.metadataKey(v.input.value)
        : factor
          ? o.factorKey(v.input.scope, v.input.ikm, v.input.value)
          : o.bytes(o.root),
      nonce = metadata ? null : o.bytes(v.input.value.nonce ?? v.input.value.sealed.nonce),
      actualKey = await crypto.subtle.importKey(
        'raw',
        k,
        metadata ? { name: 'HMAC', hash: 'SHA-256' } : 'AES-GCM',
        false,
        metadata ? ['sign', 'verify'] : ['encrypt', 'decrypt'],
      );
    for (const n of v.negatives) {
      if (metadata)
        assert.equal(
          await crypto.subtle.verify(
            'HMAC',
            actualKey,
            o.bytes(v.expected.resultHex),
            o.bytes(n.messageHex),
          ),
          false,
        );
      else
        await assert.rejects(
          crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: o.bytes(n.messageHex), tagLength: 128 },
            actualKey,
            o.bytes(v.expected.resultHex),
          ),
        );
      bound++;
    }
    for (const c of v.encodedBindingControls) {
      assert.equal(c.omittedHex, c.changedOmittedHex);
      if (metadata) {
        const sig = await crypto.subtle.sign('HMAC', actualKey, o.bytes(c.omittedHex));
        assert(await crypto.subtle.verify('HMAC', actualKey, sig, o.bytes(c.changedOmittedHex)));
        assert.equal(
          await crypto.subtle.verify('HMAC', actualKey, sig, o.bytes(v.expected.messageHex)),
          false,
        );
      } else {
        const alg = {
            name: 'AES-GCM',
            iv: nonce,
            additionalData: o.bytes(c.omittedHex),
            tagLength: 128,
          },
          ct = await crypto.subtle.encrypt(alg, actualKey, o.bytes(o.root));
        assert.equal(
          o.hex(
            new Uint8Array(
              await crypto.subtle.decrypt(
                { ...alg, additionalData: o.bytes(c.changedOmittedHex) },
                actualKey,
                ct,
              ),
            ),
          ),
          o.root,
        );
        await assert.rejects(
          crypto.subtle.decrypt(
            { ...alg, additionalData: o.bytes(v.expected.messageHex) },
            actualKey,
            ct,
          ),
        );
      }
      omissions++;
    }
  }
  report('bindings', { bound, omissions });
});

test('closed custody parser rejects malformed nested carriers and owns every retained byte array', () => {
  let refused = 0;
  for (const state of ['creating', 'protected']) {
    const original = typed(o.recordFixture(state));
    function missing(value, path = []) {
      if (value instanceof Uint8Array || value === null || typeof value !== 'object') return;
      if (!Array.isArray(value))
        for (const k of Object.keys(value)) {
          const x = structuredClone(original);
          let at = x;
          for (const p of path) at = at[p];
          delete at[k];
          assert.throws(
            () => h.parseRecord(x, o.scope),
            { code: 'repair-required' },
            [...path, k].join('.'),
          );
          refused++;
        }
      for (const [k, v] of Object.entries(value)) missing(v, [...path, k]);
    }
    missing(original);
    for (const altered of [
      null,
      [],
      Object.create(null),
      { ...original, extra: 1 },
      { ...original, v: 3 },
      { ...original, state: ['protected'] },
      { ...original, state: Object('protected') },
      { ...original, rotation_owed: true },
      { ...original, seal_reserved: -1 },
      { ...original, seal_reserved: 2 ** 32 },
      { ...original, seal_reserved: 3.1 },
      { ...original, seals: [] },
      { ...original, seals: [...original.seals, ...original.seals] },
      { ...original, mac: new Uint8Array(31) },
      { ...original, store_id: 'AB'.repeat(16) },
      { ...original, seals: [{ ...original.seals[0], factor: 'prf' }] },
      { ...original, seals: [{ ...original.seals[0], id: 'other' }] },
      { ...original, seals: [{ ...original.seals[0], ct: new Uint8Array(47) }] },
    ]) {
      assert.throws(() => h.parseRecord(altered, o.scope), { code: 'repair-required' });
      refused++;
    }
    const copy = h.parseRecord(original, o.scope),
      before = o.hex(h.recordPayload(copy));
    function wipe(v) {
      if (v instanceof Uint8Array) v.fill(255);
      else if (v && typeof v === 'object') Object.values(v).forEach(wipe);
    }
    wipe(original);
    assert.equal(o.hex(h.recordPayload(copy)), before);
  }
  const p = typed(r);
  for (const x of [
    { ...p, seal_reserved: 2 },
    { ...p, envelope: { ...p.envelope, v: 2 } },
    { ...p, envelope: { ...p.envelope, gen: 2 } },
    { ...p, credentials: [p.credentials[1], p.credentials[0]] },
    { ...p, credentials: [p.credentials[0], { ...p.credentials[1], id: p.credentials[0].id }] },
    {
      ...p,
      credentials: [{ ...p.credentials[0], publicKey: new Uint8Array(31) }, p.credentials[1]],
    },
    { ...p, creation_intent: o.intent },
  ]) {
    assert.throws(() => h.parseRecord(x, o.scope), { code: 'repair-required' });
    refused++;
  }
  for (const x of [
    { ...p, v: 1 },
    { ...p, state: 'migrating' },
  ])
    assert.throws(() => h.parseRecord(x, o.scope), { code: 'migration-required' });
  assert.equal(
    h.parseRecord({ ...p, seal_reserved: 2 ** 32 - 1 }, o.scope).seal_reserved,
    2 ** 32 - 1,
  );
  const zero = h.parseRecord({ ...typed(o.recordFixture()), seal_reserved: -0 }, o.scope);
  assert.equal(o.hex(h.recordPayload(zero)), o.hex(h.recordPayload(typed(o.recordFixture()))));
  report('parsers', {
    refused,
    bytesDetached: true,
    legacy: 'migration-required',
    stateDomain: 'primitive strings only',
    negativeZero: 'equivalent to zero',
  });
});

test('200 shrinking-enabled reservation and completion histories authenticate exact metadata and reject one-leaf alterations', async () => {
  let histories = 0,
    steps = 0;
  const traces = [];
  const result = await fc.check(
    fc.asyncProperty(
      fc.array(fc.record({ complete: fc.boolean(), reorder: fc.boolean(), leaf: fc.nat(1000) }), {
        minLength: 2,
        maxLength: 20,
      }),
      async (ops) => {
        let state = 'creating',
          reserved = 0,
          current = o.recordFixture();
        for (const op of ops) {
          if (state === 'creating') {
            reserved += 3;
            if (op.complete) state = 'protected';
          }
          current = o.recordFixture(state, reserved);
          let candidate = typed(current);
          if (op.reorder) candidate = Object.fromEntries(Object.entries(candidate).reverse());
          const parsed = h.parseRecord(structuredClone(candidate), o.scope);
          await h.authenticateRecord(o.bytes(o.root), parsed);
          assert.equal(o.hex(h.recordPayload(parsed)), o.hex(o.json(o.metadataValues(current))));
          const values = o.metadataValues(current),
            leaf = o.leaves(values)[op.leaf % o.leaves(values).length],
            changed = o.edit(values, leaf.path, o.changed(leaf.value));
          assert.notEqual(o.hex(o.mac(o.metadataKey(current), o.json(changed))), current.mac);
          const lied = { ...parsed, seal_reserved: parsed.seal_reserved + 1 };
          await assert.rejects(h.authenticateRecord(o.bytes(o.root), lied), {
            code: 'repair-required',
          });
          assert.equal(h.recordEqual(parsed, { ...parsed, mac: new Uint8Array(32) }), false);
          steps++;
        }
        histories++;
        traces.push({ operations: ops.length, state, reserved });
      },
    ),
    { seed: 5110921, numRuns: 200 },
  );
  report('metadata-properties', {
    ...result,
    errorInstance: result.errorInstance ? String(result.errorInstance) : null,
    histories,
    steps,
    traces,
  });
  assert.equal(result.failed, false, String(result.errorInstance));
});

test('authentic wrong private keys, relocated credentials and metadata omissions expose effective source controls', async () => {
  const evidence = [];
  for (const role of ['signing', 'wrapping']) {
    const bad = typed(o.credentialFixture(role, '99'.repeat(32), o.hex(o.publicBytes(role))));
    await assert.rejects(h.openCredential(o.scope, o.bytes(o.root), bad), /public key mismatch/);
    const m = await load(role === 'signing' ? 'signingPair' : 'wrappingPair'),
      key = await m.openCredential(o.scope, o.bytes(o.root), bad);
    if (role === 'signing') {
      const pub = await crypto.subtle.importKey('raw', o.publicBytes(role), 'Ed25519', false, [
          'verify',
        ]),
        sig = await crypto.subtle.sign('Ed25519', key, o.signingProbe());
      assert.equal(await crypto.subtle.verify('Ed25519', pub, sig, o.signingProbe()), false);
    } else {
      const pub = await crypto.subtle.importKey(
        'raw',
        o.publicBytes('wrapping', '77'.repeat(32)),
        'X25519',
        false,
        [],
      );
      assert.notEqual(
        o.hex(
          new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: pub }, key, 256)),
        ),
        o.hex(o.shared(o.seed(role), o.publicBytes('wrapping', '77'.repeat(32)))),
      );
    }
    evidence.push(role + 'Pair');
  }
  const m = await load('credentialId'),
    original = typed(o.credentialFixture('signing')),
    other = '99'.repeat(16);
  await assert.rejects(h.openCredential(o.scope, o.bytes(o.root), { ...original, id: other }));
  const weak = await fixedRandom([o.credentialFixture('signing').sealed.nonce], () =>
    m.createCredential(
      o.scope,
      o.bytes(o.root),
      'signing',
      original.id,
      awaitableSubtle('signing'),
    ),
  );
  await m.openCredential(o.scope, o.bytes(o.root), { ...weak, id: other });
  evidence.push('credentialId');
  const count = await load('metadataCount'),
    base = typed(o.recordFixture()),
    signed = await count.signRecord(o.bytes(o.root), base);
  await count.authenticateRecord(o.bytes(o.root), { ...signed, seal_reserved: 3 });
  await assert.rejects(h.authenticateRecord(o.bytes(o.root), { ...base, seal_reserved: 3 }), {
    code: 'repair-required',
  });
  evidence.push('metadataCount');
  const slot = await load('metadataKeySlot'),
    different = await slot.signRecord(o.bytes(o.root), base);
  assert.notEqual(o.hex(different.mac), o.recordFixture().mac);
  await slot.authenticateRecord(o.bytes(o.root), different);
  evidence.push('metadataKeySlot');
  const equal = await load('equalMac');
  assert.equal(h.recordEqual(base, { ...base, mac: new Uint8Array(32) }), false);
  assert.equal(equal.recordEqual(base, { ...base, mac: new Uint8Array(32) }), true);
  evidence.push('equalMac');
  const coercion = await load('stateCoercion'),
    boxed = structuredClone({ ...typed(r), state: Object('protected') });
  assert.throws(() => h.parseRecord(boxed, o.scope), { code: 'repair-required' });
  const accepted = coercion.parseRecord(boxed, o.scope);
  await coercion.authenticateRecord(o.bytes(o.root), accepted);
  assert.equal(typeof accepted.state, 'object');
  assert.equal(
    coercion.recordEqual(accepted, typed(r)),
    false,
    'primitive comparison also refuses boxed state',
  );
  assert.equal(coercion.recordEqual(typed(r), typed(r)), true);
  evidence.push('stateCoercion');
  report('source-controls', {
    caught: evidence,
    stateCoercion:
      'coercing parser accepts authenticated boxed state; primitive equality and ordinary owner separately refuse it',
    metadataKeySlot:
      'independent bytes detect weakened KDF even though payload still binds the slot',
  });
});

test('credential export-format and failure cleanup guards execute before accepting keys or retaining temporary private bytes', async () => {
  let formats = 0;
  const cleanup = [];
  for (const role of ['signing', 'wrapping']) {
    for (const mutation of ['prefix', 'short', 'trailing']) {
      let exported,
        encrypted = 0;
      const base = awaitableSubtle(role),
        subtle = new Proxy(base, {
          get(t, p) {
            const f = t[p];
            if (p === 'exportKey')
              return async (format, key) => {
                const b = await f(format, key);
                if (format !== 'pkcs8') return b;
                let v = new Uint8Array(b);
                if (mutation === 'prefix') v[11] ^= 1;
                if (mutation === 'short') v = v.slice(0, -1);
                if (mutation === 'trailing') {
                  const x = new Uint8Array(v.length + 1);
                  x.set(v);
                  v = x;
                }
                exported = v;
                return v.buffer;
              };
            if (p === 'encrypt')
              return (...args) => {
                encrypted++;
                return f(...args);
              };
            return f;
          },
        });
      await assert.rejects(
        h.createCredential(o.scope, o.bytes(o.root), role, o.intent.signingId, subtle),
        /Unsupported credential encoding/,
      );
      assert.equal(encrypted, 0);
      assert(exported.every((b) => b === 0));
      formats++;
    }
    const bad = typed(o.credentialFixture(role, '99'.repeat(32), o.hex(o.publicBytes(role))));
    for (const control of [undefined, 'openCleanup']) {
      const runtime = control ? await load(control) : h,
        refs = [];
      const subtle = spySubtle({
        decrypt: async (original, args) => {
          const v = await original(...args);
          refs.push(new Uint8Array(v));
          return v;
        },
        importKey: async (original, args) => {
          if (args[0] === 'pkcs8') refs.push(args[1]);
          return original(...args);
        },
        deriveBits: async (original, args) => {
          const b = await original(...args);
          refs.push(new Uint8Array(b));
          return b;
        },
      });
      await assert.rejects(
        runtime.openCredential(o.scope, o.bytes(o.root), bad, subtle),
        /public key mismatch/,
      );
      assert(refs.length >= 2);
      assert.equal(
        refs.slice(0, 2).every((v) => v.every((b) => b === 0)),
        !control,
      );
      if (role === 'wrapping') assert(refs.slice(2).every((v) => v.every((b) => b === 0)));
    }
    cleanup.push(role + ' failed-open');
  }
  for (const control of [undefined, 'exportCleanup']) {
    let exported;
    const runtime = control ? await load(control) : h,
      base = awaitableSubtle('signing'),
      subtle = new Proxy(base, {
        get(t, p) {
          const f = t[p];
          if (p === 'exportKey')
            return async (format, key) => {
              if (format === 'raw') throw Error('public export fault');
              const b = await f(format, key);
              exported = new Uint8Array(b);
              return b;
            };
          return f;
        },
      });
    await assert.rejects(
      runtime.createCredential(o.scope, o.bytes(o.root), 'signing', o.intent.signingId, subtle),
      /public export fault/,
    );
    assert.equal(
      exported.every((b) => b === 0),
      !control,
    );
  }
  cleanup.push('failed-create');
  // Export and prepared-input format checks are independent. One omission still refuses;
  // the explicit two-site format-policy control ignores the prefix and seals the unchanged seed.
  const weak = await load('privateFormat'),
    base = awaitableSubtle('signing'),
    subtle = new Proxy(base, {
      get(t, p) {
        const f = t[p];
        if (p === 'exportKey')
          return async (...args) => {
            const b = await f(...args);
            if (args[0] === 'pkcs8') new Uint8Array(b)[11] ^= 1;
            return b;
          };
        return f;
      },
    });
  const single = await load('privateFormatExport');
  await assert.rejects(
    single.createCredential(o.scope, o.bytes(o.root), 'signing', o.intent.signingId, subtle),
    /Unsupported prepared credential encoding/,
  );
  const c = await weak.createCredential(
    o.scope,
    o.bytes(o.root),
    'signing',
    o.intent.signingId,
    subtle,
  );
  await h.openCredential(o.scope, o.bytes(o.root), c);
  report('export-cleanup', {
    formats,
    cleanup,
    controls: ['privateFormat', 'exportCleanup', 'openCleanup'],
    logicalDisposalOnly: true,
  });
});
