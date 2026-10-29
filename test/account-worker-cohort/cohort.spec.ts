import { test, expect, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
let server: ViteDevServer, url: string;
test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    plugins:
      process.env['COHORT_MUTATION'] === 'missing-anchor'
        ? [
            {
              name: 'cohort-missing-anchor-control',
              enforce: 'pre',
              transform(code, id) {
                if (!id.endsWith('/src/crdt/accountWorkerCohort.ts')) return;
                const anchor = "      [n.anchor, 'exclusive'],\n";
                if (code.split(anchor).length !== 2)
                  throw Error('Nonunique cohort mutation anchor');
                return code.replace(anchor, '');
              },
            },
          ]
        : [],
    server: { host: '127.0.0.1', port: 0, hmr: false },
  });
  await server.listen();
  const a = server.httpServer!.address();
  if (!a || typeof a === 'string') throw Error('No native test port');
  url = `http://127.0.0.1:${a.port}/test/account-worker-cohort/index.html`;
});
test.afterAll(async () => server?.close());
test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).cohortLab);
});
const open = (p: Page) => p.evaluate(() => (window as any).cohortLab.open());
const join = (p: Page, index = 0) => p.evaluate((i) => (window as any).cohortLab.join(i), index);
const close = (p: Page, index = 0) => p.evaluate((i) => (window as any).cohortLab.close(i), index);
const holders = (p: Page) =>
  p.evaluate(async () => {
    const q = await navigator.locks.query();
    return {
      held: q.held?.filter((v) => v.name === 'done/slot-writer/"slot"').map((v) => v.mode),
      pending: q.pending?.filter((v) => v.name === 'done/slot-writer/"slot"').map((v) => v.mode),
    };
  });
test('actual worker and Window share one legacy domain until both are disposed', async ({
  page,
}) => {
  await open(page);
  expect(await join(page)).toBe('active');
  expect((await holders(page)).held).toEqual(['shared', 'shared']);
  await close(page);
  expect((await holders(page)).held).toEqual([]);
  expect(await page.evaluate(() => (window as any).cohortLab.state())).toEqual({
    state: 'closed',
    keyZero: true,
    aborted: true,
  });
});
test('replayed ticket in a second dedicated worker cannot initialize another member', async ({
  page,
}) => {
  await open(page);
  expect(await join(page)).toBe('active');
  expect(await join(page)).toBe('refused');
  expect((await holders(page)).held).toEqual(['shared', 'shared']);
  await close(page);
});
test('old ticket cannot join a fresh incarnation in the same Window client', async ({ page }) => {
  await open(page);
  const old = await page.evaluate(() => (window as any).cohortLab.ticket());
  await close(page);
  const second = await open(page);
  expect(
    await page.evaluate(({ index, ticket }) => (window as any).cohortLab.join(index, ticket), {
      index: second,
      ticket: old,
    }),
  ).toBe('refused');
  await close(page, second);
});
test('older exclusive request between endpoint and worker join causes refusal without deadlock', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).legacyGranted = false;
    void navigator.locks.request('done/slot-writer/"slot"', { mode: 'exclusive' }, () => {
      (window as any).legacyGranted = true;
    });
  });
  expect(await join(page)).toBe('refused');
  expect((await holders(page)).pending).toEqual(['exclusive']);
  await close(page);
  await expect.poll(() => page.evaluate(() => (window as any).legacyGranted)).toBe(true);
});
test('close immediately invalidates input and retains native exclusion through drain', async ({
  page,
}) => {
  await open(page);
  expect(await join(page)).toBe('active');
  await page.evaluate(() => {
    (window as any).cohortLab.before();
    (window as any).closed = (window as any).cohortLab.close();
    (window as any).legacyGranted = false;
    void navigator.locks.request('done/slot-writer/"slot"', { mode: 'exclusive' }, () => {
      (window as any).legacyGranted = true;
    });
  });
  await expect(page.evaluate(() => (window as any).cohortLab.write())).rejects.toThrow('inactive');
  expect(await page.evaluate(() => (window as any).legacyGranted)).toBe(false);
  expect((await holders(page)).held).toEqual(['shared', 'shared']);
  await page.evaluate(() => (window as any).finishDrain());
  await page.evaluate(() => (window as any).closed);
  await expect.poll(() => page.evaluate(() => (window as any).legacyGranted)).toBe(true);
});
test('failed worker stop clears local buffers but retains the endpoint exclusion', async ({
  page,
}) => {
  await open(page);
  expect(await join(page)).toBe('active');
  await page.evaluate(() => (window as any).cohortLab.stopFails());
  await expect(close(page)).rejects.toThrow('deliberate worker stop failure');
  expect(await page.evaluate(() => (window as any).cohortLab.state())).toEqual({
    state: 'failed',
    keyZero: true,
    aborted: true,
  });
  expect((await holders(page)).held).toEqual(['shared', 'shared']);
  await expect(page.evaluate(() => (window as any).cohortLab.write())).rejects.toThrow('inactive');
});
test('orphaned real worker blocks a new supervisor at the exclusive legacy-name barrier', async ({
  page,
}) => {
  await page.evaluate(() => (window as any).cohortLab.injectOrphanFault());
  await open(page);
  expect(await join(page)).toBe('active');
  await page.evaluate(async () => {
    (window as any).cohortLab.loseSupervisor();
    await Promise.resolve();
    (window as any).next = (window as any).cohortLab.open();
  });
  await expect.poll(() => holders(page)).toEqual({ held: ['shared'], pending: ['exclusive'] });
  await close(page);
  const next = await page.evaluate(() => (window as any).next);
  await close(page, next);
});
test('actual navigation ends old native lifetimes before a fresh opening', async ({ page }) => {
  await open(page);
  expect(await join(page)).toBe('active');
  await page.goto(url);
  await page.waitForFunction(() => (window as any).cohortLab);
  await open(page);
  expect(await join(page)).toBe('active');
  await close(page);
});

