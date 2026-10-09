import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { startService, stopService } from './server';
declare global {
  interface Window {
    ContentRotation: typeof import('../account-membership/content-rotation-entry');
  }
}
test('native rotation preserves journal work and reservation history across interrupted re-encryption', async ({
  browser,
}, info) => {
  const bundle = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-membership/content-rotation-entry.ts'),
        name: 'ContentRotation',
        formats: ['iife'],
      },
    },
  });
  const built = Array.isArray(bundle) ? bundle[0]! : bundle;
  if (!('output' in built)) throw Error('Unexpected bundle');
  const chunk = built.output.find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw Error('Missing probe');
  const service = await startService(info.outputPath('service'));
  try {
    for (const fault of ['seal', 'commit', 'journal', 'opener'] as const) {
      const context = await browser.newContext(),
        page = await context.newPage();
      try {
        await page.goto('/');
        await page.evaluate(chunk.code);
        const result = await page.evaluate(
          (fault) => window.ContentRotation.exercise(fault),
          fault,
        );
        expect(result).toEqual({
          failedBeforeSwitch: true,
          recovered: fault === 'journal' ? 4 : 3,
          reserved: fault === 'journal' ? 7 : 6,
          newWrite: true,
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await stopService(service);
  }
});
