import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ready } from '../account-service-delivery/fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import {
  snapshotWorkspaceAuthority,
  verifyCurrentWorkspaceAuthority,
} from '../../account-service/delivery.ts';
import { AuthorizationRefused } from '../../account-service/authorization.ts';
import * as reuse from '../../account-service/inboundAuthorityReuse.ts';

async function harness(t) {
  const x = await ready(t),
    db = new DatabaseSync(x.f.path);
  t.after(() => db.close());
  const native = x.authority.owner.readInbound(
    { readInbound: (_input, issuer) => issuer },
    new Uint8Array(),
  );
  const cache = reuse.createInboundAuthorityCache();
  t.after(() => cache.close());
  let verified = 0,
    checked = 0;
  const issuer = {
    pin: native.pin,
    check: (...args) => {
      checked++;
      native.check(...args);
    },
  };
  const verify = async (...args) => {
    verified++;
    return verifyCurrentWorkspaceAuthority(...args);
  };
  const capture = () => snapshotWorkspaceAuthority(db, x.workspace);
  const run = (s = capture(), i = issuer, v = verify) =>
    reuse.reuseInboundAuthority(undefined, s, i, v, cache);
  return {
    x,
    db,
    native,
    cache,
    issuer,
    verify,
    capture,
    run,
    counts: () => ({ verified, checked }),
  };
}

test('independent native reads reuse authority proof and independently authenticate each request', async (t) => {
  const x = await ready(t),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let offers = 0;
  t.mock.method(crypto.subtle, 'verify', (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/promotion-offer/v1'))) offers++;
    return verify(...args);
  });
  for (let i = 0; i < 2; i++) {
    const q = query(x);
    pageProof(await x.authority.owner.readInbound(x.f.core, q), q, x, []);
  }
  assert.equal(
    offers,
    1,
    'identical native authority should be verified once across independent reads',
  );
  const wrong = query(x);
  // The independent oracle signs its fields; corrupt the actual signature afterward.
  const fields = JSON.parse(Buffer.from(wrong).toString());
  fields[fields.length - 1] = '00'.repeat(64);
  const refused = await x.authority.owner.readInbound(
    x.f.core,
    new Uint8Array(Buffer.from(JSON.stringify(fields))),
  );
  assert.equal(refused.kind, 'unknown');
  assert.equal(refused.bytes, undefined);
});

test('core evidence survives operation-owner retirement and returns detached mutable projections', async (t) => {
  const h = await harness(t),
    a = await h.run(),
    head = a.a.head;
  a.a.head = 'ff'.repeat(32);
  a.request.candidate.workspaceId = 'ff'.repeat(16);
  const owner = reuse.createInboundAuthorityReuse();
  const b = await reuse.reuseInboundAuthority(owner, h.capture(), h.issuer, h.verify, h.cache);
  owner.close();
  assert.equal(b.a.head, head);
  assert.equal(b.request.candidate.workspaceId, h.x.workspace);
  b.receipt.offer.head = 'ee'.repeat(32);
  b.a.head = 'ee'.repeat(32);
  assert.equal((await h.run()).a.head, head);
  assert.deepEqual(h.counts(), { verified: 1, checked: 3 });
});

test('every native header and witness including future fields selects fresh core evidence', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    a = await h.run();
  const paths = [
    ['promotion', 'request'],
    ['promotion', 'offer'],
    ['promotion', 'result'],
    ['promotion', 'acceptance_seal'],
    ['promotion', 'activation'],
    ['promotion', 'successor_head'],
    ['promotion', 'delivery_witness'],
    ['account', 'id'],
    ['account', 'state'],
    ['credential', 'id'],
    ['credential', 'state'],
    ['recovery', 'draft'],
    ['recovery', 'result'],
    ['recovery', 'state'],
    ['attempt', 'mode'],
    ['attempt', 'result'],
    ['successor'],
    ['transfer'],
    ['continuations'],
    ['membershipTransfers'],
    ['membershipCancellations'],
    ['removalPreparation'],
    ['rotations'],
    ['recoveries'],
    ['publisherWitness'],
    ['publisher'],
    ['futureAuthorityField'],
  ];
  let verified = 0;
  const verify = async (_s, issuer) => {
    verified++;
    issuer.check(a.seal, s.promotion.request_digest, a.a.acceptanceKey);
    return a;
  };
  await h.run(s, h.issuer, verify);
  for (const path of paths) {
    const changed = structuredClone(s);
    let at = changed;
    for (const key of path.slice(0, -1)) at = at[key];
    at[path.at(-1)] = { changed: true };
    const before = verified;
    await h.run(changed, h.issuer, verify);
    assert.equal(verified, before + 1, path.join('.'));
  }
});

