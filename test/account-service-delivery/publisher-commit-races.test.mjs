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
  // Warm ledger evidence independently; each case explicitly owns its authority warmup.
  reuse.authority.clear();
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
function publicationWork(t) {
  let offers = 0;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/promotion-offer/v1'))) offers++;
    return verify(...args);
  });
  return () => offers;
}
const publicationIssuer = (h) =>
  h.x.authority.owner.decideSubmission({ decideSubmission: (_input, issuer) => issuer }, {});

test('publication authority is verified once across successive genuine committed appends', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  await h.append();
  assert.equal(offers(), 1);
  await h.append();
  await h.append();
  assert.equal(offers(), 1, 'ordinary live witness changes cannot rebuild unchanged authority');
  assert.equal(h.retained.length, 7);
  await h.fetch(4);
});

test('publication authority reuse keeps fresh native custody checks on every warm request', async (t) => {
  const h = await harness(t),
    native = publicationIssuer(h),
    offers = publicationWork(t);
  let checks = 0;
  const issuer = {
    ...native,
    check(...args) {
      checks++;
      native.check(...args);
    },
  };
  for (const n of [5, 6]) {
    const wire = h.x.make(n);
    const response = await decideSubmission(
      h.db,
      { workspaceId: h.x.workspace, bytes: wire.bytes },
      issuer,
      () => {},
      h.reuse,
    );
    assert.equal(response.kind, 'decision');
    assert.equal(
      checks,
      (n - 4) * 2,
      'fresh cached custody proof and final transaction custody both run',
    );
  }
  assert.equal(offers(), 1);
});

test('publication authority reuse never caches member wire signatures or invalid requests', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  await h.append();
  const wire = h.x.make(6),
    damaged = wire.bytes.slice();
  damaged[damaged.length - 1] ^= 1;
  assert.deepEqual(await h.submit({ bytes: damaged }), {
    kind: 'unknown',
    reason: 'invalid-request',
  });
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 5);
  const good = await h.submit(wire);
  assert.equal(good.kind, 'decision');
  assert.equal(offers(), 1);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 6);
});

test('publication authority clear requires full verification before warming again', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  await h.append();
  h.reuse.clear();
  await h.append();
  await h.append();
  assert.equal(offers(), 2);
});

test('publication without an authority cache retains independent full verification', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t),
    uncached = { ...h.reuse, authority: undefined };
  for (const n of [5, 6])
    assert.equal((await h.submit(h.x.make(n), () => {}, uncached)).kind, 'decision');
  assert.equal(offers(), 2);
});

test('publication authority context retains a future native promotion field', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  h.db.exec(
    "ALTER TABLE promotions ADD COLUMN future_publication TEXT; UPDATE promotions SET future_publication='first'",
  );
  await h.append();
  assert.equal(offers(), 1);
  h.db.exec("UPDATE promotions SET future_publication='second'");
  await h.append();
  await h.append();
  assert.equal(offers(), 2);
});

test('publication authority oversized native contexts verify fully on every request', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  h.db.exec('ALTER TABLE promotions ADD COLUMN future_publication TEXT');
  h.db.prepare('UPDATE promotions SET future_publication=?').run('x'.repeat(2 * 1024 * 1024));
  await h.append();
  await h.append();
  assert.equal(offers(), 2);
});

test('publication authority reuse cannot hide a changed service pin', async (t) => {
  const h = await harness(t),
    native = publicationIssuer(h);
  await h.append();
  const issuer = { ...native, pin: { ...native.pin, authRoot: 'ff'.repeat(32) } };
  const wire = h.x.make(6);
  const response = await decideSubmission(
    h.db,
    { workspaceId: h.x.workspace, bytes: wire.bytes },
    issuer,
    () => {},
    h.reuse,
  );
  assert.equal(response.kind, 'unknown');
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 5);
  await h.append();
});

