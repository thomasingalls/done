import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { ready, proof, link, ZERO } from './fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import {
  read,
  readInbound,
  decideSubmission,
  snapshot,
  snapshotBytes,
} from '../../account-service/delivery.ts';
import { createDeliveryVerification } from '../../account-service/deliveryVerification.ts';

async function harness(t) {
  let db, reuse;
  t.after(() => {
    reuse?.close();
    db?.close();
  });
  const first = await ready(t);
  const other = await ready(t, {
    fixture: first.f,
    authority: first.authority,
    scope: {
      principalId: randomBytes(16).toString('hex'),
      workspaceId: randomBytes(16).toString('hex'),
      lineageId: randomBytes(32).toString('hex'),
    },
    signer: randomBytes(16).toString('hex'),
  });
  db = new DatabaseSync(first.f.path);
  reuse = createDeliveryVerification({ db, path: first.f.path, signal: () => {} });
  const issuer = first.authority.owner.decideSubmission(
    { decideSubmission: (_input, issuer) => issuer },
    {},
  );
  const retained = { first: [], other: [] },
    actors = { first, other };
  const submit = async (who) => {
    const x = actors[who],
      w = x.make(retained[who].length + 1);
    const r = await decideSubmission(
      db,
      { workspaceId: x.workspace, bytes: w.bytes },
      issuer,
      () => {},
      reuse,
    );
    let previous = ZERO;
    for (const row of retained[who]) previous = link(row.w.subject, previous);
    assert.equal(
      proof(r, x.offer.epoch.acceptancePublicKey, w.subject, previous, w.parent).kind,
      'accepted',
    );
    retained[who].push({ w, r });
  };
  const fetch = async (who) => {
    const x = actors[who],
      q = query(x);
    pageProof(await readInbound(db, q, issuer, () => {}, reuse), q, x, retained[who]);
  };
  await submit('first');
  await submit('first');
  await submit('other');
  await fetch('first');
  await fetch('other');
  return {
    db,
    reuse,
    actors,
    submit,
    fetch,
    capture: (who) =>
      read(db, actors[who].workspace, actors[who].credential, reuse, { after: 0, limit: 1 }),
    bytes: (who) => snapshotBytes(snapshot(db, actors[who].workspace)),
    guard(s) {
      db.exec('BEGIN IMMEDIATE');
      try {
        return reuse.tips.guard(s);
      } finally {
        db.exec('ROLLBACK');
      }
    },
    // Public metadata and an already verified prefix; this exercises private memo lifecycle only.
    remember(who, capture, prefix) {
      reuse.tips.remember(
        capture,
        { credential: actors[who].credential, pin: actors[who].authority.pin },
        prefix,
      );
    },
  };
}

test('a same-connection unrelated publisher race retains the unchanged capture and rejects stale memo installation', async (t) => {
  const h = await harness(t),
    first = h.capture('first'),
    other = h.capture('other');
  const before = h.bytes('first'),
    prefix = h.reuse.tips.prefix(other);
  assert(prefix);
  await h.submit('other');
  assert.ok(h.bytes('first') === before, 'whole unrelated snapshot bytes remain identical');
  assert.equal(h.guard(other), false, 'changed publisher still loses its stale capture');
  assert.equal(h.guard(first), true, 'unchanged publisher must retain its capture');
  assert.equal(h.reuse.tips.status().publishers, 1);
  h.remember('other', other, prefix);
  assert.equal(
    h.reuse.tips.status().publishers,
    1,
    'late old census cannot repopulate the discarded tip',
  );
  const fresh = h.capture('other');
  assert.equal(h.reuse.tips.prefix(fresh), undefined);
  assert.equal(h.guard(fresh), true);
  await h.fetch('first');
  await h.fetch('other');
});

