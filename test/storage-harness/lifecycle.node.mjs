/** Current owned workers use ephemeral ports; the remaining fixed-port campaign must fail cleanly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawnOwnedGroup as spawn } from '../../scripts/release-validation/nested-groups.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createStageRunner } from '../../scripts/release-validation/stage.mjs';
import { currentIdentity, digest } from '../../scripts/release-validation/identity.mjs';
import { installedChromium } from '../../scripts/release-validation/browser.mjs';
import { custodyStage } from '../../scripts/release-validation/custody-adapter.mjs';
import { contentStage } from '../../scripts/release-validation/content-adapter.mjs';
import { journalStage } from '../../scripts/release-validation/journal-adapter.mjs';

const output = resolve(
  'test-results/storage-harness',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log('Storage harness lifecycle evidence: ' + output);
const block = async (t, port) => {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  t.after(() => new Promise((done) => server.close(done)));
  return server;
};
for (const [name, port, selected] of [
  ['custody', 5176, 'C12.genesis'],
  ['content', 5177, 'C15.ceiling'],
  ['journal', 5178, 'C03.refusals'],
]) {
  test(
    `${name}: an occupied former port does not prevent the owned ephemeral fixture from closing cleanly`,
    { timeout: 25000 },
    async (t) => {
      const blocker = await block(t, port),
        root = process.cwd(),
        destination = join(output, name);
      const factory = { custody: custodyStage, content: contentStage, journal: journalStage }[name];
      const stage = factory(root, ['--case', selected, '--no-mutants'], 'port-control:' + name);
      const run = createStageRunner({
        root,
        output: destination,
        fingerprint: () => ({
          ...currentIdentity(root),
          tools: { chromium: digest(installedChromium().snapshot) },
        }),
        browserRuntime: installedChromium(),
      });
      const receipt = await run(stage, { signal: t.signal });
      assert.equal(receipt.status, 'passed', JSON.stringify(receipt.result));
      assert(receipt.result.groupDrained);
      assert.equal(blocker.address().port, port);
      const report = JSON.parse(readFileSync(join(destination, receipt.key, 'cases.json')));
      assert.equal(report.servers.length, 1);
      assert(
        report.servers.every(
          (server) => server.closed && Number(new URL(server.origin).port) !== port,
        ),
      );
      assert.equal(report.mutations.length, 0);
      assert.deepEqual(
        receipt.result.cases.map((row) => row.id),
        [selected],
      );
    },
  );
}
test(
  'storage-properties: occupied test port exits with a harness error and releases Vite',
  { timeout: 25000 },
  async (t) => {
    await block(t, 5186);
    const destination = resolve(output, 'storage-properties');
    const child = spawn(
      process.execPath,
      ['scripts/storage-properties/run.mjs', '--no-mutants', '--output', destination],
      { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
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
      writeFileSync(resolve(output, 'storage-properties.log'), text);
    }
    assert.equal(timedOut, false, 'a logged startup error must not leave a live process');
    assert.equal(code, 2, text);
    const report = JSON.parse(readFileSync(resolve(destination, 'report.json')));
    assert.equal(report.exitCode, 2);
    assert.match(report.fatal.message, /Port 5186 is already in use/);
    assert.equal(report.mutations.length, 0, 'startup errors are not mutation detections');
  },
);
