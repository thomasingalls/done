import { test, expect, type Page } from '@playwright/test';
async function authenticator(page: Page) {
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
async function account(page: Page) {
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
  await page.getByRole('link', { name: 'Connect another device' }).click();
  await page.getByRole('button', { name: 'Device owner', exact: true }).click();
  await unlock(page, code);
  await expect(page.getByLabel('Device invitation link')).toBeVisible();
  return { code, auth, link: await page.getByLabel('Device invitation link').inputValue() };
}
async function unlock(page: Page, code: string) {
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock enrollment' }).click();
}
async function pending(page: Page, link: string, auth: Awaited<ReturnType<typeof authenticator>>) {
  await page.goto(link);
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
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await unlock(page, code);
  await page.getByRole('button', { name: 'Use account passkey' }).click();
  return { code, auth: next };
}
async function compared(first: Page, second: Page) {
  await expect(first.getByLabel('Code on the new device')).toBeVisible({ timeout: 15000 });
  await expect(second.getByLabel('Comparison code')).toBeVisible({ timeout: 30000 });
  return (await second.getByLabel('Comparison code').textContent())!;
}

test('two independent profiles enroll and approve through real HTTP; both resume exact state after reload and a lost decision reply', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext();
  let second = await other.newPage();
  try {
    const next = await pending(second, first.link, first.auth);
    const original = await compared(page, second);
    const crash = await other.newCDPSession(second);
    const crashed = second.waitForEvent('crash');
    void crash.send('Page.crash').catch(() => {});
    await crashed;
    await second.close();
    second = await other.newPage();
    await second.goto(first.link);
    await unlock(second, next.code);
    await expect(second.getByLabel('Comparison code')).toHaveText(original, { timeout: 30000 });
    await page.reload();
    await page.getByRole('button', { name: 'Device owner', exact: true }).click();
    await unlock(page, first.code);
    await expect(page.getByLabel('Code on the new device')).toBeVisible();
    let lost = false;
    await page.route('**/__account-setup/ceremony/exchange', async (route) => {
      const input = route.request().postDataJSON();
      if (input.action === 'decide' && !lost) {
        lost = true;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page.getByLabel('Code on the new device').fill(original);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(lost).toBe(true);
    await page.unroute('**/__account-setup/ceremony/exchange');
    await page.reload();
    await page.getByRole('button', { name: 'Device owner', exact: true }).click();
    await unlock(page, first.code);
    await expect(page.getByRole('heading', { name: 'Device approved', exact: true })).toBeVisible();
    await expect(second.getByRole('heading', { name: 'Device approved', exact: true })).toBeVisible(
      { timeout: 30000 },
    );
    await expect(page.getByLabel('Code on the new device')).toHaveCount(0);
    await expect(second.locator('.shell')).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test('aborted comparison has no published result; a committed mismatch survives reopening without another guess', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext(),
    second = await other.newPage();
  try {
    await pending(second, first.link, first.auth);
    const original = await compared(page, second);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      let armed = true;
      IDBObjectStore.prototype.put = function (value: any, ...args: any[]) {
        if (armed && value?.approval?.sequence === value?.seal_reserved) {
          armed = false;
          this.transaction.abort();
          throw Error('Focused comparison commit abort');
        }
        return put.call(this, value, ...args);
      };
    });
    await page.getByLabel('Code on the new device').fill(original);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Device approved', exact: true })).toHaveCount(
      0,
    );
    await page.reload();
    await page.getByRole('button', { name: 'Device owner', exact: true }).click();
    await unlock(page, first.code);
    await expect(page.getByLabel('Code on the new device')).toBeVisible();
    const wrong = (original[0] === '0' ? '1' : '0') + original.slice(1);
    await page.getByLabel('Code on the new device').fill(wrong);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(page.getByRole('heading', { name: 'Codes did not match' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Device owner', exact: true }).click();
    await unlock(page, first.code);
    await expect(page.getByRole('heading', { name: 'Codes did not match' })).toBeVisible();
    await expect(page.getByLabel('Code on the new device')).toHaveCount(0);
  } finally {
    await other.close();
  }
});
