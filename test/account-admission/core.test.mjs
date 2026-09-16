import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DatabaseSync } from 'node:sqlite';
import { createPublicKey, verify } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccountCore } from '../../account-service/core.ts';
import { verifyReceipt } from '../../account-protocol/admission.ts';
import {
  prepared,
  signing,
  certMessage,
  candidateMessage,
  manifestBytes,
  semanticBytes,
  hash,
  lp,
} from './core-fixtures.mjs';
const evidence = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
};
test('certified first epoch and receipt bind exact recovery, recipients and separate semantic bytes', async (t) => {
  const x = await prepared(t),
    offer = await x.begin();
  assert.equal(offer.kind, 'promotion-offer');
  assert.equal(x.f.rows('accounts')[0].state, 'pending');
  assert.deepEqual(await x.begin(), offer);
  const r = await x.finish(offer);
  assert.equal(r.kind, 'promotion-receipt');
  assert.equal(x.f.rows('accounts')[0].state, 'active');
  const m = r.completion.manifest,
    a = r.completion.admission;
  assert.equal(m.checkpointDigest, hash(Buffer.from(x.request.candidate.checkpoint.ct, 'hex')));
  assert.equal(a.manifestDigest, hash(manifestBytes(m)));
  assert.equal(a.headBaselineDigest, hash(lp('done/headvec/v1')));
  assert.ok(verify(null, manifestBytes(m), x.s.publicKey, Buffer.from(m.signature, 'hex')));
  assert.ok(verify(null, semanticBytes(a), x.s.publicKey, Buffer.from(a.signature, 'hex')));
  const key = createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + x.authority.pin.authRoot, 'hex'),
    format: 'der',
    type: 'spki',
  });
  for (const [object, label, sig] of [
    [r.offer.epoch, 'done/first-epoch/v1', r.epochSignature],
    [r, 'done/promotion-receipt/v2', r.signature],
  ]) {
    const body = { ...object };
    delete body.signature;
    assert.ok(verify(null, lp(label, hash(JSON.stringify(body))), key, Buffer.from(sig, 'hex')));
  }
  await verifyReceipt(r, x.request, x.authority.pin, { sv: '00', ds: '0000' });
  assert.deepEqual(await x.finish(offer), r);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.begin(), r);
  const rows = x.f.rows('promotions');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'admitted');
  assert.equal(JSON.parse(rows[0].acceptance_seal).ct.length, 96);
  assert.equal(
    x.f.core.abandonPreparation({
      retryKey: x.account.retryKey,
      accountId: x.account.result.accountId,
    }).ok,
    false,
  );
});
test('validly signed changes of recovery, recipient and candidate cannot replace the offer', async (t) => {
  const x = await prepared(t),
    offer = await x.begin(),
    before = x.f.rows('promotions');
  for (const kind of ['candidate', 'recovery', 'recipient']) {
    const r = structuredClone(x.request);
    if (kind === 'candidate') {
      r.candidate.preparation = 'ee'.repeat(32);
      r.candidate.signature = signing(x.s.privateKey, candidateMessage(r.candidate));
    }
    if (kind === 'recovery') r.certification.recoveryStateDigest = 'ee'.repeat(32);
    if (kind === 'recipient') r.certification.members[0].wPub = 'ee'.repeat(32);
    r.certification.signature = signing(x.s.privateKey, certMessage(r));
    const result = await x.authority.owner.beginPromotion(x.f.core, {
      retryKey: x.account.retryKey,
      request: r,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(x.f.rows('promotions'), before);
  }
  assert.equal((await x.finish(offer)).kind, 'promotion-receipt');
});
test('proposal cannot be replayed as an epoch or completion; malformed and wrong-purpose signatures refuse', async (t) => {
  const x = await prepared(t),
    offer = await x.begin(),
    base = await x.completion(offer);
  for (const mutate of [
    (c) => (c.admission.signature = offer.signature),
    (c) => (c.manifest.epochHead = 'ef'.repeat(32)),
    (c) => (c.admission.selfAdmitted = 0),
    (c) => (c.admission.derivedDs = '0100'),
    (c) => (c.admission.decisionParent = 'ef'.repeat(32)),
  ]) {
    const c = structuredClone(base);
    mutate(c);
    assert.equal(
      (
        await x.authority.owner.challengePromotion(x.f.core, {
          retryKey: x.account.retryKey,
          requestDigest: offer.epoch.requestDigest,
          completion: c,
        })
      ).ok,
      false,
    );
    assert.equal(x.f.rows('accounts')[0].state, 'pending');
  }
});
test('abandonment during asynchronous verification wins before activation', async (t) => {
  let x,
    once = true;
  x = await prepared(t, {
    hook(point, operation) {
      if (point === 'after-verify' && operation === 'admit-promotion' && once) {
        once = false;
        x.f.core.abandonPreparation({
          retryKey: x.account.retryKey,
          accountId: x.account.result.accountId,
        });
      }
    },
  });
  const offer = await x.begin();
  assert.equal((await x.finish(offer)).ok, false);
  assert.equal(x.f.rows('promotions')[0].state, 'cancelled');
  assert.equal(x.f.rows('accounts')[0].state, 'pending');
  assert.equal((await x.begin()).ok, false);
});
test('unreadable acceptance custody refuses cold reopen without replacing its key', async (t) => {
  const x = await prepared(t),
    offer = await x.begin();
  {
    const db = new DatabaseSync(x.f.path);
    const row = db.prepare('SELECT acceptance_seal FROM promotions').get();
    const seal = JSON.parse(row.acceptance_seal);
    seal.ct = '00'.repeat(48);
    db.prepare('UPDATE promotions SET acceptance_seal=?').run(JSON.stringify(seal));
    db.close();
  }
  const before = x.f.rows('promotions');
  x.f.restart();
  x.authority.restart();
  assert.equal((await x.begin()).ok, false);
  assert.equal((await x.finish(offer)).ok, false);
  assert.deepEqual(x.f.rows('promotions'), before);
});
for (const operation of ['offer-promotion', 'admit-promotion'])
  for (const side of ['before-commit', 'after-commit'])
    test(`${side} ${operation} commit failure has one recoverable result`, async (t) => {
      let armed = false;
      const x = await prepared(t, {
        hook(point, kind) {
          if (armed && point === side && kind === operation) {
            armed = false;
            throw Error('commit fault');
          }
        },
      });
      let offer;
      if (operation === 'admit-promotion') offer = await x.begin();
      armed = true;
      const lost = operation === 'offer-promotion' ? await x.begin() : await x.finish(offer);
      assert.equal(lost.ok, false);
      const before = x.f.rows('promotions');
      x.f.restart();
      x.authority.restart();
      const result = operation === 'offer-promotion' ? await x.begin() : await x.finish(offer);
      assert.ok(result.kind);
      if (side === 'after-commit') assert.deepEqual(x.f.rows('promotions'), before);
      assert.deepEqual(
        operation === 'offer-promotion' ? await x.begin() : await x.finish(offer),
        result,
      );
    });
test('schema 2 upgrade is explicit and preserves all prior rows', async (t) => {
  const x = await prepared(t);
  const db = new DatabaseSync(x.f.path);
  db.exec(
    'DROP TABLE workspace_successors; DROP TABLE delivery_decisions; DROP TABLE promotions; PRAGMA user_version=2;',
  );
  const before = db.prepare('SELECT * FROM accounts').all();
  db.close();
  assert.throws(
    () => new AccountCore(x.f.path, { rpId: 'localhost', origin: 'http://localhost:4999' }),
    /offline upgrade/,
  );
  const upgraded = new AccountCore(
    x.f.path,
    { rpId: 'localhost', origin: 'http://localhost:4999' },
    { upgradeFromV2: true },
  );
  upgraded.close();
  x.f.restart();
  assert.deepEqual(x.f.rows('accounts'), before);
});
test(
  '80 generated service histories match an independent pending/offered/active/cancelled ledger',
  { timeout: 60000 },
  async (t) => {
    const histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('offer', 'finish', 'restart', 'abandon', 'wrong'), {
          minLength: 2,
          maxLength: 15,
        }),
        async (commands) => {
          const x = await prepared(t);
          let state = 'pending',
            offer;
          for (const command of commands) {
            if (command === 'restart') {
              x.f.restart();
              x.authority.restart();
            }
            if (command === 'offer') {
              const result = await x.begin();
              if (state === 'cancelled') assert.equal(result.ok, false);
              else if (state === 'active') assert.equal(result.kind, 'promotion-receipt');
              else {
                assert.equal(result.kind, 'promotion-offer');
                if (offer) assert.deepEqual(result, offer);
                offer = result;
                state = 'offered';
              }
            }
            if (command === 'finish' && offer) {
              const result = await x.finish(offer);
              if (state === 'cancelled') assert.equal(result.ok, false);
              else {
                assert.equal(result.kind, 'promotion-receipt');
                state = 'active';
              }
            }
            if (command === 'abandon') {
              const result = x.f.core.abandonPreparation({
                retryKey: x.account.retryKey,
                accountId: x.account.result.accountId,
              });
              if (state === 'active') assert.equal(result.ok, false);
              else {
                assert.equal(result.ok, true);
                state = 'cancelled';
              }
            }
            if (command === 'wrong') {
              const result = await x.authority.owner.beginPromotion(x.f.core, {
                retryKey: 'A'.repeat(43),
                request: x.request,
              });
              assert.equal(result.ok, false);
            }
            assert.equal(x.f.rows('accounts')[0].state, state === 'active' ? 'active' : 'pending');
            assert.ok(x.f.rows('promotions').length <= 1);
          }
          histories.push({ commands, state });
        },
      ),
      { seed: 9232026, numRuns: 80, endOnFailure: true },
    );
    evidence('generated-service', { seed: 9232026, histories });
  },
);

test('a cancelled proposal permits a fresh registration for the same retained workspace', async (t) => {
  const x = await prepared(t);
  await x.begin();
  assert.equal(
    x.f.core.abandonPreparation({
      retryKey: x.account.retryKey,
      accountId: x.account.result.accountId,
    }).ok,
    true,
  );
  const next = await prepared(t, { fixture: x.f, authority: x.authority });
  const offer = await next.begin();
  assert.equal(offer.kind, 'promotion-offer', JSON.stringify(offer));
  assert.equal((await next.finish(offer)).kind, 'promotion-receipt');
  assert.deepEqual(
    x.f.rows('promotions').map((r) => r.state),
    ['cancelled', 'admitted'],
  );
});
