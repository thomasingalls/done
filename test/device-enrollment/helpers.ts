import { expect, type Page } from '@playwright/test';
export async function authenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}
export async function account(page: Page, beforeInvite?: () => Promise<'invite' | void>) {
  await page.goto('/private/account-setup.html');
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Device owner');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm device-lock code', exact: true }).click();
  const auth = await authenticator(page);
  await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
  await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
  const recovery = (await page.getByLabel('Generated recovery code').textContent())!;
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Finish account setup' }).click();
  await expect(page.locator('.shell')).toBeVisible();
  const compose = page.locator('.day-panel[data-active="true"] .compose-field');
  await compose.fill('Keep the first device writing');
  await compose.press('Enter');
  const invitationStarted = await beforeInvite?.();
  if (invitationStarted !== 'invite') {
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await page
      .getByRole('button', { name: 'Create invitation for Device owner', exact: true })
      .click();
  }
  await unlock(page, code);
  await expect(page.getByLabel('Device invitation link')).toBeVisible();
  return { code, auth, link: await page.getByLabel('Device invitation link').inputValue() };
}
export async function unlock(page: Page, code: string) {
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page
    .getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ })
    .click();
}
export async function pending(
  page: Page,
  link: string,
  auth: Awaited<ReturnType<typeof authenticator>>,
) {
  await page.goto(new URL('/private/account-setup.html', link).href);
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(
    page.getByText('No connected account is saved in this browser yet.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Create invitation for/ })).toHaveCount(0);
  await page.getByLabel('Invitation from your other device').fill(link);
  await page.getByRole('button', { name: 'Connect this device', exact: true }).click();
  const next = await authenticator(page);
  const { credentials } = await auth.cdp.send('WebAuthn.getCredentials', {
    authenticatorId: auth.authenticatorId,
  });
  for (const credential of credentials)
    await next.cdp.send('WebAuthn.addCredential', {
      authenticatorId: next.authenticatorId,
      credential,
    });
  await page.getByRole('button', { name: 'Prepare this device' }).click();
  await expect(
    page.getByText('Keep your other device’s code; do not overwrite it.', { exact: false }),
  ).toBeVisible();
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await unlock(page, code);
  await page.getByRole('button', { name: 'Use account passkey' }).click();
  return { code, auth: next };
}
export async function compared(first: Page, second: Page) {
  await expect(first.getByLabel('Code on the new device')).toBeVisible({ timeout: 15000 });
  await expect(second.getByLabel('Comparison code')).toBeVisible({ timeout: 30000 });
  return (await second.getByLabel('Comparison code').textContent())!;
}
