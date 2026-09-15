import { createHash } from 'node:crypto';
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
          const evidence = { commands, observations: [], recovered: [] };
          histories.push(evidence);
          const save = () => artifact({ seed, histories, status: 'running' });
          save();
          let armed = '';
          const x = await ready(t, {
            hook(point, op) {
              if (op === 'decide-submission' && point === armed) {
                armed = '';
                throw Error('generated interruption');
              }
            },
          });
          const census = () =>
            x.f
              .rows('delivery_decisions')
              .map(({ ordinal, kind, position, digest }) => ({ ordinal, kind, position, digest }));
          const inv = () => createHash('sha256').update(inventory(x)).digest('hex');
          const resultBytes = (r) =>
            r.kind === 'decision'
              ? { kind: r.kind, bytes: Buffer.from(r.bytes).toString('hex') }
              : r;
          const observe = (value) => {
            evidence.observations.push(value);
            save();
          };
          let through = 0,
            previous = ZERO,
            parent = null;
          const retained = [];
          let expectedRows = 0;
          for (const [step, cmd] of commands.entries()) {
            if (cmd === 'restart') {
              const before = inv();
              x.f.restart();
              x.authority.restart();
              observe({ kind: 'restart', before, after: inv(), rows: census() });
              continue;
            }
            if (cmd === 'retry' && retained.length) {
              const item = retained[step % retained.length],
                before = inventory(x);
              const result = await x.call(item.w);
              observe({
                kind: 'retry',
                index: step % retained.length,
                result: resultBytes(result),
                before: createHash('sha256').update(before).digest('hex'),
                after: inv(),
                rows: census(),
              });
              assert.deepEqual(result, item.r);
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
              const result = await x.call(w);
              observe({
                kind: 'unknown',
                result: resultBytes(result),
                before: createHash('sha256').update(before).digest('hex'),
                after: inv(),
                rows: census(),
              });
              assert.equal(result.kind, 'unknown');
              assert.equal(inventory(x), before);
              continue;
            }
            if (cmd === 'before' || cmd === 'after') armed = cmd + '-commit';
            const first = await x.call(w);
            const observation = {
              kind: 'decision',
              subject: w.subject,
              requestHash: createHash('sha256').update(w.bytes).digest('hex'),
              first: resultBytes(first),
              firstRows: census(),
            };
            evidence.observations.push(observation);
            save();
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
            Object.assign(observation, {
              result: resultBytes(r),
              proofKind: parsed.kind,
              rows: census(),
            });
            save();
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
          for (const item of retained) {
            const result = await x.call(item.w);
            evidence.recovered.push(resultBytes(result));
            save();
            assert.deepEqual(result, item.r);
          }
          evidence.finalRows = census();
          save();
        },
      ),
      { seed, numRuns: 80, endOnFailure: true },
    );
    artifact({ seed, histories, status: 'passed' });
  },
);
