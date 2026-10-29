import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createdAccount } from '../device-enrollment/helpers';
import { openMenuSection } from '../geometry/openApp';
import { add } from './devices';
import { startService, stopService } from './server';
async function nameFlow(page: Page, info: TestInfo, write: boolean) {
  page.setDefaultTimeout(15000);
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const observations: Record<string, unknown> = { write };
  try {
    const first = await createdAccount(page);
    if (write) await add(page, 'Name-test immediate writing');
    observations['beforeClose'] = await page.getByLabel('User name', { exact: true }).inputValue();
    await expect(page.getByLabel('User name', { exact: true })).toHaveValue('Device owner');
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Choose an account', exact: true }),
    ).toBeVisible();
    observations['chooser'] = await page
      .getByRole('button', { name: /^Unlock / })
      .allTextContents();
    await expect(page.getByRole('button', { name: /^Unlock Device owner/ })).toBeVisible();
    await page.getByRole('button', { name: /^Unlock Device owner/ }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(first.code);
    await page
      .getByRole('button', { name: 'Confirm code and unlock with passkey', exact: true })
      .click();
    await expect(page.locator('.shell')).toBeVisible();
    observations['afterReopen'] = await page.getByLabel('User name', { exact: true }).inputValue();
    await expect(page.getByLabel('User name', { exact: true })).toHaveValue('Device owner');
    if (write) await expect(page.locator('.shell')).toContainText('Name-test immediate writing');
  } finally {
    await info.attach('public-name-observations', {
      body: JSON.stringify(observations),
      contentType: 'application/json',
    });
    await stopService(service);
  }
}
test('native setup retains the entered user name through immediate empty close and reopen', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await nameFlow(page, info, false);
});
test('native setup retains the entered user name after immediate first writing, close and reopen', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await nameFlow(page, info, true);
});
