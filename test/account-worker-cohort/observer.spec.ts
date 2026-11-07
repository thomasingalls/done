import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { waitForState } from '../../scripts/storage-conformance/observe.mjs';
let server: ViteDevServer, url: string;
test.beforeAll(async () => {
  server = await createServer({
    root: process.cwd(),
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false },
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw Error('No observer port');
  url = `http://127.0.0.1:${address.port}/test/account-worker-cohort/index.html`;
});
test.afterAll(async () => server?.close());
test.beforeEach(async ({ page }) => {
  await page.goto(url);
});
test('native async state observations require an actual true result', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).observerCalls = 0;
  });
  const result = await waitForState(
    page,
    async () => {
      await navigator.locks.query();
      return ++(window as any).observerCalls === 3;
    },
    undefined,
    1000,
  );
  expect(result).toBe(true);
  expect(await page.evaluate(() => (window as any).observerCalls)).toBe(3);
});
test('installed legacy wait accepts a false Promise while the state observer refuses it', async ({
  page,
}) => {
  const legacy = await page.waitForFunction(async () => false, undefined, { timeout: 500 });
  expect(await legacy.jsonValue()).toBe(false);
  await legacy.dispose();
  await expect(waitForState(page, async () => false, undefined, 100)).rejects.toMatchObject({
    name: 'TimeoutError',
  });
});
test('a never-settling page observation stays bounded and its late result earns no credit', async ({
  page,
}) => {
  const result = waitForState(
    page,
    () =>
      new Promise<boolean>((resolve) => {
        (window as any).releaseObservation = resolve;
      }),
    undefined,
    250,
  );
  await expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
  await page.evaluate(() => (window as any).releaseObservation(true));
  expect(await page.evaluate(() => typeof (window as any).releaseObservation)).toBe('function');
});
