import assert from 'node:assert/strict';
import { verifyReceipt } from '../../account-protocol/admission.ts';
import { inspectChallenge } from '../account-activation/oracle.mjs';
import { canonical, hash, prove, unchanged, assertOtherUnchanged } from './fixtures.mjs';
// Test-owned transition oracle. It never imports the core's predicates or row reducer.
export async function history(p, commands, arm = () => {}, metrics = {}) {
  const initial = p.inventory(),
    model = [{ state: 'pending' }, { state: 'pending' }];
  const verify = async () => {
    const current = p.inventory(),
      expected = structuredClone(initial);
    for (let i = 0; i < 2; i++) {
      const x = p.accounts[i],
        m = model[i],
        s = p.saved[i],
        id = x.account.result.accountId;
      expected.service.accounts.find((r) => r.id === id).state =
        m.state === 'active' ? 'active' : 'pending';
      if (m.state === 'cancelled') {
        expected.service.attempts.find((r) => r.account_id === id).state = 'cancelled';
        expected.service.recovery.find((r) => r.account_id === id).state = 'cancelled';
      }
      if (m.state === 'active')
        expected.service.credentials.find((r) => r.account_id === id).counter = 17 + i;
      if (m.row) {
        const row = {
          ...m.row,
          state:
            m.state === 'active' ? 'admitted' : m.state === 'cancelled' ? 'cancelled' : 'proposed',
          activation: s.challenge
            ? JSON.stringify({
                challenge: s.challenge,
                proofHash:
                  m.state === 'active' ? hash(canonical(s.proof.activation.response)) : null,
              })
            : null,
          result: m.state === 'active' ? JSON.stringify(s.receipt) : null,
        };
        expected.service.promotions.push(row);
      }
    }
    const sort = (rows) => rows.toSorted((a, b) => a.account_id.localeCompare(b.account_id));
    expected.service.promotions = sort(expected.service.promotions);
    current.service.promotions = sort(current.service.promotions);
    assert(canonical(current) === canonical(expected), 'full durable oracle differs');
  };
  for (const c of commands) {
    const i = c.account,
      j = 1 - i,
      x = p.accounts[i],
      y = p.accounts[j],
      m = model[i],
      s = p.saved[i],
      other = p.saved[j],
      before = p.inventory();
    let ran = true,
      cut = false;
    const operation = c.op.replace(/^lose-/, ''),
      loss = c.op.startsWith('lose-') ? c.cut : null;
    if (c.op === 'restart') p.restart();
    else if (c.op === 'cross-offer')
      await unchanged(p, 'cross offer', () =>
        p.authority.owner.beginPromotion(p.f.core, {
          retryKey: y.account.retryKey,
          request: x.request,
        }),
      );
    else if (c.op === 'cross-abandon')
      await unchanged(p, 'cross abandon', () => p.pending(i, j, true));
    else if (c.op === 'cross-inspect') await unchanged(p, 'cross inspect', () => p.pending(i, j));
    else if (c.op === 'cross-challenge' && s.input)
      await unchanged(p, 'cross challenge', () =>
        p.authority.owner.challengePromotion(p.f.core, {
          ...s.input,
          retryKey: y.account.retryKey,
        }),
      );
    else if (c.op === 'cross-finish' && s.proof)
      await unchanged(p, 'cross finish', () =>
        p.authority.owner.finishPromotion(p.f.core, { ...s.proof, retryKey: y.account.retryKey }),
      );
    else if (c.op === 'cross-proof' && s.proof && other.proof)
      await unchanged(p, 'cross proof', () =>
        p.authority.owner.finishPromotion(p.f.core, {
          ...s.proof,
          activation: other.proof.activation,
        }),
      );
    else if (c.op === 'cross-binding' && s.offer)
      await unchanged(p, 'cross binding', () =>
        p.authority.owner.promotionBinding(p.f.core, {
          retryKey: y.account.retryKey,
          requestDigest: s.offer.epoch.requestDigest,
        }),
      );
    else if (operation === 'offer') {
      const fresh = m.state === 'pending';
      if (loss && !fresh) {
        ran = false;
        continue;
      }
      if (loss) {
        arm(loss, 'offer-promotion');
        cut = true;
      }
      let r = await x.begin();
      if (m.state === 'cancelled' || loss) {
        assert.equal(r.ok, false);
      }
      if (fresh && loss !== 'before-commit') {
        m.state = 'offered';
        if (loss) {
          p.restart();
          r = await x.begin();
        }
        assert.equal(r.kind, 'promotion-offer');
        s.offer = r;
        m.row = structuredClone(
          p.f.rows('promotions').find((r) => r.account_id === x.account.result.accountId),
        );
        assert.equal(m.row.request, JSON.stringify(x.request));
        assert.equal(m.row.request_digest, hash(JSON.stringify(x.request)));
        assert.equal(m.row.workspace_id, x.request.candidate.workspaceId);
        assert.equal(m.row.lineage_id, x.request.candidate.lineageId);
        assert.equal(m.row.offer, JSON.stringify(r));
        assert.equal(r.epoch.accountId, x.account.result.accountId);
      } else if (!loss && m.state !== 'cancelled')
        assert.deepEqual(r, m.state === 'active' ? s.receipt : s.offer);
    } else if (operation === 'challenge' && s.offer) {
      const fresh = m.state === 'offered';
      if (loss && !fresh) {
        ran = false;
        continue;
      }
      s.completion ??= await x.completion(s.offer);
      s.input = {
        retryKey: x.account.retryKey,
        requestDigest: s.offer.epoch.requestDigest,
        completion: s.completion,
      };
      if (loss) {
        arm(loss, 'challenge-promotion');
        cut = true;
      }
      let r = await p.authority.owner.challengePromotion(p.f.core, s.input);
      if (m.state === 'cancelled' || loss) assert.equal(r.ok, false);
      if (fresh && loss !== 'before-commit') {
        m.state = 'challenged';
        if (loss) {
          p.restart();
          r = await p.authority.owner.challengePromotion(p.f.core, s.input);
        }
        inspectChallenge(r, x, s.offer, s.completion);
        s.challenge = r;
        s.proof = prove(x, s.input, r, { count: 17 + i });
      } else if (!loss && m.state !== 'cancelled')
        assert.deepEqual(r, m.state === 'active' ? s.receipt : s.challenge);
    } else if (operation === 'finish' && s.proof) {
      const fresh = m.state === 'challenged';
      if (loss && !fresh) {
        ran = false;
        continue;
      }
      if (loss) {
        arm(loss, 'admit-promotion');
        cut = true;
      }
      let r = await p.authority.owner.finishPromotion(p.f.core, s.proof);
      if (m.state === 'cancelled' || loss) assert.equal(r.ok, false);
      if (fresh && loss !== 'before-commit') {
        m.state = 'active';
        if (loss) {
          p.restart();
          r = await x.begin();
        }
        await verifyReceipt(r, x.request, p.authority.pin);
        assert.deepEqual(r.completion, s.completion);
        s.receipt = r;
      } else if (!loss && m.state !== 'cancelled') assert.deepEqual(r, s.receipt);
    } else if (operation === 'abandon') {
      const r = p.pending(i, i, true);
      if (m.state === 'active') assert.equal(r.ok, false);
      else {
        assert.equal(r.ok, true);
        m.state = 'cancelled';
      }
    } else ran = false;
    if (cut) {
      arm(null, null);
      if (loss === 'before-commit') p.restart();
    }
    if (ran) metrics[c.op] = (metrics[c.op] ?? 0) + 1;
    if (c.op !== 'restart') assertOtherUnchanged(p, i, before);
    await verify();
  }
  return model.map((m) => m.state);
}