for (const change of ['explicit-clear', 'external-connection']) {
  test(`${change} still invalidates every captured publisher and prevents stale memo installation`, async (t) => {
    const h = await harness(t),
      first = h.capture('first'),
      other = h.capture('other');
    const prefix = h.reuse.tips.prefix(first),
      before = [h.bytes('first'), h.bytes('other')];
    if (change === 'explicit-clear') h.reuse.clear();
    else {
      const version = h.db.prepare('PRAGMA data_version').get().data_version;
      const external = new DatabaseSync(h.actors.first.f.path);
      try {
        external.exec('CREATE TABLE publisher_isolation_marker (value INTEGER)');
      } finally {
        external.close();
      }
      assert.notEqual(
        h.db.prepare('PRAGMA data_version').get().data_version,
        version,
        'an actual external commit crosses the global version fence',
      );
    }
    assert.ok(h.bytes('first') === before[0] && h.bytes('other') === before[1]);
    assert.equal(h.guard(first), false);
    assert.equal(h.guard(other), false);
    h.remember('first', first, prefix);
    assert.equal(h.reuse.tips.status().publishers, 0);
    assert.equal(h.reuse.tips.status().captureOwners, 0);
    assert.equal(h.guard(h.capture('first')), true);
    await h.fetch('first');
    await h.fetch('other');
  });
}

test('bounded preliminary ownership evicts one publisher and key recreation never revives an old capture', async (t) => {
  const h = await harness(t),
    first = h.capture('first'),
    other = h.capture('other');
  const prefix = h.reuse.tips.prefix(first);
  // These unverified preliminary captures exercise the memory bound, not membership or read authority.
  for (let i = 0; i < 126; i++)
    h.reuse.tips.capture(h.actors.first.workspace, (100 + i).toString(16).padStart(32, '0'));
  assert.equal(h.reuse.tips.status().captureOwners, 128);
  h.capture('other'); // Keep the other real publisher recent.
  h.reuse.tips.capture(h.actors.first.workspace, 'ff'.repeat(16));
  assert.equal(h.reuse.tips.status().captureOwners, 128);
  assert.equal(h.guard(first), false, 'evicted capture is no longer current');
  assert.equal(h.guard(other), true, 'eviction does not invalidate the other owner');
  const fresh = h.capture('first');
  assert.equal(h.guard(fresh), true);
  assert.equal(h.guard(first), false, 'same key with a fresh owner cannot revive the old capture');
  h.remember('first', first, prefix);
  assert.equal(h.reuse.tips.prefix(h.capture('first')), undefined);
  assert.equal(h.reuse.tips.status().captureOwners, 128);
  await h.fetch('first');
  await h.fetch('other');
});

test('a local race discards its active audit result while the unrelated queued audit completes', async (t) => {
  const h = await harness(t),
    other = h.capture('other');
  await h.submit('other');
  await h.fetch('first'); // The stale other tip is first in audit order.
  const before = h.reuse.tips.status().auditsCompleted;
  h.reuse.tips.audit();
  assert.equal(h.reuse.tips.status().auditActive, true);
  assert.equal(h.reuse.tips.status().auditsQueued, 1);
  // No await: the old worker's completion callback cannot run before this invalidation.
  assert.equal(h.guard(other), false);
  assert.equal(h.reuse.tips.status().auditsQueued, 1, 'unrelated queued audit remains owned');
  await h.fetch('other'); // A new owner must not adopt the previous owner's audit result.
  for (let i = 0; i < 400; i++) {
    const s = h.reuse.tips.status();
    if (!s.auditActive && !s.auditsQueued) break;
    await delay(20);
  }
  const after = h.reuse.tips.status();
  assert.equal(after.auditActive, false);
  assert.equal(after.auditsQueued, 0);
  assert.equal(after.auditsCompleted - before, 1, 'only the unaffected queued audit may count');
  assert.equal(after.quarantined, 0);
  await h.fetch('first');
  await h.fetch('other');
});

test('local quarantine survives global clear without invalidating an unrelated capture', async (t) => {
  const h = await harness(t),
    first = h.capture('first'),
    other = h.capture('other');
  assert.throws(() => h.reuse.tips.failure(other), { code: 'ledger-integrity' });
  assert.equal(h.guard(first), true);
  assert.throws(() => h.capture('other'), { code: 'ledger-integrity' });
  h.reuse.clear();
  assert.equal(h.guard(first), false);
  assert.throws(() => h.capture('other'), { code: 'ledger-integrity' });
  assert.equal(h.reuse.tips.status().quarantined, 1);
  await h.fetch('first');
});
