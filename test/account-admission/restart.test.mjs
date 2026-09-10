import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { prepared } from './core-fixtures.mjs';
async function worker(t, x, point = '', operation = '') {
  const child = fork(
    new URL('./worker.mjs', import.meta.url),
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
for (const operation of ['offer-promotion', 'admit-promotion'])
  for (const side of ['before-commit', 'after-commit'])
    test(
      `SIGKILL ${side} ${operation} recovers one durable result`,
      { timeout: 10000 },
      async (t) => {
        const x = await prepared(t),
          action = operation === 'offer-promotion' ? 'beginPromotion' : 'finishPromotion';
        const offer = operation === 'admit-promotion' ? await x.begin() : undefined;
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
        assert.equal(result.kind, offer ? 'promotion-receipt' : 'promotion-offer');
        if (side === 'after-commit') assert.deepEqual(x.f.rows('promotions'), before);
        assert.deepEqual(await cold.call(action, input), result);
        await cold.close();
      },
    );
test(
  'two service processes converge on the exact offer and final receipt',
  { timeout: 10000 },
  async (t) => {
    const x = await prepared(t),
      a = await worker(t, x),
      b = await worker(t, x),
      request = { retryKey: x.account.retryKey, request: x.request };
    const offers = await Promise.all([
      a.call('beginPromotion', request),
      b.call('beginPromotion', request),
    ]);
    assert.deepEqual(offers[0], offers[1]);
    const input = {
      retryKey: x.account.retryKey,
      requestDigest: offers[0].epoch.requestDigest,
      completion: await x.completion(offers[0]),
    };
    const results = await Promise.all([
      a.call('finishPromotion', input),
      b.call('finishPromotion', input),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(results[0].kind, 'promotion-receipt');
    assert.equal(x.f.rows('promotions').length, 1);
    await a.close();
    await b.close();
  },
);
