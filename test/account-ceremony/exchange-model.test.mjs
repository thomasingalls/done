import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { exchangeFixture } from './exchange-oracle.mjs';
import { ExchangeModel, happy, events } from './exchange-model.mjs';

test('both roles resume the exact transcript after a crash at each exchange/save boundary', async () => {
  const x = exchangeFixture();
  for (const role of ['existing', 'new'])
    for (let cut = 0; cut <= happy.length; cut++) {
      const m = new ExchangeModel(x, role);
      for (const event of [...happy.slice(0, cut), 'crash', ...happy]) {
        await m.step(event);
        m.invariant();
      }
      assert.deepEqual(m.result, x.result);
      const before = structuredClone(m.durable);
      for (const event of [...happy, 'crash', ...happy]) {
        await m.step(event);
        m.invariant();
      }
      assert.deepEqual(m.durable, before);
    }
});
test('a competing head, expiry or abandonment terminates every prefix without erasing its record', async () => {
  const x = exchangeFixture();
  for (const event of ['epoch-change', 'expire', 'cancel'])
    for (let cut = 0; cut <= happy.length; cut++) {
      const m = new ExchangeModel(x, 'existing');
      for (const action of happy.slice(0, cut)) await m.step(action);
      const before = structuredClone(m.durable),
        sent = m.sent.length;
      await m.step(event);
      for (const action of ['crash', 'restart-same', ...happy]) {
        await m.step(action);
        m.invariant();
      }
      assert.equal(m.sent.length, sent);
      assert.equal(m.result, null);
      assert.deepEqual({ ...m.durable, terminal: null }, before);
      assert.equal(m.durable.terminal, event === 'cancel' ? 'spent' : 'restart-required');
    }
});
test('unsigned relay status, forged commitments and early or wrong reveals cannot advance the ceremony', async () => {
  const x = exchangeFixture(),
    m = new ExchangeModel(x, 'existing');
  for (const action of [
    'prepare-reveal',
    'save-reveal',
    'publish-reveal',
    'receive-reveal',
    'finish',
  ])
    await m.step(action);
  assert.equal(m.sent.length, 0);
  assert.equal(m.result, null);
  for (const action of [
    'prepare-own',
    'save-own',
    'bad-commit',
    'prepare-pair',
    'save-pair',
    'prepare-reveal',
    'save-reveal',
    'publish-reveal',
  ])
    await m.step(action);
  assert.equal(m.durable.peer, null);
  assert.equal(m.sent.length, 0);
  for (const action of [...happy.slice(0, 9), 'bad-reveal', 'finish', 'unsigned-stale'])
    await m.step(action);
  const fixedPeer = structuredClone(m.durable.peer);
  await m.step('other-commit');
  assert.deepEqual(
    m.durable.peer,
    fixedPeer,
    'Signed equivocation cannot replace the saved peer commitment',
  );
  assert.equal(m.durable.peerReveal, null);
  assert.equal(m.result, null);
  for (const action of ['receive-reveal', 'finish']) await m.step(action);
  m.invariant();
  assert.deepEqual(m.result, x.result);
});
test('80 shrinking reordered histories retain commit-before-disclosure and exact restart state', async (t) => {
  const x = exchangeFixture();
  let completed = 0,
    stopped = 0,
    disclosed = 0;
  const noise = events.filter(
    (e) => !['epoch-change', 'expire', 'cancel', 'other-commit'].includes(e),
  );
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom('existing', 'new'),
      fc.array(fc.array(fc.constantFrom(...noise), { maxLength: 3 }), {
        minLength: happy.length,
        maxLength: happy.length,
      }),
      fc.option(fc.integer({ min: 0, max: happy.length - 1 })),
      async (role, interruptions, stopAt) => {
        const m = new ExchangeModel(x, role);
        for (let i = 0; i < happy.length; i++) {
          for (const action of [...interruptions[i], happy[i]]) {
            await m.step(action);
            m.invariant();
          }
          if (i === stopAt) await m.step('epoch-change');
        }
        for (const action of happy) {
          await m.step(action);
          m.invariant();
        }
        if (!m.durable.terminal) {
          assert.deepEqual(m.result, x.result);
          completed++;
        } else stopped++;
        if (m.sent.some((s) => s.kind === 'reveal')) disclosed++;
      },
    ),
    { seed: 16091609, numRuns: 80 },
  );
  assert(
    completed > 0 && stopped > 0 && disclosed > 0,
    'Generated histories must reach meaningful boundaries',
  );
  t.diagnostic(
    `Generated histories: ${completed} complete, ${stopped} stopped, ${disclosed} reach disclosure.`,
  );
});
test('model omission control actually discloses a nonce before the verified pair survives a crash', async () => {
  const x = exchangeFixture(),
    actions = happy.filter((a) => a !== 'save-pair');
  const normal = new ExchangeModel(x, 'existing'),
    broken = new ExchangeModel(x, 'existing', { omitPairPersistence: true });
  for (const action of actions) {
    await normal.step(action);
    await broken.step(action);
  }
  normal.invariant();
  assert.equal(normal.sent.filter((s) => s.kind === 'reveal').length, 0);
  assert.equal(broken.sent.find((s) => s.kind === 'reveal').wire.nonce, x.nonces.existing);
  assert.equal(broken.durable.pair, null);
  assert.throws(() => broken.invariant(), /before the signed pair was durable/);
  await broken.step('crash');
  assert.equal(broken.memory.pair, undefined);
});
