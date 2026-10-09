import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { ready, proof, inventory, ZERO } from './fixtures.mjs';
async function worker(t, x, point = '') {
  const child = fork(
    new URL('./worker.mjs', import.meta.url),
    [
      x.f.path,
      x.authority.path,
      JSON.stringify(x.authority.pin),
      x.authority.key.toString('hex'),
      point,
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced' },
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
    async call(w) {
      const next = once(child, 'message');
      child.send({ workspaceId: x.workspace, bytes: w.bytes });
      const [r] = await next;
      assert(!r.error, r.error);
      return r.result;
    },
    async close() {
      const done = once(child, 'exit');
      child.send({ close: true });
      await done;
    },
  };
}
for (const side of ['before-commit', 'after-commit'])
  for (const gen of [1, 2])
    test(
      `SIGKILL ${side} generation ${gen} preserves the exact durable decision`,
      { timeout: 10000 },
      async (t) => {
        const x = await ready(t),
          w = x.make(1, 'kill', { gen }),
          a = await worker(t, x, side),
          death = once(a.child, 'exit');
        a.child.send({ workspaceId: x.workspace, bytes: w.bytes });
        const [code, signal] = await death;
        assert.equal(code, null);
        assert.equal(signal, 'SIGKILL');
        assert.equal(x.f.rows('delivery_decisions').length, side === 'before-commit' ? 0 : 1);
        const before = inventory(x),
          b = await worker(t, x),
          r = await b.call(w);
        assert.equal(
          proof(r, x.offer.epoch.acceptancePublicKey, w.subject, ZERO).kind,
          gen === 1 ? 'accepted' : 'refused',
        );
        if (side === 'after-commit') assert.equal(inventory(x), before);
        assert.deepEqual(await b.call(w), r);
        await b.close();
      },
    );
test(
  'two service processes accepting competing leaves converge on one persisted head',
  { timeout: 15000 },
  async (t) => {
    const x = await ready(t),
      a = await worker(t, x),
      b = await worker(t, x),
      one = x.make(1, 'one'),
      two = x.make(1, 'two');
    const results = await Promise.all([a.call(one), b.call(two)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(x.f.rows('delivery_decisions').length, 1);
    const winner = x.f.rows('delivery_decisions')[0].digest === one.subject.digest ? one : two;
    assert.equal(
      proof(results[0], x.offer.epoch.acceptancePublicKey, winner.subject).kind,
      'accepted',
    );
    assert.deepEqual(await a.call(one), results[0]);
    assert.deepEqual(await b.call(two), results[0]);
    await a.close();
    await b.close();
  },
);
test(
  'acceptance racing closure of the same subject can never yield both signed outcomes',
  { timeout: 15000 },
  async (t) => {
    const x = await ready(t),
      a = await worker(t, x),
      b = await worker(t, x),
      good = x.make(),
      bad = x.make(1, 'bad stamp', { ct: good.ct, gen: 2 });
    const results = await Promise.all([a.call(good), b.call(bad)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(x.f.rows('delivery_decisions').length, 1);
    const parsed = proof(results[0], x.offer.epoch.acceptancePublicKey, good.subject);
    assert.ok(['accepted', 'refused'].includes(parsed.kind));
    await a.close();
    await b.close();
  },
);
