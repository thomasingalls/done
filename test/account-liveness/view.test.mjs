import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  createLocal,
  openLocal,
  prepareRecovery,
  select,
  insert,
  close,
  read,
  sync,
  settle,
  sample,
  report,
} from './fixtures.mjs';
const oracleSync = async (f, item, online = true) => {
  await f.page.evaluate(() => {
    globalThis.livenessVerificationOracle = true;
  });
  return sync(f, item, online);
};
const status = (f) =>
  f.page.evaluate(async () => ({
    delivery: await opened.deliveryStatus(),
    receive: await opened.receiveStatus(),
    spool: await opened.spoolStatus(),
  }));
test(
  'warm complete views refuse native carrier tampering and survive compaction, erasure and cold open',
  { timeout: 150000 },
  async (t) => {
    const f = await fixture(t),
      item = await createLocal(f, 'verified-view');
    await openLocal(f, item);
    await insert(f, 'Verified view baseline.');
    await close(f);
    await prepareRecovery(f, item);
    await select(f, item);
    await oracleSync(f, item);
    const initial = await settle(f);
    await insert(f, ' Account delta.');
    await settle(f, initial + 1);
    await f.page.evaluate(async () => {
      setOnline(false);
      await editor.whenDurable();
      await opened.receiveStatus();
    });
    const oracleChecks = await f.page.evaluate(() => globalThis.livenessOracleChecks);
    assert(oracleChecks > 0);
    const expected = (await read(f)).master,
      observations = [];
    const warm = await sample(f, 'warm-view', () => status(f));
    assert.equal(warm.client.rows['inbound.ledger']?.calls ?? 0, 0);
    assert.equal(warm.client.rows['delivery.verify']?.calls ?? 0, 0);
    await f.page.evaluate(() => opened.compactContent());
    assert.equal((await read(f)).master, expected);
    await close(f);
    await f.cold();
    await oracleSync(f, item, false);
    assert.equal((await read(f)).master, expected);
    const modes = [
      'ciphertext',
      'nonce',
      'missing-content',
      'missing-source',
      'placement',
      'counter',
      'generation',
    ];
    for (const mode of modes) {
      console.log('Tamper mode: ' + mode);
      await status(f);
      await f.page.evaluate(async (mode) => {
        const open = (name) =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
        for (const { name } of await indexedDB.databases()) {
          const db = await open(name);
          if (!db.objectStoreNames.contains('content')) {
            db.close();
            continue;
          }
          const saved = await new Promise((resolve, reject) => {
            const tx = db.transaction(['meta', 'content', 'outbound']),
              values = {};
            for (const n of ['meta', 'content', 'outbound']) {
              const r = tx.objectStore(n).getAll();
              r.onsuccess = () => (values[n] = r.result);
            }
            tx.oncomplete = () => resolve(values);
            tx.onabort = () => reject(tx.error);
          });
          if (saved.meta[0]?.v !== 2) {
            db.close();
            continue;
          }
          globalThis.savedCarrier = { name, values: saved };
          await new Promise((resolve, reject) => {
            const tx = db.transaction(['meta', 'content', 'outbound'], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
            if (mode === 'missing-content') tx.objectStore('content').clear();
            else if (mode === 'missing-source')
              tx.objectStore('outbound').delete(saved.outbound[0].seq);
            else if (mode === 'counter' || mode === 'generation') {
              const value = structuredClone(saved.meta[0]);
              if (mode === 'counter') value.mac[0] ^= 1;
              else value.active_gen++;
              tx.objectStore('meta').put(value, 'counter');
            } else {
              const value = structuredClone(saved.content[0]);
              if (mode === 'ciphertext') value.ct[0] ^= 1;
              if (mode === 'nonce') value.nonce[0] ^= 1;
              if (mode === 'placement') {
                tx.objectStore('content').delete(value.seq);
                tx.objectStore('content').put(value, value.seq + 10000);
              } else tx.objectStore('content').put(value, value.seq);
            }
          });
          db.close();
          return;
        }
        throw Error('No v9 carrier');
      }, mode);
      await assert.rejects(
        async () => {
          const value = await status(f);
          console.log('Unexpected success', mode, JSON.stringify(value));
        },
        undefined,
        'refuse ' + mode,
      );
      await close(f).catch(() => {});
      await f.page.evaluate(async () => {
        const { name, values } = savedCarrier;
        const db = await new Promise((resolve) => {
          const r = indexedDB.open(name);
          r.onsuccess = () => resolve(r.result);
        });
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(['meta', 'content', 'outbound'], 'readwrite');
            for (const n of ['meta', 'content', 'outbound']) {
              const store = tx.objectStore(n);
              store.clear();
              for (const r of values[n]) store.put(r, n === 'meta' ? 'counter' : r.seq);
            }
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      });
      await f.cold();
      await oracleSync(f, item, false);
      assert.equal((await read(f)).master, expected);
      observations.push({ mode, refused: true, coldRecovery: true });
    }
    await close(f);
    await assert.rejects(status(f));
    report('verified-view', {
      status: 'passed',
      oracleChecks,
      warm,
      observations,
      compactionAndColdReplay: true,
    });
  },
);
