/** Native coordination only. The fixture's private acquire seam skips Account custody/authentication. */
import { test, expect, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
let server: ViteDevServer, url: string;
test.beforeAll(async () => {
  if (process.env['FORMAT_NATIVE_CONTROL'] && process.env['FORMAT_NATIVE_CONTROL'] !== 'barrier')
    throw Error('Unknown native format control');
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: 'native-format-coordination-only',
        enforce: 'pre',
        transform(code, id) {
          if (id.endsWith('/src/crdt/writeSession.ts')) {
            const anchor = 'export const openAccountWriteSession = (';
            if (code.split(anchor).length !== 2) throw Error('Nonunique actual acquire seam');
            return (
              code +
              `\nexport const openFormatTaskTestSession = (slotId: string) => acquire(slotId, accountMode(slotId), workerSessionOptions(slotId, { initialize() {}, dispose() {} }), async () => {}, accountWorkerRuntime(slotId)?.join);\n`
            );
          }
          if (
            process.env['FORMAT_NATIVE_CONTROL'] === 'barrier' &&
            id.endsWith('/src/crdt/accountWorkerCohort.ts')
          ) {
            const anchor =
              "      const barrier = await hold(locks, n.slot, 'exclusive', opening.signal);\n      await barrier.close();";
            if (code.split(anchor).length !== 2) throw Error('Nonunique actual startup barrier');
            return code.replace(
              anchor,
              '      // Declared negative control: startup barrier omitted.',
            );
          }
          return undefined;
        },
      },
    ],
    server: { host: '127.0.0.1', port: 0, hmr: false },
  });
  await server.listen();
  const a = server.httpServer!.address();
  if (!a || typeof a === 'string') throw Error('Missing native fixture port');
  url = `http://127.0.0.1:${a.port}/test/account-worker-cohort/format.html`;
});
test.afterAll(async () => server?.close());
const api = (page: Page, method: string, value?: string) =>
  page.evaluate(({ method, value }) => (window as any).formatNative[method](value), {
    method,
    value,
  });
async function open(page: Page) {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).formatNative, undefined, { polling: 50 });
}
test('real exclusive Page tasks accept only the original live exact-slot scope', async ({
  page,
}) => {
  await open(page);
  const observed = await api(page, 'pageChecks');
  await test.info().attach('format-page-native', {
    body: JSON.stringify(observed),
    contentType: 'application/json',
  });
  expect(observed).toEqual({
    original: 'allowed',
    copy: 'inactive',
    wrong: 'inactive',
    expired: 'inactive',
  });
});
test('real startup barrier excludes an old shared holder; exact Worker tasks retain the slot through abort and drain', async ({
  page,
  context,
}) => {
  const observed: Record<string, unknown> = {};
  try {
    const old = await context.newPage();
    await open(old);
    await open(page);
    await api(old, 'holdShared');
    await api(page, 'start');
    await expect
      .poll(async () => {
        const state = (await api(page, 'started')) as { ready: boolean };
        const locks = (await api(page, 'locks')) as { pending: string[] };
        return state.ready || locks.pending.includes('exclusive');
      })
      .toBe(true);
    observed['beforeRelease'] = await api(page, 'started');
    observed['barrierLocks'] = await api(page, 'locks');
    expect(
      observed['beforeRelease'],
      'startup barrier must prevent member creation before the old shared writer releases',
    ).toEqual({ spawned: false, ready: false });
    expect(observed['barrierLocks']).toMatchObject({ held: ['shared'], pending: ['exclusive'] });
    await api(old, 'releaseShared');
    await api(page, 'awaitStart');
    observed['workerChecks'] = await api(page, 'command', 'checks');
    observed['genericShared'] = await api(page, 'command', 'shared');
    observed['joinedLocks'] = await api(page, 'locks');
    expect(observed['workerChecks']).toEqual({ original: 'allowed', copy: 'inactive' });
    expect(observed['genericShared']).toBe('inactive');
    expect((observed['joinedLocks'] as { held: string[] }).held).toEqual(['shared', 'shared']);
    await api(page, 'command', 'hold');
    observed['heldBeforeClose'] = await api(page, 'command', 'check-held');
    expect(observed['heldBeforeClose']).toBe('allowed');
    await api(page, 'beginClose');
    observed['heldAfterAbort'] = await api(page, 'command', 'check-held');
    observed['drainingLocks'] = await api(page, 'locks');
    expect(observed['heldAfterAbort']).toBe('worker-lifetime');
    expect((observed['drainingLocks'] as { held: string[] }).held.length).toBeGreaterThan(0);
    await api(page, 'command', 'release');
    await api(page, 'awaitClose');
    observed['closedLocks'] = await api(page, 'locks');
    expect((observed['closedLocks'] as { held: string[] }).held).toEqual([]);
    await old.close();
  } finally {
    await test.info().attach('format-worker-native', {
      body: JSON.stringify(observed),
      contentType: 'application/json',
    });
  }
});
