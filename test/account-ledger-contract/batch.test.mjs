import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { load } from './runtime.mjs';
import { fixture, bytes, hex, json, sourceValues, spoolValues, hash } from './oracle.mjs';
import { encrypted, encode, envelopeParts } from '../account-transport-contract/oracle.mjs';
import { report, publicKey } from './helpers.mjs';
const oldReader = await load('oldBatchReader');
const h = await load(),
  f = fixture();
const capsule = () => ({
  ...f.mixed,
  sources: f.mixed.sources.map((s) => ({ ...s, actor: f.route.principal, kind: 'human' })),
});
const allocation = (c, indices = [0, 1]) => ({
  type: 'position-batch',
  position: 1,
  sources: indices.map((index) => ({ id: c.id, index, hash: hash(json(sourceValues(c))) })),
});
const records = (c, entry = allocation(c)) => [
  { seq: 1, gen: 1, kind: 'outbound', bytes: bytes(hex(json(sourceValues(c)))) },
  { seq: 2, gen: 1, kind: 'heads', bytes: bytes(hex(json(spoolValues(f.route, entry)))) },
];
test('independent batch bytes retain two original updates; signed second-update substitution needs the real guard', async () => {
  const c = capsule(),
    entry = allocation(c),
    raw = json(spoolValues(f.route, entry));
  assert.equal(hex(h.encodeSpoolEntry(entry, f.route)), hex(raw));
  assert.deepEqual(h.decodeSpoolEntry(bytes(hex(raw)), f.route), entry);
  assert.throws(() => oldReader.decodeSpoolEntry(bytes(hex(raw)), f.route), /Unreadable/);
  const wire = (updates) =>
    hex(
      encode(
        envelopeParts(
          encrypted(
            { ...f.env, nonce: 'ac'.repeat(12) },
            { actor_id: f.route.principal, actor_kind: 'human', updates },
            f.kg,
            f.keys.member.seed,
          ),
        ),
      ),
    );
  const make = (updates) => [
    ...records(c),
    {
      seq: 3,
      gen: 1,
      kind: 'heads',
      bytes: bytes(hex(json(spoolValues(f.route, { type: 'attempt', position: 1, attempt: 1 })))),
    },
    {
      seq: 4,
      gen: 1,
      kind: 'outbound',
      bytes: bytes(
        hex(
          json(
            spoolValues(f.route, {
              type: 'envelope',
              position: 1,
              attempt: 1,
              wire: wire(updates),
            }),
          ),
        ),
      ),
    },
  ];
  const key = await publicKey(f);
  await h.verifySpool(
    h.inspectSpool(make(c.sources.map((s) => s.bytes)), f.route),
    f.route,
    bytes(f.kg),
    key,
    crypto.subtle,
  );
  const wrong = h.inspectSpool(make([c.sources[0].bytes, c.sources[0].bytes]), f.route);
  await assert.rejects(
    h.verifySpool(wrong, f.route, bytes(f.kg), key, crypto.subtle),
    /source differs/,
  );
  await (await load('envelopeSource')).verifySpool(wrong, f.route, bytes(f.kg), key, crypto.subtle);
  report('batch-vector', {
    status: 'passed',
    allocation: entry,
    canonicalHex: hex(raw),
    substitution: { baseline: 'refused', guardOmitted: 'accepted' },
    originalUpdateCount: 2,
  });
});
test('actual actor, order and byte-budget omissions expose forbidden batch allocations', async () => {
  const big = capsule(),
    doc = new Y.Doc();
  const updates = [];
  doc.on('update', (b) => updates.push(hex(b)));
  doc.getText('body').insert(0, 'a'.repeat(40000));
  doc.getText('body').insert(0, 'b'.repeat(40000));
  doc.destroy();
  big.sources = updates.map((bytes) => ({ actor: f.route.principal, kind: 'human', bytes }));
  const cases = [
    ['batchActor', records(f.mixed)],
    ['batchOrder', records(capsule(), allocation(capsule(), [1, 0]))],
    ['batchBytes', records(big)],
  ];
  for (const [name, rows] of cases) {
    assert.throws(() => h.inspectSpool(rows, f.route), /batch/);
    assert.equal((await load(name)).inspectSpool(rows, f.route).positions.length, 1);
  }
  report('batch-allocation-controls', {
    status: 'passed',
    controls: cases.map(([name]) => ({ name, baseline: 'refused', guardOmitted: 'accepted' })),
  });
});
