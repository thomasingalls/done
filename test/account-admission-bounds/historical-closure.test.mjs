import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { historicalBundle } from '../../scripts/lib/historical-bundle.mjs';

test('historical production graphs match independent Git blob identities without current source imports', async () => {
  const parent = resolve('test-results/historical-bundles');
  mkdirSync(parent, { recursive: true });
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  for (const revision of [
    '83785967428cfd04b2ebbe9179c33db772a79b08',
    '6398e33da4fd4b5b413de23078a04707557599bf',
  ]) {
    const bridge =
      "export { readPromotion as historicalAuthenticatedRead } from './src/crdt/promotionRecord';\n";
    const previous = new Set(readdirSync(parent));
    const script = await historicalBundle(revision, bridge);
    const candidates = readdirSync(parent).filter((n) => !previous.has(n));
    assert.equal(candidates.length, 1);
    const directory = join(parent, candidates[0]);
    const identity = JSON.parse(readFileSync(join(directory, 'identity.json')));
    assert.equal(identity.bridge, bridge);
    assert.equal(identity.commit, revision);
    const tree = execFileSync(
      'git',
      [
        'ls-tree',
        '-r',
        revision,
        '--',
        'src',
        'account-protocol',
        'wasm',
        'package.json',
        'pnpm-lock.yaml',
      ],
      { encoding: 'utf8' },
    );
    const blobs = new Map(
      tree
        .trim()
        .split('\n')
        .map((row) => {
          const [header, path] = row.split('\t');
          return [path, header.split(' ')[2]];
        }),
    );
    assert.deepEqual(identity.source.map((f) => f.path).sort(), [...blobs.keys()].sort());
    for (const file of identity.source) {
      const bytes = readFileSync(join(directory, 'source', file.path));
      assert.equal(sha(bytes), file.sha256, file.path);
      assert.equal(
        createHash('sha1')
          .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
          .digest('hex'),
        blobs.get(file.path),
        file.path,
      );
    }
    assert.ok(identity.modules.includes('src/crdt/promotionRecord.ts'));
    assert.ok(identity.modules.some((id) => id.startsWith('account-protocol/')));
    assert.ok(identity.modules.every((id) => !id.startsWith('/') || id.includes('/node_modules/')));
    assert.equal(sha(readFileSync(join(directory, 'reader.js'))), identity.bundleSha256);
    assert.ok(script.includes('historicalAuthenticatedRead'));
  }
});
