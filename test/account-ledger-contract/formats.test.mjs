import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { load, encoder, decoder, typed } from './runtime.mjs';
import {
  fixture,
  descriptors,
  bytes,
  hex,
  json,
  hash,
  leaves,
  mutate,
  at,
  change,
  chainPayload,
  fold,
  history,
  sourceValues,
} from './oracle.mjs';
const h = await load(),
  f = fixture(),
  ds = descriptors(f),
  corpus = JSON.parse(readFileSync('test/vectors/account-ledger.json'));
import { report, context, publicKey, fullRecords, audit } from './helpers.mjs';
test('twenty fixed carriers, chain steps, source digest and baseline agree with actual encoders and crypto', async () => {
  for (const d of ds) {
    const b = encoder(h, f, d),
      v = corpus.vectors.find((v) => v.id === d.id);
    assert.equal(hex(b), v.expected.messageHex, d.id);
    assert.equal(hex(encoder(h, f, d, decoder(h, f, d, b))), hex(b));
  }
  for (const v of corpus.vectors.filter((v) => v.id.startsWith('chain-'))) {
    assert.equal(hex(chainPayload(v.before.hash, bytes(v.eventHex))), v.expected.messageHex);
    assert.deepEqual(
      await h.extendSpoolWitness(v.before, bytes(v.eventHex), crypto.subtle),
      v.after,
    );
  }
  const marker = structuredClone(f.promotion);
  marker.credentials[1].publicKey = bytes(marker.credentials[1].publicKey);
  const base = await h.heldInboundContext(marker, bytes(f.kg), crypto.subtle);
  assert.equal(base.baseline.id, f.baseline);
  const reordered = structuredClone(marker);
  reordered.admission.receipt = Object.fromEntries(
    Object.entries(reordered.admission.receipt).reverse(),
  );
  assert.equal(
    (await h.heldInboundContext(reordered, bytes(f.kg), crypto.subtle)).baseline.id,
    f.baseline,
  );
  let digestBound = 0,
    digestRefused = 0;
  for (const { path } of corpus.vectors.find((v) => v.id === 'inbound-baseline-digest').negatives) {
    const next = structuredClone(marker);
    const parent = at(next.admission.receipt, path.slice(0, -1));
    parent[path.at(-1)] = change(parent[path.at(-1)]);
    let actual;
    try {
      actual = await h.heldInboundContext(next, bytes(f.kg), crypto.subtle);
    } catch {
      digestRefused++;
      continue;
    }
    assert.notEqual(actual.baseline.id, f.baseline, path.join('.'));
    digestBound++;
  }
  report('baseline-bindings', { digestBound, digestRefused, total: digestBound + digestRefused });
  report('fixed', {
    vectors: corpus.vectors.length,
    carriers: ds.length,
    baseline: f.baseline,
    sourceDigest: hash(json(sourceValues(f.capsule))),
  });
});
test('all carrier leaves are rejected or retained as distinct canonical bytes; omissions cannot disappear unnoticed', () => {
  const results = [];
  let bound = 0,
    refused = 0,
    omissions = 0;
  for (const d of ds)
    for (const path of leaves(d.values)) {
      const variant = mutate(d.values, path),
        b = bytes(hex(json(variant)));
      let result;
      try {
        result = decoder(h, f, d, b);
      } catch {
        refused++;
      }
      if (result) {
        assert.equal(hex(encoder(h, f, d, result)), hex(b));
        assert.notEqual(hex(b), hex(json(d.values)));
        bound++;
      }
      assert.throws(() => decoder(h, f, d, bytes(hex(json(mutate(d.values, path, true))))));
      omissions++;
      const altered = structuredClone(d.values);
      at(altered, path.slice(0, -1))[path.at(-1)] = change(at(altered, path));
      assert.deepEqual(mutate(d.values, path, true), mutate(altered, path, true));
      results.push({
        id: d.id,
        path,
        result: result ? 'different canonical bytes' : 'parser refusal',
        omission: 'parser refusal',
      });
    }
  report('bindings', { bound, refused, total: bound + refused, omissions, results });
});
test('canonical framing rejects whitespace, BOM, alternate spellings, bad UTF-8, extra fields and all truncated prefixes', () => {
  let prefixes = 0,
    refusals = 0;
  for (const d of ds) {
    const text = JSON.stringify(d.values),
      b = bytes(hex(json(d.values)));
    for (const input of [
      ' ' + text,
      text + '\n',
      JSON.stringify(d.values, null, 1),
      text.replace(',1,', ',1.0,'),
      text.replace('done', 'd\\u006fne'),
      JSON.stringify([...d.values, 0]),
    ]) {
      assert.throws(() => decoder(h, f, d, new TextEncoder().encode(input)), d.id);
      refusals++;
    }
    for (const b2 of [new Uint8Array([0xef, 0xbb, 0xbf, ...b]), new Uint8Array([0xff, ...b])]) {
      assert.throws(() => decoder(h, f, d, b2));
      refusals++;
    }
    for (let n = 0; n < b.length; n++) {
      assert.throws(() => decoder(h, f, d, b.slice(0, n)), d.id + ': ' + n);
      prefixes++;
    }
  }
  report('framing', { prefixes, refusals });
});
test('capsules require bounded original Yjs frames and exact identity deduplication, not snapshot equivalence', () => {
  const raw = typed(f.capsule),
    single = encoder(h, f, ds[0]);
  assert.throws(() => h.encodeSourceCapsule({ ...raw, sources: [] }));
  assert.throws(() => h.encodeSourceCapsule({ ...raw, sources: Array(65).fill(raw.sources[0]) }));
  h.encodeSourceCapsule({ ...raw, sources: Array(64).fill(raw.sources[0]) });
  assert.throws(() =>
    h.encodeSourceCapsule({ ...raw, sources: [{ ...raw.sources[0], bytes: bytes('ff') }] }),
  );
  assert.throws(() =>
    h.encodeSourceCapsule({ ...raw, sources: [{ ...raw.sources[0], actor: 'system' }] }),
  );
  assert.throws(() =>
    h.encodeSourceCapsule({
      ...raw,
      sources: [{ ...raw.sources[0], bytes: new Uint8Array(1024 * 1024 + 1) }],
    }),
  );
  const rows = [
    { kind: 'outbound', gen: 1, seq: 1, bytes: single },
    { kind: 'outbound', gen: 1, seq: 2, bytes: single.slice() },
  ];
  assert.equal(h.captureCatalog(rows, f.route).size, 1);
  const sameSource = h.encodeSourceCapsule({ ...raw, id: 'dd'.repeat(16) });
  assert.equal(
    h.captureCatalog([...rows, { ...rows[0], seq: 3, bytes: sameSource }], f.route).size,
    2,
  );
  const replay = h.capturedRecovery(
    {
      records: rows,
      journal: [
        { key: 'journal-a', generation: 1, bytes: single },
        { key: 'journal-b', generation: 1, bytes: sameSource },
      ],
    },
    f.route,
  );
  assert.equal(replay.journal.length, 1);
  assert.equal(hex(replay.journal[0].bytes), f.updates[0]);
  report('capture', {
    identicalCapsule: 'deduplicated',
    differentIdSameSource: 'retained',
    persistedPlusJournal: 'one uncopied identity replayed',
  });
});
test('ledger census composes all families, validates signed source correspondence and reconstructs conflict with cold expiry', async () => {
  const rows = fullRecords(f),
    c = h.inspectInbound(rows, f.route, context(f)),
    w = fold(c.delivery.spool.events),
    result = await audit(h, f, rows, w);
  assert.equal(w.events, 8);
  assert.equal(result.delivery.acceptedThrough, 1);
  assert.equal(result.received.prefix.position, 1);
  assert.equal(result.received.conflict, true);
  const permuted = [...rows].reverse(),
    again = await audit(h, f, permuted, w);
  assert.deepEqual(again.received.prefix, result.received.prefix);
  for (const seq of [2, 3, 4, 5, 6, 7, 9, 10])
    await assert.rejects(
      audit(
        h,
        f,
        rows.filter((r) => r.seq !== seq),
        w,
      ),
    );
  await assert.rejects(
    audit(
      h,
      f,
      rows.filter((r) => r.kind !== 'update'),
      w,
    ),
    /coverage/,
  );
  const altered = fullRecords(f);
  altered[1].kind = 'outbound';
  assert.throws(() => h.inspectInbound(altered, f.route, context(f)), /misplaced/);
  report('union', {
    events: w.events,
    witness: w,
    accepted: 1,
    received: 1,
    conflict: true,
    missingEventsRefused: 8,
    missingContentRefused: true,
    expiredStoredRequests: 'reauthenticated',
  });
});
test('chain binds raw previous hash, u32 big-endian length and exact event bytes; count is checked separately', async () => {
  const e = bytes(hex(json(ds[2].values))),
    before = { events: 7, hash: '91'.repeat(32) },
    b = chainPayload(before.hash, e),
    result = await h.extendSpoolWitness(before, e, crypto.subtle);
  assert.equal(result.hash, hash(b));
  assert.equal(result.events, 8);
  for (const position of [0, 27, 58, b.length - 1]) {
    const changed = Buffer.from(b);
    changed[position] ^= 1;
    assert.notEqual(hash(changed), result.hash);
  }
  const size = Buffer.byteLength('done/account-spool-chain/v1\0');
  assert.equal(b.readUInt32BE(size + 32), e.length);
  assert.deepEqual(b.subarray(size, size + 32), Buffer.from(before.hash, 'hex'));
  const parts = [
    b.subarray(0, size),
    b.subarray(size, size + 32),
    b.subarray(size + 32, size + 36),
    b.subarray(size + 36),
  ];
  for (let i = 0; i < parts.length; i++) {
    const altered = parts.map((p) => Buffer.from(p));
    altered[i][0] ^= 1;
    assert.notEqual(hash(Buffer.concat(parts)), hash(Buffer.concat(altered)));
    assert.deepEqual(
      Buffer.concat(parts.filter((_, j) => i !== j)),
      Buffer.concat(altered.filter((_, j) => i !== j)),
    );
  }
  assert.equal(
    (await h.extendSpoolWitness({ ...before, events: 0 }, e, crypto.subtle)).hash,
    result.hash,
  );
  await assert.rejects(
    h.extendSpoolWitness({ ...before, events: Number.MAX_SAFE_INTEGER }, e, crypto.subtle),
  );
  await h.verifySpoolWitness({ events: [] }, { v: 1 }, crypto.subtle);
  await assert.rejects(h.verifySpoolWitness({ events: [e] }, { v: 1 }, crypto.subtle));
  report('chain', {
    messageHex: hex(b),
    result,
    omissionWitnesses: parts.length,
    countInHash: false,
  });
});
test('200 shrinking-enabled generated spool histories compare retained prefixes, retries and omission faults to an independent ledger', async () => {
  let runs = 0,
    events = 0;
  const traces = [];
  const result = await fc.check(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 5 }),
      fc.boolean(),
      fc.nat(),
      async (counts, unfinished, pick) => {
        const expected = history(f, counts, unfinished),
          rows = expected.records,
          signer = await publicKey(f),
          s = h.inspectSpool([...rows].reverse(), f.route);
        assert.equal(s.attempts, expected.attempts);
        assert.deepEqual(
          s.positions.map((p) => ({
            position: p.position,
            attempts: p.attempts,
            wire: p.wire ? hex(p.wire) : undefined,
          })),
          expected.positions,
        );
        await h.verifySpool(s, f.route, bytes(f.kg), signer, crypto.subtle);
        await h.verifySpoolWitness(s, { v: 2, spool: expected.witness }, crypto.subtle);
        const candidates = rows.filter(
          (r) =>
            r.kind === 'heads' ||
            JSON.parse(new TextDecoder().decode(r.bytes))[0] === 'done/account-spool/v1',
        );
        const removed = candidates[pick % candidates.length];
        await assert.rejects(async () => {
          const broken = h.inspectSpool(
            rows.filter((r) => r !== removed),
            f.route,
          );
          await h.verifySpoolWitness(broken, { v: 2, spool: expected.witness }, crypto.subtle);
        });
        await assert.rejects(
          h.verifySpoolWitness(
            s,
            { v: 2, spool: { ...expected.witness, hash: 'ff'.repeat(32) } },
            crypto.subtle,
          ),
        );
        // Honest partial prefixes reconstruct with their matching witness. Coordinated rollback is outside this mechanism.
        const end = removed.seq - 1,
          partial = rows.filter((r) => r.seq <= end),
          p = h.inspectSpool(partial, f.route);
        await h.verifySpoolWitness(p, { v: 2, spool: fold(p.events) }, crypto.subtle);
        events += s.events.length;
        runs++;
        traces.push({
          counts,
          unfinished,
          removedSeq: removed.seq,
          events: s.events.length,
          witness: expected.witness,
        });
      },
    ),
    { numRuns: 200, seed: 5110917 },
  );
  report('properties', {
    ...result,
    errorInstance: result.errorInstance ? String(result.errorInstance) : null,
    runs,
    events,
    traces,
  });
  assert.equal(result.failed, false, String(result.errorInstance));
});
