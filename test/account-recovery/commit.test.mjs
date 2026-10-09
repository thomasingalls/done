import { AccountCore } from '../../account-service/core.ts';
import test from 'node:test';
import { createHash, sign } from 'node:crypto';
import { lp } from '../account-enrollment/fixtures.mjs';
import assert from 'node:assert/strict';
import { client, sourceFixture as ready } from './source-fixtures.mjs';
import { mutate } from '../account-service-delivery/fixtures.mjs';
import { recoveryReader } from './read-fixtures.mjs';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator.ts';
import { historyMembership } from '../../account-protocol/admissionHistory.ts';
import { membershipState } from '../../account-protocol/membership.ts';
const { Y } = client;
const commit = (x, request) => x.authority.owner.commitRecovery(x.f.core, request);
test('first-device recovery commits one real replayed checkpoint, finalizes old writing and survives a lost reply', async (t) => {
  let lose = false;
  const x = await ready(t, {
    hook: (point, op) => {
      if (lose && point === 'after-commit' && op === 'commit-recovery') {
        lose = false;
        throw Error('reply lost');
      }
    },
  });
  const prepared = await client.prepareRecoveryCommit(x.input);
  t.after(() => prepared.key.fill(0));
  lose = true;
  assert.equal((await commit(x, prepared.request)).ok, false);
  assert.equal(x.f.rows('recovery_successors').length, 1);
  x.f.restart();
  x.authority.restart();
  const result = await commit(x, prepared.request);
  assert.equal(result.stage, 'committed', JSON.stringify(result));
  assert.deepEqual(await commit(x, prepared.request), result);
  assert.equal(x.f.rows('recovery_successors').length, 1);
  const { history } = await verifyMembershipChain(
    { successor: null, certification: null, continuations: [result.successor] },
    x.reader.verified.prepared.base,
  );
  const state = membershipState(historyMembership(history));
  assert.equal(state.generation, 2);
  assert.equal(state.roster.length, 1);
  assert.equal(state.roster[0].id, x.reader.input.candidate.credentialId);
  const old = await x.authority.owner.decideSubmission(x.f.core, {
    workspaceId: x.workspace,
    bytes: x.make(1, 'after exclusion').bytes,
  });
  assert.equal(old.kind, 'unknown');
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(x.root));
  const sv = Y.encodeStateVector(doc);
  doc.getText('master').insert(0, 'recovered writing\n');
  const delivered = await x.authority.owner.decideSubmission(x.f.core, {
    workspaceId: x.workspace,
    bytes: x.make(1, 'recovered', {
      credential: x.reader.input.candidate.credentialId,
      signer: x.reader.nodeSigner,
      epoch: 2,
      gen: 2,
      generationKey: prepared.key,
      updates: [Y.encodeStateAsUpdate(doc, sv)],
    }).bytes,
  });
  assert.equal(delivered.kind, 'decision', JSON.stringify(delivered));
  doc.destroy();
  // A later recovery can cold-open the rotated key using the same saved code.
  const later = await recoveryReader(x);
  const source = await client.readRecoverySource({
    ...x.input,
    prepared: later.verified.prepared,
    begin: later.input,
    bootstrap: later.bootstrap,
    sign: async (bytes) =>
      Buffer.from(await crypto.subtle.sign('Ed25519', later.signer, bytes)).toString('hex'),
    read: later.read,
  });
  source.snapshot.fill(0);
  assert.equal(source.generation, 2);
  assert.equal(source.heads.length, 2);
  assert.equal(
    source.heads.find((h) => h.credentialId === x.reader.input.candidate.credentialId).position,
    1,
  );
});
test('an accepted append between replay and commit refuses without excluding the writer', async (t) => {
  const x = await ready(t),
    prepared = await client.prepareRecoveryCommit(x.input);
  t.after(() => prepared.key.fill(0));
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(x.root));
  const sv = Y.encodeStateVector(doc);
  doc.getText('master').insert(0, 'late writing\n');
  await x.append(1, [Y.encodeStateAsUpdate(doc, sv)]);
  doc.destroy();
  assert.equal((await commit(x, prepared.request)).refusal, 'state-changed');
  assert.equal(x.f.rows('recovery_successors').length, 0);
  const newer = await client.prepareRecoveryCommit(x.input);
  t.after(() => newer.key.fill(0));
  const result = await commit(x, newer.request);
  assert.equal(result.stage, 'committed', JSON.stringify(result));
  assert.equal(result.successor.epoch.finalizations[0].position, 1);
});
test('commit rollback, cancellation and corrupted checkpoint never leave a partial authority', async (t) => {
  let abort = false;
  const x = await ready(t, {
      hook: (point, op) => {
        if (abort && point === 'before-commit' && op === 'commit-recovery') throw Error('crash');
      },
    }),
    prepared = await client.prepareRecoveryCommit(x.input);
  t.after(() => prepared.key.fill(0));
  const corrupt = structuredClone(prepared.request);
  corrupt.checkpoint.ct = 'ff'.repeat(corrupt.checkpoint.ct.length / 2);
  assert.equal((await commit(x, corrupt)).refusal, 'invalid-proof');
  abort = true;
  assert.equal((await commit(x, prepared.request)).ok, false);
  assert.equal(x.f.rows('recovery_successors').length, 0);
  assert.equal(x.f.rows('promotions')[0].successor_head, null);
  abort = false;
  await x.reader.cancel();
  assert.equal((await commit(x, prepared.request)).refusal, 'cancelled');
});
test('committed exact retry remains resolvable after preparation expiry; changed bytes cannot remint it', async (t) => {
  let now = 1000;
  const x = await ready(t, { now: () => now }),
    prepared = await client.prepareRecoveryCommit(x.input);
  t.after(() => prepared.key.fill(0));
  const first = await commit(x, prepared.request);
  assert.equal(first.stage, 'committed', JSON.stringify(first));
  now += 20 * 60 * 1000;
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await commit(x, prepared.request), first);
  const different = structuredClone(prepared.request);
  different.intent.signature = 'ff'.repeat(64);
  assert.equal((await commit(x, different)).refusal, 'request-conflict');
});

