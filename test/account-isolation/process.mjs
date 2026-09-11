import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
export async function worker(t, p, point = '', operation = '') {
  const child = fork(
    new URL('../account-admission/worker.mjs', import.meta.url),
    [
      p.f.path,
      p.authority.path,
      JSON.stringify(p.authority.pin),
      p.authority.key.toString('hex'),
      point,
      operation,
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  let errors = '';
  child.stderr.on('data', (b) => (errors += b));
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const [ready] = await Promise.race([
    once(child, 'message'),
    once(child, 'exit').then(() => {
      throw Error(errors);
    }),
  ]);
  assert.equal(ready.ready, true);
  return {
    child,
    async call(action, input) {
      const response = once(child, 'message');
      child.send({ action, input });
      const [r] = await response;
      assert(!r.error, r.error);
      return r.result;
    },
    async close() {
      const done = once(child, 'exit');
      child.send({ action: 'close' });
      await done;
    },
  };
}
