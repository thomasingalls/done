import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, largestInstallable } from './service-fixture.mjs';
import { client as c } from './client.mjs';
import { mutate } from '../account-successor/service-fixtures.mjs';
import { isPrunedDecision } from '../../account-service/prunedDecision.ts';

async function fixture(t, hook) {
  const f = await setup(t, hook);
  const retained = [];
  let previous = null,
    catalog;
  for (let position = 1; position <= 3; position++) {
    const wire = f.make(position, 'prune-' + position, {
      updates: [new Uint8Array(c.Y.encodeStateAsUpdate(f.doc))],
    });
    const result = await f.call(wire);
    assert.equal(result.kind, 'decision');
    retained.push({ wire, result });
    if (position === 3) break;
    const head = {
      credentialId: f.credential,
      position,
      link: JSON.parse(Buffer.from(result.bytes).toString())[6],
    };
    const cp = await f.create(previous, [head]);
    const publish = await f.makeRequest('publish', cp);
    await f.check(publish, await f.exchange(publish));
    const admit = await f.makeRequest('admit', await f.admit(cp));
    catalog = (await f.check(admit, await f.exchange(admit))).catalog;
    previous = cp;
  }
  const request = await f.makeRequest('prune', {
    latest: catalog.latest,
    previous: catalog.previous,
  });
  return { ...f, retained, catalog, request };
}

test('pruning removes only ciphertext covered by both retained snapshots and preserves exact acceptance retries', async (t) => {
  const f = await fixture(t);
  const before = f.f.rows('delivery_decisions');
  await f.check(f.request, await f.exchange(f.request));
  const after = f.f.rows('delivery_decisions');
  assert.equal(after.length, 3);
  assert(isPrunedDecision(after[0].submission));
  assert.deepEqual(after[1], before[1]);
  assert.deepEqual(after[2], before[2]);
  assert.deepEqual(after[0].response, before[0].response);
  assert.equal(f.f.rows('history_checkpoint_records').length, 2);
  f.f.restart();
  f.authority.restart();
  await f.check(f.request, await f.exchange(f.request));
  for (const { wire, result } of f.retained) {
    const replay = await f.call(wire);
    assert.equal(replay.kind, 'decision');
    assert.deepEqual(replay.bytes, result.bytes);
  }
  const next = await f.makeRequest('read', 'latest');
  assert.equal((await f.check(next, await f.exchange(next))).catalog.sequence, 2);
  assert.equal((await f.call(f.make(4, 'after-pruning'))).kind, 'decision');
});

for (const boundary of ['before-commit', 'after-commit'])
  test(`pruning resumes atomically after ${boundary} and restart`, async (t) => {
    let armed = false;
    const f = await fixture(t, (point, op) => {
      if (armed && op === 'history-checkpoint' && point === boundary) {
        armed = false;
        throw Error('Interrupted pruning');
      }
    });
    armed = true;
    assert.equal((await f.exchange(f.request)).ok, false);
    assert.equal(
      isPrunedDecision(f.f.rows('delivery_decisions')[0].submission),
      boundary === 'after-commit',
    );
    f.f.restart();
    f.authority.restart();
    await f.check(f.request, await f.exchange(f.request));
    assert(isPrunedDecision(f.f.rows('delivery_decisions')[0].submission));
  });

test('pruning refuses a stale boundary, and modified compact evidence cannot conceal ledger damage', async (t) => {
  const f = await fixture(t);
  const stale = await f.makeRequest('prune', {
    latest: f.catalog.latest,
    previous: 'ab'.repeat(32),
  });
  assert.equal((await f.exchange(stale)).ok, false);
  assert(!isPrunedDecision(f.f.rows('delivery_decisions')[0].submission));
  await f.check(f.request, await f.exchange(f.request));
  const original = f.f.rows('delivery_decisions')[0].submission;
  for (const edit of [
    (p) => p.position++,
    (p) => p.generation++,
    (p) => (p.submissionHash = 'ff'.repeat(32)),
    (p) => (p.envelopeSignature = 'ff'.repeat(64)),
    (p) => (p.parent = 'ff'.repeat(32)),
  ]) {
    const proof = JSON.parse(Buffer.from(original).toString());
    edit(proof);
    mutate(f, (db) =>
      db
        .prepare('UPDATE delivery_decisions SET submission=? WHERE ordinal=1')
        .run(Buffer.from(JSON.stringify(proof))),
    );
    assert.equal((await f.call(f.retained[2].wire)).kind, 'unknown');
    // Each injected corruption is examined afresh, not hidden behind an earlier quarantine.
    f.f.restart();
  }
  mutate(f, (db) =>
    db.prepare('UPDATE delivery_decisions SET submission=? WHERE ordinal=1').run(original),
  );
  // Operator restoration and a cold owner are required to clear detected corruption.
  f.f.restart();
  assert.equal((await f.call(f.retained[2].wire)).kind, 'decision');
});

