import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import fc from 'fast-check';
import { AccountCore, CEREMONY_LIFETIME_MS as lifetime } from '../../account-service/core.ts';
import { authenticator, fresh, finishRequest, policy, registered } from './fixtures.mjs';
import { DatabaseSync } from 'node:sqlite';
import { snapshot, failure } from './diagnostics.mjs';

test(
  '160 generated durable ceremony histories against an independent acceptance ledger',
  { timeout: 60000 },
  async () => {
    const command = fc.record({
      action: fc.constantFrom(
        'begin',
        'submit',
        'abort',
        'lost',
        'replay',
        'bad-proof',
        'cancel',
        'advance',
        'restart',
        'race',
      ),
      slot: fc.integer({ min: 0, max: 2 }),
      tick: fc.constantFrom(0, 1, lifetime - 1, lifetime),
    });

    const property = fc.asyncProperty(
      fc.constantFrom(-8, -7),
      fc.array(command, { minLength: 8, maxLength: 45 }),
      async (alg, commands) => {
        const dir = mkdtempSync(join(tmpdir(), 'done-account-model-')),
          path = join(dir, 'store.sqlite');
        let now = 1000,
          fault = null;
        const options = {
          now: () => now,
          hook(point, operation) {
            if (fault === `${point}:${operation}`) {
              fault = null;
              throw Error('injected');
            }
          },
        };
        let core = new AccountCore(path, policy, options);
        const ledger = Array.from({ length: 3 }, () => ({
          retryKey: fresh(),
          key: authenticator(alg),
          state: 'absent',
          created: false,
          hasKey: false,
          committed: 0,
          view: null,
          proof: null,
          proofResult: null,
          deadline: 0,
        }));
        const accepted = new Set();
        let before, lastCommand;
        const expire = (row) => {
          if (['register', 'confirm'].includes(row.state) && now >= row.deadline)
            row.state = 'expired';
        };
        const refuseFor = (row) => (row.state === 'absent' ? 'unknown-attempt' : row.state);
        try {
          for (const item of commands) {
            before = snapshot(path);
            lastCommand = item;
            const row = ledger[item.slot];
            if (item.action === 'advance') now += item.tick;
            else if (item.action === 'restart') {
              core.close();
              core = new AccountCore(path, policy, options);
            } else if (item.action === 'begin') {
              expire(row);
              const result = core.begin({ operation: 'register', retryKey: row.retryKey });
              if (row.state === 'absent') {
                assert.equal(result.operation, 'register');
                row.created = true;
                row.state = 'register';
                row.view = result;
                row.deadline = now + lifetime;
              } else if (['cancelled', 'expired'].includes(row.state))
                assert.equal(result.refusal, row.state);
              else assert.deepEqual(result, row.view);
            } else if (item.action === 'cancel') {
              const result = core.cancel({ retryKey: row.retryKey });
              if (row.state === 'absent') assert.equal(result.refusal, 'unknown-attempt');
              else if (row.state === 'done') assert.equal(result.refusal, 'already-finished');
              else {
                assert.equal(result.stage, 'cancelled');
                row.state = 'cancelled';
              }
            } else if (item.action === 'replay' && row.proof) {
              expire(row);
              const result = await core.finish(row.proof);
              if (['cancelled', 'expired'].includes(row.state))
                assert.equal(result.refusal, row.state);
              else assert.deepEqual(result, row.proofResult);
            } else if (['submit', 'abort', 'lost', 'bad-proof', 'race'].includes(item.action)) {
              expire(row);
              if (!['register', 'confirm'].includes(row.state)) {
                const result = core.resume({ retryKey: row.retryKey });
                if (row.state === 'done') assert.deepEqual(result, row.view);
                else assert.equal(result.refusal, refuseFor(row));
              } else {
                const edits = item.action === 'bad-proof' ? { client: { challenge: fresh() } } : {};
                const response =
                  row.state === 'register'
                    ? row.key.register(row.view, edits)
                    : row.key.assert(row.view, edits);
                const proof = finishRequest(row.view, row.retryKey, response);
                fault =
                  item.action === 'abort'
                    ? `before-commit:${row.view.operation}`
                    : item.action === 'lost'
                      ? `after-commit:${row.view.operation}`
                      : null;
                let result;
                if (item.action === 'race') {
                  const other = new AccountCore(path, policy, options);
                  try {
                    const results = await Promise.all([core.finish(proof), other.finish(proof)]);
                    assert.deepEqual(results[0], results[1]);
                    result = results[0];
                  } finally {
                    other.close();
                  }
                } else result = await core.finish(proof);
                if (item.action === 'bad-proof') assert.equal(result.refusal, 'invalid-proof');
                else if (item.action === 'abort')
                  assert.equal(result.refusal, 'storage-unavailable');
                else {
                  if (item.action === 'lost') {
                    assert.equal(result.refusal, 'storage-unavailable');
                    result = core.resume({ retryKey: row.retryKey });
                  }
                  assert.equal(result.ok, true);
                  row.committed++;
                  const logicalReceipt = result.ceremonyId ?? result.receiptId;
                  assert(!accepted.has(logicalReceipt));
                  accepted.add(logicalReceipt);
                  row.proof = proof;
                  row.proofResult = result;
                  if (row.state === 'register') {
                    assert.equal(result.operation, 'confirm-registration');
                    row.hasKey = true;
                    row.state = 'confirm';
                    row.deadline = now + lifetime;
                  } else {
                    assert.equal(result.stage, 'credential-confirmed');
                    row.state = 'done';
                  }
                  row.view = result;
                }
              }
            }
            const db = new DatabaseSync(path);
            try {
              const count = (sql) => db.prepare(sql).get().n;
              assert.equal(
                count('SELECT count(*) AS n FROM accounts'),
                ledger.filter((r) => r.created).length,
              );
              assert.equal(
                count('SELECT count(*) AS n FROM credentials'),
                ledger.filter((r) => r.hasKey).length,
              );
              assert.equal(
                count("SELECT count(*) AS n FROM credentials WHERE state='confirmed'"),
                ledger.filter((r) => r.state === 'done').length,
              );
              assert.equal(
                count('SELECT count(*) AS n FROM ceremonies WHERE proof_hash IS NOT NULL'),
                ledger.reduce((n, r) => n + r.committed, 0),
              );
              assert.equal(count("SELECT count(*) AS n FROM accounts WHERE state='active'"), 0);
            } finally {
              db.close();
            }
          }
        } catch (error) {
          failure('registration-state', path, before, error, {
            alg,
            now,
            command: lastCommand,
            commands,
            ledger: ledger.map(({ key, ...row }) => ({ ...row, credentialId: key.id })),
          });
          throw error;
        } finally {
          core.close();
          rmSync(dir, { recursive: true, force: true });
        }
      },
    );
    const result = await fc.check(property, { seed: 9142026, numRuns: 160, endOnFailure: true });
    if (result.failed && process.env.ACCOUNT_REPORT_DIR) {
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'property-counterexample.json'),
        JSON.stringify(
          {
            seed: result.seed,
            path: result.counterexamplePath,
            counterexample: result.counterexample,
            error: String(result.errorInstance),
          },
          null,
          2,
        ),
      );
    }
    assert.equal(result.failed, false, String(result.errorInstance));
  },
);

