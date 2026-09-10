import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { ready, mutate, inventory } from '../account-service-delivery/fixtures.mjs';
import { query, pageProof } from './oracle.mjs';
import {
  decodeSubmit,
  decodeReadRequest,
  decodeReadPage,
  SUBMIT_BODY_LIMIT,
  READ_REQUEST_LIMIT,
  READ_PAGE_LIMIT,
} from '../../account-protocol/deliveryTransport.ts';
const read = (x, q) => x.authority.owner.readAccepted(x.f.core, q);
test('authenticated empty, count-bounded pages, exact ciphertext/proof, and cursor end across restart', async (t) => {
  const x = await ready(t),
    retained = [];
  let q = query(x);
  pageProof(await read(x, q), q, x, retained);
  for (let i = 1; i <= 5; i++) {
    const w = x.make(i, 'entry-' + i),
      r = await x.call(w);
    retained.push({ w, r });
  }
  const before = inventory(x);
  for (let after = 0; after <= 5; after += after < 4 ? 2 : 1) {
    q = query(x, after, 2);
    const p = pageProof(await read(x, q), q, x, retained);
    assert.equal(p.count, Math.min(2, 5 - after));
    x.f.restart();
    x.authority.restart();
  }
  assert.equal(inventory(x), before);
});
test(
  'byte-bounded page makes progress with maximum-size envelopes',
  { timeout: 40000 },
  async (t) => {
    const x = await ready(t),
      retained = [];
    for (let i = 1; i <= 2; i++) {
      const w = x.make(i, 'large', { ct: Buffer.alloc(4 * 1024 * 1024 + 16, i) }),
        r = await x.call(w);
      retained.push({ w, r });
    }
    for (const after of [0, 1]) {
      const q = query(x, after),
        r = await read(x, q);
      assert.ok(r.bytes.length <= READ_PAGE_LIMIT);
      assert.equal(pageProof(r, q, x, retained).count, 1);
    }
  },
);
test('foreign signer, all foreign scope fields, expired/future requests, malformed framing and past-end cursors refuse without mutations', async (t) => {
  const x = await ready(t),
    before = inventory(x),
    foreign = generateKeyPairSync('ed25519').privateKey;
  const cases = [
    query(x, 0, 8, {}, foreign),
    ...[
      { serviceId: 'ff'.repeat(16) },
      { origin: 'https://elsewhere.test' },
      { workspace: 'ff'.repeat(16) },
      { credential: 'ff'.repeat(16) },
      { lineage: 'ff'.repeat(32) },
      { head: 'ff'.repeat(32) },
      { epoch: 2 },
      { expires: Date.now() - 1 },
      { expires: Date.now() + 120000 },
      { after: 1 },
      { limit: 0 },
      { limit: 9 },
    ].map((c) => query(x, 0, 8, c)),
    new Uint8Array([0]),
    new Uint8Array(READ_REQUEST_LIMIT + 1),
  ];
  for (const q of cases) assert.equal((await read(x, q)).kind, 'unknown');
  const valid = query(x),
    changed = JSON.parse(Buffer.from(valid).toString());
  changed[9] = 1;
  assert.equal(
    (await read(x, new Uint8Array(Buffer.from(JSON.stringify(changed))))).kind,
    'unknown',
  );
  assert.equal(inventory(x), before);
});
test('signed read authorization is rechecked after verification and a retained witness refuses missing rows', async (t) => {
  let armed = false,
    x;
  x = await ready(t, {
    hook(point, op) {
      if (armed && point === 'after-verify' && op === 'read-accepted') {
        armed = false;
        mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
      }
    },
  });
  const w = x.make(),
    r = await x.call(w),
    q = query(x);
  pageProof(await read(x, q), q, x, [{ w, r }]);
  armed = true;
  assert.equal((await read(x, q)).kind, 'unknown');
  mutate(x, (db) => db.exec("UPDATE accounts SET state='active'; DELETE FROM delivery_decisions"));
  assert.equal((await read(x, q)).kind, 'unknown');
});
test('current membership is required on every replay, with no new durable nonce state', async (t) => {
  const x = await ready(t),
    q = query(x),
    before = inventory(x);
  assert.deepEqual(await read(x, q), await read(x, q));
  assert.equal(inventory(x), before);
  mutate(x, (db) => db.exec("UPDATE credentials SET state='staged'"));
  assert.equal((await read(x, q)).kind, 'unknown');
});
test('binary endpoint parsers reject oversize, noncanonical JSON, trailing bytes and unbounded hex', () => {
  for (const [decode, max] of [
    [decodeSubmit, SUBMIT_BODY_LIMIT],
    [decodeReadRequest, READ_REQUEST_LIMIT],
    [decodeReadPage, READ_PAGE_LIMIT],
  ]) {
    assert.throws(() => decode(new Uint8Array(max + 1)));
    assert.throws(() => decode(new TextEncoder().encode('[] ')));
    assert.throws(() => decode(new Uint8Array([255])));
  }
  assert.throws(() =>
    decodeSubmit(
      new TextEncoder().encode(
        JSON.stringify(['done/private-submit/v1', 1, 'aa'.repeat(16), 'FF']),
      ),
    ),
  );
});
