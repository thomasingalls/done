import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};
async function load(t, mode) {
  const dir = resolve('test-results/receive-scheduler-controls');
  mkdirSync(dir, { recursive: true });
  const temp = mkdtempSync(join(dir, 'case-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  let code = readFileSync('src/crdt/accountReceiveDriver.ts', 'utf8');
  const changes = {
    overlap: [
      ['if (stopped || work || !ready()) return;', 'if (stopped || !ready()) return;'],
      ['if (expedited && !work) {', 'if (expedited) {'],
      ['if (!ready() || work || due === undefined) {', 'if (!ready() || due === undefined) {'],
    ],
    poll: [
      [
        'due = clock.now() + (expedited ? 0 : delay);',
        "due = result.kind === 'idle' ? undefined : clock.now() + (expedited ? 0 : delay);",
      ],
    ],
    halt: [
      [
        "if (cause === 'retry') halt = undefined;",
        "if (cause === 'retry' || cause === 'online') halt = undefined;",
      ],
    ],
    observer: [['if (!ready() || stopped) return;', 'void stopped;']],
    resume: [
      [
        "phase = 'working';\n        if (!ready() || stopped) return;\n        due = undefined;",
        "phase = 'working';\n        due = undefined;\n        if (!ready() || stopped) return;",
      ],
    ],
  };
  if (mode)
    for (const [from, to] of changes[mode]) {
      assert.equal(code.split(from).length, 2, 'Mutation anchor ' + mode);
      code = code.replace(from, to);
    }
  const entry = resolve('src/crdt/accountReceiveDriver.ts');
  let hits = 0;
  const built = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'actual-scheduler-control-closure',
        enforce: 'pre',
        transform(_source, id) {
          if (id !== entry) return;
          hits++;
          return code;
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
  assert.equal(hits, 1, 'Actual mutated scheduler is bundled once with its dependencies');
  const output = (Array.isArray(built) ? built[0] : built).output;
  assert.equal(output.length, 1, 'Retain the complete scheduler closure');
  assert.equal(output[0].type, 'chunk');
  assert.equal(output[0].isEntry, true);
  const file = join(temp, 'scheduler.mjs');
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}
for (const mode of ['overlap', 'poll', 'halt', 'observer', 'resume'])
  test(`actual ${mode} omission exposes prohibited scheduling`, async (t) => {
    const observations = [];
    for (const changed of [false, true]) {
      const { createReceiveScheduler } = await load(t, changed ? mode : null),
        controller = new AbortController();
      let gate = 'ready';
      let now = 0,
        serial = 0,
        calls = 0;
      const timers = new Map(),
        pending = [];
      const s = createReceiveScheduler({
        signal: controller.signal,
        gate: () => gate,
        detach() {},
        clock: {
          now: () => now,
          set(fn, delay) {
            timers.set(++serial, { fn, at: now + delay });
            return serial;
          },
          clear(id) {
            timers.delete(id);
          },
        },
        step: () => {
          calls++;
          return new Promise((r) => pending.push(r));
        },
      });
      const tick = async (ms) => {
        now += ms;
        for (const [id, timer] of [...timers])
          if (timer.at <= now) {
            timers.delete(id);
            timer.fn();
            await flush();
          }
      };
      if (mode === 'observer')
        s.onStatus((v) => {
          if (v.phase === 'working') controller.abort();
        });
      let paused = false;
      if (mode === 'resume')
        s.onStatus((v) => {
          if (v.phase === 'working' && !paused) {
            paused = true;
            gate = 'local-storage';
            s.wake();
          }
        });
      s.wake('start');
      await tick(0);
      if (mode === 'overlap') {
        s.wake('retry');
        await tick(0);
        assert.equal(calls, changed ? 2 : 1);
      }
      if (mode === 'poll') {
        pending.shift()({ kind: 'idle', receivedThrough: 0 });
        await flush();
        await tick(5000);
        assert.equal(calls, changed ? 1 : 2);
      }
      if (mode === 'halt') {
        pending.shift()({ kind: 'blocked', reason: 'conflict', receivedThrough: 0 });
        await flush();
        s.wake('online');
        await tick(0);
        assert.equal(calls, changed ? 2 : 1);
      }
      if (mode === 'observer') assert.equal(calls, changed ? 1 : 0);
      if (mode === 'resume') {
        assert.equal(calls, 0);
        gate = 'ready';
        s.wake();
        await tick(0);
        assert.equal(calls, changed ? 0 : 1);
      }
      observations.push({ changed, calls, timers: timers.size, status: s.status() });
      controller.abort();
      for (const release of pending) release({ kind: 'idle', receivedThrough: 0 });
      await s.dispose();
      observations.at(-1).disposed = { calls, timers: timers.size, status: s.status() };
    }
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-' + mode + '.json'),
        JSON.stringify({ mode, effective: true, observations }, null, 2) + '\n',
      );
  });
