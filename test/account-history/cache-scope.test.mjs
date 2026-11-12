// Phase 553: a history request retires only the verification evidence its own writes can change.
// Publish, admit and discard write only history tables, so they retire nothing. A prune replaces
// stored bytes of one account, so it retires that account's verified publisher tips and nothing
// else. Two accounts share one in-process service: A has two certified devices and runs the real
// history maintenance commands, B is another account that only writes and reads. Every count comes
// from the service's own verification status or the test's crypto boundary; nothing is logged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { devices } from './devices-fixture.mjs';
import { ready } from '../account-service-delivery/fixtures.mjs';
import { query, read, pageProof } from '../account-service-inbound/oracle.mjs';
import { page } from '../account-successor/service-fixtures.mjs';
import { signed } from '../account-ceremony/exchange-oracle.mjs';
import { historyExchangeMessage } from '../../account-protocol/historyExchange.ts';
import {
  readInbound,
  decideSubmission,
  read as capture,
  unchanged,
} from '../../account-service/delivery.ts';
import { exchangeHistoryCheckpoint } from '../../account-service/historyCheckpoint.ts';
import { createDeliveryVerification } from '../../account-service/deliveryVerification.ts';
import { enableMembershipStore } from '../../account-service/membershipStore.ts';
import { isPrunedDecision } from '../../account-service/prunedDecision.ts';

// Accepted positions per stream before the first snapshot and between the first and second. A cold
// census of A1 or B then verifies 512 to 1,033 rows; a warm read verifies only what it serves.
const FIRST = { A1: 512, A2: 256, B: 1024 };
const SECOND = { A1: 512, A2: 256 };
const COVERED = FIRST.A1 + FIRST.A2; // rows at or below the previous snapshot: what a prune replaces

/** Account A (two devices, A1 and A2) and account B on one service. Writes go through the core. */
async function accounts(t, { snapshots = false } = {}) {
  const f = await devices(t, 2),
    x = f.x,
    p = f.p;
  const B = await ready(t, {
    fixture: x.f,
    authority: x.authority,
    scope: {
      principalId: randomBytes(16).toString('hex'),
      workspaceId: randomBytes(16).toString('hex'),
      lineageId: randomBytes(32).toString('hex'),
    },
    signer: randomBytes(16).toString('hex'),
  });
  const [A1, A2] = f.devices;
  const id = { A1: A1.id, A2: A2.id },
    key = { A1: x.keys.existing, A2: x.keys.new };
  const retained = { A1: [], A2: [], B: [] };
  const workspace = (name) => (name === 'B' ? B.workspace : x.workspace);
  const wire = (name) => {
    const position = retained[name].length + 1;
    return name === 'B'
      ? B.make(position, 'other account ' + position)
      : x.make(position, `${name} ${position}`, {
          epoch: p.epoch,
          credential: id[name],
          signer: key[name],
        });
  };
  const keep = (name, w, r) => {
    assert.equal(r.kind, 'decision', JSON.stringify(r));
    assert.equal(JSON.parse(Buffer.from(r.bytes).toString())[2], 'accepted');
    retained[name].push(name === 'B' ? { w, r } : { w, r, epoch: p.epoch });
  };
  /** The reader of each stream: A's devices read each other, B reads its own. */
  const reader = { A1: 'A2', A2: 'A1', B: 'B' };
  const queryFor = (name, after = retained[name].length - 1, limit = 1) =>
    name === 'B'
      ? query(B, after, limit)
      : query(
          x,
          after,
          limit,
          { reader: id[reader[name]], publisher: id[name], head: p.head, epoch: p.epoch },
          key[reader[name]],
        );
  const verifyPage = (name, result, q) =>
    name === 'B' ? pageProof(result, q, B, retained.B) : page(x, result, q, retained[name]);
  const a = {
    f,
    x,
    p,
    B,
    A1,
    A2,
    id,
    retained,
    workspace,
    wire,
    keep,
    queryFor,
    verifyPage,
    async upload(counts) {
      for (const [name, n] of Object.entries(counts))
        for (let i = 0; i < n; i++) {
          const w = wire(name);
          keep(name, w, await (name === 'B' ? B.call(w) : x.deliveryCall(w)));
        }
    },
    /** One write by this stream's own device, through the core. */
    async submit(name) {
      const w = wire(name);
      keep(name, w, await (name === 'B' ? B.call(w) : x.deliveryCall(w)));
    },
    /** The last accepted position of a stream, read through the core and checked. */
    async read(name) {
      const q = queryFor(name);
      verifyPage(name, await read(name === 'B' ? B : x, q), q);
    },
    /** A history request this device signs now, for the harness to send. */
    async request(name, action, payload) {
      const r = {
        v: 1,
        kind: 'history-checkpoint-request',
        workspaceId: p.workspaceId,
        lineageId: p.lineageId,
        epoch: p.epoch,
        head: p.head,
        credentialId: id[name],
        nonce: randomBytes(32).toString('hex'),
        expiresAt: 31000,
        action,
        payload,
        signature: '00'.repeat(64),
      };
      r.signature = signed(key[name], await historyExchangeMessage(r));
      return r;
    },
    /** Decision rows whose ciphertext a prune replaced, in either ledger table. */
    pruned: () =>
      [...x.f.rows('delivery_decisions'), ...x.f.rows('publisher_decisions')].filter((r) =>
        isPrunedDecision(new Uint8Array(r.submission)),
      ).length,
  };
  await a.upload(FIRST);
  if (snapshots) {
    assert.equal((await A1.run('create')).pending, 'waiting');
    assert.equal((await A2.run('verify')).sequence, 1);
    assert.equal((await A1.run('resume')).pending, 'none');
    await a.upload(SECOND);
    assert.equal((await A1.run('create')).pending, 'waiting');
    assert.equal((await A2.run('verify')).sequence, 2);
    assert.equal((await A1.run('resume')).pending, 'none');
  }
  return a;
}

