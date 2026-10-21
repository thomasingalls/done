import test from 'node:test';
import assert from 'node:assert/strict';
import workerThreads from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { ready, proof, link, ZERO } from './fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import { read, readInbound, decideSubmission } from '../../account-service/delivery.ts';
import { createDeliveryVerification } from '../../account-service/deliveryVerification.ts';

async function harness(t) {
  const x = await ready(t),
    retained = [];
  for (let n = 1; n <= 4; n++) {
    const w = x.make(n),
      r = await x.call(w);
    retained.push({ w, r });
  }
  const db = new DatabaseSync(x.f.path);
  let signals = 0;
  const reuse = createDeliveryVerification({ db, path: x.f.path, signal: () => signals++ });
  t.after(() => {
    reuse.close();
    db.close();
  });
  const issuer = x.authority.owner.decideSubmission(
    { decideSubmission: (_input, issuer) => issuer },
    {},
  );
  const h = {
    x,
    db,
    reuse,
    retained,
    get signals() {
      return signals;
    },
    capture: () => read(db, x.workspace, x.credential, reuse, { after: 0, limit: 1 }),
    guard(s) {
      db.exec('BEGIN IMMEDIATE');
      try {
        return reuse.tips.guard(s);
      } finally {
        db.exec('ROLLBACK');
      }
    },
    async fetch(after = 0) {
      const q = query(x, after),
        r = await readInbound(db, q, issuer, () => {}, reuse);
      pageProof(r, q, x, retained);
      return r;
    },
    submit: (w, hook = () => {}, owner = reuse) =>
      decideSubmission(
        db,
        { workspaceId: x.workspace, bytes: w.bytes },
        issuer,
        hook,
        owner ?? undefined,
      ),
    async append(n = retained.length + 1) {
      const w = x.make(n),
        r = await h.submit(w);
      let previous = ZERO;
      for (const item of retained) previous = link(item.w.subject, previous);
      assert.equal(
        proof(r, x.offer.epoch.acceptancePublicKey, w.subject, previous, w.parent).kind,
        'accepted',
      );
      retained.push({ w, r });
      return { w, r };
    },
    // Only private memo lifecycle: public metadata and an independently verified prefix.
    remember(s, prefix) {
      reuse.tips.remember(s, { credential: x.credential, pin: x.authority.pin }, prefix);
    },
    prefix: () => reuse.tips.prefix(h.capture()),
  };
  await h.fetch();
  return h;
}

// Delay only delivery of a real worker's exit callback. Its actual SQL/crypto result is unchanged.
function holdAuditExit(t) {
  const RealWorker = workerThreads.Worker;
  let release,
    count = 0;
  class HeldWorker extends RealWorker {
    once(event, listener) {
      return super.once(
        event,
        event === 'exit'
          ? (code) => {
              count++;
              release = () => listener.call(this, code);
            }
          : listener,
      );
    }
  }
  workerThreads.Worker = HeldWorker;
  syncBuiltinESMExports();
  const restore = () => {
    workerThreads.Worker = RealWorker;
    syncBuiltinESMExports();
  };
  t.after(() => {
    restore();
    release?.();
    release = undefined;
  });
  return {
    restore,
    async deliver() {
      for (let i = 0; i < 400 && !release; i++) await delay(20);
      assert.equal(count, 1, 'the actual audit worker must exit once');
      assert(release, 'actual worker exit within original eight-second audit deadline');
      const finish = release;
      release = undefined;
      finish();
    },
  };
}

test('a known committed append rejects old captures without discarding the authenticated prefix', async (t) => {
  const h = await harness(t),
    before = h.reuse.tips.status(),
    old = h.capture();
  await h.append();
  assert.equal(h.guard(old), false, 'a pre-commit snapshot is still rejected');
  assert.equal(h.prefix()?.count, 4, 'the verified pre-append prefix must survive its losing read');
  await h.fetch(4);
  const after = h.reuse.tips.status();
  assert.equal(after.fullCensuses, before.fullCensuses, 'no replacement whole-history census');
  assert.equal(
    after.verifiedRows - before.verifiedRows,
    1,
    'the new row is independently verified',
  );
});

