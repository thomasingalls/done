import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { withPair, evidence } from './fixtures.mjs';
import { history } from './history.mjs';
export const command = fc.record({
  account: fc.integer({ min: 0, max: 1 }),
  op: fc.constantFrom(
    'offer',
    'challenge',
    'finish',
    'abandon',
    'restart',
    'cross-offer',
    'cross-abandon',
    'cross-inspect',
    'cross-challenge',
    'cross-finish',
    'cross-proof',
    'cross-binding',
    'lose-offer',
    'lose-challenge',
    'lose-finish',
  ),
  cut: fc.constantFrom('before-commit', 'after-commit'),
});
test(
  '160 generated shared-service histories preserve per-account rows and exact authority across reply loss and restart',
  { timeout: 120000 },
  async () => {
    const seed = 112103,
      metrics = {},
      histories = [];
    const result = await fc.check(
      fc.asyncProperty(fc.array(command, { minLength: 5, maxLength: 35 }), async (commands) => {
        let fault;
        await withPair(
          {
            now: () => 1000,
            hook(point, op) {
              if (fault && point === fault.point && op === fault.op) {
                fault = null;
                throw Error('Injected lost reply');
              }
            },
          },
          async (p) => {
            const states = await history(
              p,
              commands,
              (point, op) => (fault = point ? { point, op } : null),
              metrics,
            );
            histories.push({ commands, states });
          },
        );
      }),
      { seed, numRuns: 160 },
    );
    evidence('generated', {
      seed,
      numRuns: result.numRuns,
      metrics,
      histories,
      failed: result.failed,
      counterexample: result.counterexample,
      path: result.counterexamplePath,
      error: result.errorInstance ? String(result.errorInstance) : null,
    });
    assert.equal(result.failed, false, String(result.errorInstance));
    assert(metrics['cross-offer'] > 0 && metrics['cross-abandon'] > 0 && metrics['lose-offer'] > 0);
  },
);
for (const cut of ['before-commit', 'after-commit'])
  test(`directed complete histories exercise every ${cut} loss with a live neighbor`, async () => {
    let fault;
    const metrics = {};
    await withPair(
      {
        now: () => 1000,
        hook(point, op) {
          if (fault && point === fault.point && op === fault.op) {
            fault = null;
            throw Error('Injected lost reply');
          }
        },
      },
      async (p) => {
        const commands = [
          { account: 1, op: 'offer' },
          { account: 1, op: 'challenge' },
          ...['offer', 'challenge', 'finish'].flatMap((op) => [
            { account: 0, op: 'lose-' + op, cut },
            { account: 0, op },
          ]),
          { account: 1, op: 'cross-finish' },
          { account: 1, op: 'finish' },
          { account: 0, op: 'restart' },
          { account: 0, op: 'finish' },
          { account: 1, op: 'finish' },
          { account: 0, op: 'cross-binding' },
        ];
        assert.deepEqual(
          await history(
            p,
            commands,
            (point, op) => (fault = point ? { point, op } : null),
            metrics,
          ),
          ['active', 'active'],
        );
        evidence('loss-' + cut, { commands, metrics });
      },
    );
  });
