import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('origin gate scans the selected disposable build and still refuses remote code and empty output', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'done-origin-control-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const scan = (...args) =>
    spawnSync(process.execPath, [resolve('scripts/check-origin-isolation.mjs'), ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
  assert.notEqual(scan('--dist', dir).status, 0);
  const file = join(dir, 'app.js');
  writeFileSync(file, 'document.createElementNS("http://www.w3.org/2000/svg", "svg");');
  assert.equal(scan('--dist', dir).status, 0);
  writeFileSync(file, 'import "https://example.invalid/code.js";');
  const refused = scan('--dist', dir);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /remote origin reference/);
  assert.notEqual(scan('--dist').status, 0);
  assert.notEqual(scan('--ignored', dir).status, 0);
});
