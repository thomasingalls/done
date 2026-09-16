import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  verifyAdmissionHistory,
  historyAuthority,
  historyEnvelopeRoute,
  verifyHistoryDecision,
  createAdmissionPrefixVerifier,
} from '../../account-protocol/admissionHistory.ts';
import {
  historyFixture,
  wire,
  expected,
  accepted,
  link,
  refusal,
  response,
  ZERO,
} from './history-oracle.mjs';
const open = (f) => verifyAdmissionHistory(f.successor, f.base, f.held);
const route = (h, epoch = 2) => ({
  v: 2,
  workspace_id: h.current.workspace,
  credential_id: h.credential,
  epoch,
  gen: 1,
});

test('only verified, immutable exact parent/current contexts resolve historical routes', async () => {
  const f = historyFixture(),
    pending = open(f);
  f.successor.epoch.heads[0].link = '88'.repeat(32);
  f.base.receipt.offer.head = '99'.repeat(32);
  const h = await pending;
  assert.equal(h.boundary.position, 2);
  assert(Object.isFrozen(h) && Object.isFrozen(h.current) && Object.isFrozen(h.boundary));
  assert.deepEqual(historyAuthority(h, { ...h.first }), h.first);
  assert.deepEqual(historyAuthority(h, { ...h.current }), h.current);
  assert.throws(() => historyAuthority({ ...h }, h.current), /Unverified/);
  for (const field of ['workspace', 'lineage', 'head', 'acceptanceKey'])
    assert.throws(() => historyAuthority(h, { ...h.current, [field]: '88'.repeat(32) }));
  assert.throws(() => historyAuthority(h, { ...h.current, tip: 3 }));
  for (const epoch of [1, 2]) assert.equal(historyEnvelopeRoute(h, route(h), epoch).epoch, epoch);
  for (const epoch of [0, 3, NaN]) assert.throws(() => historyEnvelopeRoute(h, route(h), epoch));
  assert.throws(() => historyEnvelopeRoute(h, route(h, 1), 2));
  for (const bad of [
    { ...route(h), credential_id: f.context.candidate.credentialId },
    { ...route(h), workspace_id: '88'.repeat(16) },
    { ...route(h), gen: 2 },
    { ...route(h), v: 1 },
  ])
    assert.throws(() => historyEnvelopeRoute(h, bad, 1));
});

test('historical acceptance and exact old pending envelopes accepted after admission remain distinct', async () => {
  const f = historyFixture(),
    h = await open(f);
  for (const w of f.wires)
    assert.equal(
      (await verifyHistoryDecision(accepted(f, w, 1), expected(w), h.current, h)).kind,
      'accepted',
    );
  let previous = h.boundary.link;
  for (const epoch of [1, 2]) {
    const w = wire(f, 3, epoch);
    assert.equal(
      (
        await verifyHistoryDecision(
          accepted(f, w, 2, previous),
          expected(w, previous),
          h.current,
          h,
        )
      ).kind,
      'accepted',
    );
  }
  const queued = wire(f, 3),
    bytes = queued.bytes.slice();
  assert.equal(
    (
      await verifyHistoryDecision(
        accepted(f, queued, 1, previous),
        expected(queued, previous),
        h.current,
        h,
      )
    ).kind,
    'unknown',
  );
  assert.deepEqual(queued.bytes, bytes);
  const old = f.wires[0];
  assert.equal(
    (await verifyHistoryDecision(accepted(f, old, 2), expected(old), h.current, h)).kind,
    'unknown',
  );
  assert.equal(
    (
      await verifyHistoryDecision(
        accepted(f, queued, 2, previous),
        expected(queued, previous),
        h.first,
        h,
      )
    ).kind,
    'unknown',
  );
});

test('signatures, publisher, previous link, leaf epoch and admission boundary cannot be substituted', async () => {
  const f = historyFixture(),
    h = await open(f),
    last = f.wires.at(-1);
  const alternative = wire(f, 2, 1, 'different'),
    before = last.previous;
  assert.equal(
    (
      await verifyHistoryDecision(
        accepted(f, alternative, 1, before),
        expected(alternative, before),
        h.current,
        h,
      )
    ).kind,
    'unknown',
  );
  for (const proof of [accepted(f, last, 1, ZERO), accepted(f, last, 3)])
    assert.equal(
      (await verifyHistoryDecision(proof, expected(last), h.current, h)).kind,
      'unknown',
    );
  const proof = accepted(f, last, 1),
    value = JSON.parse(Buffer.from(proof));
  value[11] = '00'.repeat(64);
  assert.equal(
    (
      await verifyHistoryDecision(
        new Uint8Array(Buffer.from(JSON.stringify(value))),
        expected(last),
        h.current,
        h,
      )
    ).kind,
    'unknown',
  );
  await assert.rejects(
    verifyHistoryDecision(
      proof,
      { ...expected(last), credential: f.context.candidate.credentialId },
      h.current,
      h,
    ),
  );
  assert.equal(
    (await verifyHistoryDecision(new Uint8Array([0]), expected(last), h.current, h)).kind,
    'unknown',
  );
});

