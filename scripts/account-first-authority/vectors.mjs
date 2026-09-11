import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  fixedFixture,
  hash,
  signed,
  checks,
  at,
  changed,
  replace,
  omit,
  traceJson,
  lp,
  leafPaths,
  pinFields,
} from '../../test/account-first-authority/oracle.mjs';
import {
  cases,
  runtimeBytes,
  expectedBytes,
  assertSlotInterop,
} from '../../test/account-first-authority/cases.mjs';
const output = new URL('../../test/vectors/first-authority.json', import.meta.url);
export async function buildVectors() {
  const f = fixedFixture(),
    vectors = [];
  for (const c of cases(f)) {
    const trace = c.trace(c.input),
      bytes = expectedBytes(c, c.input),
      signer = c.signer ? f.keys[c.signer] : null;
    assert.deepEqual(await runtimeBytes(c, c.input), bytes, c.id + ' baseline');
    const signature = signer ? signed(signer, bytes) : null,
      negatives = [];
    for (const path of c.paths) {
      const replacement = changed(at(c.input, path)),
        input = replace(c.input, path, replacement),
        altered = expectedBytes(c, input);
      assert.notDeepEqual(altered, bytes, c.id + ': unbound input ' + path.join('.'));
      if (signer) assert.equal(checks(signer, altered, signature), false);
      let result;
      try {
        result = await runtimeBytes(c, input);
      } catch {
        result = null;
      }
      if (result) assert.deepEqual(result, altered, c.id + ' changed ' + path.join('.'));
      negatives.push({
        path: path.join('.'),
        replacement,
        alteredMessageHash: hash(altered),
        runtime: result ? 'different-bound-bytes' : 'parser-refusal',
        signatureRefuses: signer ? true : null,
      });
    }
    // Isolate bindings below value validation; nested LP/JSON/hash components keep their outer framing.
    const bindings = [];
    const audit = (body, paths, encode, prefix = '', arrayFields = false) => {
      for (const path of paths) {
        const variant = replace(body, path, changed(at(body, path)));
        const good = encode(body),
          bad = encode(variant);
        assert.deepEqual(good, Buffer.from(trace.messageHex, 'hex'), c.id + ' control baseline');
        assert.notDeepEqual(good, bad);
        const omitOne = (b) =>
          encode(arrayFields ? b.filter((_, i) => i !== Number(path[0])) : omit(b, path));
        assert.deepEqual(omitOne(body), omitOne(variant));
        if (signer) {
          assert.equal(checks(signer, bad, signed(signer, good)), false);
          assert.equal(checks(signer, omitOne(variant), signed(signer, omitOne(body))), true);
        }
        bindings.push({
          path: prefix + path.join('.'),
          changedBytesRefuse: true,
          omissionRescues: true,
        });
      }
    };
    const fieldPaths = (fields) => fields.map((_, i) => [String(i)]);
    if (c.codec === 'json-domain') {
      audit(c.body(c.input), c.paths, (b) =>
        Buffer.from(traceJson(trace.fields[0], b).messageHex, 'hex'),
      );
      audit(trace.fields, [['0']], (b) => lp(...b), '$domain.', true);
    } else if (trace.fields) {
      audit(trace.fields, fieldPaths(trace.fields), (b) => lp(...b), '', true);
    }
    if (c.id === 'pending') {
      const state = JSON.parse(trace.fields[3]);
      audit(
        state,
        leafPaths(state),
        (b) => lp(...trace.fields.slice(0, 3), JSON.stringify(b)),
        '$state.',
      );
      const pin = pinFields(c.input.pin);
      audit(
        pin,
        fieldPaths(pin),
        (b) => lp(trace.fields[0], lp(...b).toString('hex'), ...trace.fields.slice(2)),
        '$pin.',
        true,
      );
    }
    if (c.id === 'certification') {
      audit(
        trace.memberFields,
        fieldPaths(trace.memberFields),
        (b) => {
          const fields = [...trace.fields];
          fields[8] = hash(lp(...b));
          return lp(...fields);
        },
        '$member.',
        true,
      );
    }
    vectors.push({
      id: c.id,
      kind: c.kind,
      signer: c.signer ?? null,
      input: c.input,
      expected: { ...trace, resultHex: bytes.toString('hex'), resultHash: hash(bytes), signature },
      negatives,
      encodedBindingControls: bindings,
    });
  }
  await assertSlotInterop(assert, f);
  const { keys: _keys, ...fixture } = f;
  return {
    v: 1,
    contract: 'docs/account-crypto/first-authority.md',
    generator: 'scripts/account-first-authority/vectors.mjs',
    scope:
      'Private first-authority bytes. Deterministic synthetic signing keys; opaque checkpoint/wrap/recovery ciphertext is not an encryption or Yjs coverage vector. Encoded-field controls operate below parser/semantic validation.',
    schemaSha256: hash(readFileSync('docs/account-crypto/first-authority.json')),
    fixture,
    vectors,
    genesisHeads: {
      empty: hash(lp('done/headvec/v1')),
      explicitZero: hash(lp('done/headvec/v1', f.candidate.signer, '0', '00'.repeat(32))),
      rule: 'Only empty at first genesis; certification still includes the creating member.',
    },
  };
}
export async function verifyVectors() {
  const actual = await buildVectors(),
    expected = JSON.parse(readFileSync(output, 'utf8'));
  assert.deepEqual(actual, expected, 'First-authority vectors stale');
  return actual;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await buildVectors();
  if (process.argv.includes('--check'))
    assert.deepEqual(
      JSON.parse(readFileSync(output, 'utf8')),
      data,
      'First-authority vectors stale',
    );
  else writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
  console.log(
    `${data.vectors.length} first-authority vectors; ${data.vectors.reduce((n, v) => n + v.negatives.length, 0)} input negatives; ${data.vectors.reduce((n, v) => n + v.encodedBindingControls.length, 0)} encoded-field omission controls agree with independent bytes.`,
  );
}
