import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ready, proof, link, ZERO } from './fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import {
  readInbound,
  decideSubmission,
  read,
  verifyCurrentWorkspaceAuthority,
  selectPublisher,
  verifiedCensus,
} from '../../account-service/delivery.ts';
import { createDeliveryVerification } from '../../account-service/deliveryVerification.ts';

async function harness(t, options = {}) {
  const x = await ready(t, options),
    retained = [];
  for (let n = 1; n <= 8; n++) {
    const w = x.make(n),
      r = await x.call(w);
    retained.push({ w, r });
  }
  const db = new DatabaseSync(x.f.path);
  const reuse = createDeliveryVerification({ db, path: x.f.path, signal: () => {} });
  const issuer = x.authority.owner.decideSubmission({ decideSubmission: (_input, i) => i }, {});
  t.after(() => {
    reuse.close();
    db.close();
  });
  return {
    x,
    db,
    reuse,
    issuer,
    retained,
    fetch(q = query(x), owner = issuer) {
      return readInbound(db, q, owner, () => {}, reuse);
    },
    submit(w) {
      return decideSubmission(
        db,
        { workspaceId: x.workspace, bytes: w.bytes },
        issuer,
        () => {},
        reuse,
      );
    },
  };
}

test('concurrent first reads perform one full census and independently prove each page', async (t) => {
  const h = await harness(t),
    requests = Array.from({ length: 6 }, () => query(h.x));
  const answers = await Promise.all(requests.map((q) => h.fetch(q)));
  for (let i = 0; i < answers.length; i++) pageProof(answers[i], requests[i], h.x, h.retained);
  assert.equal(h.reuse.tips.status().fullCensuses, 1, 'one initial history verification');
  assert.equal(h.reuse.tips.status().verifiedRows, 8, 'no duplicate full-row verification');
});

test('the cold group drains an explicit six-write burst fairly without exhausting read retries', async (t) => {
  const h = await harness(t),
    tasks = [],
    queries = [],
    writes = [];
  let writerTail = Promise.resolve();
  for (let n = 0; n < 6; n++) {
    const q = query(h.x),
      w = h.x.make(9 + n);
    queries.push(q);
    writes.push(w);
    writerTail = writerTail.then(() => h.submit(w));
    tasks.push(h.fetch(q), writerTail);
  }
  const results = await Promise.all(tasks);
  let previous = h.retained.reduce((p, item) => link(item.w.subject, p), ZERO);
  for (let n = 0; n < 6; n++) {
    const w = writes[n],
      r = results[2 * n + 1];
    assert.equal(
      proof(r, h.x.offer.epoch.acceptancePublicKey, w.subject, previous, w.parent).kind,
      'accepted',
    );
    previous = link(w.subject, previous);
    h.retained.push({ w, r });
  }
  for (let n = 0; n < 6; n++) {
    const r = results[2 * n],
      through = JSON.parse(Buffer.from(r.bytes))[3];
    pageProof(r, queries[n], h.x, h.retained.slice(0, through));
  }
  assert.equal(h.reuse.tips.status().fullCensuses, 1, 'queued writes retain the initial prefix');
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('a warmed publisher returns to ordinary concurrency after its cold lane drains', async (t) => {
  const h = await harness(t);
  await h.fetch();
  const first = h.reuse.tips.enter(h.x.workspace, h.x.credential);
  const second = h.reuse.tips.enter(h.x.workspace, h.x.credential);
  assert.equal(typeof first, 'function');
  assert.equal(typeof second, 'function');
  assert.equal(h.reuse.tips.status().coldLanes, 0);
  first();
  second();
});

test('cold lane handoff is FIFO, idempotent, and still applies after the prefix warms', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  const order = [];
  const second = h.reuse.tips.enter(h.x.workspace, h.x.credential).then((end) => {
    order.push(2);
    return end;
  });
  const third = h.reuse.tips.enter(h.x.workspace, h.x.credential).then((end) => {
    order.push(3);
    return end;
  });
  assert.equal(h.db.isTransaction, false);
  assert.equal(h.reuse.tips.status().coldWaiting, 2);
  release();
  release();
  const end2 = await second;
  await tick();
  assert.deepEqual(order, [2]);
  assert.equal(h.reuse.tips.status().coldWaiting, 1);
  end2();
  const end3 = await third;
  end2();
  assert.deepEqual(order, [2, 3]);
  end3();
  assert.equal(h.reuse.tips.status().coldLanes, 0);
  const stale = release;
  const fresh = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  stale();
  assert.equal(h.reuse.tips.status().coldLanes, 1, 'old release cannot remove a new lane');
  fresh();
});

test('another publisher is not serialized behind a held cold lane', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  const other = h.reuse.tips.enter(h.x.workspace, 'ff'.repeat(16));
  assert.equal(typeof other, 'function');
  assert.equal(h.reuse.tips.status().coldLanes, 2);
  other();
  release();
});

