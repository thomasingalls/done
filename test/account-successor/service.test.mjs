import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, decision, page, query, read, state, mutate, ZERO } from './service-fixtures.mjs';
import { verifySuccessor } from '../../account-protocol/successor.ts';
import { AccountCore } from '../../account-service/core.ts';

test('live preparation is consumed once; old queued bytes, lost decisions and current writes survive restart', async (t) => {
  const x = await ready(t),
    p = await x.prepare(),
    old = x.make(1, 'before'),
    oldReply = await x.call(old);
  let previous = decision(x, oldReply, old).head.link;
  const queued = x.make(2, 'sealed before admission'),
    queuedBytes = queued.bytes.slice();
  const s = await x.admit(p.input);
  assert.equal(s.kind, 'device-admission-successor', JSON.stringify(s));
  await verifySuccessor(
    s,
    { pin: x.authority.pin, request: x.request, receipt: x.receipt },
    { epoch: 1, head: x.offer.head },
  );
  assert.deepEqual(
    s.epoch.heads.find((h) => h.credentialId === x.credential),
    { credentialId: x.credential, position: 1, link: previous },
  );
  const before = state(x);
  assert.deepEqual(await x.admit(p.input), s);
  assert.equal(state(x), before);
  for (const [op, input] of [
    ['resume', { retryKey: p.input.retryKey }],
    ['cancel', { retryKey: p.input.retryKey }],
    ['finish', p.proof],
    ['begin', p.entry.input],
  ])
    assert.equal((await x.enroll(op, input)).stage, 'admitted');
  assert.deepEqual(await x.call(old), oldReply, 'exact lost old reply remains recoverable');
  const queuedReply = await x.call(queued);
  previous = decision(x, queuedReply, queued, previous, 2).head.link;
  assert.deepEqual(queued.bytes, queuedBytes);
  // Still-stale clients may seal after the transition too; signing time is not authority.
  const stale = x.make(3, 'stale after admission'),
    staleReply = await x.call(stale);
  previous = decision(x, staleReply, stale, previous, 2).head.link;
  const current = x.make(4, 'new epoch', { epoch: 2 }),
    currentReply = await x.call(current);
  decision(x, currentReply, current, previous, 2);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.admit(p.input), s);
  const q = query(x, 0, 8, { head: s.head, epoch: 2 });
  page(x, await read(x, q), q, [
    { w: old, r: oldReply, epoch: 1 },
    { w: queued, r: queuedReply, epoch: 2 },
    { w: stale, r: staleReply, epoch: 2 },
    { w: current, r: currentReply, epoch: 2 },
  ]);
  assert.equal(
    (await read(x, query(x))).kind,
    'unknown',
    'old current-read context must be adopted',
  );
  const candidate = p.entry.input.candidate;
  assert.equal(
    (
      await read(
        x,
        query(x, 0, 1, { head: s.head, epoch: 2, reader: candidate.credentialId }, p.entry.key),
      )
    ).kind,
    'unknown',
  );
  assert.equal(
    (
      await x.call(
        x.make(1, 'candidate', {
          epoch: 2,
          credential: candidate.credentialId,
          signer: p.entry.key,
        }),
      )
    ).kind,
    'unknown',
  );
});

test('a permanent refusal and its exact parent-epoch successor cross admission without resurrection', async (t) => {
  const x = await ready(t),
    p = await x.prepare(),
    wrong = x.make(1, 'wrong generation', { gen: 2 }),
    refusal = await x.call(wrong);
  const r = decision(x, refusal, wrong).refusal,
    replacement = x.make(1, 'replacement', { parent: r });
  const s = await x.admit(p.input);
  assert.equal(s.kind, 'device-admission-successor');
  assert.deepEqual(await x.call(wrong), refusal);
  decision(x, await x.call(replacement), replacement, ZERO, 2);
  assert.deepEqual(await x.call(wrong), refusal);
  x.f.restart();
  assert.deepEqual(await x.call(wrong), refusal);
});

test('empty successor vector covers both credentials and changed request IDs never consume', async (t) => {
  const x = await ready(t),
    p = await x.prepare();
  for (const change of [
    { receiptId: p.input.attemptId },
    { attemptId: p.input.receiptId },
    { retryKey: p.input.receiptId },
  ]) {
    const before = state(x);
    assert.equal((await x.admit({ ...p.input, ...change })).ok, false);
    assert.equal(state(x), before);
  }
  const s = await x.admit(p.input);
  assert.equal(s.kind, 'device-admission-successor');
  assert(s.epoch.heads.every((h) => h.position === 0 && h.link === ZERO));
  assert.equal(s.epoch.heads.length, 2);
  const w = x.make();
  decision(x, await x.call(w), w, ZERO, 2);
});

