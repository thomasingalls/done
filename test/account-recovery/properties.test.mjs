import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepared } from './fixtures.mjs';
import { CEREMONY_LIFETIME_MS } from '../../account-service/core.ts';

test(
  '160 generated recovery histories obey an independent durable outcome ledger',
  { timeout: 30000 },
  async () => {
    let run = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            'retry',
            'bad-code-proof',
            'bad-passkey',
            'foreign-id',
            'finish',
            'concurrent',
            'abort',
            'lost-response',
            'restart',
            'cancel',
            'expire',
            'changed-draft',
          ),
          { minLength: 1, maxLength: 30 },
        ),
        async (commands) => {
          let point = '',
            now = 1000,
            state = 'open',
            receipt = null;
          const cleanups = [];
          const item = await prepared(
            { after: (fn) => cleanups.push(fn) },
            {
              now: () => now,
              hook(at, kind) {
                if (at === point && kind === 'finalize-recovery') throw Error('write boundary');
              },
            },
          );
          const { f, proof, input, account } = item;
          const before = f.rows('recovery');
          try {
            for (const command of commands) {
              let result;
              point = '';
              if (command === 'restart') {
                f.restart();
                continue;
              }
              if (command === 'expire') {
                now += CEREMONY_LIFETIME_MS;
                continue;
              }
              if (command === 'changed-draft') {
                assert.equal(
                  (
                    await f.core.beginRecovery({
                      ...input,
                      draft: { ...input.draft, principalId: 'different' },
                    })
                  ).refusal,
                  'recovery-conflict',
                );
                continue;
              }
              if (command === 'cancel') {
                result = f.core.cancelRecovery({ retryKey: account.retryKey });
                if (state === 'done') assert.equal(result.refusal, 'already-finished');
                else {
                  state = 'cancelled';
                  assert.equal(result.stage, 'recovery-cancelled');
                }
              } else {
                if (
                  command !== 'foreign-id' &&
                  state === 'open' &&
                  now >= 1000 + CEREMONY_LIFETIME_MS
                )
                  state = 'expired';
                if (command === 'retry') result = await f.core.beginRecovery(input);
                else {
                  const changed = { ...proof };
                  if (command === 'bad-code-proof') changed.recoveryProof = '00'.repeat(64);
                  if (command === 'bad-passkey') changed.response = {};
                  if (command === 'foreign-id') changed.recoveryId = 'A'.repeat(43);
                  if (command === 'abort') point = 'before-commit';
                  if (command === 'lost-response') point = 'after-commit';
                  if (command === 'concurrent') {
                    const results = await Promise.all([
                      f.core.finishRecovery(changed),
                      f.core.finishRecovery(changed),
                    ]);
                    assert.deepEqual(results[0], results[1]);
                    result = results[0];
                  } else result = await f.core.finishRecovery(changed);
                }
                const invalid = ['bad-code-proof', 'bad-passkey', 'foreign-id'].includes(command);
                if (state === 'open' && !invalid && command !== 'retry' && command !== 'abort')
                  state = 'done';
                if (command === 'foreign-id') assert.equal(result.ok, false);
                else if (command === 'abort' && state === 'open')
                  assert.equal(result.refusal, 'storage-unavailable');
                else if (command === 'lost-response' && state === 'done' && !receipt)
                  assert.equal(result.refusal, 'storage-unavailable');
                else if (invalid) assert.equal(result.ok, false);
                else if (state === 'done') {
                  assert.equal(result.stage, 'recovery-confirmed');
                  receipt ??= result;
                  assert.deepEqual(result, receipt);
                } else if (state === 'cancelled' || state === 'expired')
                  assert.equal(result.refusal, state);
                else assert.equal(result.stage, 'recovery-ceremony');
              }
              point = '';
              const row = f.rows('recovery')[0];
              assert.equal(row.state, state);
              assert.equal(f.rows('accounts')[0].state, 'pending');
              assert.equal(f.rows('recovery').length, 1);
              if (state === 'done') {
                const committed = JSON.parse(row.result);
                receipt ??= committed;
                assert.deepEqual(committed, receipt);
              } else assert.equal(row.result, null);
            }
          } catch (error) {
            if (process.env.ACCOUNT_REPORT_DIR) {
              mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
              writeFileSync(
                join(process.env.ACCOUNT_REPORT_DIR, `recovery-counterexample-${run}.json`),
                JSON.stringify(
                  {
                    seed: 9162026,
                    commands,
                    state,
                    error: String(error),
                    before,
                    after: f.rows('recovery'),
                  },
                  null,
                  2,
                ),
              );
            }
            throw error;
          } finally {
            for (const cleanup of cleanups) await cleanup();
            run++;
          }
        },
      ),
      { seed: 9162026, numRuns: 160, endOnFailure: true },
    );
    assert.equal(run, 160);
  },
);