test('active lanes and total waiting entries are bounded, and close rejects every waiter', async (t) => {
  const h = await harness(t),
    releases = [];
  for (let n = 0; n < 128; n++)
    releases.push(await h.reuse.tips.enter(h.x.workspace, n.toString(16).padStart(32, '0')));
  assert.throws(() => h.reuse.tips.enter(h.x.workspace, 'ff'.repeat(16)), /capacity/);
  assert.equal(h.reuse.tips.status().coldLanes, 128);
  const id = '00'.repeat(16),
    waiting = [];
  for (let n = 0; n < 128; n++) waiting.push(h.reuse.tips.enter(h.x.workspace, id));
  const settled = Promise.allSettled(waiting);
  assert.throws(() => h.reuse.tips.enter(h.x.workspace, id), /capacity/);
  assert.equal(h.reuse.tips.status().coldWaiting, 128);
  h.reuse.close();
  const results = await settled;
  assert.equal(results.length, 128);
  assert(results.every((r) => r.status === 'rejected' && /Closed/.test(r.reason.message)));
  releases.forEach((release) => release());
  assert.equal(h.reuse.tips.status().coldLanes, 0);
  assert.equal(h.reuse.tips.status().coldWaiting, 0);
  assert.throws(() => h.reuse.tips.enter(h.x.workspace, id), /Closed/);
});

test('queued input is copied and independently signed; invalid input cannot inherit the leader authority', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  const q = query(h.x),
    original = q.slice();
  // Modify a canonical signature, preserving the valid request shape.
  const parsed = JSON.parse(Buffer.from(original));
  parsed[14] = '00'.repeat(64);
  const invalid = new Uint8Array(Buffer.from(JSON.stringify(parsed)));
  const goodTask = h.fetch(q),
    invalidTask = h.fetch(invalid);
  q.fill(0);
  invalid.fill(0);
  release();
  pageProof(await goodTask, original, h.x, h.retained);
  assert.deepEqual(await invalidTask, { kind: 'unknown', reason: 'invalid-request' });
  assert.equal(h.reuse.tips.status().coldLanes, 0);
});

test('expiry during a cold wait is refused before signing and does not strand its successor', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  const expires = Date.now() + 200,
    q = query(h.x, 0, 1, { expires });
  let issued = 0;
  const owner = {
    ...h.issuer,
    inboundPage(...args) {
      issued++;
      return h.issuer.inboundPage(...args);
    },
  };
  const expired = h.fetch(q, owner),
    nextQ = query(h.x),
    next = h.fetch(nextQ);
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, expires - Date.now() + 1)));
  release();
  assert.deepEqual(await expired, { kind: 'unknown', reason: 'invalid-request' });
  assert.equal(issued, 0);
  pageProof(await next, nextQ, h.x, h.retained);
});

test('queued custody and grant checks remain per request and cannot inherit a previous success', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  let checks = 0,
    authorized = 0,
    pages = 0;
  const owner = {
    ...h.issuer,
    check(...args) {
      checks++;
      return h.issuer.check(...args);
    },
    authorize() {
      authorized++;
      throw Error('Revoked test grant');
    },
    inboundPage(...args) {
      pages++;
      return h.issuer.inboundPage(...args);
    },
  };
  const firstQ = query(h.x),
    first = h.fetch(firstQ),
    refused = h.fetch(query(h.x), owner);
  release();
  pageProof(await first, firstQ, h.x, h.retained);
  assert.deepEqual(await refused, { kind: 'unknown', reason: 'unavailable' });
  assert(checks > 0);
  assert.equal(authorized, 1);
  assert.equal(pages, 0);
  assert.equal(h.reuse.tips.status().coldLanes, 0);
  await h.fetch();
});

