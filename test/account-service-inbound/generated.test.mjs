import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ready, inventory, mutate } from '../account-service-delivery/fixtures.mjs';
import { query, read, pageProof } from './oracle.mjs';

test(
  '60 generated append/read/restart/replay/role/ledger histories preserve original prefixes',
  { timeout: 90000 },
  async () => {
    const seed = 9112031,
      histories = [],
      coverage = {};
    const save = (status, details) => {
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'generated.json'),
          JSON.stringify({ seed, status, coverage, histories, details }, null, 2) + '\n',
        );
    };
    const property = fc.asyncProperty(
      fc.array(
        fc.record({
          op: fc.constantFrom(
            'append',
            'read',
            'restart',
            'replay',
            'reader',
            'publisher',
            'ledger',
          ),
          limit: fc.integer({ min: 1, max: 8 }),
          cursor: fc.nat(20),
        }),
        { minLength: 4, maxLength: 14 },
      ),
      async (commands) => {
        // Each generated case owns and promptly closes its resources, including a failing case.
        const cleanup = [],
          scope = { after: (f) => cleanup.push(f) };
        histories.push(commands);
        save('running');
        try {
          const x = await ready(scope),
            retained = [];
          let saved;
          for (const c of commands) {
            coverage[c.op] = (coverage[c.op] ?? 0) + 1;
            if (c.op === 'append') {
              const w = x.make(retained.length + 1, 'authored-' + retained.length),
                r = await x.call(w);
              assert.equal(r.kind, 'decision');
              retained.push({ w, r });
              continue;
            }
            if (c.op === 'restart') {
              x.f.restart();
              x.authority.restart();
              continue;
            }
            const after = c.cursor % (retained.length + 1),
              q = c.op === 'replay' && saved ? saved : query(x, after, c.limit);
            const before = inventory(x);
            if (c.op === 'reader' || c.op === 'publisher') {
              assert.equal(
                (await read(x, query(x, after, c.limit, { [c.op]: 'ac'.repeat(16) }))).kind,
                'unknown',
              );
            } else if (c.op === 'ledger' && retained.length) {
              const ordinal = x.f.rows('delivery_decisions').at(-1).ordinal;
              mutate(x, (db) =>
                db
                  .prepare('UPDATE delivery_decisions SET ordinal=? WHERE ordinal=?')
                  .run(ordinal + 1, ordinal),
              );
              assert.equal((await read(x, q)).kind, 'unknown');
              mutate(x, (db) =>
                db
                  .prepare('UPDATE delivery_decisions SET ordinal=? WHERE ordinal=?')
                  .run(ordinal, ordinal + 1),
              );
            } else {
              pageProof(await read(x, q), q, x, retained);
              saved = q;
            }
            assert.equal(inventory(x), before);
          }
          let after = 0;
          do {
            const q = query(x, after, 1);
            after = pageProof(await read(x, q), q, x, retained).next;
          } while (after < retained.length);
        } finally {
          for (const close of cleanup.reverse()) await close();
        }
      },
    );
    const result = await fc.check(property, { seed, numRuns: 60, endOnFailure: true });
    save(result.failed ? 'failed' : 'passed', {
      failed: result.failed,
      numRuns: result.numRuns,
      numShrinks: result.numShrinks,
      counterexample: result.counterexample,
      counterexamplePath: result.counterexamplePath,
      error: result.errorInstance ? String(result.errorInstance.stack) : null,
    });
    assert.equal(result.failed, false, String(result.errorInstance?.stack));
    for (const op of ['append', 'read', 'restart', 'replay', 'reader', 'publisher', 'ledger'])
      assert.ok(coverage[op] > 0, 'Missing generated coverage: ' + op);
  },
);
