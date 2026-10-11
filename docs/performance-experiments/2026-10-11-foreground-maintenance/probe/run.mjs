import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
const [source, output] = process.argv.slice(2).map((p) => resolve(p));
mkdirSync(output, { recursive: false });
const root = dirname(fileURLToPath(import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { '@subject': join(source, 'src') } },
  server: { host: '127.0.0.1', port: 53781, strictPort: true, fs: { allow: [source, root] } },
});
let browser;
const results = { source, profile: process.env.MAINTENANCE_PROFILE === '1', runs: [] };
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const collision of [false, true]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      page.on('pageerror', (e) => console.error(e.message));
      await page.goto('http://127.0.0.1:53781/');
      await page.waitForFunction(() => typeof window.run === 'function');
      const cdp = await context.newCDPSession(page);
      if (results.profile) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.start');
      }
      const result = await page.evaluate((collision) => window.run(collision), collision);
      results.runs.push(result);
      writeFileSync(join(output, 'result.json'), JSON.stringify(results, null, 2));
      if (results.profile) {
        const { profile } = await cdp.send('Profiler.stop');
        writeFileSync(
          join(output, `${collision ? 'collision' : 'quiet'}.cpuprofile`),
          JSON.stringify(profile),
        );
      }
      if (!result.matches || !result.reopenedMatches || result.retainedRows !== 1200)
        throw Error('Recovery or retained-row mismatch');
      console.log(JSON.stringify(result));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
