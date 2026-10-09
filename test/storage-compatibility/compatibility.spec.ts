import { test } from '../release-validation/browser-fixture';
import { expect, type Page } from '@playwright/test';
const fixture = '/test/storage-compatibility/';
const call = async (page: Page, name: string, ...args: unknown[]) => {
  // Module dependencies can still be evaluating after navigation completes.
  await page.waitForFunction(
    (name) =>
      typeof (window as unknown as { compat?: Record<string, unknown> }).compat?.[name] ===
      'function',
    name,
    { timeout: 10000 },
  );
  return page.evaluate(
    ({ name, args }) =>
      (window as unknown as { compat: Record<string, (...args: unknown[]) => unknown> }).compat[
        name
      ]!(...args),
    { name, args },
  );
};
const op = async (page: Page, id: string, state: string) =>
  expect
    .poll(async () => {
      const snapshot = (await call(page, 'state')) as {
        operations: Record<string, { state: string }>;
      };
      return snapshot.operations[id]?.state;
    })
    .toBe(state);
const seed = async (page: Page) => {
  await page.goto(fixture);
  const result = (await call(page, 'seed')) as { code: string; scope: Record<string, string> };
  await call(page, 'open', 'seed', result.code);
  await call(page, 'edit', 'seed', 'retained writing');
  await call(page, 'durable', 'seed');
  await call(page, 'close', 'seed');
  return result;
};

test('fixture calls await a deliberately delayed module initialization', async ({ page }) => {
  await page.route('**/test/storage-compatibility/browser.mjs', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        'await new Promise(resolve => { window.releaseCompatibilityFixture = resolve; });\n' +
        (await response.text()),
    });
  });
  await page.goto(fixture);
  expect(await page.evaluate(() => typeof (window as unknown as { compat?: unknown }).compat)).toBe(
    'undefined',
  );
  const pending = call(page, 'state').then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error: String(error) }),
  );
  await page.evaluate(() =>
    (
      window as unknown as { releaseCompatibilityFixture: () => void }
    ).releaseCompatibilityFixture(),
  );
  expect(await pending).toMatchObject({ ok: true, value: { initializations: 0, operations: {} } });
});

test('two live writers block an upgrade; a queued opener rechecks before loading keys', async ({
  page,
  context,
}) => {
  const { code } = await seed(page),
    a = await context.newPage(),
    b = await context.newPage(),
    queued = await context.newPage();
  await a.goto(fixture);
  await b.goto(fixture);
  await queued.goto(fixture);
  await call(a, 'open', 'a', code);
  await call(b, 'open', 'b', code);
  await call(a, 'edit', 'a', ' first-tab edit');
  await call(b, 'edit', 'b', ' second-tab edit');
  await call(page, 'transition', { v: 1, state: 'migrating', targetFormat: 2 });
  await expect
    .poll(async () => ((await call(page, 'locks')) as { pending: unknown[] }).pending.length)
    .toBe(1);
  await call(queued, 'probe', 'queued');
  await expect
    .poll(async () => ((await call(page, 'locks')) as { pending: unknown[] }).pending.length)
    .toBe(2);
  await call(a, 'close', 'a');
  expect(
    ((await call(page, 'state')) as { operations: Record<string, unknown> }).operations['granted'],
  ).toBeUndefined();
  // Accepted edits remain in the exact carrier set captured immediately before transition.
  await call(b, 'close', 'b');
  await op(page, 'transition', 'resolved');
  await op(queued, 'queued', 'rejected');
  expect(await call(queued, 'state')).toMatchObject({
    initializations: 0,
    operations: { queued: { code: 'app-update-required' } },
  });
  const before = await call(page, 'census');
  await queued.goto('/');
  await expect(queued.locator('.local-startup')).toHaveAttribute(
    'data-state',
    'app-update-required',
  );
  await expect(
    queued.getByRole('heading', { name: 'This workspace needs a compatible app' }),
  ).toBeVisible();
  await expect(queued.getByLabel('Device-lock code', { exact: true })).toHaveCount(0);
  expect(await call(page, 'census')).toEqual(before);
  // Only the synthetic marker is removed here; no format changed. This is NOT a migration rollback.
  await call(page, 'unmark');
  const text = await call(page, 'open', 'verify', code);
  expect(text).toEqual(expect.stringContaining('retained writing'));
  expect(text).toEqual(expect.stringContaining('first-tab edit'));
  expect(text).toEqual(expect.stringContaining('second-tab edit'));
  await call(page, 'close', 'verify');
});

