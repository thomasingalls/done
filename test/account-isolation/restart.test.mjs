import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { pair, unchanged, evidence, canonical, assertOtherUnchanged } from './fixtures.mjs';
import { worker } from './process.mjs';
for (const operation of ['offer-promotion', 'challenge-promotion', 'admit-promotion'])
  for (const side of ['before-commit', 'after-commit'])
    test(
      `two-account SIGKILL ${side} ${operation} preserves the neighbor and exact retry`,
      { timeout: 15000 },
      async (t) => {
        const p = await pair(t);
        await p.challenge(1);
        if (operation !== 'offer-promotion') await p.offer(0);
        if (operation === 'admit-promotion') await p.challenge(0);
        const x = p.accounts[0],
          s = p.saved[0],
          action =
            operation === 'offer-promotion'
              ? 'beginPromotion'
              : operation === 'challenge-promotion'
                ? 'challengePromotion'
                : 'finishPromotion';
        const input =
          action === 'beginPromotion'
            ? { retryKey: x.account.retryKey, request: x.request }
            : action === 'challengePromotion'
              ? {
                  retryKey: x.account.retryKey,
                  requestDigest: s.offer.epoch.requestDigest,
                  completion: await x.completion(s.offer),
                }
              : s.proof;
        const before = p.inventory(),
          crash = await worker(t, p, side, operation),
          death = once(crash.child, 'exit');
        crash.child.send({ action, input });
        const [code, signal] = await death;
        assert.equal(code, null);
        assert.equal(signal, 'SIGKILL');
        assertOtherUnchanged(p, 0, before);
        if (side === 'before-commit') assert.equal(canonical(p.inventory()), canonical(before));
        const committed = canonical(p.inventory()),
          cold = await worker(t, p),
          result = await cold.call(action, input);
        assert.equal(
          result.kind,
          action === 'beginPromotion'
            ? 'promotion-offer'
            : action === 'challengePromotion'
              ? 'promotion-activation-challenge'
              : 'promotion-receipt',
        );
        if (side === 'after-commit') assert.equal(canonical(p.inventory()), committed);
        assert.deepEqual(await cold.call(action, input), result);
        await unchanged(p, 'cross token after process restart', () =>
          cold.call(action, { ...input, retryKey: p.accounts[1].account.retryKey }),
        );
        await cold.close();
        p.restart();
        if (operation === 'offer-promotion') await p.offer(0);
        await p.finish(0);
        await p.finish(1);
        assert.equal(p.f.rows('accounts').filter((r) => r.state === 'active').length, 2);
        evidence(operation + '-' + side, {
          operation,
          side,
          signal,
          exactRetry: true,
          neighborUnchanged: true,
          bothCanActivate: true,
        });
      },
    );
test(
  'two live service processes independently admit both accounts and reject crossed tokens',
  { timeout: 15000 },
  async (t) => {
    const p = await pair(t),
      a = await worker(t, p),
      b = await worker(t, p),
      workers = [a, b];
    const offers = await Promise.all(
      p.accounts.map((x, i) =>
        workers[i].call('beginPromotion', { retryKey: x.account.retryKey, request: x.request }),
      ),
    );
    assert.notEqual(offers[0].head, offers[1].head);
    for (let i = 0; i < 2; i++) {
      assert.equal(offers[i].epoch.accountId, p.accounts[i].account.result.accountId);
      await p.offer(i);
      await p.challenge(i);
    }
    for (let i = 0; i < 2; i++)
      await unchanged(p, 'two-process crossed completion', () =>
        workers[i].call('finishPromotion', {
          ...p.saved[i].proof,
          retryKey: p.accounts[1 - i].account.retryKey,
        }),
      );
    const receipts = await Promise.all(
      workers.map((w, i) => w.call('finishPromotion', p.saved[i].proof)),
    );
    for (let i = 0; i < 2; i++) {
      assert.equal(receipts[i].kind, 'promotion-receipt');
      assert.deepEqual(await workers[1 - i].call('finishPromotion', p.saved[i].proof), receipts[i]);
    }
    assert.equal(p.f.rows('accounts').filter((r) => r.state === 'active').length, 2);
    await a.close();
    await b.close();
  },
);
