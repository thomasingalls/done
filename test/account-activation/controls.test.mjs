import { AccountCore } from '../../account-service/core.ts';
import { createHash } from 'node:crypto';
import { canonical } from './oracle.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import fc from 'fast-check';
import { fixture } from '../account-core/fixtures.mjs';
import { ready, changedCompletion, evidence } from './fixtures.mjs';
import { prove } from './oracle.mjs';
async function mutant(t, gate) {
  const parent = resolve('test-results/account-activation-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, gate + '-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['account-protocol', 'account-service']) {
    mkdirSync(join(dir, folder));
    for (const name of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
      let code = readFileSync(join(folder, name), 'utf8');
      if (folder === 'account-service' && name === 'core.ts') {
        if (gate === 'assertion') {
          const from = code.indexOf('      const counter = await assertion('),
            to = code.indexOf('      const authorization', from);
          assert(from > 0 && to > from);
          code = code.slice(0, from) + '      const counter = 0;\n' + code.slice(to);
        } else if (gate === 'expiry') {
          const needle =
            "        if (this.#now() >= saved.challenge.context.expiresAt) return refuse('expired');";
          assert(code.includes(needle));
          code = code.replace(needle, '        void 0;');
        } else {
          const needle =
            '        requireActivationTarget(saved.challenge.context, target, issuer.pin);';
          assert(code.includes(needle));
          code = code.replace(needle, '        void 0;');
        }
      }
      writeFileSync(join(dir, folder, name), code);
    }
  }
  return (await import(pathToFileURL(join(dir, 'account-service/core.ts')).href)).AccountCore;
}
for (const gate of ['assertion', 'expiry', 'target'])
  test(`omitting ${gate} admits a forbidden first activation`, async (t) => {
    const Core = await mutant(t, gate);
    const observations = [];
    for (const [variant, Implementation] of [
      ['baseline', AccountCore],
      ['mutant', Core],
    ]) {
      let now = 1000,
        armed = false;
      const options = {
        now: () => now,
        hook(p, op) {
          if (armed && gate === 'expiry' && p === 'after-verify' && op === 'admit-promotion')
            now += 600000;
        },
      };
      const x = await ready(t, { fixture: fixture(t, options, Implementation) }),
        c = await x.challenge();
      const p = prove(x, x.input, c);
      if (gate === 'assertion') p.activation.response = {};
      if (gate === 'target') p.completion = changedCompletion(x);
      const inventory = () =>
        canonical(['accounts', 'promotions', 'credentials'].map((n) => x.f.rows(n)));
      const before = inventory();
      armed = true;
      const result = await x.submit(p),
        after = inventory();
      const hash = (v) => createHash('sha256').update(v).digest('hex');
      observations.push({
        variant,
        challenge: c,
        result,
        before: hash(before),
        after: hash(after),
        assertion: p.activation.response,
        completionDigest: hash(JSON.stringify(p.completion)),
        now,
        accountState: x.f.rows('accounts')[0].state,
      });
      if (variant === 'baseline') {
        assert.equal(result.ok, false);
        assert.equal(after, before);
      } else {
        assert.equal(result.kind, 'promotion-receipt');
        assert.equal(x.f.rows('accounts')[0].state, 'active');
      }
    }
    evidence('control-' + gate, { gate, observations });
  });
test('generated stale-proof invariant fails and shrinks when assertion verification is omitted', async (t) => {
  const Core = await mutant(t, 'assertion');
  const attempts = [];
  const result = await fc.check(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 1, max: 600000 }), { minLength: 1, maxLength: 8 }),
      async (delays) => {
        let now = 1000;
        const x = await ready(t, { fixture: fixture(t, { now: () => now }, Core) }),
          old = await x.challenge();
        for (const delay of delays) now += delay;
        now = Math.max(now, old.context.expiresAt);
        const fresh = await x.challenge();
        const p = prove(x, x.input, old);
        p.activation.nonce = fresh.context.nonce;
        // Relabelling an old signed proof with a fresh nonce must never activate.
        const result = await x.submit(p);
        attempts.push({ delays, old, fresh, assertion: p.activation.response, result });
        assert.equal(result.ok, false);
      },
    ),
    { seed: 9110402, numRuns: 12 },
  );
  assert.equal(result.failed, true);
  assert.ok(result.numShrinks > 0);
  evidence('control-generated', {
    seed: 9110402,
    numShrinks: result.numShrinks,
    failed: result.failed,
    attempts,
    counterexample: result.counterexample,
    path: result.counterexamplePath,
  });
});