test('core proof hits replay fresh custody checks and cannot retain a failed check', async (t) => {
  const h = await harness(t);
  await h.run();
  await assert.rejects(
    h.run(h.capture(), {
      ...h.issuer,
      check() {
        throw Error('closed custody');
      },
    }),
    /closed custody/,
  );
  await h.run();
  assert.equal(h.counts().verified, 2);
  assert.equal(h.counts().checked, 2);
});

test('clear and close during verification fence return and late cache population', async (t) => {
  for (const action of ['clear', 'close']) {
    const h = await harness(t);
    let entered, release;
    const waiting = new Promise((r) => {
        entered = r;
      }),
      hold = new Promise((r) => {
        release = r;
      });
    const verify = async (...args) => {
      const a = await h.verify(...args);
      entered();
      await hold;
      return a;
    };
    const pending = h.run(h.capture(), h.issuer, verify);
    await waiting;
    h.cache[action]();
    release();
    await assert.rejects(pending, /owner or input changed/);
    if (action === 'clear') {
      await h.run();
      assert.equal(h.counts().verified, 2);
    } else await assert.rejects(h.run(), /Inactive read authority cache/);
  }
});

test('clear or close from a replayed custody check fences a core cache hit', async (t) => {
  for (const action of ['clear', 'close']) {
    const h = await harness(t);
    await h.run();
    await assert.rejects(
      h.run(h.capture(), {
        ...h.issuer,
        check(...args) {
          h.issuer.check(...args);
          h.cache[action]();
        },
      }),
      /owner or input changed/,
    );
    if (action === 'clear') {
      await h.run();
      assert.equal(h.counts().verified, 2);
    }
  }
});

test('core cache is private, pin-specific and verifier-specific with exact non-JSON context bytes', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    a = await h.run();
  await assert.rejects(
    reuse.reuseInboundAuthority(undefined, s, h.issuer, h.verify, { clear() {}, close() {} }),
    /Inactive/,
  );
  let calls = 0;
  const verify = async () => {
    calls++;
    return a;
  };
  await h.run(s, h.issuer, verify);
  await h.run(
    s,
    { ...h.issuer, pin: { ...h.issuer.pin, origin: 'https://different.invalid' } },
    verify,
  );
  await h.run({ ...s, futureField: new Map([['proof', 'first']]) }, h.issuer, verify);
  await h.run({ ...s, futureField: new Map([['proof', 'second']]) }, h.issuer, verify);
  assert.equal(calls, 4);
});

test('core cache omits only rows while oversized or unserializable inputs use full verification', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await h.run(s);
  await h.run({ ...s, rows: [{ untrusted: 'not authority evidence' }] });
  assert.equal(h.counts().verified, 1);
  for (const futureField of ['x'.repeat(reuse.INBOUND_AUTHORITY_CONTEXT_BYTES), () => {}]) {
    await h.run({ ...s, futureField });
    await h.run({ ...s, futureField });
  }
  assert.equal(h.counts().verified, 5);
});

test('core cache bounds identities and refreshes LRU order without reviving evicted evidence', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    a = await h.run();
  h.cache.clear();
  let calls = 0;
  const verify = async () => {
    calls++;
    return a;
  };
  for (let i = 0; i < reuse.INBOUND_AUTHORITY_CACHE_ENTRIES; i++)
    await h.run({ ...s, salt: i }, h.issuer, verify);
  await h.run({ ...s, salt: 0 }, h.issuer, verify);
  await h.run({ ...s, salt: reuse.INBOUND_AUTHORITY_CACHE_ENTRIES }, h.issuer, verify);
  const before = calls;
  await h.run({ ...s, salt: 0 }, h.issuer, verify);
  assert.equal(calls, before);
  await h.run({ ...s, salt: 1 }, h.issuer, verify);
  assert.equal(calls, before + 1);
});