test('older snapshot ciphertext becomes an authenticated completion receipt without breaking lost-reply retries', async (t) => {
  const f = await fixture(t);
  const old = f.f.rows('history_checkpoint_records').find((r) => r.sequence === 1);
  const latest = await f.makeRequest('read', 'latest');
  const parent = (await f.check(latest, await f.exchange(latest))).checkpoint;
  const thirdHead = {
    credentialId: f.credential,
    position: 3,
    link: JSON.parse(Buffer.from(f.retained[2].result.bytes).toString())[6],
  };
  const third = await f.create(parent, [thirdHead]);
  const publish = await f.makeRequest('publish', third);
  await f.check(publish, await f.exchange(publish));
  const admit = await f.makeRequest('admit', await f.admit(third));
  const catalog = (await f.check(admit, await f.exchange(admit))).catalog;
  const prune = await f.makeRequest('prune', {
    latest: catalog.latest,
    previous: catalog.previous,
  });
  await f.check(prune, await f.exchange(prune));
  const rows = f.f.rows('history_checkpoint_records');
  assert.equal(
    rows.filter((r) => JSON.parse(r.checkpoint).kind === 'history-checkpoint').length,
    2,
  );
  const compact = rows.find((r) => r.sequence === 1);
  assert.equal(JSON.parse(compact.checkpoint).kind, 'pruned-history-checkpoint');
  assert(!('ct' in JSON.parse(compact.checkpoint)));
  assert.equal(compact.admission, old.admission);
  f.f.restart();
  f.authority.restart();
  const retryPublish = await f.makeRequest('publish', JSON.parse(old.checkpoint));
  assert.deepEqual(
    (await f.check(retryPublish, await f.exchange(retryPublish))).checkpoint,
    JSON.parse(old.checkpoint),
  );
  const retryAdmit = await f.makeRequest('admit', JSON.parse(old.admission));
  const completed = await f.check(retryAdmit, await f.exchange(retryAdmit));
  assert.equal(completed.checkpoint, null);
  assert.deepEqual(completed.admission, JSON.parse(old.admission));
  assert.equal(completed.catalog.sequence, 3);
  await f.check(prune, await f.exchange(prune));
  assert(isPrunedDecision(f.f.rows('delivery_decisions')[1].submission));
  assert(!isPrunedDecision(f.f.rows('delivery_decisions')[2].submission));
  const damaged = JSON.parse(compact.checkpoint);
  damaged.hash = 'ff'.repeat(32);
  mutate(f, (db) =>
    db
      .prepare('UPDATE history_checkpoint_records SET checkpoint=? WHERE sequence=1')
      .run(JSON.stringify(damaged)),
  );
  assert.equal((await f.exchange(retryAdmit)).ok, false);
});

test('pruning keeps refusal and parent evidence while accepted retries remain closed over their original decision', async (t) => {
  const { decodePositionResponse } = await import('../../account-protocol/positionDecision.ts');
  const f = await setup(t);
  const refusedWire = f.make(1, 'wrong-generation', { gen: 2 });
  const refused = await f.call(refusedWire);
  assert.equal(refused.kind, 'decision');
  const proof = decodePositionResponse(refused.bytes);
  assert.equal(proof.kind, 'refused');
  const retry = f.make(1, 'correct-generation', { parent: proof.refusal });
  const accepted = await f.call(retry);
  assert.equal(accepted.kind, 'decision');
  const head = {
    credentialId: f.credential,
    position: 1,
    link: JSON.parse(Buffer.from(accepted.bytes).toString())[6],
  };
  let parent = null,
    catalog;
  for (let i = 0; i < 2; i++) {
    const cp = await f.create(parent, [head]);
    const publish = await f.makeRequest('publish', cp);
    await f.check(publish, await f.exchange(publish));
    const admit = await f.makeRequest('admit', await f.admit(cp));
    catalog = (await f.check(admit, await f.exchange(admit))).catalog;
    parent = cp;
  }
  const before = f.f.rows('delivery_decisions');
  const request = await f.makeRequest('prune', {
    latest: catalog.latest,
    previous: catalog.previous,
  });
  await f.check(request, await f.exchange(request));
  const rows = f.f.rows('delivery_decisions');
  assert.deepEqual(rows[0], before[0]);
  assert(isPrunedDecision(rows[1].submission));
  assert.deepEqual((await f.call(refusedWire)).bytes, refused.bytes);
  assert.deepEqual((await f.call(retry)).bytes, accepted.bytes);
  mutate(f, (db) => db.prepare('DELETE FROM delivery_decisions WHERE ordinal=1').run());
  assert.equal((await f.call(retry)).kind, 'unknown');
});

test('revoked commit authorization refuses pruning before either ciphertext carrier changes', async (t) => {
  const { AuthorizationRefused } = await import('../../account-service/authorization.ts');
  const f = await fixture(t);
  const before = f.f.rows('delivery_decisions');
  await assert.rejects(
    f.exchange(f.request, () => {
      throw new AuthorizationRefused('revoked');
    }),
  );
  assert.deepEqual(f.f.rows('delivery_decisions'), before);
});

test('pruning refuses while the latest snapshot is one an earlier build admitted too large to install', async (t) => {
  const f = await setup(t);
  const first = await f.sized(10);
  const publish = await f.makeRequest('publish', first.cp);
  await f.check(publish, await f.exchange(publish));
  const admit = await f.makeRequest('admit', first.admission);
  await f.check(admit, await f.exchange(admit));
  const over = await f.sized((await largestInstallable(f)) + 100, first.cp);
  await f.legacy([{ ...over, admitted: true }], {
    sequence: 2,
    latest: over.hash,
    previous: first.hash,
  });
  // Devices still read it, so each can say why it cannot install it.
  const read = await f.makeRequest('read', 'latest');
  assert.equal((await f.check(read, await f.exchange(read))).checkpoint.manifest.sequence, 2);
  const kept = () =>
    JSON.stringify([
      f.f.rows('history_checkpoint_records'),
      f.f.rows('history_checkpoint_catalog'),
      f.f.rows('delivery_decisions'),
    ]);
  const before = kept();
  const prune = await f.makeRequest('prune', { latest: over.hash, previous: first.hash });
  assert.deepEqual(await f.exchange(prune), { ok: false, refusal: 'checkpoint-too-large' });
  assert.equal(kept(), before);
});
