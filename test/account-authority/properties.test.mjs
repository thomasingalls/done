import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authorityFixture, nonce, policy } from './fixtures.mjs';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { verifyPinnedAuthority } from '../../account-protocol/authority.ts';

test(
  '160 generated authority histories preserve the root through corruption, restart and competing setup',
  { timeout: 15000 },
  async () => {
    let run = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            'prove',
            'restart',
            'close',
            'corrupt',
            'restore',
            'reinitialize',
            'wrong-key',
            'substitute',
            'replay',
          ),
          { minLength: 1, maxLength: 25 },
        ),
        async (commands) => {
          const cleanups = [],
            f = authorityFixture({ after: (fn) => cleanups.push(fn) }),
            g = authorityFixture({ after: (fn) => cleanups.push(fn) });
          let readable = true,
            live = true;
          const db = new DatabaseSync(f.path),
            row = db.prepare('SELECT * FROM authority').get();
          const n = nonce(),
            old = f.owner.prove({ nonce: n });
          try {
            for (const command of commands) {
              if (command === 'prove') {
                if (live)
                  assert.deepEqual(
                    await verifyPinnedAuthority(f.pin, n, f.owner.prove({ nonce: n })),
                    f.pin,
                  );
                else assert.throws(() => f.owner.prove({ nonce: n }), /closed/);
              }
              if (command === 'close') {
                f.owner.close();
                live = false;
              }
              if (command === 'restart') {
                if (readable) {
                  f.restart();
                  live = true;
                } else {
                  assert.throws(() => f.restart());
                  live = false;
                }
              }
              if (command === 'corrupt') {
                db.prepare('UPDATE authority SET ct=?').run('00'.repeat(48));
                readable = false;
              }
              if (command === 'restore') {
                db.prepare('UPDATE authority SET ct=?').run(row.ct);
                readable = true;
              }
              if (command === 'reinitialize')
                assert.throws(() => PrivateAuthority.initialize(f.path, policy, f.key), /EEXIST/);
              if (command === 'wrong-key')
                assert.throws(() => PrivateAuthority.open(f.path, f.pin, randomBytes(32)));
              if (command === 'substitute')
                await assert.rejects(verifyPinnedAuthority(f.pin, n, g.owner.prove({ nonce: n })));
              if (command === 'replay')
                await assert.rejects(verifyPinnedAuthority(f.pin, nonce(), old));
              assert.equal(db.prepare('SELECT pin FROM authority').get().pin, row.pin);
            }
          } catch (error) {
            if (process.env.ACCOUNT_REPORT_DIR)
              writeFileSync(
                join(process.env.ACCOUNT_REPORT_DIR, `authority-counterexample-${run}.json`),
                JSON.stringify(
                  {
                    seed: 9172026,
                    commands,
                    readable,
                    live,
                    error: String(error),
                    pin: f.pin,
                    rows: db.prepare('SELECT * FROM authority').all(),
                  },
                  null,
                  2,
                ),
              );
            throw error;
          } finally {
            db.close();
            for (const cleanup of cleanups) await cleanup();
            run++;
          }
        },
      ),
      { numRuns: 160, seed: 9172026, endOnFailure: true },
    );
    assert.equal(run, 160);
  },
);
