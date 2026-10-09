import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from './runtime.mjs';
import {
  corpus,
  fixtures,
  scope,
  kg,
  bytes,
  hex,
  lp,
  key,
  name,
  storageKey,
  recordAAD,
  journalAAD,
  aes,
  xseal,
  encode,
} from './oracle.mjs';
export const report = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
};
const h = await load();
const nativeKey = async (s, secret = kg) =>
  h.hkdf(
    bytes(secret),
    new Uint8Array(),
    h.fields('done/store/v1', s.workspaceId, s.storeId),
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
  );
const crypt = async (mode, k, n, a, p) =>
  new Uint8Array(
    await crypto.subtle[mode]({ name: 'AES-GCM', iv: n, additionalData: a, tagLength: 128 }, k, p),
  );

test('independent fixed corpus agrees with names, HKDF, record AEAD and synchronous WASM carrier bytes', async () => {
  const vectors = corpus().vectors;
  for (const v of vectors) {
    if (v.kind === 'digest') {
      assert.equal(
        await h.deriveStoreName(v.input.principalId, v.input.workspaceId),
        v.expected.name,
      );
      for (const n of v.negatives) {
        const actual = await h.deriveStoreName(n.scope.principalId, n.scope.workspaceId);
        assert.equal(actual, n.name);
        assert.notEqual(actual, v.expected.name);
      }
      continue;
    }
    if (v.kind === 'kdf') {
      if (v.id === 'journal-key')
        assert.equal(
          hex(await h.deriveJournalKey(bytes(kg), scope.workspaceId)),
          v.expected.resultHex,
        );
      else {
        const k = await nativeKey(scope);
        assert.equal(k.extractable, false);
        assert.deepEqual(k.usages, ['encrypt', 'decrypt']);
        assert.equal(
          hex(await crypt('encrypt', k, new Uint8Array(12), new Uint8Array(), new Uint8Array())),
          hex(aes(key(scope), new Uint8Array(12), new Uint8Array(), new Uint8Array())),
        );
      }
      for (const n of v.negatives) {
        assert.notEqual(n.resultHex, v.expected.resultHex);
        if (v.id === 'journal-key')
          assert.equal(
            hex(await h.deriveJournalKey(bytes(n.kg), n.scope.workspaceId)),
            n.resultHex,
          );
        else
          assert.equal(
            hex(
              await crypt(
                'encrypt',
                await nativeKey(n.scope, n.kg),
                new Uint8Array(12),
                new Uint8Array(),
                new Uint8Array(),
              ),
            ),
            hex(aes(bytes(n.resultHex), new Uint8Array(12), new Uint8Array(), new Uint8Array())),
          );
      }
      continue;
    }
    const f = v.input,
      n = bytes(f.nonce),
      p = bytes(f.plaintext);
    if (f.family === 'record') {
      const k = await nativeKey(f.scope, f.kg),
        aad = h.recordAAD(f.scope, f.record);
      assert.equal(hex(aad), v.expected.messageHex);
      assert.equal(hex(await crypt('encrypt', k, n, aad, p)), v.expected.resultHex);
      assert.equal(
        hex(await crypt('decrypt', k, n, aad, bytes(v.expected.resultHex))),
        f.plaintext,
      );
    } else {
      assert.equal(
        hex(h.journalAAD(f.scope.workspaceId, f.gen, f.storageKey)),
        v.expected.messageHex,
      );
      const c = h.createJournalCodec(
        f.scope.workspaceId,
        f.gen,
        await h.deriveJournalKey(bytes(f.kg), f.scope.workspaceId),
      );
      try {
        assert.equal(c.seal(f.storageKey, n, p), v.expected.carrier);
        assert.equal(hex(c.open(f.storageKey, v.expected.carrier).bytes), f.plaintext);
      } finally {
        c.dispose();
      }
    }
  }
  report('fixed', { vectors: vectors.length, productionExtractable: false, actualWasm: true });
});

