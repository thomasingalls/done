import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeliveryVerification } from '../../account-service/deliveryVerification.ts';
import { ready, mutate, inventory } from '../account-service-delivery/fixtures.mjs';
import { query, read } from '../account-service-inbound/oracle.mjs';
import { report } from './fixtures.mjs';

// 64 KiB and 1 MiB; literal byte counts keep registration statically enumerable.
for (const checkpointBytes of [65536, 1048576])
  test(`service cache retains reuse with ${checkpointBytes}-byte checkpoint and 35 larger rows`, async (t) => {
    const x = await ready(t, { checkpointBytes });
    for (let i = 1; i <= 35; i++)
      assert.equal((await x.call(x.make(i, String(i).padEnd(4096, 'x')))).kind, 'decision');
    const q = query(x),
      expected = await read(x, q);
    const original = crypto.subtle.verify.bind(crypto.subtle);
    let calls = 0;
    crypto.subtle.verify = async (...args) => {
      calls++;
      return original(...args);
    };
    t.after(() => {
      crypto.subtle.verify = original;
    });
    assert.deepEqual(await read(x, q), expected);
    const warmVerifies = calls;
    x.f.restart();
    calls = 0;
    assert.deepEqual(await read(x, q), expected);
    const coldVerifies = calls;
    report('service-context-' + checkpointBytes, {
      checkpointBytes,
      rows: 35,
      rowBodyBytes: 4096,
      warmVerifies,
      coldVerifies,
      sameColdResult: true,
    });
    assert.equal(
      coldVerifies - warmVerifies,
      35 * 3,
      'Warm requests must reuse all row signatures even with a large checkpoint',
    );
    const p = x.f.rows('promotions')[0];
    mutate(x, (db) => db.prepare('UPDATE promotions SET request_digest=?').run('ff'.repeat(32)));
    assert.equal((await read(x, q)).kind, 'unknown');
    mutate(x, (db) => db.prepare('UPDATE promotions SET request_digest=?').run(p.request_digest));
    assert.deepEqual(await read(x, q), expected);
    const changed = JSON.parse(p.request);
    changed.candidate.checkpoint.ct = 'ff' + changed.candidate.checkpoint.ct.slice(2);
    mutate(x, (db) => db.prepare('UPDATE promotions SET request=?').run(JSON.stringify(changed)));
    assert.equal((await read(x, q)).kind, 'unknown');
    mutate(x, (db) => db.prepare('UPDATE promotions SET request=?').run(p.request));
    assert.deepEqual(await read(x, q), expected);
    report('service-context-' + checkpointBytes, {
      status: 'passed',
      checkpointBytes,
      rows: 35,
      rowBodyBytes: 4096,
      warmVerifies,
      coldVerifies,
      sameColdResult: true,
      changedDigestRefused: true,
      changedRequestRefused: true,
    });
  });

test('bounded service cache owns bytes/context, evicts, and cannot repopulate after close', async () => {
  const cache = createDeliveryVerification();
  let calls = 0;
  const bytes = new Uint8Array([1, 2]);
  const check = async () => {
    calls++;
    return bytes.slice();
  };
  const get = (slot = 'a', context = 'scope') => cache.check(slot, context, [bytes], check);
  (await get()).fill(0);
  assert.deepEqual(await get(), bytes);
  assert.equal(calls, 1);
  bytes[0] = 3;
  await get();
  assert.equal(calls, 2);
  await get('a', 'changed predecessor');
  assert.equal(calls, 3);
  for (let i = 0; i < 513; i++) await get(String(i));
  const before = calls;
  await get('0');
  assert.equal(calls, before + 1);
  const large = new Uint8Array(17 * 1024 * 1024);
  let largeCalls = 0;
  for (let i = 0; i < 2; i++) await cache.check('oversize', '', [large], async () => ++largeCalls);
  assert.equal(largeCalls, 2);
  let release;
  const pending = cache.check('pending', '', [bytes], async () => {
    await new Promise((r) => {
      release = r;
    });
    return bytes.slice();
  });
  cache.clear();
  release();
  await pending;
  const at = calls;
  await get('pending', '');
  assert.equal(calls, at + 1);
  cache.clear();
});

test('warm service read matches cold verification, reduces crypto, and rechecks SQL fields and membership', async (t) => {
  const x = await ready(t);
  for (let i = 1; i <= 4; i++)
    assert.equal((await x.call(x.make(i, 'service-cache-' + i))).kind, 'decision');
  const q = query(x),
    expected = await read(x, q);
  const original = crypto.subtle.verify.bind(crypto.subtle);
  let calls = 0;
  crypto.subtle.verify = async (...args) => {
    calls++;
    return original(...args);
  };
  t.after(() => {
    crypto.subtle.verify = original;
  });
  const before = inventory(x);
  assert.deepEqual(await read(x, q), expected);
  const warmVerifies = calls;
  x.f.restart();
  calls = 0;
  assert.deepEqual(await read(x, q), expected);
  const coldVerifies = calls;
  assert(coldVerifies > warmVerifies + 8);
  assert.equal(inventory(x), before);
  const first = x.f.rows('delivery_decisions')[0];
  mutate(x, (db) =>
    db.prepare('UPDATE delivery_decisions SET digest=? WHERE ordinal=1').run('ff'.repeat(32)),
  );
  assert.equal((await read(x, q)).kind, 'unknown');
  mutate(x, (db) =>
    db.prepare('UPDATE delivery_decisions SET digest=? WHERE ordinal=1').run(first.digest),
  );
  assert.equal(
    (await read(x, q)).reason,
    'ledger-integrity',
    'quarantine survives byte restoration',
  );
  x.f.restart(); // Operator restoration is checked by a new full census.
  assert.deepEqual(await read(x, q), expected);
  mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
  assert.equal((await read(x, q)).kind, 'unknown');
  mutate(x, (db) => db.exec("UPDATE accounts SET state='active'"));
  assert.deepEqual(await read(x, q), expected);
  mutate(x, (db) => db.exec("UPDATE delivery_decisions SET response=X'00' WHERE ordinal=1"));
  assert.equal((await read(x, q)).kind, 'unknown');
  report('service-cache', {
    status: 'passed',
    warmVerifies,
    coldVerifies,
    sameColdResult: true,
    changedSqlColumnsRefused: true,
    changedMembershipRefused: true,
    changedResponseRefused: true,
  });
});
