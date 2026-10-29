import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
let server: ViteDevServer, url: string;
test.beforeAll(async () => {
  server = await createServer({
    root: process.cwd(),
    configFile: false,
    logLevel: 'error',
    plugins:
      process.env['WORKER_RUNTIME_MUTATION'] === 'retain-fence'
        ? [
            {
              name: 'worker-retain-fence-control',
              enforce: 'pre',
              transform(code, id) {
                if (!id.endsWith('/src/crdt/accountWorkerRuntime.ts')) return;
                const anchor =
                  '      } finally {\n        fence = undefined;\n        pinned.clear();\n      }';
                if (code.split(anchor).length !== 2)
                  throw Error('Nonunique worker fence mutation anchor');
                return code.replace(
                  anchor,
                  '      } finally { /* deliberately retain expired fence */ }',
                );
              },
            },
          ]
        : [],
    server: { host: '127.0.0.1', port: 0, hmr: false },
  });
  await server.listen();
  const a = server.httpServer!.address();
  if (!a || typeof a === 'string') throw Error('No test port');
  url = `http://127.0.0.1:${a.port}/test/account-worker-cohort/runtime.html`;
});
test.afterAll(async () => server?.close());
test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).runtimeLab);
});
test('fresh asynchronous reads do not become a synchronous permission after opening', async ({
  page,
}) => {
  expect(await page.evaluate(() => (window as any).runtimeLab.pageInstallerRefused())).toBe(true);
  await page.evaluate(() => (window as any).runtimeLab.data([['scoped.a', 'ciphertext']]));
  expect(await page.evaluate(() => (window as any).runtimeLab.read())).toMatchObject({
    entries: [['scoped.a', 'ciphertext']],
  });
  await page.evaluate(() => (window as any).runtimeLab.ready());
  expect(
    await page.evaluate(async () => {
      try {
        await (window as any).runtimeLab.peek();
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await page.evaluate(() => (window as any).runtimeLab.close());
});
test('a synchronous journal view expires with its explicit Window FIFO reservation', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).runtimeLab.ready());
  await page.evaluate(() => (window as any).runtimeLab.data([['scoped.a', 'current']]));
  await page.evaluate(() => (window as any).runtimeLab.fence());
  expect(await page.evaluate(() => (window as any).runtimeLab.peek())).toMatchObject({
    entries: [['scoped.a', 'current']],
  });
  await page.evaluate(() => (window as any).runtimeLab.release());
  expect(
    await page.evaluate(async () => {
      try {
        await (window as any).runtimeLab.peek();
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await page.evaluate(() => (window as any).runtimeLab.close());
});
test('worker activity uses the actual Window state while its native manager remains unreplaceable', async ({
  page,
}) => {
  expect(
    await page.evaluate(() =>
      (window as any).runtimeLab.activity('visibilitychange', 'hidden', false),
    ),
  ).toEqual({ visibility: 'hidden', online: false, seen: ['visibilitychange'] });
  expect(
    await page.evaluate(() => (window as any).runtimeLab.activity('beforeinput', 'visible', true)),
  ).toEqual({ visibility: 'visible', online: true, seen: ['visibilitychange', 'beforeinput'] });
  await page.evaluate(() => (window as any).runtimeLab.close());
  expect(
    await page.evaluate(
      async () =>
        (await navigator.locks.query()).held?.filter(
          (v) => v.name === 'done/slot-writer/"runtime-slot"',
        ).length,
    ),
  ).toBe(0);
});
