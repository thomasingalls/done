import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { build } from 'vite';
import { resolve } from 'node:path';
import {
  fixture,
  record,
  stages,
  message,
  bytes,
  key,
  mac,
  hex,
} from '../account-promotion-contract/oracle.mjs';
import { report } from '../account-residue/packaged-fixture.mjs';
const result = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('src/crdt/promotionRecord.ts'), name: 'Product', formats: ['iife'] },
  },
});
const h = Function(
  (Array.isArray(result) ? result[0] : result).output.find((o) => o.type === 'chunk').code +
    ';return Product;',
)();
const f = fixture();
test('every stage round-trips retained encoding with exact independent MAC and request bytes', async () => {
  for (const [v, stage] of stages) {
    const r = await h.signPromotion(bytes(f.root), record(f, v, stage), crypto.subtle),
      packed = h.storePromotion(r),
      decoded = h.parseStoredPromotion(structuredClone(packed));
    assert.equal(hex(h.promotionPayload(decoded)), hex(message(r)));
    assert.equal(hex(decoded.mac), mac(key(f.root, r), message(r)));
    assert.deepEqual(decoded, h.parsePromotion(r));
    if (v >= 3) {
      assert.equal(packed.retainedEncoding, 1);
      assert.equal(packed.admission.request.candidate.kind, 'genesis-reference');
      assert.throws(() => h.parsePromotion(packed), 'old logical parser refuses encoded storage');
      assert.equal(JSON.stringify(decoded.admission.request), JSON.stringify(r.admission.request));
    }
  }
});
test('unknown versions, malformed/extra references, accessors and conflicting candidates refuse', () => {
  const r = record(f, 9, 'account-receiving'),
    p = h.storePromotion(r);
  const changes = [
    (q) => (q.retainedEncoding = 2),
    (q) => (q.unexpected = true),
    (q) => (q.admission.request.candidate.v = 2),
    (q) => (q.admission.request.candidate.signature = '00'.repeat(64)),
    (q) => (q.admission.request.candidate.extra = true),
    (q) => (q.admission.request.candidate = r.genesis),
  ];
  for (const change of changes) {
    const q = structuredClone(p);
    change(q);
    assert.throws(() => h.parseStoredPromotion(q));
  }
  let calls = 0;
  for (const target of ['outer', 'reference']) {
    const q = structuredClone(p),
      obj = target === 'outer' ? q : q.admission.request.candidate;
    Object.defineProperty(obj, target === 'outer' ? 'retainedEncoding' : 'signature', {
      enumerable: true,
      get() {
        calls++;
        return 1;
      },
    });
    assert.throws(() => h.parseStoredPromotion(q));
  }
  assert.equal(calls, 0);
  for (const length of [16, 17]) {
    const short = structuredClone(p);
    short.genesis.checkpoint.ct = '00'.repeat(length);
    assert.throws(() => h.parseStoredPromotion(short));
  }
  const changed = structuredClone(r);
  changed.admission.request.candidate.checkpoint.ct = 'ab'.repeat(32);
  assert.throws(() => h.storePromotion(changed));
});
test('150 generated retained histories preserve exact authentication and detect candidate substitution', async () => {
  let attempts = 0;
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 3, max: 9 }),
      fc.uint8Array({ minLength: 18, maxLength: 2048 }),
      fc.integer({ min: 0, max: 255 }),
      async (v, cipher, byte) => {
        const stage = stages.find(([n]) => n === v)[1],
          r = record(f, v, stage);
        r.genesis.checkpoint.ct = hex(cipher);
        r.admission.request.candidate = structuredClone(r.genesis);
        const signed = await h.signPromotion(bytes(f.root), r, crypto.subtle),
          p = h.storePromotion(signed);
        const decoded = h.parseStoredPromotion(structuredClone(p));
        assert.equal(hex(h.promotionPayload(decoded)), hex(message(signed)));
        assert.equal(hex(decoded.mac), mac(key(f.root, signed), message(signed)));
        // Reference equality cannot authenticate a substituted candidate with the same signature locator.
        const changed = structuredClone(p);
        const first = Number.parseInt(changed.genesis.checkpoint.ct.slice(0, 2), 16);
        changed.genesis.checkpoint.ct =
          (first ^ (byte || 1)).toString(16).padStart(2, '0') +
          changed.genesis.checkpoint.ct.slice(2);
        const bad = h.parseStoredPromotion(changed);
        assert.notEqual(mac(key(f.root, signed), message(bad)), hex(signed.mac));
        assert.equal(h.equalPromotion(signed, bad), false);
        attempts++;
      },
    ),
    { seed: 120919, numRuns: 150 },
  );
  report('retained-marker-generated', { status: 'passed', seed: 120919, histories: attempts });
});