test('oversized verified projections are not retained even with a small native context', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    a = await h.run();
  h.cache.clear();
  let calls = 0;
  const verify = async () => {
    calls++;
    return { ...a, futureProjection: 'x'.repeat(reuse.INBOUND_AUTHORITY_CACHE_BYTES) };
  };
  await h.run(s, h.issuer, verify);
  await h.run(s, h.issuer, verify);
  assert.equal(calls, 2);
});

test('independent overlapping cache misses still verify each owned input and fresh custody', async (t) => {
  const h = await harness(t),
    s = h.capture();
  const [a, b] = await Promise.all([h.run(s), h.run(structuredClone(s))]);
  assert.equal(a.a.head, b.a.head);
  assert.equal(h.counts().verified, 2);
  await h.run();
  assert.equal(h.counts().verified, 2);
  assert.equal(h.counts().checked, 3);
});

test('warm native reads retain expiry, current grant and independent ledger-corruption refusals', async (t) => {
  const h = await harness(t),
    w = h.x.make(1),
    accepted = await h.x.call(w),
    q = query(h.x);
  pageProof(await h.x.authority.owner.readInbound(h.x.f.core, q), q, h.x, [{ w, r: accepted }]);
  const expired = await h.x.authority.owner.readInbound(
    h.x.f.core,
    query(h.x, 0, 1, { expires: Date.now() - 1 }),
  );
  assert.equal(expired.kind, 'unknown');
  assert.equal(expired.bytes, undefined);
  await assert.rejects(
    h.x.authority.owner.readInbound(h.x.f.core, query(h.x), () => {
      throw new AuthorizationRefused('insufficient-scope');
    }),
    AuthorizationRefused,
  );
  const warmed = query(h.x);
  pageProof(await h.x.authority.owner.readInbound(h.x.f.core, warmed), warmed, h.x, [
    { w, r: accepted },
  ]);
  h.db.prepare('UPDATE delivery_decisions SET response=?').run(new Uint8Array([1]));
  const corrupt = await h.x.authority.owner.readInbound(h.x.f.core, query(h.x));
  assert.equal(corrupt.kind, 'unknown');
  assert.equal(corrupt.bytes, undefined);
});

test('mutated native input during a hit and changed authority during a miss both refuse', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await h.run(s);
  const changed = structuredClone(s);
  await assert.rejects(
    h.run(changed, {
      ...h.issuer,
      check(...args) {
        h.issuer.check(...args);
        changed.futureField = 1;
      },
    }),
    /input changed/,
  );
  const input = h.capture();
  await assert.rejects(
    h.run(input, h.issuer, async (...args) => {
      const a = await h.verify(...args);
      input.futureField = 1;
      return a;
    }),
    /input changed/,
  );
});

test('aggregate cache accounting evicts entries before the byte charge exceeds its bound', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    a = await h.run();
  h.cache.clear();
  let calls = 0;
  const verify = async () => {
    calls++;
    return { ...a, futureProjection: 'x'.repeat(1024 * 1024) };
  };
  const count = Math.ceil(reuse.INBOUND_AUTHORITY_CACHE_BYTES / (2 * 1024 * 1024)) + 1;
  for (let i = 0; i < count; i++) await h.run({ ...s, salt: i }, h.issuer, verify);
  const before = calls;
  await h.run({ ...s, salt: 0 }, h.issuer, verify);
  assert.equal(calls, before + 1);
});

test('a warm native cache cannot hide changed promotion bytes on an independent connection', async (t) => {
  const h = await harness(t),
    q = query(h.x);
  pageProof(await h.x.authority.owner.readInbound(h.x.f.core, q), q, h.x, []);
  h.db.prepare("UPDATE promotions SET offer='{}' WHERE workspace_id=?").run(h.x.workspace);
  const changed = await h.x.authority.owner.readInbound(h.x.f.core, query(h.x));
  assert.equal(changed.kind, 'unknown');
  assert.equal(changed.bytes, undefined);
});