test('unchanged inherited row 2 and stored-record subset of row 3 match the independent oracle and current runtime', async () => {
  let records = 0,
    journals = 0;
  for (const v of JSON.parse(readFileSync('test/vectors/record-format.json')).vectors.filter(
    (v) => v.expected.stored_record,
  )) {
    const i = v.inputs,
      s = { principalId: i.principal_id, workspaceId: i.workspace_id, storeId: i.store_id },
      r = { v: 1, gen: i.gen, seq: i.seq, kind: i.kind };
    assert.equal(hex(recordAAD(s, r)), v.derived.aad);
    assert.equal(hex(h.recordAAD(s, r)), v.derived.aad);
    assert.equal(
      hex(aes(key(s, i.k_g), bytes(i.nonce), recordAAD(s, r), bytes(i.plaintext))),
      v.expected.ct,
    );
    assert.equal(
      hex(
        await crypt(
          'encrypt',
          await nativeKey(s, i.k_g),
          bytes(i.nonce),
          h.recordAAD(s, r),
          bytes(i.plaintext),
        ),
      ),
      v.expected.ct,
    );
    records++;
  }
  for (const v of JSON.parse(readFileSync('test/vectors/journal-aead.json')).vectors) {
    const i = v.inputs,
      s = { workspaceId: i.workspace_id },
      k = key(s, i.k_g, true),
      aad = journalAAD(s, i.gen, i.journal_storage_key);
    assert.equal(hex(k), v.derived.k_journal);
    assert.equal(hex(aad), v.derived.aad);
    assert.equal(
      encode(i.gen, bytes(i.nonce), xseal(k, bytes(i.nonce), aad, bytes(i.plaintext))),
      v.expected.record,
    );
    const c = h.createJournalCodec(
      i.workspace_id,
      i.gen,
      await h.deriveJournalKey(bytes(i.k_g), i.workspace_id),
    );
    try {
      assert.equal(
        c.seal(i.journal_storage_key, bytes(i.nonce), bytes(i.plaintext)),
        v.expected.record,
      );
    } finally {
      c.dispose();
    }
    journals++;
  }
  report('inherited', {
    records,
    journals,
    sourcePins: corpus().inherited,
    envelopes: 'deferred',
    wasm: 'existing generated blob, no rebuild',
  });
});

test('every AAD field binds with held keys; omission witnesses retain real authenticated encryption', async () => {
  let bound = 0,
    omissions = 0;
  for (const v of corpus().vectors.filter((v) => v.kind === 'aead')) {
    const f = v.input,
      j = f.family === 'journal',
      k = key(f.scope, f.kg, j),
      nk = j ? null : await nativeKey(f.scope, f.kg),
      n = bytes(f.nonce),
      p = bytes(f.plaintext);
    for (const m of v.negatives) {
      if (j) {
        // Use actual WASM directly via codec's production AAD seam. Keep key fixed to isolate AAD.
        const fields = m.fields;
        // Arbitrary label/version/decimal mutations are exercised with WebAssembly's primitive wrapper below.
        const { createJournalSeal } = await import('../../wasm/journal-seal/seal.generated.ts');
        const w = createJournalSeal();
        try {
          assert.throws(() => w.open(k, n, lp(...fields), bytes(v.expected.resultHex)));
        } finally {
          w.dispose();
        }
      } else
        await assert.rejects(
          crypt('decrypt', nk, n, bytes(m.messageHex), bytes(v.expected.resultHex)),
        );
      bound++;
    }
    for (const m of v.encodedBindingControls) {
      assert.equal(m.omittedHex, m.changedOmittedHex);
      const aad = bytes(m.omittedHex);
      if (j) {
        const { createJournalSeal } = await import('../../wasm/journal-seal/seal.generated.ts');
        const w = createJournalSeal();
        try {
          const ct = w.seal(k, n, aad, p);
          assert.equal(hex(w.open(k, n, bytes(m.changedOmittedHex), ct)), f.plaintext);
          assert.throws(() => w.open(k, n, bytes(v.expected.messageHex), ct));
        } finally {
          w.dispose();
        }
      } else {
        const ct = await crypt('encrypt', nk, n, aad, p);
        assert.equal(
          hex(await crypt('decrypt', nk, n, bytes(m.changedOmittedHex), ct)),
          f.plaintext,
        );
        await assert.rejects(crypt('decrypt', nk, n, bytes(v.expected.messageHex), ct));
      }
      omissions++;
    }
  }
  report('bindings', { bound, omissions });
});

