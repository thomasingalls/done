import test from 'node:test';
import assert from 'node:assert/strict';
import {
  load,
  l,
  carriers,
  decode,
  json,
  hex,
  at,
  nodes,
  replace,
  invalidTypes,
  property,
  report,
  fc,
  Y,
} from './helpers.mjs';
import { sourceValues, spoolValues } from '../account-ledger-contract/oracle.mjs';
const h = await load();
const position = carriers.find((d) => d.family === 'spool' && d.input.type === 'position');

test('generated coercible source hashes must be rejected by the spool decoder', () => {
  property(
    'hash-reproduction',
    fc.integer({ min: 1, max: 5 }),
    (n) => {
      const v = structuredClone(position.values);
      let value = v[9][2];
      for (let i = 0; i < n; i++) value = [value];
      v[9][2] = value;
      assert.throws(() => decode(h, position, json(v)));
    },
    112104,
  );
});

for (const family of ['source', 'spool', 'delivery'])
  test('generated ' + family + ' nested type mutations reach the decoder', () => {
    const ds = carriers.filter((d) => d.family === family);
    const cases = ds.flatMap((d) => nodes(d.values).map((path) => ({ d, path })));
    property(
      family + '-types',
      fc.tuple(fc.integer({ min: 0, max: cases.length - 1 }), fc.nat({ max: 10 })),
      ([pick, mutation]) => {
        const { d, path } = cases[pick],
          invalid = invalidTypes(at(d.values, path));
        assert.throws(
          () => decode(h, d, json(replace(d.values, path, invalid[mutation % invalid.length]))),
          d.id + ':' + path.join('.'),
        );
      },
      112105 + ['source', 'spool', 'delivery'].indexOf(family),
      400,
    );
  });

test('decoder numeric boundaries and nested response/submission damage refuse without encoder prechecks', () => {
  let negatives = 0;
  for (const d of carriers.filter((d) => d.family !== 'source')) {
    const index = d.family === 'spool' ? 8 : 10;
    for (const n of [-1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null, []]) {
      assert.throws(() => decode(h, d, json(replace(d.values, [index], n))));
      negatives++;
    }
    const wirePath = d.family === 'delivery' ? [11] : d.input.type === 'envelope' ? [9, 1] : null;
    if (wirePath)
      for (const v of [
        '',
        '0',
        'gg',
        'ab',
        at(d.values, wirePath) + '00',
        at(d.values, wirePath).slice(0, -2),
      ]) {
        assert.throws(() => decode(h, d, json(replace(d.values, wirePath, v))));
        negatives++;
      }
  }
  for (const index of [-1, 64, 1.5, '0'])
    assert.throws(() => decode(h, position, json(replace(position.values, [9, 1], index))));
  for (const d of carriers.filter((d) => d.family === 'spool' && d.input.type !== 'position'))
    for (const attempt of [0, -1, 1.5, 2 ** 32, '1'])
      assert.throws(() =>
        decode(h, d, json(replace(d.values, d.input.type === 'attempt' ? [9] : [9, 0], attempt))),
      );
  report('wire-boundaries', { negatives });
});

test('generated valid reference positions and invocation counts preserve exact independent wire bytes', () => {
  property(
    'spool-positive',
    fc.tuple(
      fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      fc.integer({ min: 0, max: 63 }),
      fc.integer({ min: 1, max: 2 ** 32 - 1 }),
    ),
    ([n, index, attempt]) => {
      for (const entry of [
        { type: 'position', position: n, source: { ...position.input.source, index } },
        { type: 'attempt', position: n, attempt },
      ]) {
        const wire = json(spoolValues(l.route, entry));
        const out = h.decodeSpoolEntry(wire, l.route);
        assert.deepEqual(out, entry);
        assert.equal(hex(h.encodeSpoolEntry(out, l.route)), hex(wire));
      }
    },
    112108,
  );
});

test('generated real Yjs updates and both actor kinds round-trip while malformed count and frame data refuse', () => {
  property(
    'source-positive',
    fc.tuple(fc.string({ maxLength: 150 }), fc.boolean(), fc.integer({ min: 1, max: 64 })),
    ([text, system, count]) => {
      const doc = new Y.Doc({ gc: false });
      try {
        doc.clientID = 123;
        doc.getText('text').insert(0, text);
        const source = {
          actor: system ? 'system' : l.route.principal,
          kind: system ? 'system' : 'human',
          bytes: hex(Y.encodeStateAsUpdate(doc)),
        };
        const c = { ...l.capsule, sources: Array(count).fill(source) };
        const wire = json(sourceValues(c)),
          out = h.decodeSourceCapsule(wire, l.route);
        assert.equal(out.sources.length, count);
        assert.equal(hex(out.sources[0].bytes), source.bytes);
        assert.equal(hex(h.encodeSourceCapsule(out)), hex(wire));
      } finally {
        doc.destroy();
      }
    },
    112109,
    150,
  );
  for (const n of [0, 65])
    assert.throws(() =>
      h.decodeSourceCapsule(
        json(sourceValues({ ...l.capsule, sources: Array(n).fill(l.capsule.sources[0]) })),
        l.route,
      ),
    );
  for (const b of ['', 'ff', '0', 'GG']) {
    const c = structuredClone(l.capsule);
    c.sources[0].bytes = b;
    assert.throws(() => h.decodeSourceCapsule(json(sourceValues(c)), l.route));
  }
});

test('source wire limit accepts a real near-limit frame and refuses the first larger canonical wire', () => {
  const limit = 2 * 1024 * 1024;
  const make = (n) => {
    const doc = new Y.Doc({ gc: false });
    try {
      doc.clientID = 123;
      doc.getText('text').insert(0, 'a'.repeat(n));
      return json(
        sourceValues({
          ...l.capsule,
          sources: [{ ...l.capsule.sources[0], bytes: hex(Y.encodeStateAsUpdate(doc)) }],
        }),
      );
    } finally {
      doc.destroy();
    }
  };
  let low = 900000,
    high = 1100000;
  while (high - low > 1) {
    const n = Math.floor((low + high) / 2);
    if (make(n).length <= limit) low = n;
    else high = n;
  }
  const accepted = make(low),
    refused = make(high);
  assert.ok(accepted.length <= limit && refused.length > limit);
  assert.equal(hex(h.encodeSourceCapsule(h.decodeSourceCapsule(accepted, l.route))), hex(accepted));
  assert.throws(() => h.decodeSourceCapsule(refused, l.route));
  for (const d of carriers)
    assert.throws(() =>
      decode(h, d, new Uint8Array((d.family === 'source' ? limit : 2 * limit) + 1)),
    );
  report('source-byte-bound', {
    acceptedBytes: accepted.length,
    refusedBytes: refused.length,
    textBytes: low,
  });
});