test('publication authority reuse still rejects a damaged fresh live ledger witness', async (t) => {
  const h = await harness(t);
  await h.append();
  // Advance through the other real core: the fresh witness has a new event count,
  // so refusal must not rely only on a changed same-count cached witness string.
  assert.equal((await h.x.call(h.x.make(6, 'independently committed suffix'))).kind, 'decision');
  const raw = h.db.prepare('SELECT delivery_witness FROM promotions').get().delivery_witness;
  const witness = JSON.parse(raw);
  witness.signature = '00'.repeat(64);
  h.db.prepare('UPDATE promotions SET delivery_witness=?').run(JSON.stringify(witness));
  assert.deepEqual(await h.submit(h.x.make(7)), { kind: 'unknown', reason: 'ledger-integrity' });
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 6);
});

test('publication authority reuse cannot bypass a freshly revoked transaction grant', async (t) => {
  const h = await harness(t),
    native = publicationIssuer(h);
  await h.append();
  const { AuthorizationRefused } = await import('../../account-service/authorization.ts');
  let authorizations = 0;
  const issuer = {
    ...native,
    authorize() {
      authorizations++;
      throw new AuthorizationRefused('sign-in-required');
    },
  };
  const wire = h.x.make(6);
  await assert.rejects(
    decideSubmission(
      h.db,
      { workspaceId: h.x.workspace, bytes: wire.bytes },
      issuer,
      () => {},
      h.reuse,
    ),
    AuthorizationRefused,
  );
  assert.equal(authorizations, 1);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 5);
});

test('publication authority cache never revives an in-flight proof after clear', async (t) => {
  const h = await harness(t);
  let entered, release;
  const arrived = new Promise((resolve) => {
      entered = resolve;
    }),
    held = new Promise((resolve) => {
      release = resolve;
    });
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  let armed = true,
    offers = 0;
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/promotion-offer/v1'))) {
      offers++;
      if (armed) {
        armed = false;
        entered();
        await held;
      }
    }
    return verify(...args);
  });
  const wire = h.x.make(5),
    pending = h.submit(wire);
  await arrived;
  h.reuse.clear();
  release();
  assert.equal((await pending).kind, 'unknown');
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 4);
  assert.equal((await h.submit(wire)).kind, 'decision');
  assert.equal((await h.submit(h.x.make(6))).kind, 'decision');
  assert.equal(offers, 2);
});

test('publication authority close during a warm wire verification cannot publish', async (t) => {
  const h = await harness(t);
  await h.append();
  let armed = true;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (armed && Buffer.from(args[3]).includes(Buffer.from('done/envelope-submission/v1'))) {
      armed = false;
      h.reuse.close();
    }
    return verify(...args);
  });
  assert.equal((await h.submit(h.x.make(6))).kind, 'unknown');
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 5);
});

test('publication authority retry retains exactly the committed bytes after a lost reply', async (t) => {
  const h = await harness(t),
    wire = h.x.make(5);
  assert.equal(
    (
      await h.submit(wire, (phase) => {
        if (phase === 'after-commit') throw Error('lost test reply');
      })
    ).kind,
    'unknown',
  );
  const expected = new Uint8Array(
    h.db.prepare('SELECT response FROM delivery_decisions WHERE position=5').get().response,
  );
  const first = await h.submit(wire),
    second = await h.submit(wire);
  assert.equal(first.kind, 'decision');
  assert.equal(second.kind, 'decision');
  assert.deepEqual(first.bytes, expected);
  assert.deepEqual(second.bytes, expected);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 5);
});

test('publication authority failures are not cached and repaired native evidence can warm normally', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  const saved = h.db.prepare('SELECT result FROM promotions').get().result;
  const receipt = JSON.parse(saved);
  receipt.signature = '00'.repeat(64);
  h.db.prepare('UPDATE promotions SET result=?').run(JSON.stringify(receipt));
  for (let i = 0; i < 2; i++) assert.equal((await h.submit(h.x.make(5))).kind, 'unknown');
  assert.equal(offers(), 2);
  h.db.prepare('UPDATE promotions SET result=?').run(saved);
  await h.append();
  await h.append();
  assert.equal(offers(), 3);
});

