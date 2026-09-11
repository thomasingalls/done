import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ready, inventory, mutate } from '../account-service-delivery/fixtures.mjs';
import { query, read, pageProof, json } from './oracle.mjs';
import { query as oldQuery, pageProof as oldProof } from '../account-transport/oracle.mjs';
import { decodeInboundPage } from '../../account-protocol/inboundTransport.ts';
import { decodeReadPage, READ_PAGE_LIMIT } from '../../account-protocol/deliveryTransport.ts';
import { AcceptanceCustody } from '../../account-service/acceptance.ts';
import { parseAdmissionRequest } from '../../account-protocol/admission.ts';

test('v2 returns exact bounded witnessed originals across restart; v1 remains a separate purpose', async (t) => {
  const x = await ready(t),
    retained = [];
  assert.notEqual(x.f.rows('credentials')[0].id, x.credential, 'Passkey and workspace IDs differ');
  let q = query(x);
  pageProof(await read(x, q), q, x, []);
  for (let i = 1; i <= 5; i++) {
    const w = x.make(i, 'original-' + i),
      r = await x.call(w);
    retained.push({ w, r });
  }
  const before = inventory(x);
  for (let after = 0; after <= 5; after += after < 4 ? 2 : 1) {
    q = query(x, after, 2);
    const r = await read(x, q),
      p = pageProof(r, q, x, retained);
    assert.equal(p.count, Math.min(2, 5 - after));
    assert.throws(() => decodeReadPage(r.bytes));
    x.f.restart();
    x.authority.restart();
  }
  const old = oldQuery(x),
    prior = await x.authority.owner.readAccepted(x.f.core, old);
  oldProof(prior, old, x, retained);
  assert.throws(() => decodeInboundPage(prior.bytes));
  assert.equal((await read(x, old)).kind, 'unknown');
  assert.equal((await x.authority.owner.readAccepted(x.f.core, q)).kind, 'unknown');
  assert.equal(inventory(x), before);
});

test('each role, pin field, signature, expiry and extent is checked with no service writes', async (t) => {
  const x = await ready(t),
    before = inventory(x);
  const invalid = [
    query(x, 0, 1, {}, generateKeyPairSync('ed25519').privateKey),
    ...[
      { reader: 'aa'.repeat(16) },
      { publisher: 'aa'.repeat(16) },
      { reader: 'aa'.repeat(16), publisher: 'aa'.repeat(16) },
      { reader: x.account.key.id },
      { serviceId: 'aa'.repeat(16) },
      { origin: 'https://foreign.test' },
      { workspace: 'aa'.repeat(16) },
      { lineage: 'aa'.repeat(32) },
      { head: 'aa'.repeat(32) },
      { epoch: 2 },
      { expires: Date.now() - 1 },
      { expires: Date.now() + 120000 },
      { limit: 0 },
      { limit: 9 },
      { after: 1 },
      { after: -1 },
    ].map((v) => query(x, 0, 1, v)),
    new Uint8Array(4097),
    new Uint8Array([255]),
    json([]),
    new Uint8Array([...query(x), 32]),
  ];
  const good = query(x),
    changed = JSON.parse(Buffer.from(good).toString());
  changed[12] = 'ab'.repeat(32);
  invalid.push(json(changed));
  for (const q of invalid) assert.equal((await read(x, q)).kind, 'unknown');
  pageProof(await read(x, good), good, x, []);
  assert.equal(inventory(x), before);
});

test(
  'maximum wire sizes still produce byte-bounded pages without losing a position',
  { timeout: 40000 },
  async (t) => {
    const x = await ready(t),
      retained = [];
    for (let i = 1; i <= 2; i++) {
      const w = x.make(i, 'large', { ct: Buffer.alloc(4 * 1024 * 1024 + 16, i) });
      retained.push({ w, r: await x.call(w) });
    }
    for (const after of [0, 1]) {
      const q = query(x, after, 8),
        r = await read(x, q);
      assert.ok(r.bytes.length <= READ_PAGE_LIMIT);
      assert.equal(pageProof(r, q, x, retained).count, 1);
    }
  },
);

test('registration identity is checked in its own namespace; candidate/member mismatch and lost witness refuse', async (t) => {
  const x = await ready(t),
    w = x.make(),
    r = await x.call(w),
    q = query(x);
  pageProof(await read(x, q), q, x, [{ w, r }]);
  const id = x.f.rows('credentials')[0].id,
    request = x.f.rows('promotions')[0].request;
  mutate(x, (db) => db.prepare('UPDATE credentials SET id=?').run('replaced-passkey'));
  const before = inventory(x);
  assert.equal((await read(x, q)).kind, 'unknown');
  assert.equal((await x.call(w)).kind, 'unknown');
  assert.equal(inventory(x), before);
  mutate(x, (db) => db.prepare('UPDATE credentials SET id=?').run(id));
  const changed = JSON.parse(request);
  changed.certification.members[0].id = 'dd'.repeat(16);
  changed.certification.approver = changed.certification.members[0].id;
  assert.throws(() => parseAdmissionRequest(changed), /Candidate recipient changed/);
  mutate(x, (db) => db.prepare('UPDATE promotions SET request=?').run(JSON.stringify(changed)));
  assert.equal((await read(x, q)).kind, 'unknown');
  mutate(x, (db) => db.prepare('UPDATE promotions SET request=?').run(request));
  pageProof(await read(x, q), q, x, [{ w, r }]);
  mutate(x, (db) => db.exec('DELETE FROM delivery_decisions'));
  assert.equal((await read(x, q)).kind, 'unknown');
});