/** Background audits run on worker snapshots; let them finish so counts are taken at rest. */
async function settled(status) {
  for (let i = 0; i < 1500; i++) {
    const s = status();
    if (!s.auditActive && !s.auditsQueued) return s;
    await delay(20);
  }
  assert.fail('background audits did not finish within 30 s');
}

/**
 * The service's own delivery, read and history functions on a second connection with its own
 * verification owner, as the core composes them, so the test can hold a prune at its last await
 * and see the moment a read captures. Everything after setup goes through this connection.
 */
function harness(t, a) {
  const { x } = a;
  const db = new DatabaseSync(x.f.path);
  enableMembershipStore(db);
  const reuse = createDeliveryVerification({ db, path: x.f.path, signal: () => {} });
  t.after(() => {
    reuse.close();
    db.close();
  });
  let wipes = 0;
  const wipe = reuse.clear;
  reuse.clear = function () {
    wipes++;
    return wipe.call(this);
  };
  const capturing = reuse.tips.capture;
  let watch = null;
  reuse.tips.capture = function (workspace, publisher, options) {
    const s = capturing.call(this, workspace, publisher, options);
    if (watch && watch.workspace === workspace && watch.publisher === publisher) {
      const seen = watch.seen;
      watch = null;
      seen();
    }
    return s;
  };
  const owner = x.authority.owner;
  const issuers = {
    read: owner.readInbound({ readInbound: (_input, issuer) => issuer }, new Uint8Array()),
    submit: owner.decideSubmission({ decideSubmission: (_input, issuer) => issuer }, {}),
    history: owner.exchangeHistoryCheckpoint(
      { exchangeHistoryCheckpoint: (_input, issuer) => issuer },
      {},
    ),
  };
  const publisher = (name) => (name === 'B' ? a.B.credential : a.id[name]);
  return {
    db,
    reuse,
    issuers,
    status: () => reuse.tips.status(),
    get wipes() {
      return wipes;
    },
    /** Call `seen` synchronously the next time this stream is captured. */
    onCapture(name, seen) {
      watch = { workspace: a.workspace(name), publisher: publisher(name), seen };
    },
    async submit(name, hook = () => {}, issuer = issuers.submit) {
      const w = a.wire(name);
      const r = await decideSubmission(
        db,
        { workspaceId: a.workspace(name), bytes: w.bytes },
        issuer,
        hook,
        reuse,
      );
      if (r.kind === 'decision') a.keep(name, w, r);
      return r;
    },
    async read(name, hook = () => {}, after) {
      const q = a.queryFor(name, after);
      const result = await readInbound(db, q, issuers.read, hook, reuse);
      return { q, result };
    },
    async readChecked(name) {
      const { q, result } = await this.read(name);
      a.verifyPage(name, result, q);
    },
    exchange: (request, hook = () => {}, issuer = issuers.history) =>
      exchangeHistoryCheckpoint(db, request, issuer, () => 1000, hook, reuse),
    async prune(hook, issuer) {
      const catalog = a.f.catalog();
      return this.exchange(
        await a.request('A1', 'prune', { latest: catalog.latest, previous: catalog.previous }),
        hook,
        issuer,
      );
    },
    /** Verified tips for all three streams. */
    async warm() {
      for (const name of ['A1', 'A2', 'B']) await this.readChecked(name);
      return settled(this.status);
    },
  };
}