test('publication authority reuse separates two accounts even in a shared bounded evidence pool', async (t) => {
  const a = await harness(t),
    b = await harness(t),
    offers = publicationWork(t);
  const shared = { ...b.reuse, authority: a.reuse.authority };
  await a.append();
  assert.equal((await b.submit(b.x.make(5), () => {}, shared)).kind, 'decision');
  const cold = offers();
  assert.equal(cold, 2);
  await a.append();
  assert.equal((await b.submit(b.x.make(6), () => {}, shared)).kind, 'decision');
  assert.equal(offers(), cold);
  assert.notEqual(a.x.request.candidate.accountId, b.x.request.candidate.accountId);
  for (const h of [a, b])
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 6);
});

test('publication authority reuse retains the four-attempt fence under genuine competing appends', async (t) => {
  const h = await harness(t);
  await h.append();
  const { decodeSubmission } = await import('../../account-protocol/submission.ts');
  const { hash } = await import('./fixtures.mjs');
  const target = h.x.make(6, 'target must never be recorded'),
    targetHash = hash(decodeSubmission(target.bytes).envelope);
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  let races = 0,
    appending = false,
    previous = ZERO;
  for (const old of h.retained) previous = link(old.w.subject, previous);
  const competing = [];
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    const message = Buffer.from(args[3]);
    if (
      !appending &&
      races < 4 &&
      message.includes(Buffer.from('done/envelope-submission/v1')) &&
      message.includes(Buffer.from(targetHash))
    ) {
      appending = true;
      try {
        const wire = h.x.make(6 + races++, 'genuine competing publisher write'),
          result = await h.x.call(wire);
        const accepted = proof(
          result,
          h.x.offer.epoch.acceptancePublicKey,
          wire.subject,
          previous,
          wire.parent,
        );
        assert.equal(accepted.kind, 'accepted');
        previous = accepted.head.link;
        competing.push({ wire, result });
      } finally {
        appending = false;
      }
    }
    return verify(...args);
  });
  assert.deepEqual(await h.submit(target), { kind: 'unknown', reason: 'state-changed' });
  assert.equal(races, 4);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 9);
  const later = await h.submit(target);
  assert.equal(later.kind, 'decision');
  assert.deepEqual(later.bytes, competing[0].result.bytes);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 9);
});

// The native ledger remains live even when its immutable authority proof is warm.
async function stableRead(
  h,
  {
    after = 0,
    issuer = publicationIssuer(h),
    owner = h.reuse,
    hook = () => {},
    changes = {},
    group,
  } = {},
) {
  const q = query(h.x, after, 1, changes);
  const result = await readInbound(h.db, q, issuer, hook, owner, undefined, group);
  return { q, result };
}

test('stable read authority shares a single proof with interleaved real publications', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  await h.fetch();
  assert.equal(offers(), 1);
  for (let n = 5; n <= 7; n++) {
    await h.append(n);
    await h.fetch(n - 1);
    assert.equal(offers(), 1, 'read and publication must neither rebuild nor evict the same proof');
  }
});

test('stable read authority survives live appends by an independent native core', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  await h.fetch();
  for (let n = 5; n <= 7; n++) {
    const w = h.x.make(n),
      r = await h.x.call(w);
    h.retained.push({ w, r });
    await h.fetch(n - 1);
  }
  assert.equal(offers(), 1);
});

test('stable read authority retains fresh custody replay and both signing-side checks', async (t) => {
  const h = await harness(t),
    native = publicationIssuer(h),
    offers = publicationWork(t);
  let checks = 0;
  const issuer = {
    ...native,
    check(...args) {
      checks++;
      native.check(...args);
    },
  };
  for (let i = 0; i < 3; i++) {
    const { q, result } = await stableRead(h, { issuer });
    pageProof(result, q, h.x, h.retained);
    assert.equal(checks, (i + 1) * 3);
  }
  assert.equal(offers(), 1);
});

