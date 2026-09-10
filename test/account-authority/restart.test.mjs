import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { authorityFixture, policy, nonce } from './fixtures.mjs';
import { verifyPinnedAuthority } from '../../account-protocol/authority.ts';
function worker(t, input) {
  const child = fork(new URL('./worker.mjs', import.meta.url), [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const result = once(child, 'message').then(([message]) => message),
    exit = once(child, 'exit');
  child.send(input);
  return { result, exit };
}
for (const killAt of ['before-commit', 'after-commit'])
  test(
    `SIGKILL ${killAt}: cold operator recovery never silently rekeys`,
    { timeout: 8000 },
    async (t) => {
      const f = authorityFixture(t),
        path = join(f.dir, 'crash.sqlite'),
        input = { path, policy, key: f.key.toString('hex') };
      const crash = worker(t, { ...input, operation: 'initialize', killAt });
      const [code, signal] = await crash.exit;
      assert.equal(code, null);
      assert.equal(signal, 'SIGKILL');
      const n = nonce(),
        cold = worker(t, { ...input, operation: 'open', nonce: n }),
        result = await cold.result;
      await cold.exit;
      if (killAt === 'before-commit') assert.equal(result.ok, false);
      else {
        assert.equal(result.ok, true);
        assert.deepEqual(await verifyPinnedAuthority(result.pin, n, result.proof), result.pin);
      }
      const reinit = worker(t, { ...input, operation: 'initialize' }),
        again = await reinit.result;
      await reinit.exit;
      assert.equal(again.ok, false);
      assert.match(again.error, /EEXIST/);
    },
  );
test(
  'competing processes initialize exactly one root and can cold-recover the winner',
  { timeout: 8000 },
  async (t) => {
    const f = authorityFixture(t),
      path = join(f.dir, 'race.sqlite'),
      input = { path, policy, key: f.key.toString('hex') };
    const a = worker(t, { ...input, operation: 'initialize' }),
      b = worker(t, { ...input, operation: 'initialize' });
    const results = await Promise.all([a.result, b.result]);
    await Promise.all([a.exit, b.exit]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    const winner = results.find((r) => r.ok);
    const cold = worker(t, { ...input, operation: 'open', nonce: nonce() }),
      result = await cold.result;
    await cold.exit;
    assert.deepEqual(result.pin, winner.pin);
  },
);