for (const reason of [
  'cancelled',
  'expired',
  'authority',
  'custody',
  'late-custody',
  'late-expiry',
  'before-commit',
  'after-commit',
])
  test(`admission final boundary: ${reason}`, async (t) => {
    let action,
      now = 1000;
    const x = await ready(t, {
        now: () => now,
        hook(point, op) {
          if (action && op === 'admit-prepared') action(point);
        },
      }),
      p = await x.prepare();
    const before = state(x);
    action = (point) => {
      if (reason === 'before-commit' && point === 'before-commit') throw Error('injected');
      if (reason === 'after-commit' && point === 'after-commit') throw Error('lost reply');
      if (reason === 'late-custody' && point === 'before-commit') x.authority.owner.close();
      if (reason === 'late-expiry' && point === 'before-commit') now += 600001;
      if (point !== 'after-verify') return;
      if (reason === 'cancelled')
        mutate(x, (db) => db.exec("UPDATE enrollment_preparations SET stage='cancelled'"));
      if (reason === 'expired') now += 600001;
      if (reason === 'authority') mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
      if (reason === 'custody') x.authority.owner.close();
    };
    const r = await x.admit(p.input);
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(x.f.rows('workspace_successors').length, reason === 'after-commit' ? 1 : 0);
    if (['before-commit', 'custody', 'expired', 'late-custody', 'late-expiry'].includes(reason))
      assert.equal(state(x), before);
    action = null;
    if (reason === 'after-commit')
      assert.equal((await x.admit(p.input)).kind, 'device-admission-successor');
  });

test('competing prepared candidates serialize; losing reservation cannot silently rebase', async (t) => {
  const x = await ready(t),
    a = await x.prepare(),
    b = await x.prepare();
  const results = await Promise.all([x.admit(a.input), x.admit(b.input)]);
  assert.equal(
    results.filter((r) => r.kind === 'device-admission-successor').length,
    1,
    JSON.stringify(results),
  );
  assert.equal(results.find((r) => r.ok === false).refusal, 'stale');
  assert.equal(x.f.rows('workspace_successors').length, 1);
});

for (const damage of [
  'missing-pointer',
  'missing-successor',
  'boundary',
  'prefix',
  'current-witness',
  'artifact',
])
  test(`retained ${damage} damage cannot fall back to genesis or return a partial ledger`, async (t) => {
    const x = await ready(t),
      p = await x.prepare(),
      w = x.make();
    await x.call(w);
    const s = await x.admit(p.input);
    assert.equal(s.kind, 'device-admission-successor');
    mutate(x, (db) => {
      if (damage === 'missing-pointer') db.exec('UPDATE promotions SET successor_head=NULL');
      if (damage === 'missing-successor') db.exec('DELETE FROM workspace_successors');
      if (damage === 'boundary') db.exec('UPDATE workspace_successors SET boundary_witness=NULL');
      if (damage === 'prefix') db.exec('DELETE FROM delivery_decisions');
      if (damage === 'current-witness') db.exec('UPDATE promotions SET delivery_witness=NULL');
      if (damage === 'artifact') db.exec("UPDATE workspace_successors SET artifact='{}'");
    });
    const before = state(x);
    assert.equal((await x.call(w)).kind, 'unknown');
    assert.equal((await x.admit(p.input)).ok, false);
    assert.equal((await read(x, query(x, 0, 1, { head: s.head, epoch: 2 }))).kind, 'unknown');
    assert.equal(state(x), before);
  });

test('explicit schema-six upgrade preserves an already prepared operation and existing history', async (t) => {
  const x = await ready(t),
    p = await x.prepare(),
    w = x.make(),
    r = await x.call(w);
  mutate(x, (db) =>
    db.exec(
      'DROP TABLE content_transfers; DROP TABLE content_ceremonies; DROP TABLE workspace_successors; ALTER TABLE promotions DROP COLUMN successor_head; PRAGMA user_version=6;',
    ),
  );
  const policy = { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId };
  assert.throws(() => new AccountCore(x.f.path, policy), /Unsupported account schema/);
  const upgraded = new AccountCore(x.f.path, policy, { upgradeFromV6: true });
  upgraded.close();
  x.f.restart();
  assert.equal((await x.enroll('resume', { retryKey: p.input.retryKey })).stage, 'prepared');
  assert.deepEqual(await x.call(w), r);
  assert.equal((await x.admit(p.input)).kind, 'device-admission-successor');
});
