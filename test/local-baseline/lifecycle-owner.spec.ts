import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from '../packaged-account/devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from '../packaged-account/server';
import { baselineLifecycleProbe } from './lifecycle-probe';

const reduced = process.env['ACCOUNT_RETENTION'] === '1';
type Owner = {
  removeLocalHistory(expectedRevision: number): Promise<{ kind: string; revision?: number }>;
  installLocalBaseline(): Promise<{ kind: string }>;
  advanceLocalRetention(expectedRevision: number): Promise<{ kind: string }>;
  replaceLocalBaseline(expectedRevision: number): Promise<{ kind: string }>;
  workspace: { whenDurable(): Promise<void>; status: { state: string } };
};
async function anchor(page: Page, revision?: number) {
  if (reduced) {
    for (const r of revision === undefined ? [0, 1] : [revision]) {
      await expect
        .poll(
          () =>
            page.evaluate(async (revision) => {
              const owner = (globalThis as unknown as { __baselineOwner: Owner }).__baselineOwner;
              await owner.workspace.whenDurable();
              return owner.removeLocalHistory(revision);
            }, r),
          { timeout: 20000 },
        )
        .toMatchObject({ kind: 'removed', revision: r + 1 });
    }
    return;
  }
  await expect
    .poll(
      () =>
        page.evaluate(async (revision) => {
          const owner = (globalThis as unknown as { __baselineOwner: Owner }).__baselineOwner;
          await owner.workspace.whenDurable();
          return revision === undefined
            ? owner.installLocalBaseline()
            : owner.replaceLocalBaseline(revision);
        }, revision),
      { timeout: 20000 },
    )
    .toEqual({ kind: revision === undefined ? 'installed' : 'replaced' });
  if (revision === undefined)
    expect(
      await page.evaluate(() =>
        (globalThis as unknown as { __baselineOwner: Owner }).__baselineOwner.advanceLocalRetention(
          1,
        ),
      ),
    ).toEqual({ kind: 'replaced' });
}
declare global {
  interface Window {
    MembershipCustody: typeof import('../account-membership/custody-entry');
  }
}
async function bundles(info: TestInfo) {
  const built = await build({
    configFile: false,
    logLevel: 'error',
    define: {
      'import.meta.env.VITE_ACCOUNT_BASELINE_INSTALL': JSON.stringify('1'),
      'import.meta.env.VITE_ACCOUNT_RETENTION': JSON.stringify(reduced ? '1' : '0'),
      'import.meta.env.VITE_ACCOUNT_BASELINE_READ': JSON.stringify(
        process.env['ACCOUNT_BASELINE_READ'] ?? '0',
      ),
    },
    plugins: [baselineLifecycleProbe()],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-membership/custody-entry.ts'),
        name: 'MembershipCustody',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(built) ? built[0]! : built;
  if (!('output' in result)) throw Error('No probe');
  const chunk = result.output.find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw Error('No probe');
  const outDir = info.outputPath('build');
  let hits = 0;
  await build({
    logLevel: 'error',
    build: { outDir },
    define: {
      'import.meta.env.VITE_ACCOUNT_BASELINE_INSTALL': JSON.stringify('1'),
      'import.meta.env.VITE_ACCOUNT_RETENTION': JSON.stringify(reduced ? '1' : '0'),
      'import.meta.env.VITE_ACCOUNT_BASELINE_READ': JSON.stringify(
        process.env['ACCOUNT_BASELINE_READ'] ?? '0',
      ),
    },
    plugins: [
      baselineLifecycleProbe(),
      {
        name: 'private-baseline-lifecycle-handle',
        enforce: 'pre',
        transform(code, id) {
          if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
          const at = '  clearAccountTransition(result.accountId);';
          if (code.split(at).length !== 2) throw Error('Private owner anchor changed');
          hits++;
          return code.replace(at, at + '\n  globalThis.__baselineOwner = result;');
        },
      },
    ],
  });
  expect(hits).toBe(1);
  return { chunk, outDir };
}
test(`${reduced ? 'Reduced' : 'Anchored'} owners survive initial handoff, two rotations, replacement, restart and detached editing`, async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const { chunk, outDir } = await bundles(info);
  const service = await startService(info.outputPath('service'), resolve(outDir), true, true);
  const thirdContext = await browser.newContext(),
    third = await thirdContext.newPage();
  third.setDefaultTimeout(15000);
  const observed = new Set<string>();
  const observe = (p: Page) =>
    p.on('console', (msg) => {
      if (msg.text().startsWith('baseline-lifecycle:'))
        observed.add(msg.text().slice('baseline-lifecycle:'.length));
    });
  observe(page);
  observe(third);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    page.on('response', async (r) => {
      if (r.url().includes('/removal/') && r.status() !== 200)
        console.log('Removal refusal', r.status(), await r.json().catch(() => ({})));
    });
    pair = await pairedEditors(page, browser, true, { beforeInvite: () => anchor(page) });
    observe(pair.second);
    await anchor(pair.second);
    pair.second.setDefaultTimeout(15000);
    await pair.second.getByRole('button', { name: 'Devices', exact: true }).click();
    await pair.second.getByRole('button', { name: 'Connect another device', exact: true }).click();
    await unlock(pair.second, pair.next.code);
    const link = await pair.second.getByLabel('Device invitation link').inputValue();
    const next = await pending(third, link, pair.next.auth);
    const comparison = await compared(pair.second, third);
    await pair.second.getByLabel('Code on the new device').fill(comparison);
    await pair.second.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    await third
      .getByRole('button', { name: 'Open your writing', exact: true })
      .click({ timeout: 30000 });
    await expect(pair.second.getByText('The device is connected.', { exact: false })).toBeVisible({
      timeout: 30000,
    });
    await pair.second.getByRole('link', { name: 'Close and return to accounts' }).click();
    await pair.second.goto('/');
    await openSaved(pair.second, pair.next.code, true);
    await add(pair.second, 'Writing before this device is removed');
    for (const p of [page, third])
      await expect(p.locator('.shell')).toContainText('Writing before this device is removed', {
        timeout: 20000,
      });
    // Read only a native device identifier before reopening its live editor.
    await pair.second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.second.goto('/');
    await pair.second.evaluate(chunk.code);
    const target = await pair.second.evaluate(
      async (code) =>
        window.MembershipCustody.participant(
          'joined',
          await window.MembershipCustody.accountSlot(),
          code,
        ),
      pair.next.code,
    );
    await openSaved(pair.second, pair.next.code, true);
    await anchor(third);
    await thirdContext.setOffline(true);
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await page.evaluate(chunk.code);
    const slot = await page.evaluate(() => window.MembershipCustody.accountSlot());
    let removal = await page.evaluate(
      ({ slot, code, target }) => window.MembershipCustody.removal('promotion', slot, code, target),
      { slot, code: pair.first.code, target },
    );
    console.log(
      'Removal stage',
      removal.result,
      removal.after.progress?.request.epoch,
      !!removal.after.progress?.preparation,
      !!removal.after.progress?.rotation,
      !!removal.after.successor,
    );
    await expect
      .poll(
        async () => {
          if (removal.result === 'pending')
            removal = await page.evaluate(
              ({ slot, code, target }) =>
                window.MembershipCustody.removal('promotion', slot, code, target),
              { slot, code: pair!.first.code, target },
            );
          return removal.result;
        },
        { timeout: 20000, intervals: [2000] },
      )
      .toBe('applying');
    // This device has not observed the successor: its genuine offline generation-one work remains valid.
    await add(third, 'Offline survivor writing after removal');
    await expect(pair.second.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    await thirdContext.setOffline(false);
    // Both old writers retire only after authenticated discovery (terminal proof for the removed one).
    await expect(third.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    console.log('Both observations retired their old editor');
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await third.goto('/');
    await openSaved(third, next.code, true);
    await expect(third.locator('.shell')).toContainText('Offline survivor writing after removal');
    await expect(page.locator('.shell')).toContainText('Offline survivor writing after removal', {
      timeout: 20000,
    });
    await add(page, 'Survivor generation two travels after passive activation');
    await expect(third.locator('.shell')).toContainText(
      'Survivor generation two travels after passive activation',
      { timeout: 20000 },
    );
    await add(third, 'Passive survivor replies with generation two');
    await expect(page.locator('.shell')).toContainText(
      'Passive survivor replies with generation two',
      { timeout: 20000 },
    );
    for (const [p, code, joining] of [
      [page, pair.first.code, false],
      [third, next.code, true],
    ] as const) {
      await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await p.goto('/');
      await openSaved(p, code, joining);
      await expect(p.locator('.shell')).toContainText(
        'Passive survivor replies with generation two',
      );
      await expect(p.locator('.workspace-status')).toHaveCount(0);
    }
    for (const p of [page, third]) {
      await anchor(p, 2);
      await expect
        .poll(
          () =>
            p.evaluate(async (reduced) => {
              const owner = (globalThis as unknown as { __baselineOwner: Owner }).__baselineOwner;
              try {
                return reduced
                  ? await owner.removeLocalHistory(2)
                  : await owner.replaceLocalBaseline(2);
              } catch (error) {
                // Retention retires old network flights. A durability barrier may observe that
                // pre-commit refusal; only retry while admission is still active.
                if (
                  error instanceof Error &&
                  error.message === 'Receive authority was superseded' &&
                  owner.workspace.status.state === 'active'
                )
                  return { kind: 'retired-flight' };
                throw error;
              }
            }, reduced),
          { timeout: 15000 },
        )
        .toEqual({ kind: reduced ? 'already-removed' : 'already-installed' });
    }
    // A second removal keeps the generation-two opener while its replacement pointer is pending.
    await third.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await third.goto('/');
    await third.evaluate(chunk.code);
    const secondTarget = await third.evaluate(
      async (code) =>
        window.MembershipCustody.participant(
          'joined',
          await window.MembershipCustody.accountSlot(),
          code,
        ),
      next.code,
    );
    await openSaved(third, next.code, true);
    await thirdContext.setOffline(true);
    await add(third, 'Second removed device keeps its offline generation-two writing');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await page.evaluate(chunk.code);
    const laterArgs = { slot, code: pair.first.code, target: secondTarget };
    const laterJournal = await page.evaluate(
      ({ slot, code }) => window.MembershipCustody.journalOnly('promotion', slot, code),
      laterArgs,
    );
    let later = await page.evaluate(
      ({ slot, code, target }) =>
        window.MembershipCustody.removal('promotion', slot, code, target, true),
      laterArgs,
    );
    expect(later.result).toBe('pending');
    expect(later.after.previous).toHaveLength(1);
    expect(later.after.previous![0]!.generation).toBe(2);
    await page.reload();
    await page.evaluate(chunk.code);
    await expect
      .poll(
        async () => {
          later = await page.evaluate(
            ({ slot, code, target }) =>
              window.MembershipCustody.removal('promotion', slot, code, target),
            laterArgs,
          );
          return later.result;
        },
        { timeout: 20000, intervals: [2000] },
      )
      .toBe('applying');
    expect(later.after.successor!.epoch.generation).toBe(3);
    expect(
      await page.evaluate(
        ({ slot, code }) => window.MembershipCustody.activateRemoval('promotion', slot, code, true),
        laterArgs,
      ),
    ).toEqual({ generation: 0, head: 'interrupted' });
    await page.reload();
    await page.evaluate(chunk.code);
    expect(
      await page.evaluate(
        ({ slot, code }) => window.MembershipCustody.activateRemoval('promotion', slot, code),
        laterArgs,
      ),
    ).toEqual({ generation: 3, head: later.after.successor!.head });
    expect(await page.evaluate((key) => localStorage.getItem(key), laterJournal)).toBeNull();
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await add(page, 'Generation three survives two rotations');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await expect(page.locator('.shell')).toContainText('Generation three survives two rotations');
    await thirdContext.setOffline(false);
    await expect(third.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    await third.goto('/');
    await openSaved(third, next.code, true);
    await expect(third.getByText('Removed from account.', { exact: false })).toBeVisible();
    await expect(third.locator('.shell')).toContainText(
      'Second removed device keeps its offline generation-two writing',
    );
    await expect(third.locator('.shell')).not.toContainText(
      'Generation three survives two rotations',
    );
    await add(third, 'Detached generation two can still edit');
    await third.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await third.goto('/');
    await openSaved(third, next.code, true);
    await expect(third.locator('.shell')).toContainText('Detached generation two can still edit');
    const networkWrites: string[] = [];
    pair.second.on('request', (r) => {
      if (r.url().includes('/account/delivery/') || r.url().includes('/notifications/'))
        networkWrites.push(r.url());
    });
    await pair.second.goto('/');
    await openSaved(pair.second, pair.next.code, true);
    await expect(pair.second.locator('.shell')).toContainText(
      'Writing before this device is removed',
    );
    await expect(pair.second.locator('.shell')).not.toContainText(
      'Survivor generation two travels after passive activation',
    );
    await expect(pair.second.getByText('Removed from account.', { exact: false })).toBeVisible();
    await add(pair.second, 'Writing retained only in this detached copy');
    await pair.second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.second.goto('/');
    await openSaved(pair.second, pair.next.code, true);
    await expect(pair.second.locator('.shell')).toContainText(
      'Writing retained only in this detached copy',
    );
    for (const p of [page, pair.second, third]) {
      await p.evaluate(() =>
        (
          globalThis as unknown as { __baselineOwner: Owner }
        ).__baselineOwner.workspace.whenDurable(),
      );
      expect(
        await p.evaluate(
          () =>
            (globalThis as unknown as { __baselineOwner: Owner }).__baselineOwner.workspace.status
              .state,
        ),
      ).toBe('active');
    }
    expect(networkWrites).toEqual([]);
    await expect(page.locator('.shell')).not.toContainText(
      'Writing retained only in this detached copy',
    );
    if (process.env['ACCOUNT_BASELINE_READ'] === '1')
      expect([...observed].sort()).toEqual([
        'catchup',
        'detached',
        'membership-source',
        'prospective',
        'rebase',
        'rotation',
        'rotation-journal',
      ]);
  } finally {
    for (const p of [pair?.second, third])
      if (p && !p.isClosed())
        console.log(
          'Secondary messages',
          await p.locator('[role=alert], [role=status]').allTextContents(),
        );
    await pair?.other.close();
    await thirdContext.close();
    await stopService(service);
  }
});

test('an anchored original device becomes an editable detached copy while its joined survivor rotates', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const { chunk, outDir } = await bundles(info);
  const service = await startService(info.outputPath('service'), resolve(outDir), true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true, { beforeInvite: () => anchor(page) });
    const second = pair.second;
    await anchor(second);
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await page.evaluate(chunk.code);
    const target = await page.evaluate(
      async (code) =>
        window.MembershipCustody.participant(
          'promotion',
          await window.MembershipCustody.accountSlot(),
          code,
        ),
      pair.first.code,
    );
    await openSaved(page, pair.first.code);
    await second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await second.goto('/');
    await second.evaluate(chunk.code);
    const slot = await second.evaluate(() => window.MembershipCustody.accountSlot());
    await expect
      .poll(
        () =>
          second.evaluate(
            async ({ slot, code, target }) =>
              (await window.MembershipCustody.removal('joined', slot, code, target)).result,
            { slot, code: pair!.next.code, target },
          ),
        { timeout: 20000, intervals: [1000] },
      )
      .toBe('applying');
    await expect(page.locator('.shell')).toHaveCount(0, { timeout: 25000 });
    await second.goto('/');
    await openSaved(second, pair.next.code, true);
    await anchor(second, 2);
    await add(second, 'Surviving joined owner writes after rotation');
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await expect(page.getByText('Removed from account.', { exact: false })).toBeVisible();
    const requests: string[] = [];
    page.on('request', (r) => {
      if (/\/account\/(delivery|notifications)\//.test(r.url())) requests.push(r.url());
    });
    await add(page, 'Detached original retains this writing');
    await page.evaluate(() =>
      (globalThis as unknown as { __baselineOwner: Owner }).__baselineOwner.workspace.whenDurable(),
    );
    expect(
      await page.evaluate(
        () =>
          (globalThis as unknown as { __baselineOwner: Owner }).__baselineOwner.workspace.status
            .state,
      ),
    ).toBe('active');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await expect(page.locator('.shell')).toContainText('Detached original retains this writing');
    await expect(page.locator('.shell')).not.toContainText(
      'Surviving joined owner writes after rotation',
    );
    expect(requests).toEqual([]);
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
