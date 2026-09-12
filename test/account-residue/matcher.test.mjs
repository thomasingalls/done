import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { matchBytes, assess, LIMITS } from './matcher.mjs';
import { collectValues, collectSql } from './node-collector.mjs';
import { variants } from './representations.mjs';
test('all declared encodings, offsets and nested raw values detect independently generated Unicode', () => {
  const n = { id: 'unicode', values: ['needle_雪_é_🙂_' + randomBytes(16).toString('hex')] };
  for (const [encoding, bytes] of Object.entries(variants(n.values[0]))) {
    const r = matchBytes(bytes, [n]);
    assert(
      r.matches.some((m) => m.needle === n.id),
      encoding,
    );
    assert.deepEqual(r.issues, [], encoding);
    assert.equal(matchBytes(Buffer.from('clean unrelated'), [n]).matches.length, 0);
  }
});
test('raw bytes match before hashing; exact views, properties and unknown SQL paths are not allowlisted', () => {
  const n = { id: 'raw', values: ['needle_' + randomBytes(16).toString('hex')] },
    b = Buffer.from(n.values[0]);
  const base = collectValues('arbitrary', { [n.values[0]]: b.subarray(0), map: [1, 2] });
  assert.equal(assess([base], [n], ['arbitrary']).verdict, 'prohibited-match');
  assert.equal(
    assess([base], [n], ['arbitrary'], () => false, LIMITS, 'hash').matches.length,
    0,
    'source omission should break assertion',
  );
  const aligned = variants(n.values[0]).offset1;
  assert(matchBytes(aligned, [n]).matches.length > 0);
  assert.equal(matchBytes(aligned, [n], LIMITS, 'base64').matches.length, 0);
});
test('missing, unreadable, compressed and exhausted observations never become a clean negative', () => {
  const n = { id: 'probe', values: ['needle_missing_control'] };
  assert.equal(assess([], [n], ['missing']).verdict, 'incomplete');
  assert.equal(collectSql('/private/tmp/nonexistent-residue-db', 'sql').complete, false);
  assert(
    matchBytes(Buffer.from([31, 139, 8, 0]), [n]).issues.includes(
      'unsupported-compressed-container',
    ),
  );
  assert(
    matchBytes(Buffer.alloc(11), [n], { ...LIMITS, valueBytes: 10 }).issues.includes(
      'decode-byte-budget',
    ),
  );
  assert(
    matchBytes(
      Buffer.from(JSON.stringify({ v: Buffer.from(n.values[0]).toString('base64') })),
      [n],
      { ...LIMITS, decodeDepth: 0 },
    ).issues.includes('decode-depth-budget'),
  );
  const c = collectValues('x', {
    get boom() {
      throw Error('must not invoke');
    },
  });
  assert.equal(c.complete, false);
  assert.deepEqual(c.errors, ['unsupported-accessor']);
  const leak = collectValues('x', n.values[0]);
  leak.complete = false;
  leak.errors.push('other-unreadable');
  const result = assess([leak], [n], ['x']);
  assert.equal(result.verdict, 'prohibited-match');
  assert(result.issues.length);
});
test('record fragmentation is a demonstrated unqualified representation, not a fabricated clean-history proof', () => {
  const n = { id: 'split', values: ['needle_fragmentation_' + randomBytes(16).toString('hex')] },
    value = n.values[0];
  const c = collectValues('records', [value.slice(0, 12), value.slice(12)]);
  assert.equal(assess([c], [n], ['records']).matches.length, 0);
});

test('explicit random 32-byte calibration needle, including encoded transport, is independent of text markers', () => {
  const bytes = randomBytes(32),
    n = { id: 'calibration-key', raw: [bytes.toString('base64')] };
  assert(matchBytes(bytes, [n]).matches.some((m) => m.needle === n.id));
  assert(
    matchBytes(Buffer.from(bytes.toString('base64url')), [n]).matches.some(
      (m) => m.needle === n.id,
    ),
  );
  assert.equal(matchBytes(Buffer.alloc(32), [n]).matches.length, 0);
});

test('empty or duplicate manifests cannot qualify an empty scan', () => {
  assert.throws(() => assess([], [], []), /manifest/);
  assert.throws(
    () =>
      assess(
        [],
        [
          { id: 'x', values: ['a'] },
          { id: 'x', values: ['b'] },
        ],
        [],
      ),
    /manifest/,
  );
});

test('a timed-out SQL worker yields incomplete coverage and terminates', async () => {
  const { boundedSql } = await import('./node-collector.mjs');
  const r = await boundedSql('/private/tmp/nonexistent-residue-db', 'sql', {
    ...LIMITS,
    collectorMs: 1,
  });
  assert.equal(r.complete, false);
  assert.deepEqual(r.errors, ['collector-timeout']);
});

test('unexpected fresh predecessor state is not accepted as harmless metadata', async () => {
  const { freshScopeIssues } = await import('./policy.mjs');
  const raw = (location, text) => ({ location, raw: Buffer.from(text).toString('base64') });
  assert.equal(
    freshScopeIssues([
      { surface: 'indexedDB', entries: [raw(['database', 'done'], 'done')] },
      {
        surface: 'localStorage',
        entries: [
          raw(['key', 'done.actor'], 'done.actor'),
          raw(['value', 'done.pending-update.old'], '1:AAAA'),
        ],
      },
    ]).length,
    3,
  );
});

test('observer-looking fence bytes are still matched in the raw diagnostic stream', () => {
  const n = { id: 'fence', values: ['RESIDUE-FENCE:7'] };
  const c = collectValues('diagnostics:service', { stdout: Buffer.from('\nRESIDUE-FENCE:7\n') });
  assert.equal(assess([c], [n], ['diagnostics:service']).verdict, 'prohibited-match');
});

test('the acquisition/matching module graph has no product dependencies', async () => {
  const { readFileSync } = await import('node:fs');
  const allowed = new Set([
    'node:crypto',
    'node:sqlite',
    'node:fs',
    'node:worker_threads',
    'node:zlib',
    './containers.mjs',
    './matcher.mjs',
    './browser-collector.mjs',
    './node-collector.mjs',
  ]);
  for (const file of [
    'matcher.mjs',
    'browser-collector.mjs',
    'node-collector.mjs',
    'sql-worker.mjs',
    'containers.mjs',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const m of source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g))
      assert(allowed.has(m[1]), file + ': ' + m[1]);
  }
});
