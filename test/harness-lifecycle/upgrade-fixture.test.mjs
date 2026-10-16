import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { withUpgradeFixture } from '../../scripts/app-upgrades/fixture-owner.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'done-upgrade-owner-'));
  mkdirSync(join(root, 'a'));
  writeFileSync(join(root, 'a/index.html'), 'owned fixture');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const failing of [false, true])
  test(`upgrade listener closes after ${failing ? 'failed' : 'successful'} browser work`, async (t) => {
    const root = fixture(t),
      expected = Error('browser work failed');
    let origin;
    const run = withUpgradeFixture(root, async (url) => {
      origin = url;
      assert.equal(await (await fetch(url)).text(), 'owned fixture');
      if (failing) throw expected;
      return 'completed';
    });
    if (failing) await assert.rejects(run, (error) => error === expected);
    else assert.equal(await run, 'completed');
    await assert.rejects(fetch(origin));
  });

test(
  'hard-killing the upgrade owner cannot leave its HTTP fixture listening',
  { timeout: 15000 },
  async (t) => {
    const root = fixture(t),
      script = join(root, 'owner.mjs');
    writeFileSync(
      script,
      `import { withUpgradeFixture } from ${JSON.stringify(new URL('../../scripts/app-upgrades/fixture-owner.mjs', import.meta.url).href)};
    await withUpgradeFixture(${JSON.stringify(root)}, async (origin) => {
      process.send(origin); await new Promise(() => {});
    });`,
    );
    const child = fork(script, { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    });
    const [origin] = await once(child, 'message');
    assert.equal(await (await fetch(origin)).text(), 'owned fixture');
    const ended = once(child, 'exit');
    child.kill('SIGKILL');
    const [code, signal] = await ended;
    assert.equal(code, null);
    assert.equal(signal, 'SIGKILL');
    await assert.rejects(fetch(origin));
  },
);
