import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { ready, mutate, proof, link, ZERO } from './fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import { readInbound, decideSubmission } from '../../account-service/delivery.ts';
import { createDeliveryVerification } from '../../account-service/deliveryVerification.ts';
import { hex, unhex } from '../../account-protocol/recovery.ts';

async function harness(t, count = 4) {
  let db, reuse;
  t.after(() => {
    reuse?.close();
    db?.close();
  });
  const x = await ready(t),
    retained = [];
  for (let n = 1; n <= count; n++) {
    const w = x.make(n);
    retained.push({ w, r: await x.call(w) });
  }
  db = new DatabaseSync(x.f.path);
  let signals = 0;
  reuse = createDeliveryVerification({ db, path: x.f.path, signal: () => signals++ });
  const issuer = x.authority.owner.decideSubmission({ decideSubmission: (_input, i) => i }, {});
  return {
    x,
    db,
    reuse,
    retained,
    get signals() {
      return signals;
    },
    read: (q, hook = () => {}) => readInbound(db, q, issuer, hook, reuse),
    submit: (w, hook = () => {}) =>
      decideSubmission(db, { workspaceId: x.workspace, bytes: w.bytes }, issuer, hook, reuse),
  };
}
async function settled(h) {
  for (let n = 0; n < 400; n++) {
    if (!h.reuse.tips.status().auditActive) return;
    await delay(20);
  }
  assert.fail('Audit did not finish in 8 seconds');
}
test('canonical byte conversions match previous framing and rejection, including detached input', () => {
  const oldHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const oldUnhex = (v, size) => {
    if (typeof v !== 'string' || v.length !== size * 2 || !/^[0-9a-f]+$/.test(v))
      throw Error('Invalid canonical hex');
    return Uint8Array.from(v.match(/../g), (b) => parseInt(b, 16));
  };
  for (const n of [0, 1, 16, 32, 64, 256, 4096]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => i % 256);
    assert.equal(hex(bytes), oldHex(bytes));
    if (n) assert.deepEqual(unhex(hex(bytes), n), bytes);
  }
  for (const v of ['', 'a', 'ab', 'abc', 'aB', '00\n', 'éé', null, 42])
    for (const n of [0, 0.5, 1, 1.5, 2, NaN]) {
      let expected;
      try {
        expected = oldUnhex(v, n);
      } catch {
        assert.throws(() => unhex(v, n));
        continue;
      }
      assert.deepEqual(unhex(v, n), expected);
    }
  const detached = new Uint8Array(1);
  structuredClone(detached, { transfer: [detached.buffer] });
  assert.throws(() => hex(detached));
});
test('warm reads verify only served rows; appends extend a compact prefix; historical retries stay exact', async (t) => {
  const h = await harness(t);
  let q = query(h.x, 1);
  pageProof(await h.read(q), q, h.x, h.retained);
  const cold = h.reuse.tips.status();
  assert.equal(cold.verifiedRows, 4);
  for (let i = 0; i < 3; i++) {
    q = query(h.x, 1);
    pageProof(await h.read(q), q, h.x, h.retained);
  }
  const warm = h.reuse.tips.status();
  assert.equal(warm.verifiedRows, 4);
  assert.equal(warm.fullCensuses, 1);
  assert.equal(warm.servedChecks - cold.servedChecks, 6);
  assert.ok(warm.retainedBytes < 4096);
  const w = h.x.make(5),
    r = await h.submit(w);
  h.retained.push({ w, r });
  q = query(h.x, 4);
  pageProof(await h.read(q), q, h.x, h.retained);
  assert.equal(h.reuse.tips.status().verifiedRows, 5);
  assert.deepEqual(await h.submit(h.retained[0].w), h.retained[0].r);
});
test('overlapping reads and append cannot install a stale tip or expose a buffer erased by a loser', async (t) => {
  const h = await harness(t);
  await h.read(query(h.x, 4));
  const w = h.x.make(5);
  const results = await Promise.all([h.read(query(h.x, 1)), h.submit(w), h.read(query(h.x, 2))]);
  results.forEach((r) => assert.equal(r.kind, 'decision', JSON.stringify(r)));
  h.retained.push({ w, r: results[1] });
  const q = query(h.x, 4);
  pageProof(await h.read(q), q, h.x, h.retained);
});
for (const fault of ['row', 'predecessor', 'count', 'witness', 'witness-signature'])
  test(`same-connection ${fault} damage is refused immediately when examined`, async (t) => {
    const h = await harness(t);
    await h.read(query(h.x, 4));
    if (fault === 'row')
      h.db.exec("UPDATE delivery_decisions SET submission=X'00' WHERE position=2");
    if (fault === 'predecessor')
      h.db.exec("UPDATE delivery_decisions SET response=X'00' WHERE position=1");
    if (fault === 'count') h.db.exec('DELETE FROM delivery_decisions WHERE position=1');
    if (fault === 'witness') h.db.exec('UPDATE promotions SET delivery_witness=NULL');
    if (fault === 'witness-signature') {
      const w = JSON.parse(
        h.db.prepare('SELECT delivery_witness FROM promotions').get().delivery_witness,
      );
      w.signature = '11'.repeat(64);
      h.db.prepare('UPDATE promotions SET delivery_witness=?').run(JSON.stringify(w));
    }
    const result = await h.read(query(h.x, 1));
    assert.deepEqual(result, { kind: 'unknown', reason: 'ledger-integrity' });
    assert.equal(h.signals, 1);
    assert.equal(h.reuse.tips.status().quarantined, 1);
  });
