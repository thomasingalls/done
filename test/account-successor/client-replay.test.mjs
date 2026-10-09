import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { hash as libHash } from './oracle.mjs';
import { adapters, clientFixture, check, json, hex, ZERO } from './client-fixtures.mjs';
const built = await adapters(),
  lib = built.lib;
test.after(() => built.clear());

test('mixed captured, spooled, accepted and received history replays with unchanged originals', async () => {
  const f = await clientFixture(lib),
    before = f.rows.map((r) => hex(r.bytes));
  for (const reuse of [false, true]) {
    const { delivery, inbound, census } = await check(lib, f, f.rows, reuse);
    assert.equal(delivery.acceptedThrough, 4);
    assert.equal(inbound.prefix.position, 4);
    assert.equal(inbound.prefix.link, f.entries.at(-1).link);
    assert.equal(census.delivery.spool.attempts, 4);
    assert.deepEqual(
      census.delivery.spool.positions.map((p) => hex(p.wire)),
      f.entries.map((e) => hex(e.envelope)),
    );
  }
  assert.deepEqual(
    f.rows.map((r) => hex(r.bytes)),
    before,
  );
  assert.throws(() =>
    lib.inspectInbound(f.rows, f.route1, {
      ...f.context,
      authority: f.history.first,
      history: undefined,
    }),
  );
  assert.throws(() =>
    lib.inspectInbound(f.rows, { ...f.route2, history: { ...f.history } }, f.context),
  );
});

test('old journal capsules and exact pending old envelopes remain usable; new allocation batches stop at the capture epoch', async () => {
  const f = await clientFixture(lib);
  const boundary = f.rows.findIndex(
    (r) => r.kind === 'outbound' && hex(r.bytes) === hex(f.entries[2].capsule),
  );
  const rows = f.rows.slice(0, boundary + 1);
  rows.push({ seq: rows.at(-1).seq + 1, gen: 1, kind: 'outbound', bytes: f.entries[3].capsule });
  const c = lib.inspectInbound(rows, f.route2, f.context),
    s = c.delivery.spool;
  const selected = await lib.selectEnvelopeSources(s, f.route2, true, crypto.subtle);
  assert.deepEqual(
    selected.map((v) => v.id),
    [f.entries[2].id],
  );
  const pending = lib.decodeSourceCapsule(f.entries[2].capsule, f.route2);
  assert.equal(pending.epoch, 1);
  assert.deepEqual(pending.sources[0].bytes, f.entries[2].update);
  lib.eraseCapsule(pending);
  const old = f.rows.filter(
    (r) =>
      r.seq <
      f.rows.find(
        (r) =>
          r.kind === 'heads' &&
          JSON.parse(Buffer.from(r.bytes))[9] === 'response' &&
          JSON.parse(Buffer.from(r.bytes))[10] === 2,
      ).seq,
  );
  const delivery = lib.inspectInbound(old, f.route2, f.context).delivery;
  const state = await lib.verifyDelivery(
    delivery,
    f.route2,
    f.history.current,
    f.signer,
    crypto.subtle,
  );
  assert.equal(state.acceptedThrough, 1);
  assert.equal(hex(state.submissions.get(2)), hex(f.entries[1].submission));
});

test('old acceptance past the boundary, forged record head, wrong actor and damaged content refuse replay', async () => {
  const f = await clientFixture(lib);
  const variants = [
    (rows) => {
      const r = rows.find(
        (r) =>
          r.kind === 'heads' &&
          JSON.parse(Buffer.from(r.bytes))[9] === 'response' &&
          JSON.parse(Buffer.from(r.bytes))[10] === 2,
      );
      const v = JSON.parse(Buffer.from(r.bytes));
      v[11] = hex(f.proof(2, 1));
      r.bytes = json(v);
    },
    (rows) => {
      const r = rows.find(
        (r) =>
          r.kind === 'heads' && JSON.parse(Buffer.from(r.bytes))[0] === 'done/account-delivery/v1',
      );
      const v = JSON.parse(Buffer.from(r.bytes));
      v[8] = '88'.repeat(32);
      r.bytes = json(v);
    },
    (rows) => {
      const r = rows.find(
        (r) =>
          r.kind === 'outbound' && JSON.parse(Buffer.from(r.bytes))[0] === 'done/source-capture/v1',
      );
      const v = JSON.parse(Buffer.from(r.bytes));
      v[8][0][0] = f.f.context.candidate.credentialId;
      r.bytes = json(v);
    },
    (rows) =>
      rows.splice(
        rows.findIndex((r) => r.kind === 'update'),
        1,
      ),
  ];
  for (const change of variants) {
    const rows = structuredClone(f.rows);
    change(rows);
    await assert.rejects(check(lib, f, rows));
  }
});

