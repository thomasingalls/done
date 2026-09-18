import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { AccountCore } from '../../account-service/core.ts';
import { ready, proof, inventory, mutate, link, ZERO } from './fixtures.mjs';
const checked = (x, r, w, previous = ZERO) =>
  proof(r, x.offer.epoch.acceptancePublicKey, w.subject, previous, w.parent);
test('exact persisted decisions extend a contiguous chain and survive restart without replacing ciphertext', async (t) => {
  const x = await ready(t),
    a = x.make(),
    b = x.make(2, 'second');
  assert.equal((await x.call(b)).reason, 'out-of-order');
  assert.equal(x.f.rows('delivery_decisions').length, 0);
  const r = await x.call(a);
  assert.equal(checked(x, r, a).kind, 'accepted');
  const before = inventory(x);
  assert.deepEqual(await x.call(a), r);
  assert.equal(inventory(x), before);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.call(a), r);
  const next = await x.call(b);
  assert.equal(checked(x, next, b, link(a.subject, ZERO)).kind, 'accepted');
  assert.equal(x.f.rows('delivery_decisions').length, 2);
  assert.deepEqual(new Uint8Array(x.f.rows('delivery_decisions')[0].submission), a.bytes);
});
test('permanent closure cannot reopen; only an owned issued parent permits a different attempt at that position', async (t) => {
  const x = await ready(t),
    bad = x.make(1, 'bad', { gen: 2 }),
    r = await x.call(bad),
    p = checked(x, r, bad);
  assert.equal(p.kind, 'refused');
  assert.equal(p.refusal.reason, 'epoch-generation-mismatch');
  const restamped = x.make(1, 'same digest', { ct: bad.ct });
  assert.deepEqual(await x.call(restamped), r);
  assert.equal((await x.call(x.make(1, 'no parent'))).reason, 'parent-required');
  const secondBad = x.make(1, 'second bad', { gen: 3, parent: p.refusal }),
    second = await x.call(secondBad),
    p2 = checked(x, second, secondBad);
  assert.equal(p2.kind, 'refused');
  const successor = x.make(1, 'successor', { parent: p.refusal }),
    accepted = await x.call(successor);
  assert.equal(checked(x, accepted, successor).kind, 'accepted');
  assert.deepEqual(await x.call(bad), r);
  assert.deepEqual(await x.call(secondBad), second);
  assert.deepEqual(await x.call(x.make(1, 'competing valid', { parent: p2.refusal })), accepted);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.call(bad), r);
  assert.deepEqual(await x.call(successor), accepted);
  assert.equal(x.f.rows('delivery_decisions').length, 3);
});
test('invalid, foreign, future and unordered submissions never create a permanent refusal', async (t) => {
  const x = await ready(t),
    foreign = generateKeyPairSync('ed25519'),
    before = inventory(x);
  for (const w of [
    x.make(1, 'foreign', { signer: foreign.privateKey }),
    x.make(1, 'foreign credential', { credential: 'cc'.repeat(16) }),
    x.make(1, 'foreign workspace', { workspace: 'dd'.repeat(16) }),
    x.make(1, 'foreign lineage', { lineage: 'dd'.repeat(32) }),
    x.make(1, 'future', { epoch: 2 }),
    x.make(2, 'gap', { gen: 2 }),
    { bytes: new Uint8Array([255]) },
  ])
    assert.equal((await x.call(w)).kind, 'unknown');
  assert.equal(inventory(x), before);
  const a = x.make();
  assert.equal(checked(x, await x.call(a), a).kind, 'accepted');
});
test('caller bytes are captured before asynchronous verification', async (t) => {
  const x = await ready(t),
    w = x.make(),
    original = w.bytes.slice(),
    running = x.call(w);
  w.bytes.fill(0);
  const r = await running;
  assert.equal(checked(x, r, { ...w, bytes: original }).kind, 'accepted');
  assert.deepEqual(new Uint8Array(x.f.rows('delivery_decisions')[0].submission), original);
});
for (const side of ['before-commit', 'after-commit'])
  for (const gen of [1, 2])
    test(`${side} generation ${gen} decision fault resolves from durable readback`, async (t) => {
      let armed = false;
      const x = await ready(t, {
          hook(p, op) {
            if (armed && op === 'decide-submission' && p === side) {
              armed = false;
              throw Error('fault');
            }
          },
        }),
        w = x.make(1, 'fault', { gen });
      armed = true;
      assert.equal((await x.call(w)).kind, 'unknown');
      const n = x.f.rows('delivery_decisions').length;
      assert.equal(n, side === 'before-commit' ? 0 : 1);
      const before = inventory(x);
      x.f.restart();
      x.authority.restart();
      const r = await x.call(w);
      assert.equal(checked(x, r, w).kind, gen === 1 ? 'accepted' : 'refused');
      if (side === 'after-commit') assert.equal(inventory(x), before);
      assert.deepEqual(await x.call(w), r);
    });