test('close while waiting prevents verification and signing, and late release remains inert', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  let pages = 0;
  const pending = h.fetch(query(h.x), {
    ...h.issuer,
    inboundPage(...args) {
      pages++;
      return h.issuer.inboundPage(...args);
    },
  });
  for (let i = 0; i < 100 && !h.reuse.tips.status().coldWaiting; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(h.reuse.tips.status().coldWaiting, 1, 'the real request has joined the cold lane');
  h.reuse.close();
  release();
  assert.deepEqual(await pending, { kind: 'unknown', reason: 'unavailable' });
  assert.equal(pages, 0);
  assert.equal(h.reuse.tips.status().coldWaiting, 0);
});

for (const boundary of ['clear', 'external'])
  test(`${boundary} during a cold wait requires fresh verification after handoff`, async (t) => {
    const h = await harness(t),
      release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
    const q = query(h.x),
      waiting = h.fetch(q);
    if (boundary === 'clear') h.reuse.clear();
    else {
      const external = new DatabaseSync(h.x.f.path);
      try {
        external.exec('CREATE TABLE cold_test_boundary (value INTEGER)');
      } finally {
        external.close();
      }
    }
    release();
    pageProof(await waiting, q, h.x, h.retained);
    assert.equal(h.reuse.tips.status().fullCensuses, 1);
    assert.equal(h.reuse.tips.status().coldLanes, 0);
  });

test('a queued operation recaptures tampered state and refuses it rather than sharing proof results', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  const waiting = h.fetch();
  h.db
    .prepare('UPDATE delivery_decisions SET response=? WHERE position=1')
    .run(new Uint8Array([0]));
  release();
  assert.equal((await waiting).kind, 'unknown');
  assert.equal(h.reuse.tips.status().quarantined, 1);
  h.reuse.clear();
  assert.equal((await h.fetch()).kind, 'unknown', 'quarantine survives clear');
  assert.equal(h.reuse.tips.status().coldLanes, 0);
});

test('a waiting entry times out at ten seconds without resetting or stranding the lane', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  const started = Date.now(),
    waiting = h.reuse.tips.enter(h.x.workspace, h.x.credential);
  // A referenced watchdog keeps the isolated native test alive; production owns the HTTP socket.
  const watchdog = setTimeout(() => {}, 12000);
  try {
    await assert.rejects(waiting, /wait expired/);
  } finally {
    clearTimeout(watchdog);
  }
  assert(Date.now() - started >= 9900);
  assert.equal(h.reuse.tips.status().coldWaiting, 0);
  assert.equal(h.reuse.tips.status().coldLanes, 1);
  release();
  assert.equal(h.reuse.tips.status().coldLanes, 0);
  await h.fetch();
});

test('a newly warm prefix cannot bypass the existing cold group before its queued turn', async (t) => {
  const h = await harness(t),
    release = await h.reuse.tips.enter(h.x.workspace, h.x.credential);
  const s = read(h.db, h.x.workspace, h.x.credential, h.reuse);
  const auth = selectPublisher(await verifyCurrentWorkspaceAuthority(s, h.issuer), s.publisher);
  await verifiedCensus(s, auth, h.reuse);
  assert.equal(h.reuse.tips.status().publishers, 1);
  const pending = h.reuse.tips.enter(h.x.workspace, h.x.credential);
  assert(pending instanceof Promise, 'existing lane takes precedence over the new compact prefix');
  assert.equal(h.reuse.tips.status().coldWaiting, 1);
  release();
  const finish = await pending;
  finish();
  assert.equal(h.reuse.tips.status().coldLanes, 0);
  const ordinary = h.reuse.tips.enter(h.x.workspace, h.x.credential);
  assert.equal(typeof ordinary, 'function');
  ordinary();
});

test('membership-enabled scheduling captures its header transactionally and releases SQL before waiting', async (t) => {
  const { enableMembershipStore } = await import('../../account-service/membershipStore.ts');
  const { authorityFixture } = await import('../account-authority/fixtures.mjs');
  const authority = authorityFixture(t);
  // Let the production core initialize the entire enabled schema on a fresh database.
  const h = await harness(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
  });
  enableMembershipStore(h.db);
  let release;
  assert.doesNotThrow(() => {
    release = h.reuse.tips.enter(h.x.workspace, h.x.credential);
  });
  assert.equal(h.db.isTransaction, false, 'no SQL transaction survives admission');
  const q = query(h.x),
    next = h.fetch(q);
  await tick();
  assert.equal(h.db.isTransaction, false, 'no SQL transaction held while queued');
  release();
  pageProof(await next, q, h.x, h.retained);
  assert.equal(h.reuse.tips.status().coldLanes, 0);
  assert.equal(h.db.isTransaction, false);
});