test('renderer death after intent commits leaves cold open and exclusive cleanup blocked', async ({
  page,
  context,
}) => {
  const { code } = await seed(page);
  const migrating = await context.newPage();
  await migrating.goto(fixture);
  await call(migrating, 'transition', { v: 99, state: 'ready', minReader: 0, minWriter: 0 }, true);
  await op(migrating, 'committed', 'resolved');
  const before = await call(page, 'census');
  const cdp = await context.newCDPSession(migrating);
  const crashed = migrating.waitForEvent('crash');
  void cdp.send('Page.crash').catch(() => {});
  await crashed;
  // Chromium may co-locate same-origin tabs in the crashed renderer. Use a new realm after death.
  const cold = await context.newPage();
  await cold.goto(fixture);
  await call(cold, 'probe', 'after-death');
  await op(cold, 'after-death', 'rejected');
  await call(cold, 'probe', 'exclusive', 'local', true);
  await op(cold, 'exclusive', 'rejected');
  await call(cold, 'prepareClear', 'clear', code);
  await op(cold, 'clear', 'rejected');
  expect(await call(cold, 'state')).toMatchObject({
    initializations: 0,
    operations: { clear: { code: 'app-update-required' } },
  });
  expect(await call(cold, 'census')).toEqual(before);
  await cold.reload();
  await call(cold, 'probe', 'cold');
  await op(cold, 'cold', 'rejected');
  expect(await call(cold, 'census')).toEqual(before);
});

test('a cancelled blocked IndexedDB probe retains its permit until native settlement', async ({
  page,
  context,
}) => {
  await seed(page);
  await call(page, 'blockVersionUpgrade');
  await op(page, 'version-blocked', 'resolved');
  const reader = await context.newPage();
  await reader.goto(fixture);
  await call(reader, 'probe', 'blocked');
  await expect
    .poll(async () => ((await call(page, 'locks')) as { held: unknown[] }).held.length)
    .toBe(1);
  await call(reader, 'cancel', 'blocked');
  expect(await call(reader, 'state')).toMatchObject({
    initializations: 0,
    operations: { blocked: { state: 'pending' } },
  });
  expect(((await call(page, 'locks')) as { held: unknown[] }).held).toHaveLength(1);
  await call(page, 'releaseBlocker');
  await op(page, 'version-upgrade', 'resolved');
  await op(reader, 'blocked', 'rejected');
  await expect
    .poll(async () => ((await call(page, 'locks')) as { held: unknown[] }).held.length)
    .toBe(0);
  expect(await call(reader, 'state')).toMatchObject({ initializations: 0 });
});

test('a future document schema held only in the journal refuses without rewriting carriers', async ({
  page,
}) => {
  // Seed before ordinary application initialization so no concurrent schema register obscures the future value.
  await page.goto(fixture);
  const { code, scope } = (await call(page, 'seed')) as {
    code: string;
    scope: Record<string, string>;
  };
  await call(page, 'futureSchema', code, scope);
  const before = await call(page, 'census');
  await page.goto('/');
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'app-update-required');
  await page.goto(fixture);
  expect(await call(page, 'census')).toEqual(before);
});

test('unrelated slots remain usable and omitting the marker check actually admits an incompatible writer', async ({
  page,
  context,
}) => {
  await page.goto(fixture);
  await call(page, 'marker', null, 'local');
  await call(page, 'probe', 'other', 'other');
  await op(page, 'other', 'resolved');
  await call(page, 'probe', 'baseline');
  await op(page, 'baseline', 'rejected');
  const mutant = await context.newPage();
  await mutant.route('**/src/crdt/storageCompatibility.ts*', async (route) => {
    const response = await route.fetch(),
      source = await response.text();
    const anchor = 'if (present) throw new StorageCompatibilityError();';
    expect(source.split(anchor)).toHaveLength(2);
    await route.fulfill({
      response,
      body: source.replace(anchor, 'void present; // sensitivity control'),
    });
  });
  await mutant.goto(fixture);
  await call(mutant, 'probe', 'mutant');
  await op(mutant, 'mutant', 'resolved');
  expect(await call(mutant, 'state')).toMatchObject({ initializations: 1 });
});
