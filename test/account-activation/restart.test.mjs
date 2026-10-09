import { evidence } from './fixtures.mjs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { prepared } from '../account-admission/core-fixtures.mjs';
async function worker(t, x, point = '', operation = '') {
  const child = fork(
    new URL('../account-admission/worker.mjs', import.meta.url),
    [
      x.f.path,
      x.authority.path,
      JSON.stringify(x.authority.pin),
      x.authority.key.toString('hex'),
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
  const [m] = await Promise.race([
    once(child, 'message'),
    once(child, 'exit').then(() => {
      throw Error(errors);
    }),
  ]);
  assert.equal(m.ready, true);
  return {
    child,
    async call(action, input) {
      const result = once(child, 'message');
      child.send({ action, input });
      const [r] = await result;
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
for (const operation of ['challenge-promotion'])
  for (const side of ['before-commit', 'after-commit'])
    test(
      `SIGKILL ${side} ${operation} recovers one durable result`,
      { timeout: 10000 },
      async (t) => {
        const x = await prepared(t),
          action = 'challengePromotion';
        const offer = await x.begin();
        const input = offer
          ? {
              retryKey: x.account.retryKey,
              requestDigest: offer.epoch.requestDigest,
              completion: await x.completion(offer),
            }
          : { retryKey: x.account.retryKey, request: x.request };
        const crash = await worker(t, x, side, operation),
          death = once(crash.child, 'exit');
        crash.child.send({ action, input });
        const [code, signal] = await death;
        assert.equal(code, null);
        assert.equal(signal, 'SIGKILL');
        const before = x.f.rows('promotions'),
          cold = await worker(t, x),
          result = await cold.call(action, input);
        assert.equal(result.kind, 'promotion-activation-challenge');
        if (side === 'after-commit') assert.deepEqual(x.f.rows('promotions'), before);
        const retry = await cold.call(action, input);
        assert.deepEqual(retry, result);
        const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
        evidence('restart-' + side, {
          side,
          operation,
          code,
          signal,
          before: hash(before),
          after: hash(x.f.rows('promotions')),
          result,
          retry,
        });
        await cold.close();
      },
    );