test('current page carries an old proof and duplicates retain original envelope epoch', async () => {
  const f = await clientFixture(lib),
    packet = f.packet(1, 2),
    old = f.entries[0],
    current = {
      ...f.context,
      prefix: { position: 1, link: old.link, observedThrough: 1 },
      retained: { previous: ZERO, envelope: old.envelope, proof: f.proof(1) },
    };
  assert.equal(
    (
      await lib.verifyInboundPage(current, packet.request, packet.page, {
        assertCurrent() {},
        now: () => 1000,
      })
    ).kind,
    'duplicate',
  );
  const future = f.packet(2, 2, f.proof(2, 1));
  await assert.rejects(
    lib.verifyInboundPage(current, future.request, future.page, {
      assertCurrent() {},
      now: () => 1000,
    }),
  );
  const candidate = {
    ...current,
    publisher: { ...current.publisher, id: f.f.context.candidate.credentialId },
    creatingCredential: f.f.context.candidate.credentialId,
  };
  await assert.rejects(
    lib.verifyInboundPage(candidate, packet.request, packet.page, {
      assertCurrent() {},
      now: () => 1000,
    }),
  );
});

test('generated mixed histories retain source bytes, nonce counts and both accepted prefixes', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 2, max: 7 }), fc.nat(5), async (count, seed) => {
      const f = await clientFixture(lib, { count, boundary: seed % (count - 1) });
      const result = await check(lib, f, f.rows, seed % 2 === 0);
      assert.equal(result.delivery.acceptedThrough, count);
      assert.equal(result.inbound.prefix.position, count);
      assert.equal(result.census.delivery.spool.attempts, count);
      assert.deepEqual(
        result.census.delivery.spool.positions.map((p) => hex(p.wire)),
        f.entries.map((e) => hex(e.envelope)),
      );
    }),
    { seed: 16091604, numRuns: 40 },
  );
});

test('an old unresolved allocation resumes with a fresh current-epoch invocation', async () => {
  const f = await clientFixture(lib, { count: 2, boundary: 1, firstCurrent: 2 });
  const index = f.rows.findIndex(
    (r) => r.kind === 'outbound' && hex(r.bytes) === hex(f.entries[1].capsule),
  );
  const rows = structuredClone(f.rows.slice(0, index + 1));
  const event = (type, detail, epoch) => {
    const value = [
      'done/account-spool/v1',
      1,
      f.route1.workspace,
      f.route1.credential,
      f.route1.principal,
      epoch,
      1,
      type,
      2,
      detail,
    ];
    rows.push({
      seq: rows.length + 1,
      gen: 1,
      kind: type === 'envelope' ? 'outbound' : 'heads',
      bytes: json(value),
    });
  };
  const ref = f.rows[index + 1];
  const grant = JSON.parse(Buffer.from(ref.bytes));
  grant[5] = 1;
  rows.push({ ...ref, bytes: json(grant) });
  event('attempt', 2, 1); // Burned before install/crash: this grant must not be reused.
  event('attempt', 3, 2);
  event('envelope', [3, hex(f.entries[1].envelope)], 2);
  const s = lib.inspectInbound(rows, f.route2, f.context).delivery.spool;
  assert.equal(s.attempts, 3);
  assert.deepEqual(s.positions[1].attempts, [2, 3]);
  await lib.verifySpool(s, f.route2, f.kg, f.signer, crypto.subtle);
  const reused = structuredClone(rows),
    last = JSON.parse(Buffer.from(reused.at(-1).bytes));
  last[9][0] = 2;
  reused.at(-1).bytes = json(last);
  assert.throws(() => lib.inspectInbound(reused, f.route2, f.context));
});

test('mixed capture epochs in one batch and a later old ledger context are refused', async () => {
  const f = await clientFixture(lib);
  const at = f.rows.findIndex(
    (r) => r.kind === 'outbound' && hex(r.bytes) === hex(f.entries[2].capsule),
  );
  const rows = structuredClone(f.rows.slice(0, at + 1));
  rows.push({ seq: rows.at(-1).seq + 1, gen: 1, kind: 'outbound', bytes: f.entries[3].capsule });
  const refs = f.entries.slice(2).map((e) => [e.id, 0, libHash(e.capsule)]);
  rows.push({
    seq: rows.at(-1).seq + 1,
    gen: 1,
    kind: 'heads',
    bytes: json([
      'done/account-spool/v1',
      1,
      f.route1.workspace,
      f.route1.credential,
      f.route1.principal,
      2,
      1,
      'position-batch',
      3,
      refs,
    ]),
  });
  assert.throws(() => lib.inspectInbound(rows, f.route2, f.context), /crosses authority/);
  const old = f.rows.find(
    (r) => r.kind === 'heads' && JSON.parse(Buffer.from(r.bytes))[0] === 'done/account-inbound/v1',
  );
  assert.throws(
    () => lib.inspectInbound([...f.rows, { ...old, seq: f.rows.length + 1 }], f.route2, f.context),
    /authority regressed/,
  );
});
