import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ready, inventory, mutate } from '../account-service-delivery/fixtures.mjs';
import { envelope } from '../account-transport/oracle.mjs';
import { query, read, pageProof, hash } from './oracle.mjs';

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
        const entry = { commands, observations: [], final: [], completed: false };
        histories.push(entry);
        save('running');
        try {
          const x = await ready(scope),
            retained = [];
          entry.publicKey = x.offer.epoch.acceptancePublicKey;
          const observe = (q, result) => ({
            request: Buffer.from(q).toString('hex'),
            result:
              result.kind === 'decision'
                ? { kind: result.kind, bytes: Buffer.from(result.bytes).toString('hex') }
                : result,
          });
          let saved;
          for (const c of commands) {
            coverage[c.op] = (coverage[c.op] ?? 0) + 1;
            const beforeHash = hash(inventory(x));
            if (c.op === 'append') {
              const w = x.make(retained.length + 1, 'authored-' + retained.length),
                r = await x.call(w);
              assert.equal(r.kind, 'decision');
              entry.observations.push({
                op: c.op,
                before: beforeHash,
                after: hash(inventory(x)),
                position: retained.length + 1,
                envelope: Buffer.from(envelope(w)).toString('hex'),
                result: { kind: r.kind, bytes: Buffer.from(r.bytes).toString('hex') },
              });
              retained.push({ w, r });
              save('running');
              continue;
            }
            if (c.op === 'restart') {
              x.f.restart();
              x.authority.restart();
              entry.observations.push({ op: c.op, before: beforeHash, after: hash(inventory(x)) });
              save('running');
              continue;
            }
            const after = c.cursor % (retained.length + 1),
              q = c.op === 'replay' && saved ? saved : query(x, after, c.limit);
            const before = inventory(x);
            let observation;
            if (c.op === 'reader' || c.op === 'publisher') {
              const actual = query(x, after, c.limit, { [c.op]: 'ac'.repeat(16) }),
                result = await read(x, actual);
              observation = observe(actual, result);
              assert.equal(result.kind, 'unknown');
            } else if (c.op === 'ledger' && retained.length) {
              const ordinal = x.f.rows('delivery_decisions').at(-1).ordinal;
              mutate(x, (db) =>
                db
                  .prepare('UPDATE delivery_decisions SET ordinal=? WHERE ordinal=?')
                  .run(ordinal + 1, ordinal),
              );
              const result = await read(x, q);
              observation = { ...observe(q, result), faulted: hash(inventory(x)) };
              assert.equal(result.kind, 'unknown');
              mutate(x, (db) =>
                db
                  .prepare('UPDATE delivery_decisions SET ordinal=? WHERE ordinal=?')
                  .run(ordinal, ordinal + 1),
              );
            } else {
              const result = await read(x, q);
              observation = observe(q, result);
              pageProof(result, q, x, retained);
              saved = q;
            }
            entry.observations.push({
              op: c.op,
              before: beforeHash,
              after: hash(inventory(x)),
              ...observation,
            });
            save('running');
            assert.equal(inventory(x), before);
          }
          let after = 0;
          do {
            const q = query(x, after, 1);
            const before = hash(inventory(x)),
              result = await read(x, q);
            entry.final.push({ before, after: hash(inventory(x)), ...observe(q, result) });
            save('running');
            after = pageProof(result, q, x, retained).next;
          } while (after < retained.length);
          entry.completed = true;
          save('running');
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