for (const fault of [
  'missing-tail',
  'missing-all',
  'witness',
  'submission',
  'response',
  'seal',
  'membership',
])
  test(`${fault} damage refuses without signing or repairing the ledger`, async (t) => {
    const x = await ready(t),
      a = x.make(),
      b = x.make(2, 'second');
    await x.call(a);
    await x.call(b);
    mutate(x, (db) => {
      if (fault === 'missing-tail') db.exec('DELETE FROM delivery_decisions WHERE ordinal=2');
      if (fault === 'missing-all') db.exec('DELETE FROM delivery_decisions');
      if (fault === 'witness') db.exec('UPDATE promotions SET delivery_witness=NULL');
      if (fault === 'submission' || fault === 'response')
        db.exec(`UPDATE delivery_decisions SET ${fault}=X'00' WHERE ordinal=2`);
      if (fault === 'seal') db.exec("UPDATE promotions SET acceptance_seal='{}'");
      if (fault === 'membership') db.exec("UPDATE accounts SET state='pending'");
    });
    const before = inventory(x);
    assert.equal((await x.call(a)).kind, 'unknown');
    assert.equal(inventory(x), before);
  });
test('membership changes during verification prevent commit', async (t) => {
  let x,
    armed = false;
  x = await ready(t, {
    hook(p, op) {
      if (armed && p === 'after-verify' && op === 'decide-submission') {
        armed = false;
        mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
      }
    },
  });
  armed = true;
  assert.equal((await x.call(x.make())).kind, 'unknown');
  assert.equal(x.f.rows('delivery_decisions').length, 0);
});
test('schema 3 upgrade preserves historical rows but cannot invent fresh activation authority', async (t) => {
  const x = await ready(t),
    before = x.f
      .rows('promotions')
      .map(({ delivery_witness: _witness, activation: _activation, ...r }) => r);
  mutate(x, (db) =>
    db.exec(
      'DROP TABLE content_transfers; DROP TABLE content_ceremonies; DROP TABLE enrollment_preparations; DROP TABLE workspace_successors; ALTER TABLE promotions DROP COLUMN successor_head; DROP TABLE delivery_decisions; ALTER TABLE promotions DROP COLUMN delivery_witness; ALTER TABLE promotions DROP COLUMN activation; PRAGMA user_version=3;',
    ),
  );
  assert.throws(
    () => new AccountCore(x.f.path, { rpId: 'localhost', origin: 'http://localhost:4999' }),
    /offline upgrade/,
  );
  const upgraded = new AccountCore(
    x.f.path,
    { rpId: 'localhost', origin: 'http://localhost:4999' },
    { upgradeFromV3: true },
  );
  upgraded.close();
  x.f.restart();
  assert.deepEqual(
    x.f
      .rows('promotions')
      .map(({ delivery_witness: _witness, activation: _activation, ...r }) => r),
    before,
  );
  assert.equal(x.f.rows('promotions')[0].activation, null);
  assert.equal((await x.call(x.make())).kind, 'unknown');
});
test('a valid acceptance-key signature is insufficient without the service-issued closure record', async (t) => {
  const x = await ready(t);
  const { fixtureAcceptance, refusal } = await import('../account-decisions/oracle.mjs');
  const signer = fixtureAcceptance(
      { dbPath: x.f.path, pin: x.authority.pin, testOperatorKey: x.authority.key },
      x.workspace,
    ),
    absent = x.make(1, 'never submitted', { gen: 2 }),
    parent = refusal(absent.subject, signer),
    w = x.make(1, 'unissued parent', { parent });
  const before = inventory(x);
  assert.equal((await x.call(w)).reason, 'unissued-parent');
  assert.equal(inventory(x), before);
});
test('closing authority during verification prevents any decision or witness from escaping', async (t) => {
  let armed = false,
    x;
  x = await ready(t, {
    hook(point, op) {
      if (armed && point === 'after-verify' && op === 'decide-submission') {
        armed = false;
        x.authority.owner.close();
      }
    },
  });
  armed = true;
  assert.equal((await x.call(x.make())).kind, 'unknown');
  assert.equal(x.f.rows('delivery_decisions').length, 0);
});

test('R-01 independent sender cannot allocate an oversized decision, including refusal successors', async (t) => {
  const { decodeSubmission } = await import('../../account-protocol/submission.ts');
  const x = await ready(t);
  const wireAt = (size, options = {}) => {
    const overhead =
      decodeSubmission(x.make(1, 'size', { ct: Buffer.alloc(16), ...options }).bytes).envelope
        .length - 16;
    const w = x.make(1, 'size', { ...options, ct: Buffer.alloc(size - overhead, 91) });
    assert.equal(decodeSubmission(w.bytes).envelope.length, size);
    return w;
  };
  for (const gen of [1, 2]) {
    const before = inventory(x);
    assert.deepEqual(await x.call(wireAt(524289, { gen })), {
      kind: 'unknown',
      reason: 'envelope-size',
    });
    assert.equal(inventory(x), before, 'no accepted/refused decision or witness mutation');
  }
  const stale = x.make(1, 'old generation', { gen: 2 });
  const refusal = checked(x, await x.call(stale), stale).refusal;
  const before = inventory(x);
  assert.deepEqual(await x.call(wireAt(524289, { parent: refusal })), {
    kind: 'unknown',
    reason: 'envelope-size',
  });
  assert.equal(inventory(x), before);
  const exact = wireAt(524288, { parent: refusal });
  const accepted = await x.call(exact);
  assert.equal(checked(x, accepted, exact).kind, 'accepted');
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.call(exact), accepted);
});
