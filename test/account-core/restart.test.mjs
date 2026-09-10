import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fixture, fresh, authenticator, finishRequest, registered } from './fixtures.mjs';

async function worker(t, path, point = '', operation = '') {
  const child = fork(new URL('./worker.mjs', import.meta.url), [path, point, operation], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const [message] = await Promise.race([
    once(child, 'message'),
    once(child, 'exit').then(() => {
      throw Error(`Child exited: ${errors}`);
    }),
    new Promise((_, reject) => {
      const deadline = setTimeout(() => reject(Error('Child startup deadline')), 5000);
      deadline.unref();
      child.once('message', () => clearTimeout(deadline));
    }),
  ]);
  assert.equal(message.ready, true);
  return {
    child,
    async call(action, input) {
      const result = once(child, 'message');
      child.send({ action, input });
      const [message] = await result;
      assert(!message.error, message.error);
      return message.result;
    },
    async close() {
      const exited = once(child, 'exit');
      child.send({ action: 'close' });
      await exited;
    },
  };
}

for (const operation of ['begin', 'register', 'confirm-registration', 'authenticate', 'cancel']) {
  for (const point of ['before-commit', 'after-commit']) {
    test(
      `SIGKILL ${point} ${operation}: cold process recovers one outcome`,
      { timeout: 10000 },
      async (t) => {
        const f = fixture(t),
          key = authenticator(),
          retryKey = fresh();
        let action, input;
        if (operation === 'begin') {
          action = 'begin';
          input = { operation: 'register', retryKey };
        } else if (operation === 'authenticate') {
          const item = await registered(f);
          f.seedActive(item.result.accountId);
          const view = f.core.begin({ operation: 'authenticate', retryKey });
          action = 'finish';
          input = finishRequest(view, retryKey, item.key.assert(view));
        } else {
          const view = f.core.begin({ operation: 'register', retryKey });
          if (operation === 'cancel') {
            action = 'cancel';
            input = { retryKey };
          } else if (operation === 'register') {
            action = 'finish';
            input = finishRequest(view, retryKey, key.register(view));
          } else {
            const next = await f.core.finish(finishRequest(view, retryKey, key.register(view)));
            action = 'finish';
            input = finishRequest(next, retryKey, key.assert(next));
          }
        }
        const before = f.rows('ceremonies').filter((row) => row.proof_hash !== null).length;
        const crash = await worker(t, f.path, point, operation);
        const death = once(crash.child, 'exit');
        crash.child.send({ action, input });
        const [code, signal] = await death;
        assert.equal(code, null);
        assert.equal(signal, 'SIGKILL');
        const cold = await worker(t, f.path);
        const progress = await cold.call('resume', { retryKey });
        if (point === 'before-commit') {
          assert.equal(
            f.rows('ceremonies').filter((row) => row.proof_hash !== null).length,
            before,
          );
          if (operation === 'begin') assert.equal(progress.refusal, 'unknown-attempt');
          if (operation === 'cancel') assert.equal(progress.stage, 'ceremony');
        } else if (operation === 'cancel') assert.equal(progress.refusal, 'cancelled');
        else if (operation === 'begin') assert.equal(progress.operation, 'register');
        else
          assert.equal(
            f.rows('ceremonies').filter((row) => row.proof_hash !== null).length,
            before + 1,
          );
        const recovered = await cold.call(action, input);
        assert.equal(recovered.ok, true);
        assert.deepEqual(await cold.call(action, input), recovered);
        assert.equal(f.rows('accounts').length, 1);
        await cold.close();
      },
    );
  }
}
