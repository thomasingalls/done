import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { historicalBundle } from '../../scripts/lib/historical-bundle.mjs';

const revision = '534252e1dde26a02020491b2f42e2481513abb98';
const bridge = "export { openOwnedAccountReceiveStore } from './src/crdt/accountReceive';";
const name = 'import.meta.env.VITE_ACCOUNT_LEDGER';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('historical reference builds reject source replacement definitions outside the closed mode switch', () => {
  for (const define of [{ other: 'true' }, { [name]: 'true' }, { [name]: '"reference" || true' }])
    assert.throws(() => historicalBundle(revision, bridge, define), /Unsupported historical/);
});

test('pre-group modes have distinct pinned complete graphs and capture their build definitions', async () => {
  const parent = resolve('test-results/historical-bundles');
  mkdirSync(parent, { recursive: true });
  const scripts = [];
  for (const mode of ['reference', 'incremental']) {
    const previous = new Set(readdirSync(parent));
    const define = { [name]: JSON.stringify(mode) };
    const pending = historicalBundle(revision, bridge, define);
    define[name] = JSON.stringify(mode === 'reference' ? 'incremental' : 'reference');
    const script = await pending;
    scripts.push(script);
    const candidates = readdirSync(parent).filter((entry) => !previous.has(entry));
    assert.equal(candidates.length, 1);
    const directory = join(parent, candidates[0]);
    const identity = JSON.parse(readFileSync(join(directory, 'identity.json')));
    assert.equal(identity.commit, revision);
    assert.equal(identity.bridge, bridge);
    assert.deepEqual(identity.define, { [name]: JSON.stringify(mode) });
    for (const path of [
      'src/crdt/accountReceive.ts',
      'src/crdt/contentStore.ts',
      'src/crdt/receiveSelection.ts',
    ]) {
      const original = execFileSync('git', ['show', revision + ':' + path]);
      assert.equal(identity.source.find((entry) => entry.path === path).sha256, sha(original));
      assert.equal(sha(readFileSync(join(directory, 'source', path))), sha(original));
      assert.ok(identity.modules.includes(path), path);
    }
    assert.ok(identity.modules.some((id) => id.startsWith('account-protocol/')));
    assert.ok(identity.modules.every((id) => !id.startsWith('/') || id.includes('/node_modules/')));
    assert.equal(sha(readFileSync(join(directory, 'reader.js'))), identity.bundleSha256);
    assert.match(script, /openOwnedAccountReceiveStore/);
    assert.equal(
      await historicalBundle(revision, bridge, { [name]: JSON.stringify(mode) }),
      script,
    );
  }
  assert.notEqual(scripts[0], scripts[1]);
});
