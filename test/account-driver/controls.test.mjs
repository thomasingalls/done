import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'vite';
import { emitBundle } from '../../scripts/lib/emitted-bundle.mjs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
async function mutant(t, mode) {
  let code = readFileSync('src/crdt/accountDriver.ts', 'utf8');
  const changes =
    mode === 'overlap'
      ? [
          ['if (stopped || work || !gate()) return;', 'if (stopped || !gate()) return;'],
          ['if (work) return;', 'void work;'],
        ]
      : [
          [
            "publish({ phase: 'working', retryAt: null, reason: null });\n        if (stopped || !gate()) return;",
            "publish({ phase: 'working', retryAt: null, reason: null });",
          ],
        ];
  for (const [from, to] of changes) {
    assert.equal(code.split(from).length, 2, 'Mutation anchor ' + mode);
    code = code.replace(from, to);
  }
  const entry = resolve('src/crdt/accountDriver.ts');
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'scheduler-control',
        enforce: 'pre',
        transform(_source, id) {
          if (id === entry) return code;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      target: 'esnext',
      lib: { entry, formats: ['es'] },
    },
  });
  const emitted = emitBundle(result, resolve('test-results/account-driver-controls'));
  t.after(emitted.clear);
  return import(pathToFileURL(emitted.entry).href);
}
const tick = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};
for (const mode of ['overlap', 'after-close'])
  test(`actual scheduler ${mode} control demonstrates its prohibited invocation`, async (t) => {
    const { createDeliveryScheduler } = await mutant(t, mode),
      signal = new AbortController();
    let tasks = [],
      calls = 0,
      releases = [];
    const s = createDeliveryScheduler({
      signal: signal.signal,
      gate: () => 'ready',
      detach() {},
      clock: {
        now: () => 0,
        set: (f) => {
          tasks.push(f);
          return f;
        },
        clear: (f) => (tasks = tasks.filter((x) => x !== f)),
      },
      step: () => {
        calls++;
        return new Promise((resolve) => releases.push(resolve));
      },
    });
    if (mode === 'after-close')
      s.onStatus((v) => {
        if (v.phase === 'working') signal.abort();
      });
    s.wake(true);
    tasks.shift()();
    await tick();
    if (mode === 'overlap') {
      s.wake(true);
      tasks.shift()();
      await tick();
      assert.equal(calls, 2);
    } else assert.equal(calls, 1);
    signal.abort();
    for (const release of releases) release({ kind: 'idle', acceptedThrough: 0 });
    await s.dispose();
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-' + mode + '.json'),
        JSON.stringify(
          {
            mode,
            calls,
            outcome:
              mode === 'overlap'
                ? 'Two owner passes invoked concurrently.'
                : 'An owner pass starts after a synchronous observer closes the scheduler.',
          },
          null,
          2,
        ) + '\n',
      );
  });
