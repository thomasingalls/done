import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pair, withPair, unchanged, evidence } from './fixtures.mjs';
import { history } from './history.mjs';
async function mutant(t, gate) {
  const parent = resolve('test-results/account-isolation-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, gate + '-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const controls = {
    selector: [
      '    const attempt = this.#attempt(retryKey),\n      accountId = request.candidate.accountId;',
      "    const presented = this.#attempt(retryKey);\n    const attempt = presented && this.#db.prepare('SELECT * FROM attempts WHERE account_id=?').get(request.candidate.accountId) as unknown as Attempt | undefined,\n      accountId = request.candidate.accountId;",
    ],
    'pending-target': [' || attempt.account_id !== input.accountId', ''],
    'abandon-scope': [
      "UPDATE promotions SET state='cancelled' WHERE account_id=? AND state='proposed'",
      "UPDATE promotions SET state='cancelled' WHERE state='proposed' AND ? IS NOT NULL",
    ],
  };
  for (const folder of ['account-service', 'account-protocol']) {
    mkdirSync(join(dir, folder));
    for (const name of readdirSync(folder).filter((n) => n.endsWith('.ts'))) {
      let text = readFileSync(join(folder, name), 'utf8');
      if (folder === 'account-service' && name === 'core.ts') {
        const [from, to] = controls[gate];
        assert.equal(text.split(from).length, 2, 'moved control anchor');
        text = text.replace(from, to);
      }
      writeFileSync(join(dir, folder, name), text);
    }
  }
  return (await import(pathToFileURL(join(dir, 'account-service/core.ts')).href)).AccountCore;
}
test('valid-but-unbound selector passes the old unknown-key negative but leaks a neighboring offer', async (t) => {
  const Core = await mutant(t, 'selector'),
    p = await pair(t, { Core });
  await unchanged(p, 'unknown still refuses', () =>
    p.authority.owner.beginPromotion(p.f.core, {
      retryKey: 'A'.repeat(43),
      request: p.accounts[0].request,
    }),
  );
  await assert.rejects(
    unchanged(p, 'known foreign token', () =>
      p.authority.owner.beginPromotion(p.f.core, {
        retryKey: p.accounts[1].account.retryKey,
        request: p.accounts[0].request,
      }),
    ),
    /expected refusal/,
  );
  assert.equal(p.f.rows('promotions')[0].account_id, p.accounts[0].account.result.accountId);
  assert.equal(p.f.rows('promotions').length, 1);
  evidence('control-selector', {
    unknown: 'refused',
    validForeign: 'neighboring signed offer returned',
    unchangedCrypto: true,
  });
});
test('omitting explicit pending target binding makes a crossed request cancel its token owner', async (t) => {
  const Core = await mutant(t, 'pending-target'),
    p = await pair(t, { Core });
  await Promise.all([p.offer(0), p.offer(1)]);
  await assert.rejects(
    unchanged(p, 'crossed abandonment', () => p.pending(0, 1, true)),
    /expected refusal/,
  );
  assert.deepEqual(
    p.f.rows('promotions').map((r) => r.state),
    ['cancelled', 'proposed'],
  );
  evidence('control-pending-target', {
    observed: 'crossed target was accepted and token owner cancelled',
  });
});
test(
  'generated full-row oracle shrinks a missing abandonment account predicate',
  { timeout: 60000 },
  async (t) => {
    const Core = await mutant(t, 'abandon-scope');
    const command = fc.record({
      account: fc.integer({ min: 0, max: 1 }),
      op: fc.constantFrom('offer', 'restart', 'abandon'),
    });
    const result = await fc.check(
      fc.asyncProperty(fc.array(command, { minLength: 1, maxLength: 15 }), async (suffix) => {
        await withPair({ Core, now: () => 1000 }, (p) =>
          history(p, [{ account: 0, op: 'offer' }, { account: 1, op: 'offer' }, ...suffix]),
        );
      }),
      { seed: 112104, numRuns: 80 },
    );
    assert.equal(result.failed, true);
    assert(result.numShrinks > 0);
    assert.match(String(result.errorInstance), /neighbor rows changed|full durable oracle/);
    evidence('control-scope-generated', {
      seed: 112104,
      numRuns: result.numRuns,
      numShrinks: result.numShrinks,
      path: result.counterexamplePath,
      setup: 'two offered accounts',
      counterexample: result.counterexample,
      error: String(result.errorInstance),
    });
  },
);
