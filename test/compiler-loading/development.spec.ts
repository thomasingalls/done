import { test } from '../release-validation/browser-fixture';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

async function development(page: Page, info: TestInfo, configFile: string) {
  const cacheDir = info.outputPath('src', 'optimizer-cache');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let port = 0;
  let retainedMetadata: string | undefined;
  try {
    for (const phase of ['fresh', 'retained']) {
      const server = await createServer({
        configFile: resolve(configFile),
        // A cache outside node_modules must not become application compiler input.
        cacheDir,
        server: { host: '127.0.0.1', port, strictPort: true, open: false },
        logLevel: 'error',
      });
      try {
        await server.listen();
        const origin = server.resolvedUrls!.local[0]!;
        port = Number(new URL(origin).port);
        const compiled = await server.transformRequest('/src/ui/LocalApp.tsx');
        // Mounting by disabling the compiler would not exercise the repaired boundary.
        expect(compiled!.code).toMatch(/compiler[-_]runtime/);
        expect(compiled!.code).toMatch(/\b_c\(/);
        await page.goto(new URL('/local.html', origin).href);
        await expect(page.locator('.shell')).toBeVisible();
        const writing = 'Writing survives compiler cache restart';
        if (phase === 'fresh') {
          const input = page.locator('.day-panel[data-active=true] [placeholder="What got done?"]');
          await input.fill(writing);
          await input.press('Enter');
        }
        await expect(
          page.locator('.day-panel[data-active=true] .card').filter({ hasText: writing }),
        ).toHaveCount(1);
        await page.reload();
        await expect(page.locator('.shell')).toContainText(writing);
        if (configFile === 'vite/privateMigration.config.ts') {
          await page.goto(new URL('/private/migration.html', origin).href);
          await expect(page.locator('[data-migration-phase]')).toHaveAttribute(
            'data-migration-phase',
            'host',
          );
        }
        expect(errors).toEqual([]);
        if (phase === 'retained')
          expect(await readFile(resolve(cacheDir, 'deps/_metadata.json'), 'utf8')).toBe(
            retainedMetadata,
          );
        // Keep same-origin writing while releasing the mounted owner and HMR connection.
        await page.goto('about:blank');
      } finally {
        await server.close();
      }
      retainedMetadata = await readFile(resolve(cacheDir, 'deps/_metadata.json'), 'utf8');
    }
  } finally {
    await info.attach('browser-errors', {
      body: JSON.stringify(errors),
      contentType: 'application/json',
    });
  }
}

test('ordinary development compiles application code and retains writing across cold and warm cache starts', async ({
  page,
}, info) => {
  await development(page, info, 'vite.config.ts');
});

test('private migration development compiles application code and retains writing across cold and warm cache starts', async ({
  page,
}, info) => {
  await development(page, info, 'vite/privateMigration.config.ts');
});
