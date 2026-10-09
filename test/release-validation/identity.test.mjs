import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  sourcePaths,
  filePins,
  dependencyPins,
  digest,
  identityKey,
} from '../../scripts/release-validation/identity.mjs';

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'done-inputs-')),
    root = join(base, 'checkout');
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  const write = (path, bytes) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  };
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return { base, root, write };
}

test('source closure discovers new runtime helpers and does not read unrelated untracked root files', (t) => {
  const f = fixture(t);
  execFileSync('git', ['init', '--quiet', f.root]);
  f.write('.gitignore', 'node_modules/\ntest-results/\n');
  f.write('src/existing.ts', 'first');
  execFileSync('git', ['-C', f.root, 'add', '.gitignore', 'src/existing.ts']);
  f.write('done ', 'unrelated and not part of execution');
  f.write('test-results/report.json', '{}');
  const before = digest(filePins(f.root, sourcePaths(f.root)));
  f.write('src/new-helper.ts', 'new');
  assert(sourcePaths(f.root).includes('src/new-helper.ts'));
  assert(!sourcePaths(f.root).includes('done '));
  assert(!sourcePaths(f.root).includes('test-results/report.json'));
  assert.notEqual(digest(filePins(f.root, sourcePaths(f.root))), before);
  rmSync(join(f.root, 'src/existing.ts'));
  assert.deepEqual(filePins(f.root, ['src/existing.ts']), [
    { path: 'src/existing.ts', absent: true },
  ]);
  const current = sourcePaths(process.cwd());
  for (const path of [
    'src/crdt/verificationMemo.ts',
    'src/crdt/verifiedRecords.ts',
    'src/crdt/archiveProjection.ts',
    'src/crdt/localRecovery.ts',
    'src/ui/LocalRecovery.tsx',
    'account-protocol/diagnostics.ts',
    'account-service/deliveryVerification.ts',
  ])
    assert(current.includes(path), 'Fresh audit scope omitted ' + path);
});

test('installed dependency changes invalidate identity while lockfile and versions stay unchanged', (t) => {
  const f = fixture(t);
  f.write('pnpm-lock.yaml', 'same lockfile');
  f.write('node_modules/pkg/package.json', '{"version":"1.0.0"}');
  f.write('node_modules/pkg/index.mjs', 'export const value = 1;');
  const before = digest(dependencyPins(f.root));
  f.write('node_modules/pkg/index.mjs', 'export const value = 2;');
  assert.notEqual(digest(dependencyPins(f.root)), before);
  const changed = digest(dependencyPins(f.root));
  f.write('node_modules/new-package/index.mjs', 'new input');
  assert.notEqual(digest(dependencyPins(f.root)), changed);
});

test('only the two reviewed pnpm metadata links materialize; external package links refuse', (t) => {
  const f = fixture(t),
    metadata = join(f.base, 'metadata.json');
  writeFileSync(metadata, '{"packages":{}}');
  symlinkSync(metadata, join(f.root, 'node_modules/.package-map.json'));
  const linked = dependencyPins(f.root);
  rmSync(join(f.root, 'node_modules/.package-map.json'));
  f.write('node_modules/.package-map.json', '{"packages":{}}');
  assert.deepEqual(dependencyPins(f.root), linked);
  symlinkSync(metadata, join(f.root, 'node_modules/unreviewed.mjs'));
  assert.throws(() => dependencyPins(f.root), /External input symlink/);
});

test('revision, source, dependency and actual runtime binary identities all bind reusable execution', () => {
  const before = {
    revision: 'a',
    sourceDigest: 'source',
    dependencyDigest: 'deps',
    runtime: { node: 'v26', binary: 'bytes-a', platform: 'darwin', arch: 'arm64' },
  };
  for (const patch of [
    { revision: 'b' },
    { sourceDigest: 'new' },
    { dependencyDigest: 'new' },
    { runtime: { ...before.runtime, binary: 'bytes-b' } },
  ])
    assert.notEqual(identityKey(before), identityKey({ ...before, ...patch }));
});
