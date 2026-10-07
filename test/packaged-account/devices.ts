import { expect, type Browser, type Page } from '@playwright/test';
import { account, pending, compared, authenticator, unlock } from '../device-enrollment/helpers';
export async function pairedEditors(page: Page, browser: Browser) {
  const first = await account(page);
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    const next = await pending(second, first.link, first.auth);
    await page.getByLabel('Code on the new device').fill(await compared(page, second));
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    for (const p of [page, second])
      await expect(
        p.getByText('Content access is installed and certified.', { exact: false }),
      ).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Make writing available', exact: true }).click();
    await expect(
      page.getByText('Your writing is available to the approved device.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Close and return to accounts' }).click();
    await page.getByRole('button', { name: /^Unlock Device owner/ }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(first.code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
    await expect(page.locator('.shell')).toBeVisible();
    await second.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(second.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 15000,
    });
    for (const p of [page, second])
      await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    return { first, next, second, other };
  } catch (cause) {
    await other.close();
    throw cause;
  }
}
export type SavedCredential = {
  credentialId: string;
  isResidentCredential: boolean;
  rpId?: string;
  privateKey: string;
  userHandle?: string;
  signCount: number;
};
export async function credentials(
  auth: Awaited<ReturnType<typeof authenticator>>,
): Promise<SavedCredential[]> {
  return (await auth.cdp.send('WebAuthn.getCredentials', { authenticatorId: auth.authenticatorId }))
    .credentials;
}
export async function restoreAuthenticator(
  page: Page,
  saved: Awaited<ReturnType<typeof credentials>>,
) {
  const auth = await authenticator(page);
  for (const credential of saved)
    await auth.cdp.send('WebAuthn.addCredential', {
      authenticatorId: auth.authenticatorId,
      credential,
    });
  return auth;
}
export async function openSaved(page: Page, code: string, joining = false) {
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await page
    .getByRole('button', { name: joining ? /Resume device connection/ : /^Unlock Device owner/ })
    .click();
  if (joining) await unlock(page, code);
  else {
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
  }
  await expect(page.locator('.shell')).toBeVisible();
}
export async function add(page: Page, text: string) {
  const compose = page.locator('.day-panel[data-active="true"] .compose-field');
  await compose.fill(text);
  await compose.press('Enter');
  await expect(page.locator('.shell')).toContainText(text);
}
