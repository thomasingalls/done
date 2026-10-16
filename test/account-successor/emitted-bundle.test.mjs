import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { emitBundle } from '../../scripts/lib/emitted-bundle.mjs';

test('emitted adapter imports its actual entry and retains lazy siblings and binary assets', async (t) => {
  const parent = resolve('test-results/emitted-graph-regression');
  mkdirSync(parent, { recursive: true });
  const input = mkdtempSync(join(parent, 'source-'));
  t.after(() => rmSync(input, { recursive: true, force: true }));
  writeFileSync(
    join(input, 'entry.ts'),
    "export const load = () => import('./lazy').then(m => m.answer);\n",
  );
  writeFileSync(join(input, 'lazy.ts'), 'export const answer = 42;\n');
  const bytes = new Uint8Array([0, 255, 17, 128]);
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'fixture-asset',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'nested/bytes.bin', source: bytes });
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      target: 'esnext',
      lib: { entry: join(input, 'entry.ts'), formats: ['es'] },
    },
  });
  const built = Array.isArray(result) ? result[0] : result;
  assert.ok(built.output.filter((f) => f.type === 'chunk').length > 1);
  built.output.sort(
    (a, b) => Number(a.type === 'chunk' && a.isEntry) - Number(b.type === 'chunk' && b.isEntry),
  );
  assert.ok(!built.output[0].isEntry);
  const emitted = emitBundle(built, parent);
  t.after(emitted.clear);
  const receipt = JSON.parse(readFileSync(join(emitted.directory, 'bundle-manifest.json')));
  assert.deepEqual(
    receipt.files.map((f) => f.path).sort(),
    built.output.map((f) => f.fileName).sort(),
  );
  for (const file of receipt.files)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(emitted.directory, file.path)))
        .digest('hex'),
      file.sha256,
    );
  assert.deepEqual(readFileSync(join(emitted.directory, 'nested/bytes.bin')), Buffer.from(bytes));
  assert.equal(await (await import(pathToFileURL(emitted.entry))).load(), 42);
  emitted.clear();
  assert.equal(existsSync(emitted.directory), false);
});
