/** Failed Vite startup must release resources and finish, not just print an error. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve(
  'test-results/storage-harness',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log('Storage harness lifecycle evidence: ' + output);
for (const [name, port] of [
  ['custody', 5176],
  ['content', 5177],
  ['journal', 5178],
  ['storage-properties', 5186],
]) {
  test(
    `${name}: occupied test port exits with a harness error and releases Vite`,
    { timeout: 25000 },
    async (t) => {
      const blocker = createServer();
      await new Promise((done, reject) => {
        blocker.once('error', reject);
        blocker.listen(port, '127.0.0.1', done);
      });
      t.after(() => new Promise((done) => blocker.close(done)));
      const destination = resolve(output, name);
      const child = spawn(
        process.execPath,
        [`scripts/${name}/run.mjs`, '--no-mutants', '--output', destination],
        {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let text = '',
        timedOut = false;
      const kill = () => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      };
      t.after(kill);
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, 20000);
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (b) => {
          text += b;
        });
      let code;
      try {
        code = await new Promise((done, reject) => {
          child.once('error', reject);
          child.once('close', done);
        });
      } finally {
        clearTimeout(timer);
        writeFileSync(resolve(output, name + '.log'), text);
      }
      assert.equal(timedOut, false, 'a logged startup error must not leave a live process');
      assert.equal(code, 2);
      const report = JSON.parse(readFileSync(resolve(destination, 'report.json')));
      assert.equal(report.exitCode, 2);
      assert.match(report.fatal.message, new RegExp(`Port ${port} is already in use`));
      assert.equal(report.mutations.length, 0, 'startup errors are not mutation detections');
    },
  );
}