test('permanent old refusals beyond the accepted boundary stay verifiable and do not become acceptances', async () => {
  const f = historyFixture(0),
    h = await open(f),
    w = wire(f, 1),
    proof = response({
      kind: 'refused',
      refusal: refusal(w.subject, f.keys.acceptance, ZERO, 'generation-mismatch'),
    });
  const e = await verifyHistoryDecision(proof, expected(w), h.current, h);
  assert.equal(e.kind, 'refused');
  assert.equal(e.refusal.reason, 'generation-mismatch');
});

test('complete prefix verifies independently signed envelope bytes including a zero prefix', async () => {
  for (const count of [0, 1, 4]) {
    const f = historyFixture(count),
      h = await open(f),
      p = createAdmissionPrefixVerifier(h);
    for (const w of f.wires) await p.append(w.bytes);
    assert.deepEqual(p.finish(), h.boundary);
    assert.deepEqual(p.finish(), h.boundary);
    await assert.rejects(p.append(wire(f, count + 1).bytes));
    assert.throws(() => p.finish());
  }
});

test('missing, duplicate, reordered, changed and incorrectly routed prefix bytes refuse installation', async () => {
  const f = historyFixture(),
    h = await open(f);
  const cases = [
    [],
    [f.wires[0]],
    [f.wires[1]],
    [f.wires[0], f.wires[0]],
    [f.wires[0], wire(f, 2, 1, 'changed')],
    [f.wires[0], wire(f, 2, 2)],
    [f.wires[0], wire(f, 2, 1, 'same', { credential: f.context.candidate.credentialId })],
  ];
  for (const values of cases) {
    const p = createAdmissionPrefixVerifier(h);
    await assert.rejects(async () => {
      for (const w of values) await p.append(w.bytes);
      p.finish();
    });
    assert.throws(() => p.finish(), /prefix/);
  }
  const p = createAdmissionPrefixVerifier(h),
    damaged = f.wires[0].bytes.slice();
  damaged[damaged.length - 1] ^= 1;
  await assert.rejects(p.append(damaged));
  await assert.rejects(p.append(f.wires[0].bytes));
});

test('prefix verification snapshots mutable bytes and fails closed on concurrent operations', async () => {
  const f = historyFixture(),
    h = await open(f),
    p = createAdmissionPrefixVerifier(h),
    bytes = f.wires[0].bytes.slice(),
    pending = p.append(bytes);
  bytes.fill(0);
  await pending;
  await p.append(f.wires[1].bytes);
  assert.deepEqual(p.finish(), h.boundary);
  const q = createAdmissionPrefixVerifier(h),
    first = q.append(f.wires[0].bytes);
  await assert.rejects(q.append(f.wires[1].bytes));
  await assert.rejects(first);
  assert.throws(() => q.finish());
});

test('retained child rejects a sibling even when the service signs both', async () => {
  const f = historyFixture(),
    h = await open(f),
    sibling = historyFixture(1);
  await assert.rejects(
    verifyAdmissionHistory(sibling.successor, f.base, { epoch: 2, head: h.current.head }),
    /fork|rollback/i,
  );
  assert.deepEqual(
    await verifyAdmissionHistory(f.successor, f.base, { epoch: 2, head: h.current.head }),
    h,
  );
});

test('generated prefixes and issuance epochs agree with an independent boundary model', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 8 }),
      fc.integer({ min: 1, max: 10 }),
      fc.constantFrom(1, 2, 3),
      async (count, position, issuance) => {
        const f = historyFixture(count),
          h = await open(f),
          p = createAdmissionPrefixVerifier(h);
        for (const w of f.wires) await p.append(w.bytes);
        assert.deepEqual(p.finish(), h.boundary);
        let previous = ZERO;
        for (let n = 1; n < position; n++) previous = link(wire(f, n).subject, previous);
        const w = wire(f, position),
          e = await verifyHistoryDecision(
            accepted(f, w, issuance, previous),
            expected(w, previous),
            h.current,
            h,
          );
        assert.equal(e.kind, issuance === (position <= count ? 1 : 2) ? 'accepted' : 'unknown');
      },
    ),
    { seed: 16091603, numRuns: 80 },
  );
});
