/** Real read-only runner boundary; synthetic read faults never modify the repository snapshot. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  snapshot = join(root, 'docs/release-validation-graph.json'),
  runner = join(root, 'scripts/release-validation/check.mjs');
function run(fault, t) {
  const args = [];
  if (fault) {
    const dir = mkdtempSync(join(tmpdir(), 'done-snapshot-budget-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'read-fault.mjs');
    writeFileSync(
      path,
      `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';const read=fs.readFileSync;fs.readFileSync=function(path,...rest){const value=read.call(this,path,...rest);if(String(path)!==${JSON.stringify(new URL('file://' + snapshot).href)})return value;return ${fault === 'size' ? "value+' '.repeat(700001)" : 'JSON.stringify({...JSON.parse(value),schema:999})'};};syncBuiltinESMExports();`,
    );
    args.push('--import', path);
  }
  return spawnSync(process.execPath, [...args, runner], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
}
test('read-only check budgets the recorded snapshot and remains read-only when raw JSON exceeds the same limit', (t) => {
  const before = readFileSync(snapshot),
    raw = JSON.stringify(JSON.parse(before), null, 2) + '\n';
  assert.ok(before.length <= 700000);
  assert.ok(
    Buffer.byteLength(raw) > 700000,
    'This retained regression requires the real formerly failing representation boundary',
  );
  const r = run(undefined, t);
  assert.equal(r.status, 0, r.stderr);
  const row = JSON.parse(r.stdout.split('\n')[0]);
  assert.equal(row.snapshotBytes, before.length);
  assert.deepEqual(readFileSync(snapshot), before);
});
test('oversized saved bytes still fail the unchanged 700kB budget before any agreement can pass', (t) => {
  const before = readFileSync(snapshot),
    r = run('size', t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Inventory exceeds the 700 kB/);
  assert.deepEqual(readFileSync(snapshot), before);
});
test('a small drifted snapshot still fails independent inventory agreement', (t) => {
  const before = readFileSync(snapshot),
    r = run('drift', t);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stderr, /Inventory exceeds the 700 kB/);
  assert.match(r.stderr, /Planning inventory drifted/);
  assert.deepEqual(readFileSync(snapshot), before);
});
