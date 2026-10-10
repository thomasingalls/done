import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const faults = {
  abort: ['verifiedRecords.ts', 'if (at === revision) clear();', 'void at;'],
  late: [
    'verifiedRecords.ts',
    "if (at !== revision) throw Error('Verification view was invalidated');",
    'void at;',
  ],
  prefix: ['incrementalAccountLedger.ts', ' || !sameBytes(a.bytes, b.bytes)', ''],
};
async function bundle(fault) {
  const target = faults[fault];
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: target
      ? [
          {
            name: 'one-invalidation-fault',
            enforce: 'pre',
            transform(code, id) {
              if (!id.endsWith('/' + target[0])) return;
              assert.equal(code.split(target[1]).length, 2, 'exact executed fault anchor');
              hits++;
              return code.replace(target[1], target[2]);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      rollupOptions: { output: { codeSplitting: false } },
      lib: { entry: resolve('test/incremental-ledger/entry.ts'), formats: ['es'] },
    },
  });
  assert.equal(hits, target ? 1 : 0);
  const dir = mkdtempSync(join(tmpdir(), 'done-incremental-control-')),
    file = join(dir, 'client.mjs');
  writeFileSync(
    file,
    (Array.isArray(result) ? result[0] : result).output.find((x) => x.type === 'chunk').code,
  );
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const row = (seq, byte = seq) => ({ seq, gen: 1, kind: 'update', bytes: new Uint8Array([byte]) });
async function observe(api) {
  const initial = [row(1)],
    next = [row(1), row(2)],
    view = api.createVerifiedRecords(),
    current = () => {};
  const readable = (records) => {
    try {
      view.read(records);
      return true;
    } catch {
      return false;
    }
  };
  await view.verify(initial, 1, async () => 1, current);
  await view
    .verify(
      next,
      2,
      async () => 2,
      current,
      async () => {
        throw Error('abort');
      },
    )
    .catch(() => {});
  const abort = readable(initial);
  await view.verify(initial, 1, async () => 1, current);
  let release;
  const pending = view.verify(
    next,
    2,
    async () => 2,
    current,
    async (previous) => {
      await new Promise((r) => (release = r));
      return previous + 1;
    },
  );
  view.clear();
  release();
  await pending.catch(() => {});
  const late = readable(next);
  view.clear();
  const prefix = api.appendedRecords(initial, [row(1, 99), row(2)]) !== undefined;
  return { abort, late, prefix };
}
test('three controls expose stale success after abort, late reinstatement and changed-old-row append classification', async () => {
  const reference = await observe(await bundle());
  assert.deepEqual(reference, { abort: false, late: false, prefix: false });
  for (const fault of Object.keys(faults)) {
    const observed = await observe(await bundle(fault));
    assert.equal(observed[fault], true, fault + ' control must expose prohibited reuse');
  }
});
