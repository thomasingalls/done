import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ready, decision, query, read, page, ZERO, link } from './service-fixtures.mjs';

test(
  '60 shrinking service histories preserve exact pending bytes, accepted prefixes and admission eligibility',
  { timeout: 60000 },
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            'mint-old',
            'mint-current',
            'submit',
            'admit',
            'cancel',
            'expire',
            'restart',
            'read',
            'retry',
          ),
          { minLength: 1, maxLength: 24 },
        ),
        async (actions) => {
          const cleanup = [];
          let now = 1000;
          const x = await ready({ after: (f) => cleanup.push(f) }, { now: () => now });
          try {
            const p = await x.prepare();
            let eligible = true,
              cancelled = false,
              s = null,
              pending = null,
              previous = ZERO,
              boundary = 0;
            const accepted = [];
            for (const action of actions) {
              if (action === 'expire') {
                now += 600001;
                eligible = false;
              }
              if (action === 'restart') {
                x.f.restart();
                x.authority.restart();
              }
              if (action === 'mint-old' || action === 'mint-current')
                pending ??= x.make(accepted.length + 1, 'generated-' + accepted.length, {
                  epoch: action === 'mint-current' && s ? 2 : 1,
                });
              if (action === 'cancel') {
                const r = await x.enroll('cancel', { retryKey: p.input.retryKey });
                assert.equal(r.stage, s ? 'admitted' : 'cancelled');
                if (!s) {
                  cancelled = true;
                  eligible = false;
                }
              }
              if (action === 'admit') {
                const r = await x.admit(p.input);
                if (s) assert.deepEqual(r, s);
                else if (eligible) {
                  assert.equal(r.kind, 'device-admission-successor', JSON.stringify(r));
                  s = r;
                  boundary = accepted.length;
                } else assert.equal(r.refusal, cancelled ? 'cancelled' : 'expired');
              }
              if (action === 'submit' && pending) {
                const saved = pending.bytes.slice(),
                  r = await x.call(pending),
                  epoch = s ? 2 : 1;
                previous = decision(x, r, pending, previous, epoch).head.link;
                assert.deepEqual(pending.bytes, saved);
                accepted.push({ w: pending, r, epoch });
                pending = null;
              }
              if (action === 'retry' && accepted.length) {
                const a = accepted[0];
                assert.deepEqual(await x.call(a.w), a.r);
              }
              if (action === 'read') {
                const q = query(x, 0, 8, s ? { head: s.head, epoch: 2 } : {});
                page(x, await read(x, q), q, accepted);
              }
              assert.equal(x.f.rows('workspace_successors').length, s ? 1 : 0);
              assert.equal(
                x.f.rows('delivery_decisions').filter((r) => r.kind === 'accepted').length,
                accepted.length,
              );
              if (s) {
                let expected = ZERO;
                for (const a of accepted.slice(0, boundary)) expected = link(a.w.subject, expected);
                assert.deepEqual(
                  s.epoch.heads.find((h) => h.credentialId === x.credential),
                  { credentialId: x.credential, position: boundary, link: expected },
                );
              }
            }
          } finally {
            for (const f of cleanup.reverse()) await f();
          }
        },
      ),
      { seed: 16091602, numRuns: 60, verbose: true },
    );
  },
);
