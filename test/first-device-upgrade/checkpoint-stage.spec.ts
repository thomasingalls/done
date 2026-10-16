import { test, expect, type Page } from '@playwright/test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { authenticator, pending, compared } from '../device-enrollment/helpers';

const port = process.env['ACCOUNT_SETUP_UPGRADE_PORT'] ?? '53212';
const origin = `http://localhost:${port}`;
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((yes, no) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      no(Error('Preview did not shut down cleanly'));
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      yes();
    });
    child.kill('SIGTERM');
  });
}
async function marker(page: Page, slot: string) {
  return page.evaluate(async (slot) => {
    const db = await new Promise<IDBDatabase>((yes, no) => {
      const r = indexedDB.open('done.custody');
      r.onsuccess = () => yes(r.result);
      r.onerror = () => no(r.error);
    });
    try {
      return await new Promise<any>((yes, no) => {
        const tx = db.transaction('entries');
        const r = tx.objectStore('entries').get([slot, 'application-upgrade']);
        tx.oncomplete = () =>
          yes({
            v: r.result?.v,
            stage: r.result?.stage,
            successor: !!r.result?.successor,
            checkpoint: !!r.result?.catchup,
            macBytes: r.result?.mac?.length,
          });
        tx.onabort = () => no(tx.error);
      });
    } finally {
      db.close();
    }
  }, slot);
}

test('a genuine retained local-only Account commits an authenticated v6 checkpoint and cold-resumes into v9 sync', async ({
  page,
  browser,
}, info) => {
  const baseline = process.env['ACCOUNT_SETUP_UPGRADE_BASE'];
  if (!baseline)
    throw Error(
      'Set ACCOUNT_SETUP_UPGRADE_BASE to the original schema-five preview checkout (7dab01cc).',
    );
  const env = {
    ...process.env,
    ACCOUNT_SETUP_PORT: port,
    ACCOUNT_SETUP_STATE: info.outputPath('service'),
  };
  const children: ChildProcess[] = [];
  let other: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  async function start(root: string) {
    const child = spawn(process.execPath, ['scripts/dev-account-setup.mjs'], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    await new Promise<void>((yes, no) => {
      let output = '';
      const timer = setTimeout(() => no(Error('Preview startup timed out: ' + output)), 30000);
      child.once('error', (e) => {
        clearTimeout(timer);
        no(e);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        no(Error(`Preview exited (${code}): ${output}`));
      });
      const chunk = (b: Buffer) => {
        output = (output + b.toString()).slice(-8000);
        if (output.includes('Account setup development:')) {
          clearTimeout(timer);
          yes();
        }
      };
      child.stdout!.on('data', chunk);
      child.stderr!.on('data', chunk);
    });
    return child;
  }
  const text = 'Original retained checkpoint writing';
  try {
    const old = await start(resolve(baseline));
    await page.goto(origin + '/private/account-setup.html');
    const auth = await authenticator(page);
    await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Checkpoint owner');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const code = (await page.getByLabel('Generated device-lock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm device-lock code' }).click();
    await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
    await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
    const recovery = (await page.getByLabel('Generated recovery code').textContent())!;
    await page.getByRole('button', { name: 'I saved my recovery code' }).click();
    await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await page.getByRole('button', { name: 'Finish account setup', exact: true }).click();
    const input = page.locator('.day-panel[data-active=true] [placeholder="What got done?"]');
    await input.fill(text);
    await input.press('Enter');
    await expect(page.locator('.shell')).toContainText(text);
    const slot = (await page.evaluate(() =>
      sessionStorage.getItem('done.account-setup.selected-slot'),
    ))!;
    expect(slot).toMatch(/^account-[a-f0-9]{32}$/);
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    expect(await marker(page, slot)).toMatchObject({
      v: 5,
      stage: 'account-active',
      successor: false,
      checkpoint: false,
      macBytes: 32,
    });
    await page.goto('about:blank');
    await stop(old);
    const upgrade = execFileSync(process.execPath, ['scripts/upgrade-account-setup.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(upgrade).toContain('schema 5 → 11');
    await start(process.cwd());
    await page.goto(
      origin + '/connect/unlock?slot=' + slot + '&begin=' + randomUUID().replaceAll('-', ''),
    );
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock and get invitation', exact: true }).click();
    const link = await page.getByLabel('Device invitation link').inputValue();
    other = await browser.newContext();
    const second = await other.newPage();
    await pending(second, link, auth);
    const comparison = await compared(page, second);
    await page.getByLabel('Code on the new device').fill(comparison);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    for (const p of [page, second])
      await expect(
        p.getByText('Content access is installed and certified.', { exact: false }),
      ).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Make writing available', exact: true }).click();
    await expect(
      page.getByText('Your writing is available to the approved device.', { exact: false }),
    ).toBeVisible();
    expect(await marker(page, slot)).toMatchObject({
      v: 6,
      stage: 'account-capturing',
      successor: true,
      checkpoint: true,
      macBytes: 32,
    });
    // Retire the ceremony and its keys, then use a fresh realm to verify the real v6 MAC.
    await page.getByRole('link', { name: 'Close and return to accounts' }).click();
    await page.reload();
    await page.getByRole('button', { name: /^Unlock Checkpoint owner/ }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page
      .getByRole('button', { name: 'Confirm code and unlock with passkey', exact: true })
      .click();
    await expect(page.locator('.shell')).toContainText(text);
    expect(await marker(page, slot)).toMatchObject({
      v: 9,
      stage: 'account-receiving',
      successor: true,
      checkpoint: true,
      macBytes: 32,
    });
    await second.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(second.locator('.shell')).toContainText(text, { timeout: 15000 });
    expect(
      (await auth.cdp.send('WebAuthn.getCredentials', { authenticatorId: auth.authenticatorId }))
        .credentials,
    ).toHaveLength(1);
  } finally {
    await other?.close();
    await page.goto('about:blank');
    for (const child of children) await stop(child);
  }
});