test('a delayed pre-commit full census cannot reinstall or credit obsolete memo evidence', async (t) => {
  const h = await harness(t);
  h.reuse.clear();
  const old = h.capture();
  assert.equal(h.reuse.tips.prefix(old), undefined);
  await h.append();
  const before = h.reuse.tips.status(),
    p = h.prefix();
  h.remember(old, p);
  assert.deepEqual(h.reuse.tips.status(), before);
  assert.equal(h.guard(old), false);
  assert.equal(h.prefix().count, 4);
  await h.fetch(4);
});

test('successive commits fence every older capture while retaining incremental prefix verification', async (t) => {
  const h = await harness(t),
    first = h.capture();
  await h.append();
  const second = h.capture();
  await h.fetch(4);
  await h.append();
  assert.equal(h.guard(first), false);
  assert.equal(h.guard(second), false);
  assert.equal(h.prefix().count, 5);
  await h.fetch(5);
  assert.equal(h.reuse.tips.status().verifiedRows, 6);
  assert.equal(h.reuse.tips.status().fullCensuses, 1);
});

test('an unannounced same-connection commit still destroys the raced preliminary prefix', async (t) => {
  const h = await harness(t),
    old = h.capture(),
    w = h.x.make(5);
  const r = await h.submit(w, () => {}, null);
  let previous = ZERO;
  for (const item of h.retained) previous = link(item.w.subject, previous);
  assert.equal(proof(r, h.x.offer.epoch.acceptancePublicKey, w.subject, previous).kind, 'accepted');
  h.retained.push({ w, r });
  assert.equal(h.guard(old), false);
  assert.equal(h.prefix(), undefined, 'unknown same-connection changes retain full invalidation');
  await h.fetch(4);
  assert.equal(h.reuse.tips.status().fullCensuses, 2);
});

test('a committed refusal fences captures without advancing accepted progress or weakening ancestry', async (t) => {
  const h = await harness(t),
    old = h.capture(),
    w = h.x.make(5, 'refused', { gen: 2 });
  let previous = ZERO;
  for (const item of h.retained) previous = link(item.w.subject, previous);
  const r = await h.submit(w),
    checked = proof(r, h.x.offer.epoch.acceptancePublicKey, w.subject, previous, w.parent);
  assert.equal(checked.kind, 'refused');
  assert.equal(h.guard(old), false);
  assert.equal(h.prefix().count, 4);
  await h.fetch(4);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 5);
  assert.deepEqual(await h.submit(w), r, 'exact historical refusal remains byte-identical');
  const next = h.x.make(5, 'accepted-after-refusal', { parent: checked.refusal }),
    answer = await h.submit(next);
  assert.equal(
    proof(answer, h.x.offer.epoch.acceptancePublicKey, next.subject, previous, next.parent).kind,
    'accepted',
  );
  h.retained.push({ w: next, r: answer });
  await h.fetch(4);
});

test('historical retries and non-proposed decisions do not invalidate current captures', async (t) => {
  const h = await harness(t),
    old = h.capture();
  assert.deepEqual(await h.submit(h.retained[0].w), h.retained[0].r);
  assert.equal(h.guard(old), true);
  assert.deepEqual(await h.submit(h.x.make(9)), { kind: 'unknown', reason: 'out-of-order' });
  assert.equal(h.guard(old), true);
  await h.fetch();
});

