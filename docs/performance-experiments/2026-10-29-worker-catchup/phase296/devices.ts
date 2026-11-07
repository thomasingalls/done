import {expect,type Page} from '@playwright/test';
import {authenticator,unlock} from '../device-enrollment/helpers';
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
  const codeEntry = page.getByLabel('Unlock code', { exact: true });
  const saved = page.getByRole('button', {
    name: joining ? /Resume device connection/ : /^Unlock Device owner/,
  });
  // Root now resumes one protected account directly; pending/multiple accounts use the chooser.
  await expect.poll(async () => (await codeEntry.isVisible()) || (await saved.isVisible())).toBe(true);
  if (!(await codeEntry.isVisible())) await saved.click();
  await expect(codeEntry).toBeVisible();
  if (joining) await unlock(page, code);
  else {
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
  }
  await expect(page.locator('.shell')).toBeVisible({ timeout: 15000 });
}
export async function add(page: Page, text: string) {
  const compose = page.locator(
    '.day-panel[data-active="true"] .collection[data-section="done"] .compose-field',
  );
  await compose.fill(text);
  await compose.press('Enter');
  await expect(page.locator('.shell')).toContainText(text);
}
