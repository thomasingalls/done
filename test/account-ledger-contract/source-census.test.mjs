import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './runtime.mjs';
import { fixture, history, json, sourceValues } from './oracle.mjs';
import { report } from './helpers.mjs';

const h = await load(),
  prior = await load('repeatedSourceReader'),
  f = fixture();

function inspect(lib, rows) {
  const parse = JSON.parse;
  let sourceReads = 0;
  JSON.parse = (...args) => {
    const value = parse(...args);
    if (Array.isArray(value) && value[0] === 'done/source-capture/v1') sourceReads++;
    return value;
  };
  try {
    return { state: lib.inspectSpool(rows, f.route), sourceReads };
  } finally {
    JSON.parse = parse;
  }
}

test('a cold spool census reads each source once for its tag and once for full validation', () => {
  const results = [];
  for (const n of [1, 8, 32, 128]) {
    const rows = history(f, Array(n).fill(1)).records.reverse(),
      before = structuredClone(rows),
      a = inspect(h, rows),
      b = inspect(prior, rows);
    assert.deepEqual(a.state, b.state);
    assert.deepEqual(rows, before, 'borrowed carrier bytes must survive census cleanup');
    assert.equal(a.sourceReads, 2 * n);
    assert.equal(b.sourceReads, 4 * n);
    results.push({ sources: n, candidateReads: a.sourceReads, previousReads: b.sourceReads });
  }
  report('source-census-growth', results);
});

test('identical duplicate sources retain their earliest sequence; late and conflicting sources refuse', () => {
  const rows = history(f, [1]).records,
    duplicate = { ...rows[0], seq: rows.length + 1, bytes: rows[0].bytes.slice() },
    repeated = [...rows, duplicate].reverse();
  assert.deepEqual(h.inspectSpool(repeated, f.route), prior.inspectSpool(repeated, f.route));
  const late = [...rows.slice(1), duplicate];
  for (const lib of [h, prior]) assert.throws(() => lib.inspectSpool(late, f.route), /late source/);
  const altered = JSON.parse(new TextDecoder().decode(duplicate.bytes));
  altered[8][0][2] = f.updates[1];
  duplicate.bytes = new Uint8Array(json(altered));
  for (const lib of [h, prior])
    assert.throws(() => lib.inspectSpool([...rows, duplicate], f.route), /Conflicting source/);
});

test('metadata is rebuilt for each census and still checks source indices and canonical framing', () => {
  const rows = history(f, [1]).records;
  h.inspectSpool(rows, f.route);
  const allocation = JSON.parse(new TextDecoder().decode(rows[1].bytes));
  allocation[9][1] = 1;
  rows[1].bytes = new Uint8Array(json(allocation));
  for (const lib of [h, prior])
    assert.throws(() => lib.inspectSpool(rows, f.route), /Missing source index/);

  const raw = json(sourceValues(f.capsule));
  for (const bytes of [
    Buffer.concat([raw, Buffer.from(' ')]),
    Buffer.from(raw.toString().replace(',1,', ',1.0,')),
  ])
    assert.throws(
      () =>
        h.captureCatalog(
          [{ kind: 'outbound', seq: 1, gen: 1, bytes: new Uint8Array(bytes) }],
          f.route,
        ),
      /unreadable/,
    );

  const fresh = history(f, [1]).records;
  h.inspectSpool(fresh, f.route);
  fresh[0].bytes[0] = 0xff;
  for (const lib of [h, prior]) assert.throws(() => lib.inspectSpool(fresh, f.route), /Unreadable/);
});
