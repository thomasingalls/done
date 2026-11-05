import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
async function load(t, mode) {
  const dir = resolve('test-results/sync-scheduler-controls');
  mkdirSync(dir, { recursive: true });
  const temp = mkdtempSync(join(dir, 'case-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  let code = readFileSync('src/crdt/accountSyncDriver.ts', 'utf8');
  // The actual scheduler must retain the real protocol error class added by R-01.
  const protocolImport = "from '../../account-protocol/envelope'";
  assert.equal(code.split(protocolImport).length, 2, 'scheduler protocol import');
  const changes = {
    fairness: [['const name = due.find((n) => n !== last) ?? due[0];', 'const name = due[0];']],
    overlap: [
      ['if (!ready() || work) {', 'if (!ready()) {'],
      ['if (stopped || work || !ready()) return;', 'if (stopped || !ready()) return;'],
    ],
    halt: [
      [
        "if (cause === 'retry' || (cause === 'authority' && name === 'send' && lane.halt === 'closed'))",
        "if (cause === 'retry' || cause === 'online' || (cause === 'authority' && name === 'send' && lane.halt === 'closed'))",
      ],
    ],
    resume: [["lane.phase = 'working';", "lane.phase = 'working'; lane.due = undefined;"]],
    wake: [
      [
        "if (cause === 'local' && name === 'send') {\n        lane.dirty = true;",
        "if (cause === 'local' && name === 'send') {\n        lane.dirty = active === name ? false : true;",
      ],
    ],
  };
  if (mode)
    for (const [from, to] of changes[mode]) {
      assert.equal(code.split(from).length, 2, 'anchor ' + mode);
      code = code.replace(from, to);
    }
  const entry = resolve('src/crdt/accountSyncDriver.ts');
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
      rolldownOptions: {
        external: ['yjs'],
        output: { codeSplitting: false, entryFileNames: 'scheduler.mjs' },
      },
    },
  });
  assert.equal(hits, 1, 'Actual mutated scheduler is bundled once with its dependencies');
  const output = (Array.isArray(built) ? built[0] : built).output;
  assert.equal(output.length, 1, 'Retain the complete scheduler closure');
  assert.equal(output[0].type, 'chunk');
  assert.equal(output[0].isEntry, true);
  assert.deepEqual(output[0].imports, ['yjs'], 'Only the pinned Yjs package is external');
  assert.equal(output[0].fileName, 'scheduler.mjs');
  assert(
    output[0].dynamicImports.every((name) => name === output[0].fileName),
    'Every dynamic dependency must be retained in the emitted entry',
  );
  const file = join(temp, output[0].fileName);
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}
for (const mode of ['fairness', 'overlap', 'halt', 'resume', 'wake'])
  test('effective composed ' + mode + ' mutation', async (t) => {
    const observations = [];
    for (const mutant of [false, true]) {
      const { createSyncScheduler } = await load(t, mutant ? mode : null);
      let now = 0,
        serial = 0,
        gate = 'ready';
      const timers = new Map(),
        calls = [],
        controller = new AbortController();
      const step = (lane) =>
        new Promise((resolve) =>
          calls.push({
            lane,
            resolve: (kind = 'idle') =>
              resolve({
                kind,
                ...(lane === 'send' ? { acceptedThrough: 0 } : { receivedThrough: 0 }),
                ...(kind === 'blocked' ? { reason: 'conflict' } : {}),
              }),
          }),
        );
      const s = createSyncScheduler({
        signal: controller.signal,
        gate: () => gate,
        send: () => step('send'),
        receive: () => step('receive'),
        detach() {},
        clock: {
          now: () => now,
          set(run, delay) {
            timers.set(++serial, { run, at: now + delay });
            return serial;
          },
          clear(id) {
            timers.delete(id);
          },
        },
      });
      const tick = async (ms = 0) => {
        now += ms;
        const entries = [...timers]
          .filter(([, v]) => v.at <= now)
          .sort((a, b) => a[1].at - b[1].at);
        for (const [id, v] of entries) {
          if (timers.delete(id)) {
            v.run();
            await flush();
          }
        }
      };
      let observed;
      if (mode === 'resume') {
        let once = false;
        s.runtime.onStatus((v) => {
          if (!once && v.send.phase === 'working') {
            once = true;
            gate = 'local-storage';
            s.wake('gate');
          }
        });
        s.wake('start');
        await tick();
        gate = 'ready';
        s.wake('gate');
        await tick();
        observed = calls[0]?.lane;
        assert.equal(observed, mutant ? 'receive' : 'send');
      } else {
        s.wake('start');
        await tick();
        if (mode === 'overlap') {
          s.runtime.retry('receive');
          await tick();
          observed = calls.length;
          assert.equal(observed, mutant ? 2 : 1);
        } else if (mode === 'fairness') {
          calls[0].resolve('progress');
          await flush();
          now = 50;
          await tick();
          observed = calls.at(-1).lane;
          assert.equal(observed, mutant ? 'send' : 'receive');
        } else if (mode === 'halt') {
          calls[0].resolve('blocked');
          await flush();
          await tick();
          calls[1].resolve();
          await flush();
          s.wake('online');
          await tick();
          observed = calls.at(-1).lane;
          assert.equal(observed, mutant ? 'send' : 'receive');
        } else {
          s.wake('local');
          calls[0].resolve();
          await flush();
          await tick();
          calls[1].resolve();
          await flush();
          await tick(50);
          observed = calls.length;
          assert.equal(observed, mutant ? 2 : 3);
        }
      }
      const held = {
        status: s.runtime.status,
        calls: calls.map((c) => c.lane),
        timers: timers.size,
      };
      const closing = s.dispose();
      for (const call of calls) call.resolve();
      await closing;
      observations.push({
        mutant,
        observed,
        held,
        disposed: {
          status: s.runtime.status,
          calls: calls.map((c) => c.lane),
          timers: timers.size,
        },
      });
    }
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-' + mode + '.json'),
        JSON.stringify({ effective: true, observations }, null, 2) + '\n',
      );
  });
