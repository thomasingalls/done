import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReceipt } from '../../account-protocol/admission.ts';
import { pair, unchanged, evidence, canonical, assertOtherUnchanged, prove } from './fixtures.mjs';

for (const stage of ['pending', 'offered', 'challenged', 'active', 'cancelled'])
  test(
    `valid neighboring capabilities refuse mixed targets in both directions: ${stage}`,
    { timeout: 20000 },
    async (t) => {
      const p = await pair(t),
        out = [];
      if (stage !== 'pending') await Promise.all([p.offer(0), p.offer(1)]);
      if (['challenged', 'active', 'cancelled'].includes(stage))
        await Promise.all([p.challenge(0), p.challenge(1)]);
      if (stage === 'active') await Promise.all([p.finish(0), p.finish(1)]);
      if (stage === 'cancelled')
        for (let i = 0; i < 2; i++) assert.equal(p.pending(i, i, true).ok, true);
      for (let i = 0; i < 2; i++) {
        const j = 1 - i,
          a = p.accounts[i],
          b = p.accounts[j],
          sa = p.saved[i],
          sb = p.saved[j];
        const check = (name, op) => unchanged(p, `${i}->${j} ${name}`, op).then((r) => out.push(r));
        await check('offer valid foreign token', () =>
          p.authority.owner.beginPromotion(p.f.core, {
            retryKey: b.account.retryKey,
            request: a.request,
          }),
        );
        await check('inspect foreign account', () => p.pending(i, j));
        await check('abandon foreign account', () => p.pending(i, j, true));
        await check('foreign recovery draft', () =>
          p.f.core.beginRecovery({ retryKey: a.account.retryKey, draft: b.recovery.draft }),
        );
        await check('foreign recovery id', () =>
          p.f.core.finishRecovery({ ...a.recoveryInput, recoveryId: b.recoveryInput.recoveryId }),
        );
        await check('foreign recovery token', () =>
          p.f.core.finishRecovery({ ...a.recoveryInput, retryKey: b.account.retryKey }),
        );
        await check('foreign recovery proof', () =>
          p.f.core.finishRecovery({
            ...a.recoveryInput,
            recoveryProof: b.recoveryInput.recoveryProof,
          }),
        );
        await check('foreign recovery assertion', () =>
          p.f.core.finishRecovery({ ...a.recoveryInput, response: b.recoveryInput.response }),
        );
        if (sa.offer) {
          const completion = sa.completion ?? (await a.completion(sa.offer)),
            otherCompletion = sb.completion ?? (await b.completion(sb.offer));
          const input = {
            retryKey: a.account.retryKey,
            requestDigest: sa.offer.epoch.requestDigest,
            completion,
          };
          for (const [name, mix] of Object.entries({
            token: { ...input, retryKey: b.account.retryKey },
            digest: { ...input, requestDigest: sb.offer.epoch.requestDigest },
            completion: { ...input, completion: otherCompletion },
          }))
            await check('challenge ' + name, () =>
              p.authority.owner.challengePromotion(p.f.core, mix),
            );
          await check('binding foreign token', () =>
            p.authority.owner.promotionBinding(p.f.core, {
              retryKey: b.account.retryKey,
              requestDigest: sa.offer.epoch.requestDigest,
            }),
          );
        }
        if (sa.proof) {
          for (const [name, mix] of Object.entries({
            token: { ...sa.proof, retryKey: b.account.retryKey },
            digest: { ...sa.proof, requestDigest: sb.input.requestDigest },
            completion: { ...sa.proof, completion: sb.completion },
            proof: { ...sa.proof, activation: sb.proof.activation },
            nonce: {
              ...sa.proof,
              activation: { ...sa.proof.activation, nonce: sb.challenge.context.nonce },
            },
            passkey: prove(b, sa.input, sa.challenge, { count: 35 }),
          }))
            await check('finish ' + name, () => p.authority.owner.finishPromotion(p.f.core, mix));
        }
        // A complete valid B request is B's authority, not a forbidden mixed request.
        const resumed = p.f.core.resumeRecovery({ retryKey: a.account.retryKey });
        assert.equal(resumed.accountId, a.account.result.accountId);
        assert.deepEqual(await p.f.core.finishRecovery(a.recoveryInput), resumed);
      }
      if (stage !== 'cancelled')
        for (let i = 0; i < 2; i++) {
          const before = p.inventory(),
            r = await p.finish(i);
          assertOtherUnchanged(p, i, before);
          await verifyReceipt(r, p.accounts[i].request, p.authority.pin);
          p.restart();
          assert.deepEqual(await p.accounts[i].begin(), r);
          assert.deepEqual(await p.authority.owner.finishPromotion(p.f.core, p.saved[i].proof), r);
          const binding = await p.authority.owner.promotionBinding(p.f.core, {
            retryKey: p.accounts[i].account.retryKey,
            requestDigest: p.saved[i].input.requestDigest,
          });
          assert.equal(binding.kind, 'promotion-slot-binding');
          assert.equal(binding.stored.binding.accountId, p.accounts[i].account.result.accountId);
          assert.equal(binding.stored.binding.credId, p.accounts[i].account.key.id);
          assert.equal(
            binding.stored.binding.principalId,
            p.accounts[i].request.candidate.principalId,
          );
        }
      else for (const a of p.accounts) assert.equal((await a.begin()).ok, false);
      evidence('matrix-' + stage, {
        stage,
        cases: out,
        accounts: p.accounts.map((a) => a.account.result.accountId),
      });
    },
  );

test('neighboring legal abandonment during asynchronous activation leaves the target account independent', async (t) => {
  let p,
    armed = false;
  p = await pair(t, {
    hook(point, operation) {
      if (armed && point === 'after-verify' && operation === 'admit-promotion') {
        armed = false;
        assert.equal(p.pending(1, 1, true).ok, true);
      }
    },
  });
  await Promise.all([p.challenge(0), p.challenge(1)]);
  armed = true;
  const r = await p.finish(0);
  assert.equal(r.offer.epoch.accountId, p.accounts[0].account.result.accountId);
  assert.equal((await p.accounts[1].begin()).ok, false);
  p.restart();
  assert.deepEqual(await p.accounts[0].begin(), r);
  const inv = p.inventory();
  assert.equal(
    inv.service.accounts.find((r) => r.id === p.accounts[1].account.result.accountId).state,
    'pending',
  );
});

for (const stage of ['offered', 'active'])
  test(`cross-account reads after restart preserve exact ${stage} authority`, async (t) => {
    const p = await pair(t);
    await Promise.all([p.challenge(0), p.challenge(1)]);
    if (stage === 'active') await Promise.all([p.finish(0), p.finish(1)]);
    const before = canonical(p.inventory());
    p.restart();
    for (let i = 0; i < 2; i++)
      assert.deepEqual(await p.accounts[i].begin(), p.saved[i].receipt ?? p.saved[i].offer);
    assert.equal(canonical(p.inventory()), before);
    for (let i = 0; i < 2; i++)
      await unchanged(p, 'cold crossed token', () =>
        p.authority.owner.beginPromotion(p.f.core, {
          retryKey: p.accounts[1 - i].account.retryKey,
          request: p.accounts[i].request,
        }),
      );
  });