test('a recovered first device can begin and admit the next connection without an epoch-three anchor', async (t) => {
  const x = await ready(t),
    prepared = await client.prepareRecoveryCommit(x.input);
  t.after(() => prepared.key.fill(0));
  const result = await commit(x, prepared.request);
  assert.equal(result.stage, 'committed');
  const entry = x.candidate();
  entry.input.candidate.head = result.successor.head;
  const begun = await x.enroll('begin', entry.input);
  assert.equal(begun.stage, 'challenge', JSON.stringify(begun));
  assert.equal(begun.challenge.context.epoch, 2);
  const c = begun.challenge.context;
  const finished = await x.enroll('finish', {
    retryKey: entry.input.retryKey,
    attemptId: c.attemptId,
    response: x.account.key.assert({
      options: {
        challenge: createHash('sha256')
          .update(lp('done/enrollment-preparation-assertion/v2', JSON.stringify(c)))
          .digest('base64url'),
      },
    }),
    possession: sign(
      null,
      lp('done/enrollment-preparation-possession/v2', JSON.stringify(c)),
      entry.key,
    ).toString('hex'),
  });
  assert.equal(finished.stage, 'prepared', JSON.stringify(finished));
  const admission = await x.authority.owner.admitMembership(x.f.core, {
    retryKey: entry.input.retryKey,
    attemptId: finished.receipt.context.attemptId,
    receiptId: finished.receipt.receiptId,
  });
  assert.equal(admission.kind, 'membership-admission', JSON.stringify(admission));
  assert.equal(admission.epoch.epoch, 3);
  x.f.restart();
  x.authority.restart();
  const later = await recoveryReader(x);
  assert.equal(later.verified.prepared.head.epoch, 3);
});

test('expiry or account changes at the final boundary refuse and leave original authority intact', async (t) => {
  for (const scenario of ['expired', 'account', 'credential'])
    await t.test(scenario, async (t) => {
      let now = 1000,
        change;
      const x = await ready(t, {
          now: () => now,
          hook: (point, op) => {
            if (point === 'after-verify' && op === 'commit-recovery') change?.();
          },
        }),
        prepared = await client.prepareRecoveryCommit(x.input);
      t.after(() => prepared.key.fill(0));
      change = () =>
        scenario === 'expired'
          ? (now += 20 * 60 * 1000)
          : mutate(x, (db) =>
              db
                .prepare(
                  scenario === 'account'
                    ? "UPDATE accounts SET state='pending' WHERE id=?"
                    : "UPDATE credentials SET state='staged' WHERE account_id=?",
                )
                .run(x.account.result.accountId),
            );
      assert.equal((await commit(x, prepared.request)).ok, false);
      assert.equal(x.f.rows('recovery_successors').length, 0);
      assert.equal(x.f.rows('promotions')[0].successor_head, null);
    });
});

test('schema 22 requires an explicit upgrade and preserves every retained account row', async (t) => {
  const x = await ready(t);
  mutate(x, (db) => db.exec('DROP TABLE recovery_successors; PRAGMA user_version=22'));
  const tables = mutate(x, (db) =>
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name),
  );
  const before = mutate(x, (db) =>
    tables.map((table) => [table, db.prepare('SELECT * FROM ' + table).all()]),
  );
  const config = {
      sessions: { pin: x.authority.pin, operatorKey: x.authority.key },
      membershipContinuation: true,
    },
    policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(() => new AccountCore(x.f.path, policy, config), /offline upgrade/);
  new AccountCore(x.f.path, policy, { ...config, upgradeFromV22: true }).close();
  x.f.restart();
  assert.deepEqual(
    mutate(x, (db) => tables.map((table) => [table, db.prepare('SELECT * FROM ' + table).all()])),
    before,
  );
  assert.deepEqual(
    mutate(x, (db) => db.prepare('PRAGMA foreign_key_check').all()),
    [],
  );
  assert.equal(
    mutate(x, (db) => db.prepare('PRAGMA user_version').get().user_version),
    23,
  );
  assert.match(
    mutate(
      x,
      (db) =>
        db.prepare("SELECT sql FROM sqlite_master WHERE name='membership_admissions'").get().sql,
    ),
    /CHECK\(epoch>=3\)/,
  );
});
