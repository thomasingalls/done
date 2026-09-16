import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ready, census } from './fixtures.mjs';

test(
  'generated retry, cancellation, expiry and restart histories match an independent ledger',
  { timeout: 30000 },
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            'begin',
            'finish',
            'cancel',
            'resume',
            'restart',
            'expire',
            'changed-proof',
          ),
          { minLength: 1, maxLength: 30 },
        ),
        async (actions) => {
          const cleanup = [];
          let now = 1000;
          const x = await ready({ after: (f) => cleanup.push(f) }, { now: () => now });
          try {
            const e = x.candidate(),
              before = census(x);
            let state = 'absent',
              deadline = null,
              challenge = null,
              proof = null,
              receipt = null;
            for (const action of actions) {
              if (action === 'restart') {
                x.f.restart();
                x.authority.restart();
                continue;
              }
              if (action === 'expire') {
                now += 600001;
                continue;
              }
              const input =
                action === 'begin'
                  ? e.input
                  : action === 'finish' || action === 'changed-proof'
                    ? (proof ?? {
                        retryKey: e.input.retryKey,
                        attemptId: e.input.retryKey,
                        response: {},
                        possession: '00'.repeat(64),
                      })
                    : { retryKey: e.input.retryKey };
              const changed =
                action === 'changed-proof' ? { ...input, possession: '00'.repeat(64) } : input;
              const op = action === 'changed-proof' ? 'finish' : action;
              const result = await x.enroll(op, changed);
              if (state === 'absent' && action !== 'begin') {
                assert.equal(result.refusal, 'unknown-attempt');
                continue;
              }
              if (state === 'absent') {
                state = 'challenge';
                deadline = now + 600000;
                challenge = result.challenge;
                proof = x.prove(e, result);
              }
              if (action === 'changed-proof' && receipt) {
                assert.equal(result.refusal, 'proof-conflict');
                continue;
              }
              if (action === 'cancel' && ['challenge', 'prepared'].includes(state))
                state = 'cancelled';
              else if (['challenge', 'prepared'].includes(state) && now >= deadline)
                state = 'expired';
              else if (action === 'changed-proof' && state === 'challenge') {
                assert.equal(result.refusal, 'invalid-proof');
                continue;
              } else if (action === 'finish' && state === 'challenge') {
                state = 'prepared';
                deadline = now + 600000;
                receipt = result.receipt;
                assert.ok(receipt);
              }
              assert.equal(result.stage, state, JSON.stringify({ actions, action, result }));
              assert.deepEqual(result.challenge, challenge);
              assert.deepEqual(result.receipt, receipt);
              assert.equal(x.f.rows('enrollment_preparations').length, 1);
            }
            assert.equal(census(x), before);
          } finally {
            for (const f of cleanup.reverse()) await f();
          }
        },
      ),
      { seed: 160902, numRuns: 60, verbose: true },
    );
  },
);
