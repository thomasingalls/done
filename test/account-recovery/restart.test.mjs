import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { prepared, fixture, registered, scope } from './fixtures.mjs';
import { generateRecovery } from '../../src/account/recovery.ts';
async function worker(t, path, point = '', operation = '') {
  const child = fork(
    new URL('../account-core/worker.mjs', import.meta.url),
    [path, point, operation],
    {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  );
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

for (const operation of ['begin-recovery', 'finalize-recovery', 'cancel-recovery'])
  for (const point of ['before-commit', 'after-commit']) {
    test(
      'SIGKILL ' + point + ' ' + operation + ' resumes from a cold process',
      { timeout: 10000 },
      async (t) => {
        let f, account, action, input;
        if (operation === 'begin-recovery') {
          f = fixture(t);
          account = await registered(f);
          action = 'beginRecovery';
          input = { retryKey: account.retryKey, draft: (await generateRecovery(scope)).draft };
        } else {
          const item = await prepared(t);
          f = item.f;
          account = item.account;
          action = operation === 'finalize-recovery' ? 'finishRecovery' : 'cancelRecovery';
          input = action === 'finishRecovery' ? item.proof : { retryKey: account.retryKey };
        }
        const crash = await worker(t, f.path, point, operation),
          death = once(crash.child, 'exit');
        crash.child.send({ action, input });
        const [code, signal] = await death;
        assert.equal(code, null);
        assert.equal(signal, 'SIGKILL');
        const cold = await worker(t, f.path),
          progress = await cold.call('resumeRecovery', { retryKey: account.retryKey });
        if (point === 'before-commit')
          assert.equal(
            progress.stage ?? progress.refusal,
            operation === 'begin-recovery' ? 'unknown-attempt' : 'recovery-ceremony',
          );
        else
          assert.equal(
            progress.stage ?? progress.refusal,
            operation === 'begin-recovery'
              ? 'recovery-ceremony'
              : operation === 'finalize-recovery'
                ? 'recovery-confirmed'
                : 'cancelled',
          );
        const result = await cold.call(action, input);
        assert.equal(result.ok, true);
        assert.deepEqual(await cold.call(action, input), result);
        assert.equal(f.rows('accounts')[0].state, 'pending');
        await cold.close();
      },
    );
  }