test(
  '80 generated sign-in histories preserve one receipt through abort, lost response, replay and restart',
  { timeout: 60000 },
  async () => {
    const property = fc.asyncProperty(
      fc.constantFrom(-8, -7),
      fc.array(
        fc.constantFrom(
          'begin',
          'finish',
          'race',
          'abort',
          'lost',
          'bad-purpose',
          'cancel',
          'expire',
          'restart',
          'replay',
        ),
        { minLength: 10, maxLength: 40 },
      ),
      async (alg, commands) => {
        const dir = mkdtempSync(join(tmpdir(), 'done-account-login-')),
          path = join(dir, 'store.sqlite');
        let now = 1000,
          fault = null;
        const options = {
          now: () => now,
          hook(point, op) {
            if (fault === `${point}:${op}`) {
              fault = null;
              throw Error('injected');
            }
          },
        };
        let core = new AccountCore(path, policy, options);
        let before, lastCommand;
        try {
          const item = await registered(
            {
              get core() {
                return core;
              },
            },
            alg,
          );
          const db = new DatabaseSync(path);
          db.prepare("UPDATE accounts SET state='active' WHERE id=?").run(item.result.accountId);
          db.close();
          let current = null;
          const receipts = new Map();
          const retired = [];
          for (const command of commands) {
            before = snapshot(path);
            lastCommand = command;
            if (command === 'restart') {
              core.close();
              core = new AccountCore(path, policy, options);
            } else if (command === 'begin') {
              const retryKey = fresh(),
                view = core.begin({ operation: 'authenticate', retryKey });
              current = {
                retryKey,
                view,
                proof: finishRequest(view, retryKey, item.key.assert(view)),
                state: 'open',
                expiry: now + lifetime,
              };
            } else if (command === 'replay' && retired.length) {
              const previous = retired[retired.length - 1];
              assert.deepEqual(
                await core.finish(previous.proof),
                receipts.get(previous.view.attemptId),
              );
            } else if (command === 'expire') {
              now += lifetime;
            } else if (current) {
              if (current.state === 'open' && now >= current.expiry) current.state = 'expired';
              if (command === 'cancel') {
                const result = core.cancel({ retryKey: current.retryKey });
                if (current.state === 'done') assert.equal(result.refusal, 'already-finished');
                else {
                  assert.equal(result.stage, 'cancelled');
                  current.state = 'cancelled';
                }
              } else if (['finish', 'race', 'abort', 'lost', 'bad-purpose'].includes(command)) {
                fault =
                  command === 'abort'
                    ? 'before-commit:authenticate'
                    : command === 'lost'
                      ? 'after-commit:authenticate'
                      : null;
                const proof =
                  command === 'bad-purpose'
                    ? finishRequest(
                        current.view,
                        current.retryKey,
                        item.key.assert(item.confirmation),
                      )
                    : current.proof;
                let result;
                if (command === 'race') {
                  const other = new AccountCore(path, policy, options);
                  try {
                    const pair = await Promise.all([core.finish(proof), other.finish(proof)]);
                    assert.deepEqual(pair[0], pair[1]);
                    result = pair[0];
                  } finally {
                    other.close();
                  }
                } else result = await core.finish(proof);
                // A fault targeted at a write remains unused when an earlier refusal/retry returns.
                fault = null;
                if (['cancelled', 'expired'].includes(current.state))
                  assert.equal(result.refusal, current.state);
                else if (current.state === 'done') {
                  if (command === 'bad-purpose') assert.equal(result.refusal, 'proof-conflict');
                  else assert.deepEqual(result, receipts.get(current.view.attemptId));
                } else if (command === 'bad-purpose') assert.equal(result.refusal, 'invalid-proof');
                else if (command === 'abort') assert.equal(result.refusal, 'storage-unavailable');
                else {
                  if (command === 'lost') {
                    assert.equal(result.refusal, 'storage-unavailable');
                    result = core.resume({ retryKey: current.retryKey });
                  }
                  assert.equal(result.stage, 'account-proof');
                  assert.equal(result.accountId, item.result.accountId);
                  assert(
                    ![...receipts.values()].some((prior) => prior.receiptId === result.receiptId),
                  );
                  receipts.set(current.view.attemptId, result);
                  current.state = 'done';
                  retired.push(current);
                }
              }
            }
            const check = new DatabaseSync(path);
            try {
              const committed = check
                .prepare(
                  "SELECT result FROM ceremonies WHERE operation='authenticate' AND proof_hash IS NOT NULL",
                )
                .all();
              assert.equal(committed.length, receipts.size);
              for (const row of committed) {
                const value = JSON.parse(row.result);
                assert.deepEqual(value, receipts.get(value.attemptId));
              }
              assert.equal(check.prepare('SELECT count(*) n FROM accounts').get().n, 1);
              assert.equal(check.prepare('SELECT count(*) n FROM credentials').get().n, 1);
            } finally {
              check.close();
            }
          }
        } catch (error) {
          failure('login-state', path, before, error, { alg, now, command: lastCommand, commands });
          throw error;
        } finally {
          core.close();
          rmSync(dir, { recursive: true, force: true });
        }
      },
    );
    const result = await fc.check(property, { seed: 9152026, numRuns: 80, endOnFailure: true });
    if (result.failed && process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'login-counterexample.json'),
        JSON.stringify(
          {
            seed: result.seed,
            path: result.counterexamplePath,
            counterexample: result.counterexample,
            error: String(result.errorInstance),
          },
          null,
          2,
        ),
      );
    assert.equal(result.failed, false, String(result.errorInstance));
  },
);
