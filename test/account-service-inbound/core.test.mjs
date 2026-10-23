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
  'historical maximum wire sizes retain bounded pagination, cold replay and exact retries',
  { timeout: 90000 },
  async (t) => {
    const x = await ready(t),
      retained = [];
    for (let i = 1; i <= 2; i++) {
      const w = x.make(i, 'large', { ct: Buffer.alloc(4 * 1024 * 1024 + 16, i) });
      retained.push({ w, r: await legacyDecision(t, x, w) });
    }
    x.f.restart();
    x.authority.restart();
    for (const { w, r } of retained) assert.deepEqual(await x.call(w), r);
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

// Seed with the actual signed pre-R-01 decision implementation, never a relaxed production flag.
// The synthetic authority supplies its issuer to a test-only facade. Current code owns all reads/retries.
async function legacyDecision(t, x, w) {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { resolve, join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { tmpdir } = await import('node:os');
  const { DatabaseSync } = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'done-r01-historical-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = execFileSync(
    'git',
    ['show', '4bb09042f37f68ec31f0d82587af608f599eb096:account-service/delivery.ts'],
    { encoding: 'utf8' },
  );
  const filename = join(dir, 'delivery.ts');
  writeFileSync(
    filename,
    source.replace(/from '([^']+)'/g, (match, specifier) =>
      specifier.startsWith('.')
        ? `from '${pathToFileURL(resolve('account-service', specifier)).href}'`
        : match,
    ),
  );
  const legacy = await import(pathToFileURL(filename).href);
  return x.authority.owner.decideSubmission(
    {
      async decideSubmission(input, issuer) {
        const db = new DatabaseSync(x.f.path);
        try {
          return await legacy.decideSubmission(db, input, issuer, () => {});
        } finally {
          db.close();
        }
      },
    },
    { workspaceId: x.workspace, bytes: w.bytes },
  );
}

test('R-01 content-blind admission still accepts a small nonconforming member: receiver refuses 256 and receives 255', async (t) => {
  const { build } = await import('vite');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { resolve, join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const temp = mkdtempSync(join(tmpdir(), 'done-r01-receiver-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('src/crdt/accountInbound.ts'), formats: ['es'] },
    },
  });
  const file = join(temp, 'inbound.mjs');
  writeFileSync(
    file,
    (Array.isArray(built) ? built[0] : built).output.find((c) => c.type === 'chunk').code,
  );
  const { verifyInboundPage, InboundError } = await import(pathToFileURL(file).href);
  for (const count of [255, 256]) {
    const x = await ready(t);
    const w = x.make(1, '', { updates: Array.from({ length: count }, () => Buffer.from([0, 0])) });
    assert.equal((await x.call(w)).kind, 'decision');
    const q = query(x),
      page = await read(x, q);
    assert.equal(page.kind, 'decision');
    assert.ok(decodeInboundPage(page.bytes).entries[0].envelope.length < 2048);
    const publicKey = x.s.publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('hex');
    const context = {
      baseline: { kind: 'promotion-genesis', id: '00'.repeat(32) },
      service: { id: x.authority.pin.serviceId, origin: x.authority.pin.origin },
      authority: {
        workspace: x.workspace,
        lineage: x.offer.epoch.lineageId,
        head: x.offer.head,
        tip: 1,
        acceptanceKey: x.offer.epoch.acceptancePublicKey,
      },
      creatingCredential: x.credential,
      reader: { id: x.credential, publicKey, active: true },
      publisher: {
        id: x.credential,
        publicKey,
        active: true,
        principal: x.request.candidate.principalId,
        system: true,
      },
      generation: 1,
      generationKey: x.generationKey,
      prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
    };
    const before = inventory(x);
    if (count === 256)
      await assert.rejects(
        verifyInboundPage(context, q, page.bytes, { assertCurrent() {} }),
        (e) => e instanceof InboundError && e.reason === 'size',
      );
    else {
      const result = await verifyInboundPage(context, q, page.bytes, { assertCurrent() {} });
      assert.equal(result.kind, 'received');
      assert.equal(result.updates.length, 255);
    }
    assert.equal(inventory(x), before);
    assert.equal(context.prefix.position, 0);
  }
});

