import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import * as Y from 'yjs';
import { load } from './runtime.mjs';
import * as o from './oracle.mjs';
import { report, resultJSON } from './report.mjs';
import { fixedFixture } from '../account-first-authority/oracle.mjs';
const h = await load();
const derive = (v, r = h) => r.checkpointKey(o.bytes(v.key), v.salt, v.workspaceId, crypto.subtle);
const encrypt = async (v, k, aad = h.checkpointAAD(v)) =>
  o.hex(
    new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: o.bytes(v.nonce), additionalData: aad, tagLength: 128 },
        k,
        o.bytes(v.plaintext),
      ),
    ),
  );
const decrypt = (v, k, ct = o.hex(o.seal(v)), aad = h.checkpointAAD(v)) =>
  crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: o.bytes(v.nonce), additionalData: aad },
    k,
    o.bytes(ct),
  );
test('current private key helper and protocol AAD agree with independent fixed and inherited cipher bytes', async () => {
  const evidence = [];
  for (const v of o.fixtures()) {
    const k = await derive(v);
    assert.equal(k.extractable, false);
    assert.deepEqual(k.usages, ['encrypt', 'decrypt']);
    assert.equal(o.hex(h.checkpointAAD(v)), o.hex(o.lp(...o.aadFields(v))));
    assert.equal(await encrypt(v, k), o.hex(o.seal(v)));
    assert.equal(o.hex(new Uint8Array(await decrypt(v, k))), v.plaintext);
    evidence.push({
      name: v.name,
      info: o.hex(o.lp(...o.infoFields(v))),
      aad: o.hex(h.checkpointAAD(v)),
      ciphertext: await encrypt(v, k),
    });
  }
  const old = o.inherited(),
    v = o.fixtures()[1];
  assert.equal(o.hex(o.lp(...o.infoFields(v))), old.derived.hkdf_info);
  assert.equal(o.hex(h.checkpointAAD(v)), old.derived.checkpoint_aad);
  assert.equal(o.hex(o.seal(v)), old.expected.ciphertext);
  report('fixed', {
    vectors: o.corpus().vectors.length,
    evidence,
    inherited: {
      byteAgreement: true,
      scope:
        'Cipher bytes only; inherited plaintext is prose, not a decodable Yjs checkpoint; identifiers/generation/epoch are outside current genesis parser',
    },
  });
});
test('every declared KDF/AAD field, ciphertext, salt, nonce and tag mutation discriminates', async () => {
  let checks = 0,
    omissions = 0;
  for (const v of o.corpus().vectors) {
    if (v.kind === 'kdf') {
      for (const n of v.negatives) {
        assert.notEqual(n.resultHex, v.expected.resultHex);
        if (n.field !== 'label') {
          const k = await derive(n.input);
          await assert.rejects(decrypt(v.input, k));
        }
        checks++;
      }
    } else {
      const k = await derive(v.input);
      for (const n of v.negatives) {
        await assert.rejects(decrypt(v.input, k, v.expected.resultHex, o.bytes(n.messageHex)));
        assert.notEqual(n.resultHex, v.expected.resultHex);
        checks++;
      }
      for (const n of v.encodedBindingControls) {
        await assert.rejects(decrypt(v.input, k, v.expected.resultHex, o.bytes(n.messageHex)));
        assert.notEqual(n.resultHex, v.expected.resultHex);
        omissions++;
      }
      for (const field of ['key', 'salt', 'nonce']) {
        const changed = { ...v.input, [field]: o.flip(v.input[field]) };
        await assert.rejects(decrypt(changed, await derive(changed), v.expected.resultHex));
        checks++;
      }
      for (const ct of [
        o.flip(v.expected.resultHex),
        v.expected.resultHex.slice(0, -2),
        v.expected.resultHex.slice(0, -32),
        v.expected.resultHex + '00',
      ]) {
        await assert.rejects(decrypt(v.input, k, ct));
        checks++;
      }
    }
  }
  report('bindings', { checks, omissions });
});
test('actual source omissions change the private KDF and all five protocol AAD fields', async () => {
  const v = o.fixtures()[0],
    evidence = [];
  for (const [i, name] of [
    'aadLabel',
    'aadVersion',
    'aadWorkspace',
    'aadGeneration',
    'aadEpoch',
  ].entries()) {
    const mutant = await load(name),
      expected = o.corpus().vectors[1].encodedBindingControls[i];
    assert.equal(o.hex(mutant.checkpointAAD(v)), expected.messageHex);
    await assert.rejects(decrypt(v, await derive(v), o.hex(o.seal(v)), mutant.checkpointAAD(v)));
    evidence.push({ name, caught: true, omitted: expected.omitted });
  }
  for (const [i, name] of ['keyLabel', 'keyWorkspace'].entries()) {
    const mutant = await load(name),
      k = await derive(v, mutant),
      info = o.lp(...o.infoFields(v).filter((_, j) => i !== j));
    assert.equal(
      await encrypt(v, k),
      o.hex(o.aes(o.key(v, info), o.bytes(v.nonce), h.checkpointAAD(v), o.bytes(v.plaintext))),
    );
    await assert.rejects(decrypt(v, k));
    evidence.push({ name, caught: true });
  }
  report('source-controls', evidence);
});
test('genesis closed parser fixes versions, lengths, identity domains and empty head baseline', () => {
  const base = fixedFixture().candidate;
  assert.deepEqual(h.parseGenesis(base), base);
  let refused = 0;
  const change = (path, value) => {
    const v = structuredClone(base);
    let x = v;
    for (const k of path.slice(0, -1)) x = x[k];
    x[path.at(-1)] = value;
    assert.throws(() => h.parseGenesis(v));
    refused++;
  };
  for (const path of [['generation'], ['proposedEpoch'], ['checkpoint', 'v']])
    for (const value of [0, 2, '1', null, Object(1)]) change(path, value);
  for (const [field, n] of [
    ['salt', 16],
    ['nonce', 12],
    ['ct', 18],
  ])
    for (const value of ['', '01'.repeat(n - 1), 'AB'.repeat(n), 'gg'.repeat(n), null, []])
      change(['checkpoint', field], value);
  change(['checkpoint', 'salt'], '01'.repeat(17));
  change(['checkpoint', 'nonce'], '01'.repeat(13));
  for (const field of Object.keys(base.checkpoint)) {
    const v = structuredClone(base);
    delete v.checkpoint[field];
    assert.throws(() => h.parseGenesis(v));
    refused++;
  }
  const extra = structuredClone(base);
  extra.checkpoint.extra = true;
  assert.throws(() => h.parseGenesis(extra));
  refused++;
  change(['coverage', 'heads'], [{ credential: base.signer, seq: 0, link: '00'.repeat(32) }]);
  change(['coverage', 'derivation'], 'unknown');
  change(['workspaceId'], 'workspace-é');
  const oversized = structuredClone(base);
  oversized.checkpoint.ct = '00'.repeat(16 * 1024 * 1024 + 17);
  assert.throws(() => h.parseGenesis(oversized));
  refused++;
  assert.throws(() => h.checkpointAAD({ ...base, workspaceId: 'workspace-é' }), /Non-ASCII/);
  report('parser', {
    refused,
    current: { generation: 1, epoch: 1, version: 1, maxPlaintext: 16 * 1024 * 1024 },
  });
});
test('250 shrinking-enabled cipher histories agree with OpenSSL and reject a different epoch or salt', async () => {
  let checked = 0;
  const result = await fc.check(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      fc.uint8Array({ minLength: 12, maxLength: 12 }),
      fc.uint8Array({ maxLength: 2048 }),
      fc.integer({ min: 1, max: 1000000 }),
      async (key, salt, nonce, plain, epoch) => {
        const v = {
            ...o.fixtures()[0],
            key: o.hex(key),
            salt: o.hex(salt),
            nonce: o.hex(nonce),
            plaintext: o.hex(plain),
            proposedEpoch: epoch,
          },
          k = await derive(v);
        assert.equal(await encrypt(v, k), o.hex(o.seal(v)));
        await assert.rejects(decrypt({ ...v, proposedEpoch: epoch + 1 }, k, o.hex(o.seal(v))));
        await assert.rejects(decrypt(v, await derive({ ...v, salt: o.flip(v.salt) })));
        checked++;
      },
    ),
    { seed: 5110930, numRuns: 250 },
  );
  report('cipher-properties', { ...resultJSON(result), checked });
  assert.equal(result.failed, false, String(result.errorInstance));
});
test('generated deletion and out-of-order replay proves both descriptor halves and does not repair a missing genesis', async () => {
  let checked = 0;
  const result = await fc.check(
    fc.property(
      fc.string({ minLength: 2, maxLength: 60 }),
      fc.nat(80),
      fc.boolean(),
      (text, offset, reverse) => {
        const source = new Y.Doc({ gc: false }),
          before = new Y.Doc({ gc: false }),
          after = new Y.Doc({ gc: false }),
          pending = new Y.Doc({ gc: false });
        try {
          source.clientID = 17;
          const t = source.getText('master');
          t.insert(0, text);
          const initial = Y.encodeStateAsUpdate(source);
          let delta;
          source.on('update', (u) => (delta = u));
          t.delete(offset % text.length, 1);
          const final = Y.encodeStateAsUpdate(source);
          Y.applyUpdate(before, initial);
          for (const u of reverse ? [delta, initial] : [initial, delta]) Y.applyUpdate(after, u);
          assert.equal(
            after.getText('master').toString(),
            text.slice(0, offset % text.length) + text.slice((offset % text.length) + 1),
          );
          assert.deepEqual(h.genesisCoverageParts(before).sv, h.genesisCoverageParts(after).sv);
          assert.notDeepEqual(h.genesisCoverageParts(before).ds, h.genesisCoverageParts(after).ds);
          const saved = Y.encodeStateAsUpdate(before);
          assert.equal(h.coversGenesis(before, after), false);
          assert.deepEqual(Y.encodeStateAsUpdate(before), saved);
          assert(h.coversGenesis(after, source));
          assert(h.sameDocState(after, source));
          // A dependent insertion with its parent absent must not become a checkpoint.
          t.insert(t.length, '!');
          Y.applyUpdate(pending, delta);
          assert.throws(() => h.genesisCoverage(pending), /pending/);
          assert.equal(h.coversGenesis(source, pending), false);
          assert(final.length > 0);
          checked++;
        } finally {
          for (const d of [source, before, after, pending]) d.destroy();
        }
      },
    ),
    { seed: 5110931, numRuns: 200 },
  );
  report('replay-properties', { ...resultJSON(result), checked });
  assert.equal(result.failed, false, String(result.errorInstance));
});