/** The real history issuer, holding the prune after it has verified and signed everything. */
function held(issuer) {
  let open, arrive;
  const opened = new Promise((r) => (open = r)),
    reached = new Promise((r) => (arrive = r));
  return {
    issuer: {
      ...issuer,
      historyPage: async (value) => {
        const signedPage = await issuer.historyPage(value);
        arrive();
        await opened;
        return signedPage;
      },
    },
    reached,
    release: () => open(),
  };
}

test("one account's publish, admit, discard and prune leave another account's verification; its prune re-verifies only its own streams", async (t) => {
  const a = await accounts(t);
  const { x, A1, A2 } = a;
  const status = () => x.f.core.deliveryVerificationStatus;
  // Account-authority proofs verified afresh, counted where the crypto runs.
  let offers = 0;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'verify', (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/promotion-offer/v1'))) offers++;
    return verify(...args);
  });
  for (const name of ['A1', 'A2', 'B']) await a.read(name);
  const timings = {};
  const step = async (label, run, { pruned = false } = {}) => {
    await settled(status);
    await run();
    await settled(status);
    const held = status().publishers;
    // B's next write and read: whole-history censuses, rows verified and authority proofs.
    let before = status(),
      proofs = offers;
    const started = performance.now();
    await a.submit('B');
    await a.read('B');
    timings[label] = Math.round(performance.now() - started);
    let after = status();
    const b = {
      held,
      fullCensuses: after.fullCensuses - before.fullCensuses,
      authorityProofs: offers - proofs,
    };
    // A's two devices read each other's streams.
    before = after;
    await a.read('A1');
    await a.read('A2');
    after = status();
    const rows = after.verifiedRows - before.verifiedRows;
    const own = {
      fullCensuses: after.fullCensuses - before.fullCensuses,
      // A warm tip verifies at most the one row its own last write appended, per stream.
      verifiedRows: pruned ? rows : rows <= 2 ? 'suffix' : rows,
      held: after.publishers,
    };
    records.push({ step: label, b, a: own });
    expected.push({
      step: label,
      // A prune retires A's two tips and keeps B's; nothing else retires any.
      b: { held: pruned ? 1 : 3, fullCensuses: 0, authorityProofs: 0 },
      // After a prune each of A's streams is verified once, completely.
      a: {
        fullCensuses: pruned ? 2 : 0,
        verifiedRows: pruned ? a.retained.A1.length + a.retained.A2.length : 'suffix',
        held: 3,
      },
    });
  };
  const records = [],
    expected = [];
  await step('publish', async () => assert.equal((await A1.run('create')).pending, 'waiting'));
  // The producer's own reconciliation after the other device verified is a read.
  const admit = (sequence) => async () => {
    assert.equal((await A2.run('verify')).sequence, sequence);
    assert.equal((await A1.run('resume')).pending, 'none');
  };
  await step('admit', admit(1));
  await a.upload(SECOND);
  await step('second publish', async () =>
    assert.equal((await A1.run('create')).pending, 'waiting'),
  );
  await step('second admit', admit(2));
  await a.upload({ A1: 8 });
  await step('third publish', async () =>
    assert.equal((await A1.run('create')).pending, 'waiting'),
  );
  await step('discard', async () => assert.equal((await A1.run('discard')).pending, 'none'));
  assert.equal(a.pruned(), 0);
  await step('prune', async () => assert.equal((await A1.run('prune')).pruned, true), {
    pruned: true,
  });
  assert.equal(a.pruned(), COVERED, 'the prune replaced the covered ciphertext');
  t.diagnostic(`B's submit and read after each step, ms: ${JSON.stringify(timings)}`);
  assert.deepEqual(records, expected);
  // A writes on from its re-established tips.
  const before = status();
  await a.submit('A1');
  await a.submit('A2');
  await a.read('A1');
  await a.read('A2');
  assert.equal(status().fullCensuses, before.fullCensuses);
});

