import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { bundle } from './runtime.mjs';
const script = await bundle();
const report = (n, v) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, n + '.json'),
      JSON.stringify(v, null, 2) + '\n',
    );
  }
};
async function fixture(t) {
  const server = createServer((_req, res) =>
    res.end('<!doctype html><title>Disposable durability test</title>'),
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((r) => server.close(r)));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.evaluate(script);
  return page;
}
test(
  'actual custody and content AES follow completed strict grants; modeled power loss retains burned count',
  { timeout: 40000 },
  async (t) => {
    const page = await fixture(t);
    await page.evaluate(() => {
      window.trace = [];
      window.stableCounter = null;
      window.burn = false;
      const put = IDBObjectStore.prototype.put,
        transaction = IDBDatabase.prototype.transaction,
        writes = new WeakMap();
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = transaction.apply(this, args);
        tx.addEventListener('complete', () => {
          for (const { saved, domain } of writes.get(tx) ?? []) {
            trace.push({
              kind: 'commit',
              domain,
              count: saved.seal_reserved ?? saved.reserved['1'],
              durability: tx.durability,
            });
            if (domain === 'store' && tx.durability === 'strict') stableCounter = saved;
          }
        });
        return tx;
      };
      IDBObjectStore.prototype.put = function (value, ...args) {
        if (value?.seal_reserved !== undefined || (this.name === 'meta' && args[0] === 'counter')) {
          const tx = this.transaction;
          if (!writes.has(tx)) writes.set(tx, []);
          writes.get(tx).push({
            saved: structuredClone(value),
            domain: value.seal_reserved !== undefined ? 'root' : 'store',
          });
        }
        return put.call(this, value, ...args);
      };
      const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
      crypto.subtle.encrypt = async function (alg, key, bytes) {
        const aad = new TextDecoder().decode(alg.additionalData ?? new Uint8Array());
        const domain = aad.includes('done/store/v1')
          ? 'store'
          : aad.includes('done/keyenv/v1') || aad.includes('done/custody-credential/v2')
            ? 'root'
            : null;
        if (domain) trace.push({ kind: 'invoke', domain });
        const result = await encrypt(alg, key, bytes);
        if (domain === 'store' && burn) throw Error('Injected abandonment after real AES');
        return result;
      };
    });
    const saved = await page.evaluate(() => Durability.setup('f15-native'));
    // Legitimate enrollment + content initialization, then v2 event round trip.
    await page.evaluate(() => Durability.run('enable'));
    await page.evaluate(() => Durability.run('event', 'retained-control'));
    assert.equal((await page.evaluate(() => Durability.run('read'))).rows.length, 1);
    const before = await page.evaluate(() => Durability.getCounter());
    await page.evaluate(() => {
      burn = true;
    });
    await assert.rejects(
      page.evaluate(() => Durability.run('event', 'abandoned')),
      /Injected abandonment/,
    );
    const after = await page.evaluate(() => Durability.getCounter());
    assert.equal(after.next_seq, before.next_seq + 1);
    // This is an explicit power-loss MODEL, not a physical power-cut test. Replace only
    // the unflushed reservation; no ciphertext was published for the abandoned call.
    const rollback = await page.evaluate(async (before) => {
      const retained = stableCounter ?? before;
      await Durability.putCounter(retained);
      burn = false;
      return { count: retained.reserved['1'], trace };
    }, before);
    report('native-power-model', rollback);
    const invoked = rollback.trace.filter(
      (e) => e.kind === 'invoke' && e.domain === 'store',
    ).length;
    assert(
      rollback.count >= invoked,
      `lost completed grant: retained ${rollback.count}, actual AES ${invoked}`,
    );
    const durable = { root: 0, store: 0 },
      uses = { root: 0, store: 0 };
    for (const e of rollback.trace) {
      if (e.kind === 'commit' && e.durability === 'strict') durable[e.domain] = e.count;
      if (e.kind === 'invoke') {
        uses[e.domain]++;
        assert(durable[e.domain] >= uses[e.domain], `${e.domain} invoked before strict completion`);
      }
    }
    await page.reload();
    await page.evaluate(script);
    await page.evaluate((s) => Durability.configure(s), saved);
    await page.evaluate(() => Durability.run('event', 'fresh-retry'));
    assert.equal((await page.evaluate(() => Durability.run('read'))).rows.length, 2);
  },
);
for (const kind of ['content', 'custody'])
  for (const mode of [
    'strict',
    'default',
    'relaxed',
    'missing',
    'getter-throws',
    'options-throw',
    'abort-throws',
  ])
    test(
      `${kind}: ${mode} requested/reported capability, body refusal and native settlement`,
      { timeout: 20000 },
      async (t) => {
        const page = await fixture(t);
        await page.evaluate((mode) => {
          window.events = [];
          window.bodyCalls = 0;
          const transaction = IDBDatabase.prototype.transaction,
            put = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function (...args) {
            if (this.transaction.db.name === 'durability-boundary') bodyCalls++;
            return put.apply(this, args);
          };
          IDBDatabase.prototype.transaction = function (stores, access, options) {
            if (this.name !== 'durability-boundary' || access !== 'readwrite')
              return transaction.call(this, stores, access, options);
            events.push({ event: 'request', requested: options?.durability ?? null });
            if (mode === 'options-throw') throw Error('Unsupported transaction options');
            const tx = transaction.call(this, stores, access, options);
            tx.addEventListener('abort', () => events.push({ event: 'abort' }));
            tx.addEventListener('complete', () => events.push({ event: 'complete' }));
            if (mode === 'getter-throws')
              Object.defineProperty(tx, 'durability', {
                get() {
                  throw Error('Unavailable durability');
                },
              });
            else if (mode !== 'strict')
              Object.defineProperty(tx, 'durability', {
                value: mode === 'missing' ? undefined : mode === 'abort-throws' ? 'default' : mode,
              });
            if (mode === 'abort-throws')
              tx.abort = () => {
                throw Error('Abort lost race');
              };
            return tx;
          };
        }, mode);
        const result = await page.evaluate(async (kind) => {
          let error = null;
          try {
            await Durability.boundary(kind);
          } catch (e) {
            error = { code: e.code ?? null, message: String(e) };
          }
          events.push({ event: 'settled' });
          return { events, bodyCalls, error };
        }, kind);
        report(kind + '-' + mode, result);
        assert.equal(result.events[0].requested, 'strict');
        if (mode === 'strict') {
          assert.equal(result.error, null);
          assert.equal(result.bodyCalls, 1);
        } else {
          assert(result.error, 'unsupported strict durability must refuse');
          assert.equal(result.bodyCalls, 0);
          if (mode !== 'options-throw') {
            assert.equal(result.error.code, 'storage-failed');
            assert.deepEqual(
              result.events.slice(-2).map((e) => e.event),
              [mode === 'abort-throws' ? 'complete' : 'abort', 'settled'],
            );
          }
          // Readonly use does not require strict support and stays available.
          assert.equal(
            await page.evaluate(async (kind) => {
              try {
                await Durability.boundary(kind, false);
                return true;
              } catch {
                return false;
              }
            }, kind),
            true,
          );
        }
      },
    );