test('a false stop acknowledgment cannot release the endpoint while the native worker still owns it', async ({
  page,
}) => {
  await open(page);
  expect(await join(page)).toBe('active');
  await page.evaluate(() => (window as any).cohortLab.stopSkips());
  await expect(close(page)).rejects.toThrow();
  expect(await page.evaluate(() => (window as any).cohortLab.state())).toEqual({
    state: 'failed',
    keyZero: true,
    aborted: true,
  });
  expect((await holders(page)).held).toEqual(['shared', 'shared']);
});
test('cancellation while the old-name exclusive barrier is queued releases all partial new leases', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).legacyHeld = false;
    (window as any).legacyDone = navigator.locks.request(
      'done/slot-writer/"slot"',
      { mode: 'exclusive' },
      async () => {
        (window as any).legacyHeld = true;
        await new Promise<void>((resolve) => ((window as any).releaseLegacy = resolve));
      },
    );
  });
  await page.waitForFunction(() => (window as any).legacyHeld);
  await page.evaluate(() => {
    (window as any).cancelOpen = new AbortController();
    (window as any).opening = (window as any).cohortLab
      .open((window as any).cancelOpen.signal)
      .then(
        () => 'unexpected-ready',
        () => 'refused',
      );
  });
  await expect.poll(async () => (await holders(page)).pending).toEqual(['exclusive']);
  await page.evaluate(() => (window as any).cancelOpen.abort());
  expect(await page.evaluate(() => (window as any).opening)).toBe('refused');
  expect(
    await page.evaluate(async () => {
      const q = await navigator.locks.query();
      return q.held?.filter((v) => v.name?.includes('/worker-')).length;
    }),
  ).toBe(0);
  await page.evaluate(async () => {
    (window as any).releaseLegacy();
    await (window as any).legacyDone;
  });
});