test('external connection invalidates the whole prefix even for an unserved altered row', async (t) => {
  const h = await harness(t);
  await h.read(query(h.x, 4));
  mutate(h.x, (db) => db.exec("UPDATE delivery_decisions SET submission=X'00' WHERE position=1"));
  assert.deepEqual(await h.read(query(h.x, 4)), { kind: 'unknown', reason: 'ledger-integrity' });
});
test('off-path audit detects latent old damage, quarantines without repair, and never signs thereafter', async (t) => {
  const h = await harness(t);
  await h.read(query(h.x, 4));
  const old = h.db
    .prepare('SELECT submission FROM delivery_decisions WHERE position=1')
    .get().submission;
  h.db.exec("UPDATE delivery_decisions SET submission=X'00' WHERE position=1");
  // The documented detection window: the old hash is NOT recomputed from altered disk bytes.
  const w = h.x.make(5),
    r = await h.submit(w);
  assert.equal(r.kind, 'decision');
  let previous = ZERO;
  for (const item of h.retained) previous = link(item.w.subject, previous);
  proof(r, h.x.offer.epoch.acceptancePublicKey, w.subject, previous);
  h.reuse.tips.audit();
  await settled(h);
  assert.equal(h.signals, 1);
  assert.equal(h.reuse.tips.status().quarantined, 1);
  assert.equal(
    h.db.prepare('SELECT length(submission) AS n FROM delivery_decisions WHERE position=1').get().n,
    1,
  );
  // Replacing a damaged byte does not clear the running owner's quarantine.
  h.db.prepare('UPDATE delivery_decisions SET submission=? WHERE position=1').run(old);
  assert.deepEqual(await h.submit(h.x.make(6)), { kind: 'unknown', reason: 'ledger-integrity' });
});
test('successful snapshot audit, stale result and close cannot reinstall a tip', async (t) => {
  const h = await harness(t);
  await h.read(query(h.x, 4));
  h.reuse.tips.audit();
  await settled(h);
  assert.equal(h.signals, 0);
  h.reuse.tips.audit();
  h.reuse.clear();
  await settled(h);
  assert.equal(h.reuse.tips.status().publishers, 0);
  await h.read(query(h.x, 4));
  h.reuse.tips.audit();
  h.reuse.close();
  await settled(h);
  assert.equal(h.reuse.tips.status().publishers, 0);
  assert.equal(h.signals, 0);
});
test('commit abort never moves verified evidence past durable rows; lost reply finds exact decision', async (t) => {
  const h = await harness(t);
  await h.read(query(h.x, 4));
  const w = h.x.make(5);
  assert.equal(
    (
      await h.submit(w, (point) => {
        if (point === 'before-commit') throw Error('injected abort');
      })
    ).kind,
    'unknown',
  );
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 4);
  const r = await h.submit(w, (point) => {
    if (point === 'after-commit') throw Error('injected lost reply');
  });
  assert.equal(r.kind, 'unknown');
  const stored = h.db
    .prepare('SELECT response FROM delivery_decisions WHERE position=5')
    .get().response;
  assert.deepEqual((await h.submit(w)).bytes, new Uint8Array(stored));
});
test('a changed cold snapshot detected at the commit fence cannot install its old verified tip', async (t) => {
  const h = await harness(t);
  let armed = true;
  const result = await h.read(query(h.x, 1), (point) => {
    if (armed && point === 'after-verify') {
      armed = false;
      h.db.exec("UPDATE delivery_decisions SET submission=X'00' WHERE position=1");
    }
  });
  assert.deepEqual(result, { kind: 'unknown', reason: 'ledger-integrity' });
  assert.equal(h.reuse.tips.status().publishers, 0);
});
test('256 appended rows schedule a full worker audit while the prefix stores no decision bytes', async (t) => {
  const h = await harness(t, 0);
  for (let i = 1; i <= 257; i++) assert.equal((await h.submit(h.x.make(i))).kind, 'decision');
  assert.ok(h.reuse.tips.status().auditsStarted >= 1);
  await settled(h);
  assert.ok(h.reuse.tips.status().auditsCompleted >= 1);
  assert.equal(h.reuse.tips.status().publishers, 1);
  assert.ok(h.reuse.tips.status().retainedBytes < 4096);
});
