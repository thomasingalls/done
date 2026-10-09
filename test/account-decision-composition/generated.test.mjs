import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  native,
  prepared,
  decide,
  open,
  close,
  cold,
  record,
  raw,
  edit,
  captures,
  census,
  assertRetained,
  assertOpen,
  issue,
  service,
  evidence,
  hash,
  assertCaptures,
} from './fixtures.mjs';

test(
  '16 generated native decision histories preserve exact evidence, writing and retry across cold reopen',
  { timeout: 240000 },
  async (t) => {
    const f = await native(t),
      histories = [],
      metrics = {},
      seed = 112107;
    let serial = 0;
    const result = await fc.check(
      fc.asyncProperty(
        fc.constantFrom('closed', 'conflict'),
        fc.array(
          fc.constantFrom('deliver', 'lose', 'duplicate', 'invalid', 'edit', 'compact', 'restart'),
          { minLength: 5, maxLength: 12 },
        ),
        async (kind, commands) => {
          const x = await prepared(f, 'history-' + serial++, kind);
          await decide(x);
          let recorded = false,
            text = x.text;
          await open(f.page, x.item);
          try {
            // Force a lost real service reply before generated replay/order commands.
            const received = await issue(f, x.item, x.own.bytes);
            assert.deepEqual([...received.bytes], x.answer);
            await assertOpen(x, false);
            for (const op of [...commands, 'deliver', 'restart', 'duplicate']) {
              metrics[op] = (metrics[op] ?? 0) + 1;
              if (op === 'deliver' || op === 'duplicate') {
                const r = await record(f.page, 1, x.answer);
                assert.equal(r.recorded, !recorded);
                recorded = true;
              } else if (op === 'lose') {
                assert.deepEqual([...(await issue(f, x.item, x.own.bytes)).bytes], x.answer);
              } else if (op === 'invalid') {
                const before = await raw(f.page),
                  bytes = x.answer.slice();
                bytes[bytes.length - 5] ^= 1;
                assert.equal((await record(f.page, 1, bytes)).recorded, false);
                assert.equal(await raw(f.page), before);
              } else if (op === 'edit') {
                text = 'x' + text;
                await edit(f.page, 0, 0, 'x');
                await f.page.evaluate(() => editor.whenDurable());
              } else if (op === 'compact') await f.page.evaluate(() => opened.compactContent());
              else {
                const retainedCaptures = await captures(f.page);
                await close(f.page);
                assertRetained(x, await census(f.page, x.item), recorded);
                await cold(f);
                await open(f.page, x.item);
                assertCaptures(await captures(f.page), retainedCaptures);
              }
              await assertOpen(x, recorded, text);
              assert.deepEqual(service(f), x.service);
            }
            await close(f.page);
            const final = await census(f.page, x.item);
            assertRetained(x, final, true);
            histories.push({
              kind,
              commands,
              recorded,
              textDigest: hash(text),
              responseDigest: hash(x.answer),
              witness: final.witness,
            });
          } finally {
            await close(f.page).catch(() => {});
          }
        },
      ),
      { seed, numRuns: 16 },
    );
    evidence('generated', {
      seed,
      numRuns: result.numRuns,
      failed: result.failed,
      metrics,
      histories,
      path: result.counterexamplePath,
      counterexample: result.counterexample,
      numShrinks: result.numShrinks,
      error: result.errorInstance ? String(result.errorInstance) : null,
    });
    assert.equal(result.failed, false, String(result.errorInstance));
    for (const op of ['lose', 'deliver', 'duplicate', 'invalid', 'edit', 'compact', 'restart'])
      assert(metrics[op] > 0);
  },
);