test('state change after verification refuses and four racing snapshots exhaust retries', async (t) => {
  let action,
    x,
    hits = 0;
  x = await ready(t, {
    hook(point, op) {
      if (point === 'after-verify' && op === 'read-inbound' && action) {
        hits++;
        action();
      }
    },
  });
  const q = query(x);
  action = () => mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
  assert.equal((await read(x, q)).kind, 'unknown');
  mutate(x, (db) => db.exec("UPDATE accounts SET state='active'"));
  action = () =>
    mutate(x, (db) => {
      const row = db.prepare('SELECT result FROM attempts WHERE mode=?').get('register');
      const value = JSON.parse(row.result);
      value.receiptId = 'changed-' + hits;
      db.prepare('UPDATE attempts SET result=? WHERE mode=?').run(
        JSON.stringify(value),
        'register',
      );
    });
  hits = 0;
  assert.deepEqual(await read(x, q), { kind: 'unknown', reason: 'state-changed' });
  assert.equal(hits, 4);
  action = null;
  pageProof(await read(x, q), q, x, []);
});

test('caller bytes are copied and a concurrent append forces fresh census after crypto', async (t) => {
  const x = await ready(t),
    q = query(x),
    saved = q.slice(),
    original = crypto.subtle.verify;
  let release, hit;
  const reached = new Promise((r) => {
    hit = r;
  });
  const gate = new Promise((r) => {
    release = r;
  });
  let armed = true;
  crypto.subtle.verify = async function (...args) {
    if (armed) {
      armed = false;
      hit();
      await gate;
    }
    return original.apply(this, args);
  };
  try {
    const pending = read(x, q);
    await reached;
    q.fill(0);
    const w = x.make(),
      r = await x.call(w);
    assert.equal(r.kind, 'decision', 'No read transaction held during async verification');
    release();
    pageProof(await pending, saved, x, [{ w, r }]);
  } finally {
    release();
    crypto.subtle.verify = original;
  }
});

test('expiry and custody loss on the far side of signing withhold every page byte', async (t) => {
  const x = await ready(t),
    original = AcceptanceCustody.prototype.inboundPage,
    now = Date.now;
  let clock = now();
  Date.now = () => clock;
  try {
    const q = query(x);
    AcceptanceCustody.prototype.inboundPage = function (...args) {
      const bytes = original.apply(this, args);
      clock += 60001;
      return bytes;
    };
    assert.equal((await read(x, q)).kind, 'unknown');
    AcceptanceCustody.prototype.inboundPage = function (...args) {
      const bytes = original.apply(this, args);
      this.close();
      return bytes;
    };
    assert.equal((await read(x, query(x))).kind, 'unknown');
    x.authority.restart();
    AcceptanceCustody.prototype.inboundPage = original;
    const good = query(x);
    pageProof(await read(x, good), good, x, []);
  } finally {
    Date.now = now;
    AcceptanceCustody.prototype.inboundPage = original;
  }
});

test(
  'another service process cannot change membership during synchronous page signing',
  { timeout: 15000 },
  async (t) => {
    const x = await ready(t),
      q = query(x),
      original = AcceptanceCustody.prototype.inboundPage;
    const attempt = () => {
      const child = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
      import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(process.argv[1]);
      try {
        db.exec("PRAGMA busy_timeout=20; UPDATE accounts SET state='pending'");
        console.log(JSON.stringify({changed:true}));
      } catch(e) { console.log(JSON.stringify({changed:false,error:e.message})); }
      finally { db.close(); }
    `,
          x.f.path,
        ],
        { encoding: 'utf8', timeout: 3000 },
      );
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout);
    };
    let observed;
    AcceptanceCustody.prototype.inboundPage = function (...args) {
      observed = attempt();
      return original.apply(this, args);
    };
    try {
      pageProof(await read(x, q), q, x, []);
    } finally {
      AcceptanceCustody.prototype.inboundPage = original;
    }
    assert.equal(observed.changed, false);
    assert.match(observed.error, /locked/);
    assert.equal(attempt().changed, true, 'Competing write works after read releases exclusion');
    assert.equal((await read(x, q)).kind, 'unknown');
  },
);
