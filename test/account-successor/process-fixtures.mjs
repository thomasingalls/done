import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
export const deadline = (p) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Successor worker deadline')), 5000);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });
export async function worker(t, x, point = '', mode = 'kill', root = process.cwd()) {
  const child = fork(
    new URL('./worker.mjs', import.meta.url),
    [
      x.f.path,
      x.authority.path,
      JSON.stringify(x.authority.pin),
      x.authority.key.toString('hex'),
      point,
      mode,
      root,
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced' },
  );
  let errors = '';
  child.stderr.on('data', (b) => (errors += b));
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const [first] = await deadline(
    Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(() => {
        throw Error(errors);
      }),
    ]),
  );
  assert.equal(first.ready, true);
  return {
    child,
    async call(operation, input) {
      const p = deadline(once(child, 'message'));
      child.send({ operation, input });
      const [r] = await p;
      assert(!r.error, r.error);
      return r.result;
    },
    async close() {
      const p = deadline(once(child, 'exit'));
      child.send({ close: true });
      await p;
    },
  };
}