// Late-capture cases use genuine same-connection commits and independent Node/OpenSSL page proofs.
async function lateLedgerFixture(t) {
  const { DatabaseSync } = await import('node:sqlite');
  const { createDeliveryVerification } =
    await import('../../account-service/deliveryVerification.ts');
  const { readInbound, decideSubmission } = await import('../../account-service/delivery.ts');
  const x = await ready(t),
    db = new DatabaseSync(x.f.path);
  const reuse = createDeliveryVerification({ db, path: x.f.path, signal: () => {} });
  t.after(() => {
    reuse.close();
    db.close();
  });
  const issuer = x.authority.owner.decideSubmission(
    { decideSubmission: (_input, issuer) => issuer },
    {},
  );
  const retained = [];
  const append = async () => {
    const w = x.make(retained.length + 1),
      r = await decideSubmission(
        db,
        { workspaceId: x.workspace, bytes: w.bytes },
        issuer,
        () => {},
        reuse,
      );
    const { proof, link, ZERO } = await import('../account-service-delivery/fixtures.mjs');
    let previous = ZERO;
    for (const item of retained) previous = link(item.w.subject, previous);
    assert.equal(
      proof(r, x.offer.epoch.acceptancePublicKey, w.subject, previous, w.parent).kind,
      'accepted',
    );
    retained.push({ w, r });
  };
  return {
    x,
    db,
    reuse,
    issuer,
    retained,
    append,
    run: (q, hook = () => {}, i = issuer) => readInbound(db, q, i, hook, reuse),
  };
}
function lateLedgerRequestCut(t, q, cut) {
  const unsigned = Buffer.from(JSON.stringify(JSON.parse(Buffer.from(q).toString()).slice(0, -1))),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let calls = 0;
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (Buffer.from(args[3]).equals(unsigned)) await cut(++calls);
    return verify(...args);
  });
  return () => calls;
}

test('v2 late-ledger accepts a genuine append on every request-verification cut in one attempt', async (t) => {
  const h = await lateLedgerFixture(t);
  await h.append();
  const q = query(h.x, 0, 8);
  pageProof(await h.run(q), q, h.x, h.retained);
  const calls = lateLedgerRequestCut(t, q, async () => {
    assert.equal(h.db.isTransaction, false, 'no native transaction spans async verification');
    await h.append();
  });
  pageProof(await h.run(q), q, h.x, h.retained);
  assert.equal(
    calls(),
    1,
    'ordinary appends during authority/request verification cannot spend ledger retries',
  );
  assert.equal(h.retained.length, 2);
});

test('v2 late-ledger does not capture publisher-prefix evidence before authenticating the request', async (t) => {
  const h = await lateLedgerFixture(t),
    capture = h.reuse.tips.capture.bind(h.reuse.tips),
    q = query(h.x);
  let captures = 0;
  t.mock.method(h.reuse.tips, 'capture', (...args) => {
    captures++;
    return capture(...args);
  });
  lateLedgerRequestCut(t, q, async () => assert.equal(captures, 0));
  pageProof(await h.run(q), q, h.x, []);
  assert.equal(captures, 1);
});

for (const fault of ['account', 'credential', 'recovery', 'promotion'])
  test(`v2 late-ledger withholds bytes when ${fault} authority changes during request verification`, async (t) => {
    const h = await lateLedgerFixture(t),
      q = query(h.x);
    const sql = {
      account: "UPDATE accounts SET state='pending'",
      credential: "UPDATE credentials SET state='revoked'",
      recovery: "UPDATE recovery SET draft='{}'",
      promotion: "UPDATE promotions SET offer='{}'",
    }[fault];
    lateLedgerRequestCut(t, q, async () => h.db.exec(sql));
    const answer = await h.run(q);
    assert.equal(answer.kind, 'unknown');
    assert.equal('bytes' in answer, false);
    assert.equal(h.db.isTransaction, false);
  });

