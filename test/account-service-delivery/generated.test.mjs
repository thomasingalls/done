import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ready, proof, inventory, link, ZERO } from './fixtures.mjs';
const artifact = (value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'generated.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
};
test(
  '80 generated service histories preserve permanent subjects, one accepted leaf, and exact retries across unknown commits',
  { timeout: 45000 },
  async (t) => {
    const seed = 9822026,
      histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            'accept',
            'refuse',
            'retry',
            'restart',
            'gap',
            'future',
            'before',
            'after',
          ),
          { minLength: 3, maxLength: 16 },
        ),
        async (commands) => {
          histories.push(commands);
          artifact({ seed, histories, status: 'running' });
          let armed = '';
          const x = await ready(t, {
            hook(point, op) {
              if (op === 'decide-submission' && point === armed) {
                armed = '';
                throw Error('generated interruption');
              }
            },
          });
          let through = 0,
            previous = ZERO,
            parent = null;
          const retained = [];
          let expectedRows = 0;
          for (const [step, cmd] of commands.entries()) {
            if (cmd === 'restart') {
              x.f.restart();
              x.authority.restart();
              continue;
            }
            if (cmd === 'retry' && retained.length) {
              const item = retained[step % retained.length],
                before = inventory(x);
              assert.deepEqual(await x.call(item.w), item.r);
              assert.equal(inventory(x), before);
              continue;
            }
            const gen = cmd === 'refuse' ? 2 : 1,
              w = x.make(through + (cmd === 'gap' ? 2 : 1), 'history-' + step, {
                gen,
                epoch: cmd === 'future' ? 2 : 1,
                ...(parent ? { parent } : {}),
              }),
              before = inventory(x);
            if (cmd === 'gap' || cmd === 'future') {
              assert.equal((await x.call(w)).kind, 'unknown');
              assert.equal(inventory(x), before);
              continue;
            }
            if (cmd === 'before' || cmd === 'after') armed = cmd + '-commit';
            const first = await x.call(w);
            if (cmd === 'before' || cmd === 'after') {
              assert.equal(first.kind, 'unknown');
              assert.equal(
                x.f.rows('delivery_decisions').length,
                expectedRows + (cmd === 'after' ? 1 : 0),
              );
              x.f.restart();
              x.authority.restart();
            }
            const r = cmd === 'before' || cmd === 'after' ? await x.call(w) : first;
            const parsed = proof(
              r,
              x.offer.epoch.acceptancePublicKey,
              w.subject,
              previous,
              w.parent,
            );
            assert.equal(parsed.kind, gen === 1 ? 'accepted' : 'refused');
            retained.push({ w, r });
            expectedRows++;
            if (parsed.kind === 'accepted') {
              through++;
              previous = link(w.subject, previous);
              parent = null;
            } else parent = parsed.refusal;
            const rows = x.f.rows('delivery_decisions');
            assert.equal(rows.length, expectedRows);
            assert.equal(rows.filter((row) => row.kind === 'accepted').length, through);
            assert.deepEqual(
              rows.filter((row) => row.kind === 'accepted').map((row) => row.position),
              Array.from({ length: through }, (_, i) => i + 1),
            );
          }
          x.f.restart();
          x.authority.restart();
          for (const item of retained) assert.deepEqual(await x.call(item.w), item.r);
        },
      ),
      { seed, numRuns: 80, endOnFailure: true },
    );
    artifact({ seed, histories, status: 'passed' });
  },
);
