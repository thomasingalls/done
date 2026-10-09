/** Fail before build when the required exact-version integration repair is missing or mixed. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync('vendor-patches/yjs-13.6.31.json', 'utf8'));
const root = dirname(require.resolve('yjs/package.json'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  manifest.version,
);
assert.equal(
  hash(manifest.patch),
  manifest.patchHash,
  'Patch manifest must match the checked-in bytes',
);
assert(
  readFileSync('pnpm-lock.yaml', 'utf8').includes(
    `  yjs@${manifest.version}: ${manifest.patchHash}`,
  ),
  'Lockfile must pin this patch',
);
assert(
  readFileSync('pnpm-workspace.yaml', 'utf8').includes(
    `  yjs@${manifest.version}: ${manifest.patch}`,
  ),
  'Workspace must install this patch',
);
for (const [file, pins] of Object.entries(manifest.files))
  assert.equal(hash(join(root, file)), pins.patched, 'Wrong Yjs runtime/source: ' + file);
const cjs = realpathSync(require.resolve('yjs'));
for (const peer of ['y-codemirror.next', 'y-indexeddb', 'y-protocols/awareness', 'y-websocket'])
  assert.equal(
    realpathSync(createRequire(require.resolve(peer)).resolve('yjs')),
    cjs,
    'Mixed Yjs peer: ' + peer,
  );
// Separate processes avoid mixing Yjs constructors while exercising both exported runtime formats.
for (const mode of ['import', 'require']) {
  const load =
    mode === 'import'
      ? "import * as Y from 'yjs';"
      : "import {createRequire} from 'node:module'; const Y=createRequire(import.meta.url)('yjs');";
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `${load}
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const {source,order}=JSON.parse(readFileSync('test/core-reproductions/original-order.json')).outcome;
const doc=new Y.Doc();try{for(const id of order)Y.applyUpdate(doc,Uint8Array.from(source.updates[id]));assert.deepEqual(source.names.map(n=>doc.getText(n).toString()),source.expected);assert.equal(doc.store.pendingStructs,null);assert.equal(doc.store.pendingDs,null);}finally{doc.destroy();}`,
    ],
    { stdio: 'pipe' },
  );
}
console.log(
  'Yjs patch: source/ESM/CJS hashes, lock/workspace pins, four peer resolutions and both runtime regressions pass.',
);
