import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './runtime.mjs';
import {
  fixture,
  bytes,
  hex,
  json,
  sourceValues,
  spoolValues,
  history,
  fold,
  makeEnvelope,
  hash,
} from './oracle.mjs';
import { encode, envelopeParts } from '../account-transport-contract/oracle.mjs';
import { report, publicKey, fullRecords, context, audit } from './helpers.mjs';
const h = await load(),
  f = fixture();
test('removing exact capsule identity consistency accepts two different original payloads under one ID', async () => {
  const a = { kind: 'outbound', seq: 1, gen: 1, bytes: bytes(hex(json(sourceValues(f.capsule)))) };
  const altered = structuredClone(f.capsule);
  altered.sources[0].bytes = f.updates[1];
  const b = { ...a, seq: 2, bytes: bytes(hex(json(sourceValues(altered)))) };
  assert.throws(() => h.captureCatalog([a, b], f.route), /Conflicting source/);
  const mutant = await load('source');
  assert.equal(hex(mutant.captureCatalog([a, b], f.route).get(f.capsule.id)), hex(b.bytes));
  report('control-source', {
    baseline: 'refused',
    mutant: 'accepted conflicting capsule identity',
  });
});
test('real source-digest and envelope-body omissions rescue separately signed and encrypted semantic substitutions', async () => {
  const make = () => history(f, [1]);
  const a = make(),
    pos = JSON.parse(new TextDecoder().decode(a.records[1].bytes));
  pos[9][2] = 'ff'.repeat(32);
  a.records[1].bytes = bytes(hex(json(pos)));
  const s = h.inspectSpool(a.records, f.route),
    signer = await publicKey(f);
  await assert.rejects(
    h.verifySpool(s, f.route, bytes(f.kg), signer, crypto.subtle),
    /Referenced source changed/,
  );
  await (await load('sourceHash')).verifySpool(s, f.route, bytes(f.kg), signer, crypto.subtle);
  const b = make(),
    env = makeEnvelope(f, 1, f.updates[1], 'af'.repeat(12)),
    entry = { type: 'envelope', position: 1, attempt: 1, wire: hex(encode(envelopeParts(env))) };
  b.records.at(-1).bytes = bytes(hex(json(spoolValues(f.route, entry))));
  const wrong = h.inspectSpool(b.records, f.route);
  await assert.rejects(
    h.verifySpool(wrong, f.route, bytes(f.kg), signer, crypto.subtle),
    /Persisted envelope source differs/,
  );
  await (
    await load('envelopeSource')
  ).verifySpool(wrong, f.route, bytes(f.kg), signer, crypto.subtle);
  report('control-source-authentication', {
    digest: { baseline: 'refused', mutant: 'accepted' },
    envelope: {
      validSignature: true,
      validAEAD: true,
      baseline: 'different original refused',
      mutant: 'accepted',
    },
  });
});
test('count has two effective checks; hash and count omissions separately weaken completeness', async () => {
  const e = history(f, [1, 2]),
    s = h.inspectSpool(e.records, f.route),
    wrongCount = { v: 2, spool: { ...e.witness, events: e.witness.events + 1 } };
  await assert.rejects(h.verifySpoolWitness(s, wrongCount, crypto.subtle), /incomplete/);
  await assert.rejects(
    (await load('witnessCount')).verifySpoolWitness(s, wrongCount, crypto.subtle),
    /commitment/,
  );
  await (await load('witnessCountBoth')).verifySpoolWitness(s, wrongCount, crypto.subtle);
  const wrongHash = { v: 2, spool: { ...e.witness, hash: 'ff'.repeat(32) } };
  await assert.rejects(h.verifySpoolWitness(s, wrongHash, crypto.subtle), /commitment/);
  await (await load('witnessHash')).verifySpoolWitness(s, wrongHash, crypto.subtle);
  report('control-witness', {
    countPrecheckOmitted: 'still refused by final pair comparison',
    bothCountChecksOmitted: 'accepted wrong count',
    hashCheckOmitted: 'accepted wrong hash',
  });
});
test('delivery ordering and received-content coverage controls accept otherwise authentic but invalid histories', async () => {
  const records = fullRecords(f, false),
    submission = records.splice(5, 1)[0];
  records.splice(1, 0, submission);
  records.forEach((r, i) => (r.seq = i + 1));
  const c = h.inspectInbound(records, f.route, context(f));
  await assert.rejects(
    h.verifyDelivery(c.delivery, f.route, f.authority, await publicKey(f), crypto.subtle),
    /Delivery precedes/,
  );
  const state = await (
    await load('delivery')
  ).verifyDelivery(c.delivery, f.route, f.authority, await publicKey(f), crypto.subtle);
  assert.equal(state.acceptedThrough, 1);
  const noContent = fullRecords(f, false).filter((r) => r.kind !== 'update'),
    census = h.inspectInbound(noContent, f.route, context(f));
  const w = fold(census.delivery.spool.events);
  await assert.rejects(audit(h, f, noContent, w), /coverage/);
  const accepted = await audit(await load('coverage'), f, noContent, w);
  assert.equal(accepted.received.prefix.position, 1);
  report('control-semantic-order', {
    delivery: 'source guard removal accepts signed submission before persisted envelope',
    coverage: 'coverage call omission accepts valid signed receive evidence with no disk content',
    witness: w,
  });
});
test('omitting raw previous-hash bytes in the actual digest input aliases otherwise distinct witness histories', async () => {
  const entry = bytes(hex(json(sourceValues(f.capsule)))),
    a = { events: 1, hash: 'aa'.repeat(32) },
    b = { events: 1, hash: 'bb'.repeat(32) };
  assert.notEqual(
    (await h.extendSpoolWitness(a, entry, crypto.subtle)).hash,
    (await h.extendSpoolWitness(b, entry, crypto.subtle)).hash,
  );
  let calls = 0;
  const domainLength = Buffer.byteLength('done/account-spool-chain/v1\0');
  const mutant = {
    digest: async (alg, input) => {
      calls++;
      const raw = Buffer.from(input);
      return crypto.subtle.digest(
        alg,
        Buffer.concat([raw.subarray(0, domainLength), raw.subarray(domainLength + 32)]),
      );
    },
  };
  const left = await h.extendSpoolWitness(a, entry, mutant),
    right = await h.extendSpoolWitness(b, entry, mutant);
  assert.equal(left.hash, right.hash);
  assert.equal(calls, 2);
  report('control-chain', {
    baseline: 'different commitments',
    omittedPrevious: 'same commitment',
    nativeDigestCalls: calls,
    result: left.hash,
    unmodifiedEventHash: hash(entry),
  });
});
