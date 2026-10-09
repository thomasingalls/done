import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { fixture, marker, report } from './fixtures.mjs';
import {
  createLocal,
  openLocal,
  read,
  insert,
  close,
  flush,
  compactLocal,
  prepareRecovery,
  select,
  sync,
  settled,
  scan,
} from './lifecycle.mjs';

test(
  '24 generated edit/flush/lock/reopen/actual-lost-reply histories retain content without logical plaintext matches',
  { timeout: 300000 },
  async (t) => {
    const histories = [];
    let attempt = 0;
    const input = fc.record({
      edits: fc.array(
        fc.record({ flush: fc.boolean(), reopen: fc.boolean(), front: fc.boolean() }),
        { minLength: 1, maxLength: 3 },
      ),
      compact: fc.boolean(),
      lostReply: fc.boolean(),
      accountEdits: fc.integer({ min: 1, max: 2 }),
    });
    const outcome = await fc.check(
      fc.asyncProperty(input, async (history) => {
        const id = 'generated-' + String(++attempt).padStart(3, '0'),
          points = [],
          entry = { id, history, status: 'running', points };
        histories.push(entry);
        console.log(id + ' started');
        const f = await fixture(t);
        try {
          const item = await createLocal(f, 'generated-local'),
            ns = [];
          let expected = '';
          await openLocal(f, item);
          for (const [i, op] of history.edits.entries()) {
            const n = { id: 'edit' + i, values: [marker('edit' + i)] };
            ns.push(n);
            if (op.front) {
              await f.page.evaluate(async (text) => {
                await editor
                  .text({ kind: 'master' })
                  .input({ name: 'insert', text }, { ranges: [{ anchor: 0, head: 0 }], main: 0 })
                  .accepted;
              }, n.values[0]);
              expected = n.values[0] + expected;
            } else {
              await insert(f, n.values[0]);
              expected += n.values[0];
            }
            if (op.flush) await flush(f);
            await scan(f, item, ns, id + '-edit' + i);
            points.push('edit' + i);
            if (op.reopen) {
              await close(f);
              await f.cold();
              await openLocal(f, item);
              assert.equal((await read(f)).master, expected);
            }
          }
          await flush(f);
          await close(f);
          if (history.compact) await compactLocal(f, item);
          await prepareRecovery(f, item);
          await scan(f, item, ns, id + '-recovery');
          points.push('recovery');
          await select(f, item, {
            lostReply: history.lostReply,
            observe: async (stage) => {
              if (stage === 'lost-reply') {
                await scan(f, item, ns, id + '-lost');
                points.push('lost');
              }
            },
          });
          await sync(f, item);
          let through = await settled(f);
          for (let i = 0; i < history.accountEdits; i++) {
            const n = { id: 'account' + i, values: [marker('account' + i)] };
            ns.push(n);
            await insert(f, n.values[0]);
            expected += n.values[0];
            through = await settled(f, through);
          }
          await flush(f);
          await scan(f, item, ns, id + '-delivered');
          points.push('delivered');
          await close(f);
          await f.cold();
          await sync(f, item);
          await settled(f);
          await flush(f);
          assert.equal((await read(f)).master, expected);
          await scan(f, item, ns, id + '-cold');
          points.push('cold');
          await close(f);
          entry.status = 'passed';
          console.log(id + ' passed');
          entry.acceptedThrough = through;
        } catch (e) {
          entry.status = 'failed';
          entry.error = e.message;
          throw e;
        } finally {
          report('generated-histories', histories);
          await f.dispose();
        }
      }),
      { seed: 1121040, numRuns: 24, interruptAfterTimeLimit: 270000, markInterruptAsFailure: true },
    );
    report('generated', {
      seed: 1121040,
      numRuns: outcome.numRuns,
      numShrinks: outcome.numShrinks,
      failed: outcome.failed,
      interrupted: outcome.interrupted,
      counterexample: outcome.counterexample,
      counterexamplePath: outcome.counterexamplePath,
      attempts: histories.length,
      scope:
        'Seed determines operation schedules. Each attempt generates independent synthetic markers, factors and cryptographic randomness after compilation.',
    });
    assert.equal(
      outcome.failed,
      false,
      JSON.stringify({
        numRuns: outcome.numRuns,
        interrupted: outcome.interrupted,
        counterexample: outcome.counterexample,
        error: String(outcome.errorInstance ?? outcome.error),
      }),
    );
    assert.equal(outcome.numRuns, 24);
    assert.equal(outcome.interrupted, false);
  },
);
