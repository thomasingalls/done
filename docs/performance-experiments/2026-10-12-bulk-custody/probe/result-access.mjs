// Follow-up diagnostic, after the initial bulk comparison: result access may deserialize again.
// Synthetic control rows only. This isolates getter cost, not end-to-end typing or authority.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const server = createServer((_req, res) =>
  res.end('<!doctype html><title>Synthetic result-access probe</title>'),
);
await new Promise((r, j) => {
  server.once('error', j);
  server.listen(0, '127.0.0.1', r);
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const result = await page.evaluate(async () => {
    const req = indexedDB.open('synthetic', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('entries');
    const db = await new Promise((r, j) => {
      req.onsuccess = () => r(req.result);
      req.onerror = () => j(req.error);
    });
    const output = [];
    for (const kind of ['binary', 'string']) {
      await new Promise((r, j) => {
        const tx = db.transaction('entries', 'readwrite');
        tx.oncomplete = r;
        tx.onabort = () => j(tx.error);
        const s = tx.objectStore('entries');
        s.clear();
        for (let i = 0; i < 4; i++)
          s.put(
            {
              payload: kind === 'binary' ? new Uint8Array(128 * 1024) : 'ab'.repeat(128 * 1024),
              children: Array.from({ length: 100 }, (_, i) => ({ i, mac: new Uint8Array(32) })),
            },
            i,
          );
      });
      for (let pass = 0; pass < 5; pass++) {
        await new Promise((r, j) => {
          const tx = db.transaction('entries', 'readonly');
          tx.oncomplete = r;
          tx.onabort = () => j(tx.error);
          const q = tx.objectStore('entries').getAll();
          q.onsuccess = () => {
            const a = performance.now(),
              first = q.result,
              b = performance.now(),
              second = q.result,
              c = performance.now();
            const access = [];
            for (let i = 0; i < 5; i++) {
              const start = performance.now();
              void q.result[i % 4];
              access.push(performance.now() - start);
            }
            output.push({
              kind,
              pass,
              firstMs: b - a,
              secondMs: c - b,
              sameArray: first === second,
              sameValue: first[0] === second[0],
              repeatedMs: access,
            });
          };
        });
      }
    }
    db.close();
    return output;
  });
  writeFileSync(
    process.argv[2],
    JSON.stringify(
      {
        cpu: 4,
        rows: 4,
        binaryPayloadBytes: 128 * 1024,
        stringPayloadCharacters: 256 * 1024,
        result,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
