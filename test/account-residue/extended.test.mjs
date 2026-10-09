import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { matchBytes, assess, LIMITS } from './matcher.mjs';
import { collectFiles } from './files.mjs';
import { collectSql } from './node-collector.mjs';
import fc from 'fast-check';
const limits = { ...LIMITS, containers: true };
test('a random ciphertext PK prefix is not a ZIP signature', () => {
  const bytes = Buffer.from('504b7722fdecdeadbeef', 'hex'),
    n = needle();
  assert.deepEqual(matchBytes(bytes, [n]).issues, []);
  assert.deepEqual(matchBytes(bytes, [n], limits).issues, []);
});
const needle = () => ({ id: 'plant', values: ['plant_雪_' + randomBytes(16).toString('hex')] });
const zip = (text, method) =>
  execFileSync(
    'python3',
    [
      '-c',
      'import sys,io,zipfile\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w",compression=int(sys.argv[1])) as z: z.writestr("unknown.txt",sys.stdin.buffer.read())\nsys.stdout.buffer.write(b.getvalue())',
      String(method),
    ],
    { input: text, timeout: 5000, maxBuffer: 1024 * 1024 },
  );
test('60 generated nested container histories preserve detection and refuse corrupt gzip', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 24, maxLength: 200 }),
      fc.integer({ min: 0, max: 3 }),
      (text, levels) => {
        const n = { id: 'generated', values: ['generated_' + text] };
        let bytes = Buffer.from(
          JSON.stringify({ nested: Buffer.from(n.values[0]).toString('base64') }),
        );
        for (let i = 0; i <= levels; i++) bytes = gzipSync(bytes);
        const found = matchBytes(bytes, [n], { ...limits, decodeDepth: 16 });
        assert(found.matches.length);
        assert.deepEqual(found.issues, []);
        bytes[bytes.length - 8] ^= 1;
        assert(matchBytes(bytes, [n], limits).issues.length);
      },
    ),
    { seed: 1209214, numRuns: 60 },
  );
});
test('independent stored/deflated ZIP and gzip controls, nested encodings and malformed/budget refusals', () => {
  const n = needle();
  for (const bytes of [
    zip(n.values[0], 0),
    zip(n.values[0], 8),
    gzipSync(n.values[0]),
    gzipSync(zip(Buffer.from(n.values[0]).toString('base64'), 8)),
  ]) {
    const result = matchBytes(bytes, [n], limits);
    assert(result.matches.some((m) => m.needle === n.id));
    assert.deepEqual(result.issues, []);
    assert(matchBytes(bytes.subarray(0, bytes.length - 4), [n], limits).issues.length);
    assert(matchBytes(bytes, [n], { ...limits, valueBytes: 4 }).issues.length);
  }
  for (const method of [0, 8]) {
    assert.equal(matchBytes(zip('clean', method), [n], limits).matches.length, 0);
    const bad = zip(n.values[0], method);
    bad[14] ^= 1;
    assert(matchBytes(bad, [n], limits).issues.length, 'CRC mismatch');
  }
  assert(matchBytes(zip('clean', 12), [n], limits).issues.length, 'bzip2 remains unsupported');
  assert(
    matchBytes(gzipSync('x'.repeat(4096)), [n], { ...limits, valueBytes: 1024 }).issues.length,
  );
  assert(matchBytes(gzipSync(n.values[0]), [n]).issues.length, 'R1 scope remains explicit');
});
test('raw files detect unknown carriers and deleted SQLite bytes missed by logical rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'done-file-calibration-')),
    n = needle();
  let db;
  try {
    writeFileSync(join(dir, 'unexpected'), gzipSync(n.values[0]));
    assert.equal(
      assess([collectFiles(dir)], [n], ['files'], () => false, limits).verdict,
      'prohibited-match',
    );
    rmSync(join(dir, 'unexpected'));
    const path = join(dir, 'opaque.db');
    db = new DatabaseSync(path);
    db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA secure_delete=OFF; CREATE TABLE arbitrary(value TEXT);',
    );
    db.prepare('INSERT INTO arbitrary VALUES (?)').run(n.values[0]);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE); DELETE FROM arbitrary;');
    assert.equal(
      assess([collectSql(path, 'sql')], [n], ['sql']).verdict,
      'complete-no-prohibited-match',
    );
    assert.equal(
      assess([collectFiles(dir)], [n], ['files'], () => false, limits).verdict,
      'prohibited-match',
    );
    db.close();
    db = null;
    assert.equal(
      assess([collectFiles(dir)], [n], ['files'], () => false, limits).verdict,
      'prohibited-match',
    );
    symlinkSync(path, join(dir, 'link'));
    assert.equal(collectFiles(dir).complete, false);
    assert.equal(collectFiles(dir, 'files', { ...limits, valueBytes: 1 }).complete, false);
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