test('rollback and a lost post-commit reply retain only actual durable original decisions', async (t) => {
  const h = await harness(t),
    w = h.x.make(5);
  const aborted = await h.submit(w, (point) => {
    if (point === 'before-commit') throw Error('injected rollback');
  });
  assert.equal(aborted.kind, 'unknown');
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 4);
  await h.fetch();
  const lost = await h.submit(w, (point) => {
    if (point === 'after-commit') throw Error('injected lost reply');
  });
  assert.equal(lost.kind, 'unknown');
  const row = h.db.prepare('SELECT response FROM delivery_decisions WHERE position=5').get();
  const exact = await h.submit(w);
  assert.equal(exact.kind, 'decision');
  assert.deepEqual(Buffer.from(exact.bytes), Buffer.from(row.response));
  let previous = ZERO;
  for (const item of h.retained) previous = link(item.w.subject, previous);
  assert.equal(
    proof(exact, h.x.offer.epoch.acceptancePublicKey, w.subject, previous).kind,
    'accepted',
  );
  h.retained.push({ w, r: exact });
  await h.fetch(4);
});

for (const fence of ['external-version', 'explicit-clear'])
  test(`${fence} still clears all prefix evidence after a known append`, async (t) => {
    const h = await harness(t),
      old = h.capture();
    await h.append();
    if (fence === 'explicit-clear') h.reuse.clear();
    else {
      const external = new DatabaseSync(h.x.f.path);
      try {
        external.exec('CREATE TABLE commit_race_marker(value INTEGER)');
      } finally {
        external.close();
      }
    }
    assert.equal(h.guard(old), false);
    assert.equal(h.prefix(), undefined);
    await h.fetch(4);
    assert.equal(h.reuse.tips.status().fullCensuses, 2);
  });

test('fabricated and pre-COMMIT notifications cannot alter live capture ownership', async (t) => {
  const h = await harness(t),
    current = h.capture(),
    before = h.reuse.tips.status();
  h.reuse.tips.committed({ ...current });
  assert.equal(h.guard(current), true);
  h.db.exec('BEGIN IMMEDIATE');
  try {
    h.reuse.tips.committed(current);
    assert.equal(h.reuse.tips.guard(current), true);
  } finally {
    h.db.exec('ROLLBACK');
  }
  assert.deepEqual(h.reuse.tips.status(), before);
});

for (const damaged of [false, true])
  test(`known appends preserve a real active audit's ${damaged ? 'corruption quarantine' : 'verified completion'}`, async (t) => {
    const h = await harness(t);
    if (damaged) h.db.exec("UPDATE delivery_decisions SET submission=X'00' WHERE position=1");
    const held = holdAuditExit(t),
      before = h.reuse.tips.status();
    h.reuse.tips.audit();
    held.restore();
    assert.equal(h.reuse.tips.status().auditActive, true);
    await h.append();
    await h.append();
    assert.equal(h.reuse.tips.status().auditActive, true);
    await held.deliver();
    const after = h.reuse.tips.status();
    assert.equal(after.auditActive, false);
    assert.equal(after.quarantined, damaged ? 1 : 0);
    assert.equal(h.signals, damaged ? 1 : 0);
    if (damaged) {
      const q = query(h.x, 5);
      const r = await readInbound(
        h.db,
        q,
        h.x.authority.owner.decideSubmission({ decideSubmission: (_input, issuer) => issuer }, {}),
        () => {},
        h.reuse,
      );
      assert.deepEqual(r, { kind: 'unknown', reason: 'ledger-integrity' });
    } else {
      assert.equal(after.auditsCompleted - before.auditsCompleted, 1);
      await h.fetch(5);
    }
  });

test('served tail corruption after a known append is refused before any page is exposed', async (t) => {
  const h = await harness(t);
  await h.append();
  h.db.exec("UPDATE delivery_decisions SET submission=X'00' WHERE position=5");
  const q = query(h.x, 4);
  const issuer = h.x.authority.owner.decideSubmission(
    { decideSubmission: (_input, issuer) => issuer },
    {},
  );
  assert.deepEqual(await readInbound(h.db, q, issuer, () => {}, h.reuse), {
    kind: 'unknown',
    reason: 'ledger-integrity',
  });
  assert.equal(h.reuse.tips.status().quarantined, 1);
});