test('v2 late-ledger compares future native header fields and retains the four-authority-change bound', async (t) => {
  const h = await lateLedgerFixture(t);
  h.db.exec("ALTER TABLE promotions ADD COLUMN future_authority TEXT NOT NULL DEFAULT 'initial'");
  const q = query(h.x),
    calls = lateLedgerRequestCut(t, q, async (n) =>
      h.db.prepare('UPDATE promotions SET future_authority=?').run('changed-' + n),
    );
  assert.deepEqual(await h.run(q), { kind: 'unknown', reason: 'state-changed' });
  assert.equal(calls(), 4);
});

test('v2 late-ledger compares harmless byte changes to retained recovery authority before reusing it', async (t) => {
  const h = await lateLedgerFixture(t),
    q = query(h.x);
  const calls = lateLedgerRequestCut(t, q, async () =>
    h.db.exec("UPDATE recovery SET draft=draft||' '"),
  );
  assert.deepEqual(await h.run(q), { kind: 'unknown', reason: 'state-changed' });
  assert.equal(calls(), 4);
});

test('v2 late-ledger authenticates the fresh served row instead of retaining old row bytes', async (t) => {
  const h = await lateLedgerFixture(t);
  await h.append();
  const q = query(h.x);
  lateLedgerRequestCut(t, q, async () =>
    h.db.exec("UPDATE delivery_decisions SET submission=X'00' WHERE position=1"),
  );
  assert.deepEqual(await h.run(q), { kind: 'unknown', reason: 'ledger-integrity' });
});

test('v2 late-ledger retains four final owner fences for real appends after the fresh capture', async (t) => {
  const h = await lateLedgerFixture(t);
  await h.append();
  const warm = query(h.x, 0, 8);
  pageProof(await h.run(warm), warm, h.x, h.retained);
  const capture = h.reuse.tips.capture.bind(h.reuse.tips),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let armed = false,
    appending = false,
    cuts = 0;
  t.mock.method(h.reuse.tips, 'capture', (...args) => {
    const s = capture(...args);
    if (!appending) armed = true;
    return s;
  });
  t.mock.method(crypto.subtle, 'verify', async (...args) => {
    if (armed && !appending) {
      armed = false;
      cuts++;
      appending = true;
      try {
        await h.append();
      } finally {
        appending = false;
      }
    }
    return verify(...args);
  });
  const q = query(h.x, 0, 8);
  assert.deepEqual(await h.run(q), { kind: 'unknown', reason: 'state-changed' });
  assert.equal(cuts, 4);
  t.mock.restoreAll();
  pageProof(await h.run(q), q, h.x, h.retained);
});

test('v2 late-ledger cannot outlive closed verifier ownership at the recapture boundary', async (t) => {
  const h = await lateLedgerFixture(t),
    q = query(h.x);
  lateLedgerRequestCut(t, q, async () => h.reuse.close());
  const answer = await h.run(q);
  assert.equal(answer.kind, 'unknown');
  assert.equal('bytes' in answer, false);
});

test('v2 late-ledger retains current grant authorization after request verification', async (t) => {
  const h = await lateLedgerFixture(t),
    q = query(h.x);
  const { AuthorizationRefused } = await import('../../account-service/authorization.ts');
  let active = true,
    authorizations = 0;
  lateLedgerRequestCut(t, q, async () => {
    active = false;
  });
  await assert.rejects(
    h.run(q, () => {}, {
      ...h.issuer,
      authorize() {
        authorizations++;
        if (!active) throw new AuthorizationRefused('expired');
      },
    }),
    AuthorizationRefused,
  );
  assert.equal(authorizations, 1);
  assert.equal(h.db.isTransaction, false);
});
