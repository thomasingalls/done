import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { ready, policy, renewal } from './fixtures.mjs';

for (const point of ['before-commit', 'after-commit'])
  test(
    `SIGKILL ${point}: cold issuance recovers without reusing a seal nonce`,
    { timeout: 10000 },
    async (t) => {
      const x = await ready(t),
        a = x.begin();
      const child = fork(new URL('./worker.mjs', import.meta.url), [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      t.after(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      });
      const started = once(child, 'message', { signal: AbortSignal.timeout(5000) });
      child.send({
        kind: 'open',
        path: x.f.path,
        config: { ...x.config, operatorKey: x.config.operatorKey.toString('hex') },
        policy,
        point,
      });
      assert.equal((await started)[0].ready, true);
      const ended = once(child, 'exit', { signal: AbortSignal.timeout(5000) });
      child.send({ kind: 'finish', proof: a.proof });
      assert.equal((await ended)[1], 'SIGKILL');
      x.f.restart();
      assert.equal(x.f.rows('session_custody')[0].seal_counter, 1);
      assert.equal(x.f.rows('network_sessions').length, point === 'after-commit' ? 1 : 0);
      const r = await x.sessions.finish(a.proof);
      assert.equal(r.stage, 'issued');
      assert.equal(
        JSON.parse(x.f.rows('network_sessions')[0].result_seal).counter,
        point === 'after-commit' ? 1 : 2,
      );
      x.f.restart();
      assert.deepEqual(await x.sessions.finish(a.proof), r);
      assert.equal(x.sessions.renew(renewal(r)).stage, 'access');
    },
  );
