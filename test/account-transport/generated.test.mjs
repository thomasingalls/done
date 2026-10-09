import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ready, inventory } from '../account-service-delivery/fixtures.mjs';
import { query, pageProof } from './oracle.mjs';
test(
  '60 generated append/read/restart/replay histories retain exact bounded prefixes',
  { timeout: 45000 },
  async (t) => {
    const seed = 9112026,
      histories = [];
    const save = (status) => {
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'generated.json'),
          JSON.stringify({ seed, status, histories }, null, 2) + '\n',
        );
    };
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            op: fc.constantFrom('append', 'read', 'restart', 'replay', 'tamper'),
            limit: fc.integer({ min: 1, max: 8 }),
            cursor: fc.nat(20),
          }),
          { minLength: 4, maxLength: 16 },
        ),
        async (commands) => {
          histories.push(commands);
          save('running');
          const x = await ready(t),
            retained = [];
          let saved;
          for (const c of commands) {
            if (c.op === 'append') {
              const w = x.make(retained.length + 1, 'history-' + retained.length),
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
            if (c.op === 'tamper') {
              const v = JSON.parse(Buffer.from(q).toString());
              v[11] = 'ff'.repeat(32);
              assert.equal(
                (
                  await x.authority.owner.readAccepted(
                    x.f.core,
                    new Uint8Array(Buffer.from(JSON.stringify(v))),
                  )
                ).kind,
                'unknown',
              );
            } else {
              pageProof(await x.authority.owner.readAccepted(x.f.core, q), q, x, retained);
              saved = q;
            }
            assert.equal(inventory(x), before);
          }
          let after = 0;
          do {
            const q = query(x, after, 2),
              p = pageProof(await x.authority.owner.readAccepted(x.f.core, q), q, x, retained);
            after = p.next;
          } while (after < retained.length);
        },
      ),
      { seed, numRuns: 60, endOnFailure: true },
    );
    save('passed');
  },
);
