import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { bundle } from './runtime.mjs';
import { key, keyInfo, hex, json, mac, counterValues, witnessValues } from './oracle.mjs';
const scripts = {};
for (const c of ['base', 'equalMac', 'reserve'])
  scripts[c] = await bundle(c === 'base' ? undefined : c, true);
const report = (name, v) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(v, null, 2) + '\n',
    );
  }
};
async function fixture(t, control = 'base') {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Disposable counter contract</title>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  t.after(async () => {
    await browser.close();
    await new Promise((r) => server.close(r));
  });
  const page = await browser.newPage(),
    url = 'http://127.0.0.1:' + server.address().port;
  const cold = async () => {
    await page.goto(url);
    await page.evaluate(scripts[control]);
  };
  await cold();
  const setup = async () => {
    await page.evaluate(() => {
      window.keyTraces = [];
      const derive = crypto.subtle.deriveKey.bind(crypto.subtle);
      crypto.subtle.deriveKey = async function (alg, base, type, extractable, usages) {
        const result = await derive(alg, base, type, extractable, usages);
        if (alg.info && new TextDecoder().decode(alg.info).includes('done/content-metadata/v1'))
          keyTraces.push({
            info: [...alg.info],
            salt: [...alg.salt],
            extractable: result.extractable,
            usages: result.usages,
            probe: [
              ...new Uint8Array(
                await crypto.subtle.sign(
                  'HMAC',
                  result,
                  new TextEncoder().encode('["native-probe"]'),
                ),
              ),
            ],
          });
        return result;
      };
    });
    return page.evaluate(() => CounterContract.setup('native-counter-🙂'));
  };
  return { page, cold, setup };
}
const run = (page, a = 'read', s) =>
  page.evaluate(({ a, s }) => CounterContract.run(a, s), { a, s });
const snapshot = (p) => p.evaluate(() => CounterContract.snapshot());

