// Numeric results only; no account, service or persisted writing. Run from the repository root.
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const output = process.argv[2];
if (!output) throw Error('Pass an output JSON path');
const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve(import.meta.dirname, 'coverage.ts'),
      formats: ['iife'],
      name: 'CoverageProbe',
    },
  },
});
const code = (Array.isArray(built) ? built[0] : built).output.find((x) => x.type === 'chunk').code;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: code });
  const result = {
    chromium: browser.version(),
    at: new Date().toISOString(),
    results: await page.evaluate(() => CoverageProbe.run()),
  };
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
