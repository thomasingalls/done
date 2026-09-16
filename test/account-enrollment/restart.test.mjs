import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { ready, census } from './fixtures.mjs';
const limit = (p) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Worker deadline exceeded')), 5000);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });
async function worker(t, x, point = '', operation = '', mode = 'kill') {
  const child = fork(
    new URL('./worker.mjs', import.meta.url),
    [
      x.f.path,
      x.authority.path,
      JSON.stringify(x.authority.pin),
      x.authority.key.toString('hex'),
      point,
      `enrollment-${operation}`,
      mode,
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  let errors = '';
  child.stderr.on('data', (b) => (errors += b));
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const first = await limit(
    Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(() => {
        throw Error(errors);
      }),
    ]),
  );
  assert.equal(first[0].ready, true);
  return {
    child,
    call: async (operation, input) => {
      const reply = limit(once(child, 'message'));
      child.send({ operation, input });
      const [m] = await reply;
      assert(!m.error, m.error);
      return m.result;
    },
    close: async () => {
      const exit = limit(once(child, 'exit'));
      child.send({ close: true });
      await exit;
    },
  };
}
for (const operation of ['begin', 'finish', 'cancel'])
  for (const point of ['before-commit', 'after-commit'])
    test(
      `SIGKILL ${point} ${operation} recovers the committed state`,
      { timeout: 10000 },
      async (t) => {
        const x = await ready(t),
          e = x.candidate(),
          before = census(x);
        const c = operation === 'begin' ? null : await x.enroll('begin', e.input);
        const input =
          operation === 'begin'
            ? e.input
            : operation === 'finish'
              ? x.prove(e, c)
              : { retryKey: e.input.retryKey };
        const w = await worker(t, x, point, operation),
          death = limit(once(w.child, 'exit'));
        w.child.send({ operation, input });
        const [code, signal] = await death;
        assert.equal(code, null);
        assert.equal(signal, 'SIGKILL');
        const rows = x.f.rows('enrollment_preparations');
        if (operation === 'begin') assert.equal(rows.length, point === 'before-commit' ? 0 : 1);
        else
          assert.equal(
            rows[0].stage,
            point === 'before-commit'
              ? 'challenge'
              : operation === 'finish'
                ? 'prepared'
                : 'cancelled',
          );
        const cold = await worker(t, x),
          r = await cold.call(operation, input);
        assert.equal(
          r.stage,
          { begin: 'challenge', finish: 'prepared', cancel: 'cancelled' }[operation],
        );
        if (point === 'after-commit') assert.deepEqual(x.f.rows('enrollment_preparations'), rows);
        assert.deepEqual(await cold.call(operation, input), r);
        assert.equal(census(x), before);
        await cold.close();
      },
    );
test(
  'a second service process cancels while the first is stopped after proof verification',
  { timeout: 10000 },
  async (t) => {
    const x = await ready(t),
      e = x.candidate(),
      c = await x.enroll('begin', e.input),
      input = x.prove(e, c);
    const slow = await worker(t, x, 'after-verify', 'finish', 'pause'),
      other = await worker(t, x);
    const paused = limit(once(slow.child, 'message'));
    slow.child.send({ operation: 'finish', input });
    assert.equal((await paused)[0].paused, true);
    assert.equal((await other.call('cancel', { retryKey: e.input.retryKey })).stage, 'cancelled');
    const reply = limit(once(slow.child, 'message'));
    slow.child.kill('SIGCONT');
    assert.equal((await reply)[0].result.stage, 'cancelled');
    assert.equal(x.f.rows('enrollment_preparations')[0].proof_hash, null);
    await slow.close();
    await other.close();
  },
);
