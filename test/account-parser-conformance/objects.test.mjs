import test from 'node:test';
import assert from 'node:assert/strict';
import {
  load,
  f,
  promotions,
  fc,
  at,
  replace,
  nodes,
  invalidTypes,
  report,
  property,
  hex,
} from './helpers.mjs';
import { message } from '../account-promotion-contract/oracle.mjs';
const h = await load();
const objects = [
  ...promotions.map((input) => ({ name: input.stage, input, parse: h.parsePromotion })),
  { name: 'admission', input: f.admission.request, parse: h.parseAdmissionRequest },
];

test('generated coercible stage values must be rejected by the promotion parser', () => {
  property(
    'stage-reproduction',
    fc.integer({ min: 1, max: 5 }),
    (n) => {
      const input = structuredClone(promotions[1]);
      let value = input.stage;
      for (let i = 0; i < n; i++) value = [value];
      input.stage = value;
      assert.throws(() => h.parsePromotion(input));
    },
    112101,
  );
});

test('all nested data nodes reject incompatible types across thirteen promotions and admission', () => {
  const counts = [],
    accepted = [];
  for (const { name, input, parse } of objects) {
    parse(input);
    let count = 0;
    for (const path of nodes(input))
      for (const v of invalidTypes(at(input, path))) {
        try {
          parse(replace(input, path, v));
          accepted.push({ name, path, value: v });
        } catch {}
        count++;
      }
    counts.push({ name, count });
  }
  report('nested-types', { counts, accepted });
  assert.deepEqual(accepted, []);
});

test('sparse retained arrays cannot skip validation of credentials, actors or recipients', () => {
  const accepted = [];
  for (const { name, input, parse } of objects) {
    for (const path of nodes(input).filter(
      (p) => Array.isArray(at(input, p)) && at(input, p).length,
    )) {
      for (let i = 0; i < at(input, path).length; i++) {
        const changed = structuredClone(input);
        delete at(changed, path)[i];
        try {
          parse(changed);
          accepted.push({ name, path, hole: i });
        } catch {}
      }
    }
  }
  report('sparse-arrays', { accepted });
  assert.deepEqual(accepted, []);
});

test('direct admission omissions and extra keys, inherited-only fields and cyclic data refuse', () => {
  const input = f.admission.request;
  let missing = 0,
    extras = 0;
  for (const path of nodes(input).filter((p) => p.length)) {
    const changed = structuredClone(input);
    delete at(changed, path.slice(0, -1))[path.at(-1)];
    assert.throws(() => h.parseAdmissionRequest(changed), path.join('.'));
    missing++;
  }
  for (const path of nodes(input).filter(
    (p) => at(input, p) && typeof at(input, p) === 'object' && !Array.isArray(at(input, p)),
  )) {
    assert.throws(() =>
      h.parseAdmissionRequest(replace(input, path, { ...at(input, path), extra: true })),
    );
    extras++;
  }
  for (const { input, parse } of objects) {
    assert.throws(() => parse(Object.create(input)));
    assert.deepEqual(
      parse(Object.assign(Object.create(null), structuredClone(input))),
      parse(input),
    );
    const changed = structuredClone(input);
    const field = input.kind === 'local-promotion' ? 'source' : 'candidate';
    changed[field] = changed;
    assert.throws(() => parse(changed));
  }
  report('object-shapes', { missing, extras, inheritedAndCyclic: objects.length });
});

test('generated valid promotion budgets and detached credential bytes preserve independent payloads', () => {
  property(
    'promotion-positive',
    fc.tuple(
      fc.integer({ min: 0, max: 12 }),
      fc.integer({ min: 5, max: 2 ** 32 - 1 }),
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
    ),
    ([pick, budget, mac]) => {
      const input = structuredClone(promotions[pick]);
      input.sealReserved = budget;
      input.mac = mac;
      const parsed = h.parsePromotion(input);
      assert.equal(hex(h.promotionPayload(parsed)), hex(message(input)));
      assert.deepEqual(parsed, input);
      input.mac.fill(0);
      if (input.credentials) input.credentials[0].sealed.ct.fill(0);
      assert.notEqual(parsed.mac, input.mac);
      if (input.credentials)
        assert.notEqual(parsed.credentials[0].sealed.ct, input.credentials[0].sealed.ct);
    },
    112102,
  );
  for (const n of [-1, 0, 4, 5.5, 2 ** 32, Number.MAX_SAFE_INTEGER, Infinity, NaN])
    assert.throws(() => h.parsePromotion({ ...promotions[1], sealReserved: n }));
});

test('generated admission scalar corruptions execute the direct parser', () => {
  const input = f.admission.request;
  const candidates = nodes(input).filter((p) => ['string', 'number'].includes(typeof at(input, p)));
  property(
    'admission-types',
    fc.tuple(fc.integer({ min: 0, max: candidates.length - 1 }), fc.integer({ min: 0, max: 3 })),
    ([pick, kind]) => {
      const path = candidates[pick];
      assert.throws(() =>
        h.parseAdmissionRequest(replace(input, path, invalidTypes(at(input, path))[kind])),
      );
    },
    112103,
  );
});

test('admission nested genesis limits are checked at the declared byte edges', () => {
  const input = f.admission.request,
    results = [];
  for (const [path, min, max] of [
    [['candidate', 'coverage', 'snapshot'], 2, 16 * 1024 * 1024],
    [['candidate', 'checkpoint', 'ct'], 18, 16 * 1024 * 1024 + 16],
  ]) {
    for (const n of [min - 1, min, max, max + 1]) {
      const raw = replace(input, path, 'ab'.repeat(n));
      if (n >= min && n <= max) assert.equal(at(h.parseAdmissionRequest(raw), path).length, n * 2);
      else assert.throws(() => h.parseAdmissionRequest(raw));
      results.push({ path, n, accepted: n >= min && n <= max });
    }
  }
  report('admission-bounds', results);
});
