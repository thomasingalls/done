import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, registered } from '../account-core/fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { generateRecovery, confirmRecovery } from '../../src/account/recovery.ts';
import { database, unchanged, evidence } from './fixtures.mjs';
async function pendingPair(t) {
  const f = fixture(t),
    authority = authorityFixture(t),
    accounts = [];
  for (let i = 0; i < 2; i++) {
    const account = await registered(f, i ? -7 : -8),
      recovery = await generateRecovery({
        principalId: (i ? '12' : '11').repeat(16),
        workspaceId: (i ? '23' : '22').repeat(16),
        lineageId: (i ? '34' : '33').repeat(32),
        authRoot: authority.pin.authRoot,
      });
    const view = await f.core.beginRecovery({ retryKey: account.retryKey, draft: recovery.draft });
    assert.equal(view.stage, 'recovery-ceremony');
    const input = {
      retryKey: account.retryKey,
      recoveryId: view.recoveryId,
      response: account.key.assert(view),
      recoveryProof: await confirmRecovery(
        recovery.draft,
        recovery.code,
        view.options.challenge,
        view.draftDigest,
      ),
    };
    accounts.push({ account, recovery, input });
  }
  return {
    f,
    authority,
    accounts,
    inventory: () => ({ service: database(f.path), authority: database(authority.path) }),
  };
}
test('live recovery ceremonies reject genuine neighboring capabilities and proofs before either confirmation', async (t) => {
  const p = await pendingPair(t),
    out = [];
  for (let i = 0; i < 2; i++) {
    const a = p.accounts[i],
      b = p.accounts[1 - i];
    for (const field of ['retryKey', 'recoveryId', 'response', 'recoveryProof'])
      out.push(
        await unchanged(p, 'live recovery ' + i + ' ' + field, () =>
          p.f.core.finishRecovery({ ...a.input, [field]: b.input[field] }),
        ),
      );
  }
  const results = await Promise.all(p.accounts.map((a) => p.f.core.finishRecovery(a.input)));
  for (let i = 0; i < 2; i++) {
    assert.equal(results[i].stage, 'recovery-confirmed');
    assert.equal(results[i].accountId, p.accounts[i].account.result.accountId);
    assert.deepEqual(await p.f.core.finishRecovery(p.accounts[i].input), results[i]);
  }
  assert(p.f.rows('accounts').every((a) => a.state === 'pending'));
  evidence('live-recovery', {
    cases: out,
    legitimate: results.map((r) => ({ accountId: r.accountId, stage: r.stage })),
  });
});
test('cancelling one live recovery ceremony leaves the other confirmable', async (t) => {
  const p = await pendingPair(t),
    before = p.f.rows('recovery')[0];
  assert.equal(
    p.f.core.cancelRecovery({ retryKey: p.accounts[1].account.retryKey }).stage,
    'recovery-cancelled',
  );
  assert.deepEqual(p.f.rows('recovery')[0], before);
  assert.equal((await p.f.core.finishRecovery(p.accounts[0].input)).stage, 'recovery-confirmed');
  await unchanged(p, 'cancelled live recovery', () => p.f.core.finishRecovery(p.accounts[1].input));
});