test('carrier parsers enforce closed shape, safe integers, canonical base64 and maximum admitted plaintext', async () => {
  const f = fixtures()[0],
    r = { ...f.record, nonce: bytes(f.nonce), ct: new Uint8Array(16) };
  let refusals = 0;
  for (const field of Object.keys(r)) {
    const m = { ...r };
    delete m[field];
    assert.throws(() => h.parseStoredRecord(m), { code: 'repair-required' });
    refusals++;
  }
  for (const m of [
    null,
    [],
    Object.create(null),
    { ...r, extra: 1 },
    { ...r, v: 2 },
    { ...r, gen: 0 },
    { ...r, seq: NaN },
    { ...r, seq: 2 ** 53 },
    { ...r, kind: 'unknown' },
    { ...r, nonce: new Uint8Array(13) },
    { ...r, ct: new Uint8Array(15) },
  ]) {
    assert.throws(() => h.parseStoredRecord(m), { code: 'repair-required' });
    refusals++;
  }
  const parsed = h.parseStoredRecord(r);
  r.nonce.fill(9);
  r.ct.fill(9);
  assert.notEqual(parsed.nonce[0], 9);
  assert.notEqual(parsed.ct[0], 9);
  const c = h.createJournalCodec(scope.workspaceId, 1, key(scope, kg, true)),
    sk = storageKey(scope),
    n = new Uint8Array(24),
    v = c.seal(sk, n, new Uint8Array());
  try {
    const raw = Buffer.from(v.slice(2), 'base64'),
      alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
      at = v.length - 2,
      alias = v.slice(0, at) + alphabet[alphabet.indexOf(v[at]) + 1] + v.slice(at + 1);
    for (const m of [
      null,
      '1:' + v.slice(2),
      v + '\n',
      v.slice(0, -1),
      alias,
      '2:' + Buffer.concat([Buffer.alloc(4), raw.subarray(4)]).toString('base64'),
      '2:' + Buffer.alloc(43).toString('base64'),
      '2:' + Buffer.alloc(16429).toString('base64'),
    ]) {
      assert.throws(() => h.decodeJournal(m), { code: 'repair-required' });
      refusals++;
    }
    assert.deepEqual(h.decodeJournal(v).nonce, n);
    assert.equal(c.open(sk, c.seal(sk, n, new Uint8Array(16384))).bytes.length, 16384);
    assert.throws(() => c.seal(sk, n, new Uint8Array(16385)), { code: 'invalid-input' });
    assert.throws(() => c.open(sk + 'x', v), { code: 'repair-required' });
    for (const offset of [4, 28, raw.length - 1]) {
      const m = Buffer.from(raw);
      m[offset] ^= 1;
      assert.throws(() => c.open(sk, '2:' + m.toString('base64')), { code: 'repair-required' });
    }
    const m = Buffer.from(raw);
    m.writeUInt32BE(2);
    assert.throws(() => c.open(sk, '2:' + m.toString('base64')), { code: 'repair-required' });
    assert.equal((await load('canonicalBase64')).decodeJournal(alias).generation, 1);
  } finally {
    c.dispose();
  }
  assert.throws(() => h.identity('\ud800'));
  assert.throws(() => h.fields('\ud800'));
  assert.throws(() => h.fields('x'.repeat(65536)));
  // Name helper has a broader typed domain; admitted custody rejects malformed Unicode first.
  assert.equal(await h.deriveStoreName('\ud800', 'w'), await h.deriveStoreName('\ufffd', 'w'));
  assert.notEqual(await h.deriveStoreName('é', 'w'), await h.deriveStoreName('e\u0301', 'w'));
  assert.notEqual(await h.deriveStoreName('ab', 'c'), await h.deriveStoreName('a', 'bc'));
  assert.equal(h.journalPrefix('name./ 🙂'), 'done.pending-update.name.%2F%20%F0%9F%99%82.');
  report('parsers', {
    refusals,
    maximumPlaintext: 16384,
    base64Omission: 'padding alias accepted only after canonicality guard removal',
    unicode: 'identity guard rejects malformed scalar input before custody owner',
  });
});

