import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
let server: ViteDevServer, url: string;
test.beforeAll(async () => {
  server = await createServer({
    root: process.cwd(),
    configFile: false,
    logLevel: 'error',
    plugins:
      process.env['ACKNOWLEDGED_RECEIVE_FAULT'] === 'release-task'
        ? [
            {
              name: 'disposable-release-before-ack-control',
              enforce: 'pre',
              transform(code, id) {
                if (!id.endsWith('/src/crdt/acknowledgedReceive.ts')) return;
                const anchor = '      await task.wait(apply);';
                if (code.split(anchor).length !== 2)
                  throw Error('Nonunique acknowledgment fault anchor');
                return code.replace(anchor, '      void apply();');
              },
            },
          ]
        : [],
    server: { host: '127.0.0.1', port: 0, hmr: false },
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw Error('No test port');
  url = `http://127.0.0.1:${address.port}/test/account-worker-cohort/acknowledged.html`;
});
test.afterAll(async () => server?.close());
test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).acknowledgedLab);
  await page.evaluate(() => (window as any).acknowledgedLab.request('open'));
});
async function held(page: import('@playwright/test').Page) {
  return page.evaluate(async () =>
    (await navigator.locks.query()).held?.some(
      (v) => v.name === 'done/slot-writer/"acknowledged-task"',
    ),
  );
}
test('a genuine Worker native task remains held until Window application acknowledges', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).acknowledgedLab.start());
  await page.waitForFunction(() => (window as any).acknowledgedLab.applied());
  expect(await held(page)).toBe(true);
  expect(await page.evaluate(() => (window as any).acknowledgedLab.request('state'))).toMatchObject(
    { state: 'active', checks: 1, applied: 0, failures: 0 },
  );
  await page.evaluate(() => (window as any).acknowledgedLab.request('ack'));
  await page.evaluate(() => (window as any).acknowledgedLab.finish());
  expect(await page.evaluate(() => (window as any).acknowledgedLab.request('state'))).toMatchObject(
    { applied: 1, failures: 0 },
  );
  await page.evaluate(() => {
    (window as any).acknowledgedLab.close();
  });
  await page.evaluate(() => (window as any).acknowledgedLab.closed());
  expect(await held(page)).toBe(false);
});
test('close drains a pending actual task and cancellation cannot become a successful apply', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).acknowledgedLab.start());
  await page.waitForFunction(() => (window as any).acknowledgedLab.applied());
  await page.evaluate(() => (window as any).acknowledgedLab.close());
  await expect
    .poll(() => page.evaluate(() => (window as any).acknowledgedLab.request('state')))
    .toMatchObject({ state: 'closing', applied: 0 });
  expect(await held(page)).toBe(true);
  await page.evaluate(() => (window as any).acknowledgedLab.request('ack'));
  await expect(page.evaluate(() => (window as any).acknowledgedLab.finish())).rejects.toThrow();
  await page.evaluate(() => (window as any).acknowledgedLab.closed());
  expect(await held(page)).toBe(false);
  expect(await page.evaluate(() => (window as any).acknowledgedLab.request('state'))).toMatchObject(
    { applied: 0, failures: 1 },
  );
});
test('a lost acknowledgment fails once and a replay cannot apply again', async ({ page }) => {
  await page.evaluate(() => (window as any).acknowledgedLab.start());
  await page.waitForFunction(() => (window as any).acknowledgedLab.applied());
  await page.evaluate(() => (window as any).acknowledgedLab.request('lost'));
  await expect(page.evaluate(() => (window as any).acknowledgedLab.finish())).rejects.toThrow(
    'reply loss',
  );
  await expect(
    page.evaluate(() => (window as any).acknowledgedLab.request('finish')),
  ).rejects.toThrow('already consumed');
  expect(await page.evaluate(() => (window as any).acknowledgedLab.request('state'))).toMatchObject(
    { checks: 1, applied: 0, failures: 1 },
  );
  await page.evaluate(() => (window as any).acknowledgedLab.close());
  await page.evaluate(() => (window as any).acknowledgedLab.closed());
  expect(await held(page)).toBe(false);
});
