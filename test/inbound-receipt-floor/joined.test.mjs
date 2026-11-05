/** Private parser seam is test-only; no modified production module is written or imported by app entries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import { fixture } from '../account-membership/fixtures.mjs';
const floor = { inboundReceiptVersion: 1 },
  zero = '00'.repeat(32);
let hits = 0;
const built = await build({
  configFile: false,
  logLevel: 'error',
  plugins: [
    {
      name: 'receipt-floor-private-parsers',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/crdt/joinedAccount.ts')) return;
        assert.equal(code.split('function parseJoined(input: unknown): JoinedRecord {').length, 2);
        assert.equal(code.split('async function writeJoined(').length, 2);
        hits++;
        return (
          code +
          "\nexport { parseJoined, writeJoined };\nexport { captureMembershipReading } from './membershipReading';\n"
        );
      },
    },
  ],
  build: {
    write: false,
    minify: false,
    rollupOptions: { output: { codeSplitting: false } },
    lib: { entry: resolve('src/crdt/joinedAccount.ts'), name: 'FloorRuntime', formats: ['iife'] },
  },
});
assert.equal(hits, 1);
const output = (Array.isArray(built) ? built[0] : built).output;
assert.equal(output.filter((x) => x.type === 'chunk').length, 1);
const h = Function(output.find((x) => x.type === 'chunk').code + '; return FloorRuntime;')();
function marker() {
  const f = fixture(),
    a = { base: f.f.base, successor: f.f.successor, certification: f.certification },
    binding = {
      v: 1,
      kind: 'promotion-slot-binding',
      requestDigest: f.f.receipt.offer.epoch.requestDigest,
      epochHead: f.f.receipt.offer.head,
      stored: { binding: f.f.binding, bindingSignature: '00'.repeat(64) },
    },
    checkpoint = {
      v: 1,
      kind: 'content-checkpoint',
      salt: '51'.repeat(16),
      nonce: '52'.repeat(12),
      ct: '53'.repeat(16),
      manifest: {
        v: 2,
        workspaceId: a.base.request.candidate.workspaceId,
        epoch: 3,
        epochHead: f.certification.head,
        generation: 1,
        checkpointDigest: zero,
        sv: '00',
        ds: '00',
        headVectorDigest: zero,
        producer: f.context.existing.id,
        signature: '00'.repeat(64),
      },
      heads: f.certification.epoch.heads,
      binding,
    };
  return {
    v: 1,
    kind: 'certified-account-device',
    slotId: 'fixture-floor',
    claimMac: zero,
    custodyMac: zero,
    phase: 'active',
    authority: a,
    reading: {
      checkpoint,
      admission: { fixture: true },
      active: true,
      events: [],
      prefix: { position: 0, link: zero, observedThrough: 0 },
    },
    key: { sequence: 1, ct: '54'.repeat(48) },
    mac: zero,
  };
}
const updateRequired = (e) => e?.code === 'app-update-required';
test('joined parser preserves the optional marker/reading floor and exact legacy payload bytes', () => {
  const old = h.parseJoined(marker()),
    { mac: _, ...plain } = old;
  assert.equal(Object.hasOwn(old, 'inboundReceiptVersion'), false);
  assert.equal(Buffer.from(h.joinedPayload(old)).toString(), JSON.stringify(plain));
  const current = { ...old, ...floor, reading: { ...old.reading, ...floor } },
    parsed = h.parseJoined(current),
    { mac: _mac, ...expected } = current;
  assert.deepEqual(parsed, current);
  assert.equal(Buffer.from(h.joinedPayload(parsed)).toString(), JSON.stringify(expected));
  assert.notDeepEqual(h.joinedPayload(parsed), h.joinedPayload(old));
});
test('unknown marker/reading versions refuse, including accessors without evaluating them', () => {
  const old = marker();
  for (const value of [undefined, 0, 2, '1', null, true]) {
    assert.throws(() => h.parseJoined({ ...old, inboundReceiptVersion: value }), updateRequired);
    assert.throws(
      () => h.parseJoined({ ...old, reading: { ...old.reading, inboundReceiptVersion: value } }),
      updateRequired,
    );
  }
  let calls = 0;
  const current = marker();
  Object.defineProperty(current, 'inboundReceiptVersion', {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  assert.throws(() => h.parseJoined(current), updateRequired);
  assert.throws(() => h.joinedPayload(current), updateRequired);
  assert.equal(calls, 0);
});
test('central joined writer refuses downgrade before opening a native database', async () => {
  const old = h.parseJoined(marker());
  let touched = 0;
  const task = {
    wait() {
      touched++;
      throw Error('must not reach storage');
    },
  };
  await assert.rejects(
    h.writeJoined(task, { marker: { ...old, ...floor }, record: {} }, old),
    updateRequired,
  );
  assert.equal(touched, 0);
});
test('central joined writer also preserves the floor of its retained reading', async () => {
  const old = h.parseJoined(marker()),
    current = { ...old, ...floor, reading: { ...old.reading, ...floor } };
  let touched = 0;
  const task = {
    wait() {
      touched++;
      throw Error('must not reach storage');
    },
  };
  await assert.rejects(
    h.writeJoined(task, { marker: current, record: {} }, { ...old, ...floor }),
    updateRequired,
  );
  assert.equal(touched, 0);
});
test('membership retained-reading parser preserves the version independently of its old checkpoint version', () => {
  const old = marker(),
    reading = {
      v: 2,
      epoch: 4,
      head: old.authority.certification.head,
      checkpoint: old.reading.checkpoint,
      admission: null,
      streams: [
        {
          publisher: old.authority.certification.epoch.heads[0].credentialId,
          events: [],
          prefix: { position: 0, link: zero, observedThrough: 0 },
        },
      ],
    };
  assert.equal(Object.hasOwn(h.captureMembershipReading(reading), 'inboundReceiptVersion'), false);
  assert.deepEqual(h.captureMembershipReading({ ...reading, ...floor }), {
    ...h.captureMembershipReading(reading),
    ...floor,
  });
  for (const value of [undefined, 0, 2, '1', null, true])
    assert.throws(
      () => h.captureMembershipReading({ ...reading, inboundReceiptVersion: value }),
      updateRequired,
    );
});