test(
  'real custody metadata derivation, native HMAC bytes and v1 to v2 activation match independent construction',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t),
      saved = await f.setup(),
      k = key(saved.scope, saved.generation),
      traces = await f.page.evaluate(() => keyTraces);
    assert(traces.length >= 1);
    for (const x of traces) {
      assert.equal(hex(x.info), hex(keyInfo(saved.scope)));
      assert.deepEqual(x.salt, []);
      assert.equal(x.extractable, false);
      assert.deepEqual(x.usages, ['sign', 'verify']);
      assert.equal(hex(x.probe), hex(mac(k, json(['native-probe']))));
    }
    const initial = await snapshot(f.page);
    assert.equal(initial.counter.v, 1);
    await run(f.page, 'enable');
    await run(f.page, 'event');
    const after = await snapshot(f.page);
    for (const s of [initial, after]) {
      assert.equal(s.counter.mac, hex(mac(k, json(counterValues(saved.scope, s.counter)))));
      assert.equal(s.witness.mac, hex(mac(k, json(witnessValues(saved.scope, s.witness)))));
    }
    assert.equal(after.counter.v, 2);
    assert.equal(after.counter.spool.events, 1);
    await f.cold();
    await f.page.evaluate((s) => CounterContract.configure(s), saved);
    assert.equal((await run(f.page)).rows.length, 1);
    await assert.rejects(
      f.page.evaluate(() => CounterContract.ordinaryOpen()),
      /spool owner/,
    );
    report('native-kdf', {
      derivations: traces.length,
      infoHex: hex(keyInfo(saved.scope)),
      initial: initial.counter.v,
      final: after.counter.v,
      coldRows: 1,
      ordinaryReader: 'refused v2',
      counterMacs: 'independently verified',
      witnessMacs: 'independently verified',
    });
  },
);
test(
  'correctly MACed allocation and witness lies refuse at their owning boundary',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t),
      saved = await f.setup();
    await run(f.page, 'enable');
    await run(f.page, 'event');
    await f.page.evaluate(async () => {
      window.goodCounter = await CounterContract.getCounter();
      window.goodWitness = await CounterContract.getWitness();
    });
    const outcomes = [];
    for (const field of [
      'intent',
      'active_gen',
      'range',
      'spoolHash',
      'spoolCount',
      'reservedLimit',
      'witnessIntent',
      'witnessState',
    ]) {
      await f.page.evaluate(async (field) => {
        let c = structuredClone(goodCounter),
          w = structuredClone(goodWitness);
        if (field === 'intent') c.intent = 'ff'.repeat(16);
        if (field === 'active_gen') {
          c.active_gen = 2;
          c.reserved['2'] = 0;
        }
        if (field === 'range') {
          c.next_seq = 1;
          c.reserved = { 1: 0 };
        }
        if (field === 'spoolHash') c.spool.hash = 'ff'.repeat(32);
        if (field === 'spoolCount') c.spool.events++;
        if (field === 'reservedLimit') {
          c.reserved = { 1: 2 ** 32 };
          c.next_seq = 2 ** 32 + 1;
        }
        if (field === 'witnessIntent') w.intent = 'ff'.repeat(16);
        if (field === 'witnessState') w.state = 'creating';
        await CounterContract.putCounter(await CounterContract.signCounter(c));
        await CounterContract.putWitness(await CounterContract.signWitness(w));
      }, field);
      await assert.rejects(run(f.page));
      outcomes.push({ field, validMac: true, result: 'refused' });
    }
    await f.page.evaluate(async () => {
      await CounterContract.putCounter(goodCounter);
      await CounterContract.putWitness(goodWitness);
    });
    await f.cold();
    await f.page.evaluate((s) => CounterContract.configure(s), saved);
    assert.equal((await run(f.page)).rows.length, 1);
    report('native-semantic', outcomes);
  },
);
test(
  'native final abort preserves burned reservations but commits neither ledger event nor witness; observes actual durability',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t);
    await f.setup();
    await run(f.page, 'enable');
    const before = await snapshot(f.page);
    await f.page.evaluate(() => {
      window.durabilities = [];
      const transaction = IDBDatabase.prototype.transaction,
        add = IDBObjectStore.prototype.add;
      IDBDatabase.prototype.transaction = function (stores, mode, options) {
        const tx = transaction.call(this, stores, mode, options);
        if (
          mode === 'readwrite' &&
          Array.from(typeof stores === 'string' ? [stores] : stores).includes('meta')
        )
          durabilities.push({ requested: options?.durability, actual: tx.durability });
        return tx;
      };
      window.restoreAdd = () => (IDBObjectStore.prototype.add = add);
      IDBObjectStore.prototype.add = function (...args) {
        const req = add.apply(this, args);
        if (this.name === 'heads') req.addEventListener('success', () => this.transaction.abort());
        return req;
      };
    });
    await assert.rejects(run(f.page, 'event'));
    await f.page.evaluate(() => restoreAdd());
    const after = await snapshot(f.page),
      state = await run(f.page);
    assert.equal(after.counter.next_seq, before.counter.next_seq + 1);
    assert.deepEqual(after.counter.spool, before.counter.spool);
    assert.equal(state.rows.length, 0);
    await run(f.page, 'event');
    const committed = await snapshot(f.page);
    assert.equal(committed.counter.spool.events, 1);
    assert.equal(committed.counter.next_seq, before.counter.next_seq + 2);
    const durability = await f.page.evaluate(() => durabilities);
    assert(durability.length > 0);
    assert(durability.every((d) => d.requested === 'strict' && d.actual === 'strict'));
    report('native-atomic', {
      abortedReservation: 'burned',
      abortedEventAndWitness: 'absent',
      retry: 'fresh reservation and one event',
      durability,
      powerLoss: 'not established',
    });
  },
);
test(
  'actual MAC comparison omission overwrites a counter changed after authentication; retained comparison refuses',
  { timeout: 40000 },
  async (t) => {
    const outcomes = [];
    for (const control of ['base', 'equalMac']) {
      const f = await fixture(t, control);
      await f.setup();
      await run(f.page, 'enable');
      await f.page.evaluate(() => {
        window.race = false;
        const sign = crypto.subtle.sign.bind(crypto.subtle);
        crypto.subtle.sign = async function (alg, k, b) {
          const result = await sign(alg, k, b);
          if (!race && new TextDecoder().decode(b).startsWith('["done/content-counter/v2"')) {
            race = true;
            const c = await CounterContract.getCounter();
            c.mac[0] ^= 1;
            await CounterContract.putCounter(c);
          }
          return result;
        };
      });
      if (control === 'base') await assert.rejects(run(f.page, 'event'), /authentication/);
      else assert.equal((await run(f.page, 'event')).rows.length, 1);
      assert(await f.page.evaluate(() => race));
      outcomes.push({
        control,
        result:
          control === 'base'
            ? 'refused changed MAC before sealing'
            : 'overwrote changed MAC and committed',
      });
    }
    report('native-race-control', outcomes);
  },
);
test(
  'actual reservation omission invokes AES before allocation even though the later rewind guard still refuses',
  { timeout: 40000 },
  async (t) => {
    const outcomes = [];
    for (const control of ['base', 'reserve']) {
      const f = await fixture(t, control);
      await f.setup();
      await run(f.page, 'enable');
      await f.page.evaluate(() => {
        window.invocations = [];
        const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = async function (alg, key, bytes) {
          if (
            alg.additionalData &&
            new TextDecoder().decode(alg.additionalData).includes('done/store/v1')
          ) {
            const c = await CounterContract.getCounter();
            invocations.push({
              next: c.next_seq,
              reserved: c.reserved['1'],
              durable: c.reserved['1'] > 0,
            });
          }
          return encrypt(alg, key, bytes);
        };
      });
      if (control === 'base') await run(f.page, 'event');
      else await assert.rejects(run(f.page, 'event'), /rewound/);
      const calls = await f.page.evaluate(() => invocations);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].durable, control === 'base');
      outcomes.push({
        control,
        invocations: calls,
        lateRewindGuard: control === 'reserve' ? 'refuses after invocation' : 'not triggered',
      });
    }
    report('native-reservation-control', outcomes);
  },
);