test('stable read authority keeps each caller signature, identity, expiry and extent fresh', async (t) => {
  const h = await harness(t);
  await h.fetch();
  const { generateKeyPairSync } = await import('node:crypto');
  const issuer = publicationIssuer(h);
  const bad = [
    query(h.x, 0, 1, {}, generateKeyPairSync('ed25519').privateKey),
    ...[
      { reader: 'aa'.repeat(16) },
      { epoch: 2 },
      { expires: Date.now() - 1 },
      { origin: 'https://elsewhere.test' },
      { after: 5 },
    ].map((v) => query(h.x, 0, 1, v)),
  ];
  for (const q of bad)
    assert.equal((await readInbound(h.db, q, issuer, () => {}, h.reuse)).kind, 'unknown');
  await h.fetch();
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM delivery_decisions').get().n, 4);
});

test('stable read authority refuses a freshly corrupt signed ledger witness after a real append', async (t) => {
  const h = await harness(t);
  await h.fetch();
  assert.equal((await h.x.call(h.x.make(5))).kind, 'decision');
  const witness = JSON.parse(
    h.db.prepare('SELECT delivery_witness FROM promotions').get().delivery_witness,
  );
  witness.signature = '00'.repeat(64);
  h.db.prepare('UPDATE promotions SET delivery_witness=?').run(JSON.stringify(witness));
  assert.deepEqual((await stableRead(h)).result, { kind: 'unknown', reason: 'ledger-integrity' });
});

test('stable read authority never serves substituted bytes from a warm witnessed prefix', async (t) => {
  const h = await harness(t);
  await h.fetch();
  const row = h.db.prepare('SELECT submission FROM delivery_decisions WHERE position=1').get();
  const bytes = new Uint8Array(row.submission);
  bytes[bytes.length - 1] ^= 1;
  h.db.prepare('UPDATE delivery_decisions SET submission=? WHERE position=1').run(bytes);
  assert.equal((await stableRead(h)).result.kind, 'unknown');
});

test('stable read authority still performs current transaction authorization and completion', async (t) => {
  const h = await harness(t),
    native = publicationIssuer(h);
  await h.fetch();
  const { AuthorizationRefused } = await import('../../account-service/authorization.ts');
  for (const completion of [false, true]) {
    let calls = 0;
    const issuer = {
      ...native,
      authorize() {
        calls++;
        if (!completion) throw new AuthorizationRefused('sign-in-required');
        return () => {
          calls++;
          throw new AuthorizationRefused('sign-in-required');
        };
      },
    };
    await assert.rejects(stableRead(h, { issuer }), AuthorizationRefused);
    assert.equal(calls, completion ? 2 : 1);
    assert.equal(h.db.isTransaction, false);
    await h.fetch();
  }
});

test('stable read authority rejects expired requests after synchronous signing', async (t) => {
  const h = await harness(t),
    native = publicationIssuer(h);
  await h.fetch();
  const now = Date.now(),
    issuer = {
      ...native,
      inboundPage(...args) {
        const answer = native.inboundPage(...args);
        t.mock.method(Date, 'now', () => now + 61000);
        return answer;
      },
    };
  assert.deepEqual((await stableRead(h, { issuer })).result, {
    kind: 'unknown',
    reason: 'invalid-request',
  });
  assert.equal(h.db.isTransaction, false);
});

test('stable read authority retains every future native promotion field in its proof context', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  h.db.exec(
    "ALTER TABLE promotions ADD COLUMN future_read TEXT; UPDATE promotions SET future_read='one'",
  );
  await h.fetch();
  h.db.exec("UPDATE promotions SET future_read='two'");
  await h.fetch();
  await h.fetch();
  assert.equal(offers(), 2);
});

test('stable read authority oversize contexts always reverify rather than retain evidence', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  h.db.exec('ALTER TABLE promotions ADD COLUMN future_read TEXT');
  h.db.prepare('UPDATE promotions SET future_read=?').run('x'.repeat(2 * 1024 * 1024));
  await h.fetch();
  await h.fetch();
  assert.equal(offers(), 2);
});