test("a capture in flight across its own account's prune fails its guard and the read retries; another account's capture stays valid", async (t) => {
  const a = await accounts(t, { snapshots: true });
  const h = harness(t, a);
  const rested = await h.warm();
  const hold = held(h.issuers.history);
  const events = [];
  let pruneAttempts = 0;
  const prune = h.prune((point, operation) => {
    if (operation !== 'history-checkpoint') return;
    if (point === 'after-verify') pruneAttempts++;
    if (point === 'after-commit') events.push('prune-commit');
  }, hold.issuer);
  await hold.reached;
  assert.equal(h.db.isTransaction, false, 'the prune holds no transaction across its await');
  // Captures taken while the prune waits, exactly as reads and submissions take them.
  const covered = capture(h.db, a.x.workspace, a.id.A1, h.reuse, { after: 0, limit: 1 }),
    unprunedRow = capture(h.db, a.x.workspace, a.id.A1, h.reuse, {
      after: a.retained.A1.length - 1,
      limit: 1,
    }),
    other = capture(h.db, a.B.workspace, a.B.credential, h.reuse, {
      after: a.retained.B.length - 1,
      limit: 1,
    });
  // And one real read of A1's latest position, let into the prune's commit once it has captured.
  h.onCapture('A1', () => {
    events.push('read-capture');
    hold.release();
  });
  let guards = 0;
  const reading = h.read('A1', (point) => {
    if (point !== 'after-verify') return;
    guards++;
    events.push('read-guard');
  });
  const [pruned, { q, result }] = await Promise.all([prune, reading]);
  const censuses = h.status().fullCensuses - rested.fullCensuses;
  // The commit fence, as reads and submissions run it. A failed guard retires its key, so the
  // capture whose bytes changed is asked last.
  h.db.exec('BEGIN IMMEDIATE');
  let fence;
  try {
    fence = {
      other: unchanged(h.db, other, h.reuse),
      unprunedRow: unchanged(h.db, unprunedRow, h.reuse),
      covered: unchanged(h.db, covered, h.reuse),
    };
  } finally {
    h.db.exec('ROLLBACK');
  }
  assert.deepEqual(
    { pruned: pruned.ok, pruneAttempts, events, guards, censuses, fence, wipes: h.wipes },
    {
      pruned: true,
      pruneAttempts: 1,
      // The read captured, the prune committed, and the read's first guard failed and it retried.
      events: ['read-capture', 'prune-commit', 'read-guard', 'read-guard'],
      guards: 2,
      censuses: 1, // the retry re-verified A1, once
      fence: {
        other: true, // another account's capture stays valid
        unprunedRow: false, // this account's capture fails though its served row did not change
        covered: false, // and so does one whose served row the prune replaced
      },
      wipes: 0,
    },
  );
  assert.equal(a.pruned(), COVERED);
  a.verifyPage('A1', result, q);
});

test('another account writes and reads straight through a prune: no lock across its await, no retry and no census', async (t) => {
  const a = await accounts(t, { snapshots: true });
  const h = harness(t, a);
  const rested = await h.warm();
  const hold = held(h.issuers.history);
  const events = [];
  let pruneAttempts = 0;
  const prune = h.prune((point, operation) => {
    if (operation !== 'history-checkpoint') return;
    if (point === 'after-verify') pruneAttempts++;
    if (point === 'after-commit') events.push('prune-commit');
  }, hold.issuer);
  await hold.reached;
  assert.equal(h.db.isTransaction, false, 'the prune holds no transaction across its await');
  // B writes on the same single connection while A's prune waits, and is accepted.
  const written = await h.submit('B');
  assert.equal(written.kind, 'decision');
  h.onCapture('B', () => {
    events.push('read-capture');
    hold.release();
  });
  let guards = 0;
  const reading = h.read('B', (point) => {
    if (point !== 'after-verify') return;
    guards++;
    events.push('read-guard');
  });
  const [pruned, { q, result }] = await Promise.all([prune, reading]);
  const after = h.status();
  assert.deepEqual(
    {
      pruned: pruned.ok,
      pruneAttempts,
      events,
      guards,
      censuses: after.fullCensuses - rested.fullCensuses,
      held: after.publishers,
      wipes: h.wipes,
    },
    {
      pruned: true,
      pruneAttempts: 1, // B's write is outside the prune's fence: no retry
      events: ['read-capture', 'prune-commit', 'read-guard'],
      guards: 1, // B's read passed its guard on its first capture
      censuses: 0, // no account re-verified its history
      held: 1, // B's tip; A's two were retired
      wipes: 0,
    },
  );
  assert.equal(a.pruned(), COVERED);
  a.verifyPage('B', result, q);
});

