import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hkdfSync } from 'node:crypto';
import fc from 'fast-check';
import { load } from './runtime.mjs';
import {
  fixture,
  record,
  stages,
  bytes,
  hex,
  message,
  payload,
  key,
  mac,
  info,
  lp,
  lineageFields,
  paths,
  at,
  replace,
  omit,
  change,
  reverse,
  hash,
} from './oracle.mjs';
const h = await load(),
  f = fixture(),
  corpus = JSON.parse(readFileSync('test/vectors/account-promotion.json'));
export function report(name, value) {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
}
const authentic = async (r) => {
  const signed = await h.signPromotion(bytes(f.root), r, crypto.subtle);
  assert.equal(hex(signed.mac), mac(key(f.root, r), message(r)));
  return signed;
};
test('all thirteen accepted stage/version carriers match independent bytes and WebCrypto MACs', async () => {
  const cases = [];
  for (const [v, stage] of stages) {
    const r = record(f, v, stage),
      vector = corpus.vectors.find((x) => x.stage === stage),
      parsed = h.parsePromotion(r);
    assert.equal(hex(h.promotionPayload(parsed)), vector.expected.messageHex);
    assert.equal(hex((await authentic(r)).mac), vector.expected.resultHex);
    const k = await h.macKey(bytes(f.root), r, crypto.subtle);
    assert.equal(k.extractable, false);
    assert.deepEqual(k.usages, ['sign', 'verify']);
    assert.equal(
      await crypto.subtle.verify(
        'HMAC',
        k,
        bytes(vector.expected.resultHex),
        bytes(vector.expected.messageHex),
      ),
      true,
    );
    for (const n of [0, 1, 31, 33, 64])
      assert.throws(() => h.parsePromotion({ ...r, mac: new Uint8Array(n) }));
    cases.push({
      v,
      stage,
      payloadBytes: vector.expected.messageHex.length / 2,
      mac: vector.expected.resultHex,
    });
  }
  report('fixed', cases);
});
test('every input leaf is bound or rejected, including all nested signatures and empty arrays', async () => {
  let bound = 0,
    refused = 0;
  for (const [v, stage] of stages) {
    const r = record(f, v, stage),
      signed = await authentic(r),
      k = await h.macKey(bytes(f.root), r, crypto.subtle);
    const outcomes = [];
    for (const p of paths(r).filter((p) => p[0] !== 'mac')) {
      const changed = replace(signed, p, change(at(r, p)));
      let parsed;
      try {
        parsed = h.parsePromotion(changed);
      } catch {
        refused++;
        outcomes.push({ path: p, result: 'parser-refusal' });
        continue;
      }
      const b = h.promotionPayload(parsed);
      assert.notEqual(hex(b), hex(message(r)), stage + ': ' + p.join('.'));
      assert.equal(
        await crypto.subtle.verify('HMAC', k, signed.mac, b),
        false,
        stage + ': ' + p.join('.'),
      );
      bound++;
      outcomes.push({ path: p, result: 'old-mac-refuses' });
    }
    report('leaves-' + stage, outcomes);
  }
  report('input-bindings', { bound, refused, total: bound + refused });
});
test('encoded omissions demonstrably remove each binding while real HMACs still run', () => {
  let total = 0;
  for (const [v, stage] of stages) {
    const r = record(f, v, stage),
      body = payload(r),
      k = key(f.root, r),
      vector = corpus.vectors.find((x) => x.stage === stage);
    for (const c of vector.encodedBindingControls) {
      const original = c.matrix === 'pending.' ? JSON.parse(body[7]) : body;
      const encode = (b) => {
        if (c.matrix !== 'pending.') return Buffer.from(JSON.stringify(b));
        const a = structuredClone(body);
        a[7] = JSON.stringify(b);
        return Buffer.from(JSON.stringify(a));
      };
      const changed = replace(original, c.path, change(at(original, c.path)));
      assert.notEqual(mac(k, encode(original)), mac(k, encode(changed)));
      const omitted = encode(omit(original, c.path));
      assert.equal(hash(omitted), c.omittedMessageHash);
      assert.deepEqual(omitted, encode(omit(changed, c.path)));
      assert.equal(mac(k, omitted), mac(k, encode(omit(changed, c.path))));
      total++;
    }
  }
  report('encoded-omissions', {
    total,
    cryptography: 'Node HMAC-SHA256, actual omitted encodings',
  });
});
test('closed parser, version/stage matrix, credentials and handoff correspondence boundaries', () => {
  let refused = 0;
  const base = record(f, 9, 'account-receiving');
  for (let v = 0; v <= 10; v++)
    for (const [, stage] of stages) {
      const r = record(f, v, stage),
        valid = stages.some(([version, s]) => version === v && s === stage);
      if (valid) h.parsePromotion(r);
      else {
        assert.throws(() => h.parsePromotion(r));
        refused++;
      }
    }
  for (const p of paths(base)) {
    assert.throws(() => h.parsePromotion(omit(base, p)), p.join('.'));
    refused++;
  }
  for (const p of [
    [],
    ['source'],
    ['pin'],
    ['account'],
    ['genesis'],
    ['admission'],
    ['handoff'],
    ['handoff', 'destination'],
  ]) {
    const r = structuredClone(base);
    at(r, p).extra = true;
    assert.throws(() => h.parsePromotion(r));
    refused++;
  }
  for (const r of [
    { ...base, credentialIds: [base.credentialIds[0], base.credentialIds[0]] },
    { ...base, credentials: [...base.credentials].reverse() },
    { ...base, credentials: base.credentials.slice(0, 1) },
    { ...base, sealReserved: 4 },
    { ...base, sealReserved: 2 ** 32 },
    { ...base, sealReserved: 5.5 },
    replace(base, ['handoff', 'destination', 'unlockBinding', 'bindingSignature'], 'ff'.repeat(64)),
    replace(base, ['source', 'slotId'], '\ud800'),
    replace(base, ['source', 'slotId'], 'a'.repeat(1025)),
  ]) {
    assert.throws(() => h.parsePromotion(r));
    refused++;
  }
  report('parser', { refused });
});
test('property order is canonical except the retained handoff destination; array order remains significant', async () => {
  const results = [];
  for (const [v, stage] of stages) {
    const r = record(f, v, stage),
      reordered = reverse(r),
      a = await authentic(r);
    if (v >= 4) {
      assert.throws(() => h.parsePromotion(reordered), /Handoff binding differs/);
      reordered.handoff.destination.unlockBinding = structuredClone(
        r.handoff.destination.unlockBinding,
      );
      assert.notEqual(hex(h.promotionPayload(h.parsePromotion(reordered))), hex(message(r)));
      reordered.handoff.destination = structuredClone(r.handoff.destination);
    }
    assert.equal(hex(h.promotionPayload(h.parsePromotion(reordered))), hex(message(r)));
    assert.equal(h.equalPromotion(a, { ...reordered, mac: a.mac }), true);
    assert.equal(h.equalPromotion(a, { ...a, mac: bytes('ff'.repeat(32)) }), false);
    if (v >= 2) {
      const actors = structuredClone(r);
      actors.genesis.actors.reverse();
      assert.throws(() => h.parsePromotion(actors), /Unordered genesis actors/);
    }
    results.push({
      stage,
      reconstructedObjects: 'same bytes',
      destination: v >= 4 ? 'order preserved, changed MAC' : 'absent',
    });
  }
  report('ordering', results);
});
test('KDF context and deterministic names bind their exact fields without becoming authority', async () => {
  const r = record(f, 1, 'prepared'),
    k = key(f.root, r),
    challenge = bytes('ab'.repeat(17));
  const runtime = await h.macKey(bytes(f.root), r, crypto.subtle);
  assert.equal(hex(await crypto.subtle.sign('HMAC', runtime, challenge)), mac(k, challenge));
  for (const field of ['slotId', 'principalId', 'workspaceId', 'rootId']) {
    const next = replace(r, ['source', field], change(r.source[field]));
    const changed = await h.macKey(bytes(f.root), next, crypto.subtle);
    assert.equal(
      hex(await crypto.subtle.sign('HMAC', changed, challenge)),
      mac(key(f.root, next), challenge),
    );
    assert.notDeepEqual(key(f.root, next), k);
  }
  for (const field of ['storeId', 'genesisIntentId', 'generation']) {
    const next = replace(r, ['source', field], change(r.source[field]));
    assert.deepEqual(key(f.root, next), k);
    assert.notEqual(mac(k, message(next)), mac(k, message(r)));
  }
  assert.notDeepEqual(key('ff'.repeat(32), r), k);
  assert.notDeepEqual(Buffer.from(hkdfSync('sha256', bytes(f.root), bytes('01'), info(r), 32)), k);
  assert.notDeepEqual(
    Buffer.from(hkdfSync('sha256', bytes(f.root), bytes(''), lp('wrong-purpose'), 32)),
    k,
  );
  for (const id of ['promotion-lineage', 'promotion-attempt']) {
    const v = corpus.vectors.find((x) => x.id === id);
    const result =
      id === 'promotion-lineage'
        ? await h.promotionLineage(f.pin, f.account.accountId, {
            ...f.source,
            slotId: 'Local-main',
          })
        : await h.retryDigest(f.retryKey);
    assert.equal(result, v.expected.resultHex);
    for (const n of v.negatives) {
      const changed = [...v.fields];
      changed[n.index] = change(changed[n.index]);
      assert.notEqual(hash(lp(...changed)), result);
    }
  }
  for (const path of [
    ['pin', 'serviceId'],
    ['pin', 'authRoot'],
    ['account', 'accountId'],
    ...['slotId', 'principalId', 'workspaceId', 'storeId', 'rootId', 'genesisIntentId'].map((k) => [
      'source',
      k,
    ]),
  ]) {
    const input = {
      pin: structuredClone(f.pin),
      account: structuredClone(f.account),
      source: { ...f.source, slotId: 'Local-main' },
    };
    const changed = replace(input, path, change(at(input, path)));
    const fields = [
      'done/promotion-lineage/v1',
      changed.pin.serviceId,
      changed.pin.authRoot,
      changed.account.accountId,
      ...['slotId', 'principalId', 'workspaceId', 'storeId', 'rootId', 'genesisIntentId'].map(
        (k) => changed.source[k],
      ),
    ];
    assert.equal(
      await h.promotionLineage(changed.pin, changed.account.accountId, changed.source),
      hash(lp(...fields)),
    );
    assert.notEqual(hash(lp(...fields)), hash(lp(...lineageFields(f))));
  }
  assert.equal(
    await h.retryDigest(change(f.retryKey)),
    hash(lp('done/promotion-attempt/v1', change(f.retryKey))),
  );
  assert.equal(
    await h.promotionLineage(
      { ...f.pin, origin: 'https://else.invalid', rpId: 'else.invalid' },
      f.account.accountId,
      { ...f.source, slotId: 'Local-main', generation: 2 },
    ),
    hash(lp(...lineageFields(f))),
  );
  assert.throws(() => h.promotionLineage(f.pin, f.account.accountId, f.source), /Non-ASCII/);
  assert.notEqual(hash(lp('ab', 'c')), hash(lp('a', 'bc')));
  assert.notEqual(hash(lp('é')), hash(lp('e\u0301')));
  report('identities', {
    kdfInfo: hex(info(r)),
    key: hex(k),
    lineage: hash(lp(...lineageFields(f))),
    attempt: await h.retryDigest(f.retryKey),
    omittedFromLineage: ['pin.v', 'pin.origin', 'pin.rpId', 'source.generation'],
  });
});
test('200 shrinking-enabled generated authentication histories preserve the last accepted marker', async () => {
  let runs = 0,
    operations = 0;
  const observed = [];
  const result = await fc.check(
    fc.asyncProperty(
      fc.integer({ min: 0, max: stages.length - 1 }),
      fc.array(
        fc.record({ op: fc.constantFrom('commit', 'tamper', 'reopen', 'reorder'), pick: fc.nat() }),
        { minLength: 2, maxLength: 12 },
      ),
      async (i, commands) => {
        const [v, stage] = stages[i];
        let retained = await authentic(record(f, v, stage)),
          expected = hex(retained.mac);
        const k = await h.macKey(bytes(f.root), retained, crypto.subtle);
        for (const c of commands) {
          operations++;
          if (c.op === 'commit') {
            retained = await authentic({
              ...retained,
              id: (c.pick % 256).toString(16).padStart(2, '0').repeat(16),
            });
            expected = hex(retained.mac);
          }
          if (c.op === 'reopen') {
            retained = h.parsePromotion(structuredClone(retained));
            assert.equal(hex(retained.mac), expected);
            assert.equal(
              await crypto.subtle.verify('HMAC', k, retained.mac, h.promotionPayload(retained)),
              true,
            );
          }
          if (c.op === 'tamper') {
            const leaves = paths(retained).filter((p) => p[0] !== 'mac'),
              p = leaves[c.pick % leaves.length],
              candidate = replace(retained, p, change(at(retained, p)));
            let parsed;
            try {
              parsed = h.parsePromotion(candidate);
            } catch {
              continue;
            }
            assert.equal(
              await crypto.subtle.verify('HMAC', k, retained.mac, h.promotionPayload(parsed)),
              false,
            );
          }
          if (c.op === 'reorder') {
            const candidate = reverse(retained);
            if (v >= 4) candidate.handoff.destination = retained.handoff.destination;
            assert.equal(h.equalPromotion(retained, h.parsePromotion(candidate)), true);
          }
        }
        observed.push({ v, stage, commands, finalMac: expected });
        runs++;
      },
    ),
    { numRuns: 200, seed: 5110916 },
  );
  report('properties', {
    ...result,
    errorInstance: result.errorInstance ? String(result.errorInstance) : null,
    runs,
    operations,
    histories: observed,
  });
  assert.equal(result.failed, false, String(result.errorInstance));
});