test('warm authority retains transaction-time authorization and its completion check', async (t) => {
  const h = await harness(t),
    q = query(h.x);
  pageProof(await h.x.authority.owner.readInbound(h.x.f.core, q), q, h.x, []);
  let began = 0,
    completed = 0;
  await assert.rejects(
    h.x.authority.owner.readInbound(h.x.f.core, query(h.x), (db, target) => {
      assert.equal(db.isTransaction, true);
      assert.equal(target.action, 'read');
      began++;
      return () => {
        assert.equal(db.isTransaction, true);
        completed++;
        throw new AuthorizationRefused('sign-in-required');
      };
    }),
    AuthorizationRefused,
  );
  assert.equal(began, 1);
  assert.equal(completed, 1);
});

test('native core restart retires all reusable authority evidence', async (t) => {
  const x = await ready(t),
    verify = crypto.subtle.verify.bind(crypto.subtle);
  let offers = 0;
  t.mock.method(crypto.subtle, 'verify', (...args) => {
    if (Buffer.from(args[3]).includes(Buffer.from('done/promotion-offer/v1'))) offers++;
    return verify(...args);
  });
  let q = query(x);
  pageProof(await x.authority.owner.readInbound(x.f.core, q), q, x, []);
  x.f.restart();
  q = query(x);
  pageProof(await x.authority.owner.readInbound(x.f.core, q), q, x, []);
  assert.equal(offers, 2);
});
test('proof namespaces retain two independent verifiers for the same exact native input', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    value = await h.run();
  let first = 0,
    second = 0;
  const a = async () => {
      first++;
      return value;
    },
    b = async () => {
      second++;
      return value;
    };
  for (let i = 0; i < 4; i++) {
    await h.run(s, h.issuer, a);
    await h.run(s, h.issuer, b);
  }
  assert.equal(first, 1);
  assert.equal(second, 1);
});
test('proof namespaces keep a failed producer from evicting another producer owned proof', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    value = await h.run();
  let entered,
    release,
    second = 0;
  const arrived = new Promise((resolve) => {
      entered = resolve;
    }),
    held = new Promise((resolve) => {
      release = resolve;
    });
  const a = async () => {
    entered();
    await held;
    throw Error('independent failed proof');
  };
  const b = async () => {
    second++;
    return value;
  };
  const waiting = assert.rejects(h.run(s, h.issuer, a), /independent failed proof/);
  await arrived;
  await h.run(s, h.issuer, b);
  release();
  await waiting;
  await h.run(s, h.issuer, b);
  assert.equal(second, 1);
});
test('proof namespaces share one global entry bound and LRU rather than multiplying capacity', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    value = await h.run();
  h.cache.clear();
  let a = 0,
    b = 0;
  const first = async () => {
      a++;
      return value;
    },
    second = async () => {
      b++;
      return value;
    };
  await h.run(s, h.issuer, first);
  for (let i = 0; i < reuse.INBOUND_AUTHORITY_CACHE_ENTRIES - 1; i++)
    await h.run({ ...s, salt: i }, h.issuer, second);
  await h.run(s, h.issuer, first);
  assert.equal(a, 1);
  await h.run({ ...s, salt: reuse.INBOUND_AUTHORITY_CACHE_ENTRIES }, h.issuer, second);
  await h.run(s, h.issuer, first);
  assert.equal(a, 1, 'fresh first-purpose entry stays hot');
  await h.run({ ...s, salt: 0 }, h.issuer, second);
  assert.equal(
    b,
    reuse.INBOUND_AUTHORITY_CACHE_ENTRIES + 1,
    'oldest entry is evicted across purposes',
  );
});
test('complete prelude proof preserves epoch-one delivery shape and branded history', async (t) => {
  const h = await harness(t),
    s = { ...h.capture(), rows: [] };
  const { reuseWorkspaceAuthorityHistory, verifyCurrentWorkspaceAuthorityWithHistory } =
    await import('../../account-service/delivery.ts');
  const { historyMembershipAt } = await import('../../account-protocol/admissionHistory.ts');
  const expected = await verifyCurrentWorkspaceAuthorityWithHistory(s, h.issuer);
  const result = await reuseWorkspaceAuthorityHistory(s, h.issuer, { authority: h.cache });
  assert.deepEqual(result, expected);
  assert.equal('history' in result.authority, false);
  assert.equal(historyMembershipAt(result.history, 1).state.epoch, 1);
  assert.throws(() => historyMembershipAt(structuredClone(result.history), 1), /Unverified/);
});