test('stable read authority clear and close cannot revive a retained proof', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t);
  await h.fetch();
  h.reuse.clear();
  await h.fetch();
  await h.fetch();
  assert.equal(offers(), 2);
  h.reuse.close();
  assert.equal((await stableRead(h)).result.kind, 'unknown');
});

test('stable read authority fails closed when clear races the initial proof', async (t) => {
  const h = await harness(t),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let offers = 0;
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/promotion-offer/v1')) && ++offers === 1)
      h.reuse.clear();
    return verify(...args);
  });
  assert.equal((await stableRead(h)).result.kind, 'unknown');
  await h.fetch();
  await h.fetch();
  assert.equal(offers, 2);
});

test('stable read authority failures cannot hide repaired or changed native authority and pin', async (t) => {
  const h = await harness(t),
    native = publicationIssuer(h),
    offers = publicationWork(t);
  await h.fetch();
  const old = h.db.prepare('SELECT result FROM promotions').get().result,
    receipt = JSON.parse(old);
  receipt.signature = '00'.repeat(64);
  h.db.prepare('UPDATE promotions SET result=?').run(JSON.stringify(receipt));
  for (let i = 0; i < 2; i++) assert.equal((await stableRead(h)).result.kind, 'unknown');
  h.db.prepare('UPDATE promotions SET result=?').run(old);
  await h.fetch();
  await h.fetch();
  assert.equal(offers(), 4);
  assert.equal(
    (
      await stableRead(h, {
        issuer: { ...native, pin: { ...native.pin, authRoot: 'ff'.repeat(32) } },
      })
    ).result.kind,
    'unknown',
  );
  await h.fetch();
});

test('stable read authority without a core pool keeps strict independent group verification', async (t) => {
  const h = await harness(t),
    offers = publicationWork(t),
    owner = { ...h.reuse, authority: undefined };
  const { createInboundAuthorityReuse } =
    await import('../../account-service/inboundAuthorityReuse.ts');
  const group = createInboundAuthorityReuse();
  t.after(() => group.close());
  for (let n = 4; n <= 6; n++) {
    if (n > 4) {
      const w = h.x.make(n),
        r = await h.x.call(w);
      h.retained.push({ w, r });
    }
    const { q, result } = await stableRead(h, { owner, group });
    pageProof(result, q, h.x, h.retained);
  }
  assert.equal(
    offers(),
    3,
    'without core ownership each live witness change retains strict context',
  );
});

test('stable read authority separates accounts sharing the same bounded proof pool', async (t) => {
  const a = await harness(t),
    b = await harness(t),
    offers = publicationWork(t);
  const owner = { ...b.reuse, authority: a.reuse.authority };
  await a.fetch();
  let r = await stableRead(b, { owner });
  pageProof(r.result, r.q, b.x, b.retained);
  await a.append();
  await a.fetch(4);
  const w = b.x.make(5),
    result = await b.x.call(w);
  b.retained.push({ w, r: result });
  r = await stableRead(b, { owner, after: 4 });
  pageProof(r.result, r.q, b.x, b.retained);
  assert.equal(offers(), 2);
  assert.notEqual(a.x.request.candidate.accountId, b.x.request.candidate.accountId);
});

test('stable read authority retains fresh final native checks and the four-attempt fence', async (t) => {
  const h = await harness(t);
  await h.fetch();
  let hits = 0;
  const hook = (phase, op) => {
    if (phase === 'after-verify' && op === 'read-inbound') {
      hits++;
      const row = h.db.prepare("SELECT result FROM attempts WHERE mode='register'").get(),
        value = JSON.parse(row.result);
      value.receiptId = 'race-' + hits;
      h.db.prepare("UPDATE attempts SET result=? WHERE mode='register'").run(JSON.stringify(value));
    }
  };
  assert.deepEqual((await stableRead(h, { hook })).result, {
    kind: 'unknown',
    reason: 'state-changed',
  });
  assert.equal(hits, 4);
  await h.fetch();
});
