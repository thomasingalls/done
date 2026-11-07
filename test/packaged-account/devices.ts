import { expect, type Browser, type Page } from '@playwright/test';
import { account, pending, compared, authenticator, unlock } from '../device-enrollment/helpers';
export async function pairedEditors(
  page: Page,
  browser: Browser,
  sessions = false,
  hooks: {
    beforeCompare?: (second: Page) => Promise<void>;
    beforeInvite?: () => Promise<'invite' | void>;
  } = {},
) {
  const first = await account(page, hooks.beforeInvite);
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    const next = await pending(second, first.link, first.auth);
    if (sessions) {
      await expect(second.locator('[data-enrollment-state]')).toHaveAttribute(
        'data-enrollment-state',
        /^(waiting|display)$/,
        { timeout: 15000 },
      );
      // A fresh first-device opening now establishes its remembered login. The
      // enrollment ceremony resumes it without another passkey prompt.
    }
    const comparison = await compared(page, second);
    await hooks.beforeCompare?.(second);
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
    await page.getByRole('link', { name: 'Close and return to accounts' }).click();
    await page.getByRole('button', { name: /^Unlock Device owner/ }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(first.code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
    await expect(page.locator('.shell')).toBeVisible();
    await second.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(second.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 15000,
    });
    for (const p of [page, second])
      await expect
        .poll(
          () =>
            p.evaluate(async () =>
              (await navigator.serviceWorker.getRegistrations()).map(
                (r) => r.active?.state ?? r.installing?.state ?? r.waiting?.state ?? 'empty',
              ),
            ),
          {
            timeout: 15000,
            message: 'Packaged service worker must activate before offline checks',
          },
        )
        .toContain('activated');
    return { first, next, second, other };
  } catch (cause) {
    console.log(
      'Joining state:',
      await second
        .locator('[data-enrollment-state]')
        .getAttribute('data-enrollment-state')
        .catch(() => 'closed'),
    );
    console.log(
      'Joining messages:',
      await second
        .locator('[role=alert], [role=status]')
        .allTextContents()
        .catch(() => []),
    );
    await other.close().catch(() => {});
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
export async function openSaved(
  page: Page,
  code: string,
  joining = false,
  expected: 'editing' | 'removed' = 'editing',
) {
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
  // Native withdrawal can finish before the first Window editor is published. An expected
  // removal must wait for that refusal, rather than requiring a transient active editor.
  if (expected === 'removed')
    await expect(
      page.getByText('This device was removed from the account.', { exact: false }),
    ).toBeVisible({ timeout: 15000 });
  else await expect(page.locator('.shell')).toBeVisible({ timeout: 15000 });
}
export async function add(page: Page, text: string) {
  const compose = page.locator(
    '.day-panel[data-active="true"] .collection[data-section="done"] .compose-field',
  );
  await compose.fill(text);
  await compose.press('Enter');
  await expect(page.locator('.shell')).toContainText(text);
}