test('160 shrinking-enabled generated byte histories preserve cold-open bytes and reject moved identities and corruption', async () => {
  let histories = 0,
    steps = 0;
  const traces = [];
  const result = await fc.check(
    fc.asyncProperty(
      fc
        .array(fc.constantFrom('a', 'é', 'e\u0301', '🙂', '/', '.', '\u0000'), {
          minLength: 1,
          maxLength: 12,
        })
        .map((a) => a.join('')),
      fc.array(
        fc.record({
          plain: fc.uint8Array({ maxLength: 256 }),
          writer: fc.boolean(),
          gen: fc.integer({ min: 1, max: 65536 }),
          kind: fc.constantFrom('update', 'state', 'heads', 'outbound'),
        }),
        { minLength: 2, maxLength: 16 },
      ),
      async (ws, ops) => {
        const s = { ...scope, workspaceId: ws };
        assert.equal(await h.deriveStoreName(s.principalId, ws), name(s));
        const k = await nativeKey(s),
          jk = await h.deriveJournalKey(bytes(kg), ws);
        assert.equal(hex(jk), hex(key(s, kg, true)));
        for (const [i, op] of ops.entries()) {
          const sk = storageKey(s, op.writer ? '56'.repeat(16) : '34'.repeat(16), i + 1),
            n = new Uint8Array(24);
          new DataView(n.buffer).setUint32(20, i + 1);
          const c = h.createJournalCodec(ws, op.gen, jk),
            wire = c.seal(sk, n, op.plain);
          c.dispose();
          assert.equal(wire, encode(op.gen, n, xseal(jk, n, journalAAD(s, op.gen, sk), op.plain)));
          const cold = h.createJournalCodec(ws, op.gen, jk);
          try {
            assert.equal(hex(cold.open(sk, wire).bytes), hex(op.plain));
            assert.throws(() => cold.open(sk + 'x', wire), { code: 'repair-required' });
            const raw = Buffer.from(wire.slice(2), 'base64');
            raw[raw.length - 1] ^= 1;
            assert.throws(() => cold.open(sk, '2:' + raw.toString('base64')), {
              code: 'repair-required',
            });
          } finally {
            cold.dispose();
          }
          const r = { v: 1, gen: op.gen, seq: i + 1, kind: op.kind },
            ct = await crypt('encrypt', k, n.slice(12), h.recordAAD(s, r), op.plain);
          assert.equal(hex(ct), hex(aes(key(s), n.slice(12), recordAAD(s, r), op.plain)));
          const parsed = h.parseStoredRecord({ ...r, nonce: n.slice(12), ct });
          assert.equal(
            hex(await crypt('decrypt', k, parsed.nonce, h.recordAAD(s, parsed), parsed.ct)),
            hex(op.plain),
          );
          await assert.rejects(
            crypt('decrypt', k, parsed.nonce, h.recordAAD(s, { ...r, seq: r.seq + 1 }), ct),
          );
          steps++;
        }
        histories++;
        traces.push({ workspaceHex: hex(Buffer.from(ws)), operations: ops.length });
      },
    ),
    { seed: 5110919, numRuns: 160 },
  );
  report('properties', {
    ...result,
    errorInstance: result.errorInstance ? String(result.errorInstance) : null,
    histories,
    steps,
    traces,
  });
  assert.equal(result.failed, false, String(result.errorInstance));
});

test('source omissions lose record and journal bindings while real AES and WASM authentication remains operative', async () => {
  const evidence = [],
    f = fixtures()[1],
    k = await nativeKey(scope),
    n = bytes(f.nonce),
    p = bytes(f.plaintext);
  for (const control of ['principal', 'sequence', 'kind']) {
    const m = await load(control),
      s2 = control === 'principal' ? { ...scope, principalId: 'other' } : scope,
      r2 = {
        ...f.record,
        ...(control === 'sequence' ? { seq: 1 } : control === 'kind' ? { kind: 'outbound' } : {}),
      };
    const original = await crypt('encrypt', k, n, h.recordAAD(scope, f.record), p);
    await assert.rejects(crypt('decrypt', k, n, h.recordAAD(s2, r2), original));
    const weakened = await crypt('encrypt', k, n, m.recordAAD(scope, f.record), p);
    assert.equal(hex(await crypt('decrypt', k, n, m.recordAAD(s2, r2), weakened)), f.plaintext);
    evidence.push(control);
  }
  for (const control of ['journalWorkspace', 'journalGeneration', 'journalIdentity']) {
    const m = await load(control),
      jk = key(scope, kg, true),
      sk = storageKey(scope),
      nonce = new Uint8Array(24),
      ws2 = control === 'journalWorkspace' ? 'other' : scope.workspaceId,
      gen2 = control === 'journalGeneration' ? 2 : 1,
      sk2 = control === 'journalIdentity' ? sk + 'x' : sk;
    for (const runtime of [h, m]) {
      const a = runtime.createJournalCodec(scope.workspaceId, 1, jk),
        b = runtime.createJournalCodec(ws2, gen2, jk);
      try {
        let wire = a.seal(sk, nonce, p);
        if (gen2 !== 1) {
          const raw = Buffer.from(wire.slice(2), 'base64');
          raw.writeUInt32BE(gen2);
          wire = '2:' + raw.toString('base64');
        }
        if (runtime === h) assert.throws(() => b.open(sk2, wire), { code: 'repair-required' });
        else assert.equal(hex(b.open(sk2, wire).bytes), f.plaintext);
      } finally {
        a.dispose();
        b.dispose();
      }
    }
    evidence.push(control);
  }
  report('source-controls', {
    caught: evidence,
    crypto: 'operative; omission permits changed authenticated inputs',
  });
});
