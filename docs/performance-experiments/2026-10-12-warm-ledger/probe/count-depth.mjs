import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const server = createServer((_req, res) =>
  res.end('<!doctype html><title>Disposable IDB count probe</title>'),
);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const results = await page.evaluate(async () => {
    const results = [];
    for (const total of [600, 2500, 10000]) {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('count-' + total, 1);
        r.onupgradeneeded = () => {
          for (const name of ['meta', 'content', 'heads', 'outbound'])
            r.result.createObjectStore(name);
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['meta', 'content', 'heads', 'outbound'], 'readwrite');
        tx.objectStore('meta').put({ next_seq: total + 1 }, 'counter');
        for (let i = 1; i <= total; i++)
          tx.objectStore(['content', 'heads', 'outbound'][i % 3]).put(
            { seq: i, bytes: new Uint8Array(256) },
            i,
          );
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      for (const mode of ['count', 'shape']) {
        const samples = [];
        for (let repeat = 0; repeat < 55; repeat++) {
          const start = performance.now();
          await new Promise((resolve, reject) => {
            const tx = db.transaction(['meta', 'content', 'heads', 'outbound'], 'readonly');
            for (const name of ['content', 'heads', 'outbound']) {
              const s = tx.objectStore(name);
              s.count();
              if (mode === 'shape') {
                s.openKeyCursor();
                s.openKeyCursor(undefined, 'prev');
              }
            }
            if (mode === 'shape') {
              tx.objectStore('meta').count();
              tx.objectStore('meta').get('counter');
            }
            tx.oncomplete = resolve;
            tx.onabort = () => reject(tx.error);
          });
          if (repeat >= 5) samples.push(performance.now() - start);
        }
        results.push({ total, mode, samples });
      }
      db.close();
      await new Promise((resolve, reject) => {
        const r = indexedDB.deleteDatabase('count-' + total);
        r.onsuccess = resolve;
        r.onerror = () => reject(r.error);
      });
    }
    return results;
  });
  writeFileSync(
    process.argv[2],
    JSON.stringify(
      {
        cpu: 4,
        results,
        note: 'Synthetic key counts; excludes counter HMAC and real account payloads. 5 warmups then 50 sequential transactions per condition. Order ascending; descriptive, not a complexity guarantee.',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
