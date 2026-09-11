import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { bundle } from './runtime.mjs';
import {
  key,
  keyInfo,
  hex,
  bytes,
  name,
  storageKey,
  recordAAD,
  journalAAD,
  openAES,
  xopen,
} from './oracle.mjs';
const scripts = {
  base: await bundle(undefined, true),
  custodyStore: await bundle('custodyStore', true),
};
const report = (n, v) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, n + '.json'),
      JSON.stringify(v, null, 2) + '\n',
    );
  }
};
async function fixture(t, control = 'base') {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Disposable store bridge</title>');
  });
  await new Promise((r, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', r);
  });
  t.after(() => new Promise((r) => server.close(r)));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage(),
    url = 'http://127.0.0.1:' + server.address().port;
  const cold = async () => {
    await page.goto(url);
    await page.evaluate(scripts[control]);
  };
  await cold();
  await page.evaluate(() => {
    window.keyTraces = [];
    for (const method of ['deriveKey', 'deriveBits']) {
      const original = crypto.subtle[method].bind(crypto.subtle);
      crypto.subtle[method] = async function (...args) {
        const result = await original(...args),
          alg = args[0],
          info = alg.info && new TextDecoder().decode(alg.info);
        if (info && (info.includes('done/store/v1') || info.includes('done/journal/v1')))
          keyTraces.push({
            method,
            info: [...alg.info],
            salt: [...alg.salt],
            ...(method === 'deriveKey'
              ? { extractable: result.extractable, usages: result.usages }
              : { bits: [...new Uint8Array(result)] }),
          });
        return result;
      };
    }
  });
  const saved = await page.evaluate(() => StoreContract.setup());
  return { page, cold, saved };
}
const invoke = (p, method) => p.evaluate((m) => StoreContract[m](), method);
function checkRaw(saved, raw) {
  assert.equal(raw.name, name(saved.scope));
  const k = key(saved.scope, saved.generation),
    jk = key(saved.scope, saved.generation, true);
  for (const r of raw.rows)
    assert.equal(
      hex(openAES(k, bytes(r.nonce), recordAAD(saved.scope, r), bytes(r.ct))),
      hex(new Uint8Array([['update', 'state', 'heads', 'outbound'].indexOf(r.kind), 0, 255, 1])),
    );
  const journalPlaintexts = [];
  for (const [sk, wire] of raw.journal) {
    const parts = sk.split('.'),
      writer = parts.at(-2),
      ordinal = Number(parts.at(-1));
    assert.match(writer, /^[a-f0-9]{32}$/);
    assert.equal(sk, storageKey(saved.scope, writer, ordinal));
    const b = Buffer.from(wire.slice(2), 'base64'),
      gen = b.readUInt32BE();
    assert.equal(gen, 1);
    journalPlaintexts.push(
      hex(xopen(jk, b.subarray(4, 28), journalAAD(saved.scope, gen, sk), b.subarray(28))),
    );
  }
  assert.deepEqual(
    journalPlaintexts.sort(),
    Array.from({ length: raw.journal.length }, (_, i) =>
      hex(new Uint8Array([20 + i, 0, 255])),
    ).sort(),
  );
}
test(
  'real factor-opened owners derive the specified keys and persist exact store and writer/ordinal journal bytes across reopen and flush',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t);
    await invoke(f.page, 'open');
    const receipts = await invoke(f.page, 'append');
    assert(receipts.every((r) => r.status === 'journalled'));
    const raw = await invoke(f.page, 'snapshot');
    checkRaw(f.saved, raw);
    assert.equal(raw.rows.length, 4);
    assert.equal(raw.journal.length, 2);
    const traces = await f.page.evaluate(() => keyTraces);
    assert(traces.some((t) => t.method === 'deriveBits'));
    assert(traces.some((t) => t.method === 'deriveKey'));
    for (const x of traces) {
      const j = x.method === 'deriveBits';
      assert.equal(hex(x.info), hex(keyInfo(f.saved.scope, j)));
      assert.deepEqual(x.salt, []);
      if (j) assert.equal(hex(x.bits), hex(key(f.saved.scope, f.saved.generation, true)));
      else {
        assert.equal(x.extractable, false);
        assert(['decrypt', 'encrypt,decrypt'].includes(x.usages.join(',')));
      }
    }
    assert(traces.some((x) => x.usages?.join(',') === 'encrypt,decrypt'));
    const before = await invoke(f.page, 'recover');
    await invoke(f.page, 'close');
    await f.cold();
    await f.page.evaluate((s) => StoreContract.configure(s), f.saved);
    await invoke(f.page, 'open');
    assert.deepEqual(await invoke(f.page, 'recover'), before);
    const third = await invoke(f.page, 'local');
    assert.equal(third.status, 'journalled');
    const after = await invoke(f.page, 'snapshot');
    checkRaw(f.saved, after);
    assert.equal(third.key.split('.').at(-1), '0000000000000001');
    assert.notEqual(third.key.split('.').at(-2), receipts[0].key.split('.').at(-2));
    const flushed = await invoke(f.page, 'flush');
    const recovered = await invoke(f.page, 'recover');
    assert.deepEqual(
      recovered.records.map((r) => r.bytes).sort(),
      [0, 1, 2, 3]
        .map((i) => hex(new Uint8Array([i, 0, 255, 1])))
        .concat([20, 21, 22].map((i) => hex(new Uint8Array([i, 0, 255]))))
        .sort(),
    );
    assert.equal((await invoke(f.page, 'snapshot')).journal.length, 0);
    await invoke(f.page, 'close');
    report('native-bytes', {
      records: raw.rows.length,
      journalEntries: after.journal.length,
      writerRestart: true,
      traces,
      flushed,
      syntheticScope: f.saved.scope,
    });
  },
);
test(
  'native cold recovery refuses changed record placement/header/tag and copied journal writer/ordinal/scope without deletion',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t);
    await invoke(f.page, 'open');
    await invoke(f.page, 'append');
    await invoke(f.page, 'close');
    const raw = await invoke(f.page, 'snapshot'),
      r = raw.rows[0],
      evidence = [];
    for (const [field, value] of [
      ['seq', 99],
      ['gen', 2],
      ['kind', 'state'],
      ['nonce', 'ff'.repeat(12)],
      ['ct', r.ct.slice(0, -2) + (r.ct.endsWith('00') ? '01' : '00')],
    ]) {
      await f.page.evaluate(
        ({ r, field, value }) => StoreContract.setRow({ ...r, [field]: value }, r.seq),
        { r, field, value },
      );
      const error = await f.page.evaluate(async () => {
        try {
          await StoreContract.open();
          await StoreContract.recover();
          return null;
        } catch (e) {
          return e.code;
        } finally {
          await StoreContract.close();
        }
      });
      assert.equal(error, 'repair-required', field);
      assert.equal((await invoke(f.page, 'snapshot')).rows.length, raw.rows.length);
      await f.page.evaluate((r) => StoreContract.setRow(r, r.seq), r);
      evidence.push(field);
    }
    const [sk, wire] = raw.journal[0],
      parts = sk.split('.');
    for (const [field, index, value] of [
      ['writer', parts.length - 2, 'ff'.repeat(16)],
      ['ordinal', parts.length - 1, '0000000000000042'],
      ['storeId', parts.length - 3, 'ff'.repeat(16)],
    ]) {
      const moved = parts.with(index, value).join('.');
      await f.page.evaluate(
        ({ sk, moved, wire }) => {
          localStorage.removeItem(sk);
          localStorage.setItem(moved, wire);
        },
        { sk, moved, wire },
      );
      const error = await f.page.evaluate(async () => {
        try {
          await StoreContract.open();
          await StoreContract.recover();
          return null;
        } catch (e) {
          return e.code;
        } finally {
          await StoreContract.close();
        }
      });
      assert.equal(error, 'repair-required', field);
      assert.equal(await f.page.evaluate((k) => localStorage.getItem(k), moved), wire);
      await f.page.evaluate(
        ({ sk, moved, wire }) => {
          localStorage.removeItem(moved);
          localStorage.setItem(sk, wire);
        },
        { sk, moved, wire },
      );
      evidence.push(field);
    }
    await invoke(f.page, 'open');
    assert.equal((await invoke(f.page, 'recover')).journal.length, 2);
    await invoke(f.page, 'close');
    report('native-refusals', { fields: evidence, preserved: true });
  },
);
test(
  'removing storeId from actual custody HKDF still makes locally usable ciphertext but the independent owner-byte check detects it',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t, 'custodyStore');
    await invoke(f.page, 'open');
    await invoke(f.page, 'append');
    const raw = await invoke(f.page, 'snapshot');
    assert.equal((await invoke(f.page, 'recover')).records.length, 4);
    assert.throws(() => checkRaw(f.saved, raw), /authenticate|authenticat|Unsupported state/i);
    const trace = (await f.page.evaluate(() => keyTraces)).find((t) => t.method === 'deriveKey');
    assert.notEqual(hex(trace.info), hex(keyInfo(f.saved.scope)));
    await invoke(f.page, 'close');
    report('native-control', {
      control: 'custodyStore',
      localRoundTrip: 'passed',
      independentByteContract: 'detected omitted storeId',
      crypto: 'real factor, HKDF and AES; no success override',
    });
  },
);