test('a submission that meets a cleared authority proof retries and is accepted, without wiping again', async (t) => {
  const a = await accounts(t);
  const h = harness(t, a);
  await h.warm();
  let armed = true,
    hookCalls = 0;
  const issuer = {
    ...h.issuers.submit,
    check: (...args) => {
      // Another request's clear lands while this submission is reusing its authority proof.
      if (armed) {
        armed = false;
        h.reuse.clear();
      }
      return h.issuers.submit.check(...args);
    },
  };
  const before = a.retained.B.length;
  const r = await h.submit(
    'B',
    (point) => {
      if (point === 'after-verify') hookCalls++;
    },
    issuer,
  );
  assert.equal(armed, false, 'the clear was injected');
  // Accepted on its retry, which alone reached the commit fence; only the injected clear ran.
  assert.deepEqual(
    { kind: r.kind, reason: r.reason, fences: hookCalls, wipes: h.wipes },
    { kind: 'decision', reason: undefined, fences: 1, wipes: 1 },
  );
  assert.equal(a.retained.B.length, before + 1);
  await h.readChecked('B');
});

test('a prune leaves quarantine as it was, even after the damaged bytes are restored', async (t) => {
  const a = await accounts(t, { snapshots: true });
  const h = harness(t, a);
  await h.warm();
  // Damage one row of A2's stream on the same connection; the next read that serves it refuses.
  const row = h.db
    .prepare('SELECT submission FROM publisher_decisions WHERE credential_id=? AND position=3')
    .get(a.id.A2).submission;
  h.db
    .prepare('UPDATE publisher_decisions SET submission=? WHERE credential_id=? AND position=3')
    .run(new Uint8Array([0]), a.id.A2);
  const damaged = await h.read('A2', () => {}, 2);
  assert.deepEqual(damaged.result, { kind: 'unknown', reason: 'ledger-integrity' });
  assert.equal(h.status().quarantined, 1);
  h.db
    .prepare('UPDATE publisher_decisions SET submission=? WHERE credential_id=? AND position=3')
    .run(row, a.id.A2);
  // That refusal wiped every tip on its own error path (unchanged here, SVC-ERROR-CLEARS).
  await h.readChecked('B');
  const before = h.status(),
    wipes = h.wipes;
  const refused = await h.prune();
  const wiped = h.wipes - wipes,
    quarantined = h.status().quarantined;
  await h.readChecked('B');
  const censuses = h.status().fullCensuses - before.fullCensuses;
  // The restored bytes would verify now; the quarantine still refuses them until a restart.
  const reread = (await h.read('A2')).result;
  assert.deepEqual(
    { refused, wiped, pruned: a.pruned(), quarantined, censuses, reread },
    {
      refused: { ok: false, refusal: 'ledger-integrity' },
      wiped: 0,
      pruned: 0,
      quarantined: 1, // the prune did not lift the quarantine
      censuses: 0, // B kept its verified tip
      reread: { kind: 'unknown', reason: 'ledger-integrity' },
    },
  );
});

test("a prune that commits and then fails to answer still retires its account's tips, and only those", async (t) => {
  const a = await accounts(t, { snapshots: true });
  const h = harness(t, a);
  const rested = await h.warm();
  let armed = true;
  const failed = await h.prune((point, operation) => {
    if (armed && operation === 'history-checkpoint' && point === 'after-commit') {
      armed = false;
      throw Error('reply lost after commit');
    }
  });
  const committed = a.pruned(),
    held = h.status().publishers;
  await h.readChecked('B');
  const bCensuses = h.status().fullCensuses - rested.fullCensuses;
  await h.readChecked('A1');
  await h.readChecked('A2');
  const aCensuses = h.status().fullCensuses - rested.fullCensuses - bCensuses;
  // Resending the prune finds nothing more to replace and still leaves B alone.
  const resent = (await h.prune()).ok;
  await h.readChecked('B');
  const bAfterResend = h.status().fullCensuses - rested.fullCensuses - bCensuses - aCensuses;
  assert.deepEqual(
    { failed, committed, held, bCensuses, aCensuses, resent, bAfterResend, wipes: h.wipes },
    {
      failed: { ok: false, refusal: 'unavailable' },
      committed: COVERED, // the prune committed
      held: 1, // only B's tip remains
      bCensuses: 0,
      aCensuses: 2, // A's streams re-verified, once each
      resent: true,
      bAfterResend: 0,
      wipes: 0,
    },
  );
  assert.equal(a.pruned(), COVERED);
});
