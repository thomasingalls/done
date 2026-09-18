import { test, expect, type Page } from '@playwright/test';
const entry = '/private/account-setup.html';
const phase = (page: Page, name: string) =>
  expect(page.locator('.account-setup')).toHaveAttribute('data-setup-state', name);
async function local(page: Page, path = entry) {
  await page.goto(path);
  await page.getByRole('button', { name: 'Create a local-only workspace' }).click();
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my code', exact: true }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and create' }).click();
  await expect(page.locator('.shell')).toBeVisible();
  const compose = page.locator('.day-panel[data-active="true"] .compose-field');
  await compose.fill('Writing from before account setup');
  await compose.press('Enter');
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
  return code;
}
async function start(page: Page, code: string) {
  await page.getByRole('button', { name: 'Connect this workspace', exact: true }).click();
  if (!(await page.getByLabel('Your name', { exact: true }).inputValue()))
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await phase(page, 'passkey');
}
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
async function recoveryCode(page: Page) {
  await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
  await phase(page, 'confirm-passkey');
  await page.getByRole('button', { name: 'Use my passkey' }).click();
  await phase(page, 'save-recovery');
  return (await page.getByLabel('Generated recovery code').textContent())!;
}
async function reopen(page: Page, code: string) {
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page
    .getByRole('button', { name: /^(Continue|Confirm code and unlock with passkey)$/ })
    .click();
}
async function connectedAccount(page: Page) {
  const code = await local(page);
  const auth = await authenticator(page);
  await start(page, code);
  const recovery = await recoveryCode(page);
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Confirm and connect' }).click();
  await expect(page.locator('.shell')).toBeVisible();
  return { code, auth, id: (await page.getByLabel('Account ID', { exact: true }).textContent())! };
}
async function slot(page: Page, slotId = 'local') {
  return page.evaluate(async (selected) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('done.slots');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction('slots'),
          r = tx.objectStore('slots').get(selected);
        tx.oncomplete = () => resolve(r.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, slotId);
}

async function startNewAccount(page: Page, name: string) {
  await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create a new account' })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await phase(page, 'save-device-code');
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm device-lock code' }).click();
  await phase(page, 'passkey');
  return code;
}

test('a locked local workspace keeps account creation and switching available for another person', async ({
  page,
}) => {
  const localCode = await local(page);
  const beforeLocal = await slot(page);
  await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
  await expect(page.locator('[data-state="unlock-required"]')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await phase(page, 'account-choice');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open local-only workspace' })).toBeVisible();
  const accountCode = await startNewAccount(page, 'Another person');
  await authenticator(page);
  const recovery = await recoveryCode(page);
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Finish account setup', exact: true }).click();
  await expect(page.locator('.shell')).toBeVisible();
  const id = (await page.getByLabel('Account ID', { exact: true }).textContent())!;
  await expect(page.locator('.day-panel[data-active="true"] .card')).toHaveCount(0);
  const compose = page.locator('.day-panel[data-active="true"] .compose-field');
  await compose.fill('Only the other person’s writing');
  await compose.press('Enter');
  expect(await slot(page)).toEqual(beforeLocal);
  await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await page.getByRole('button', { name: 'Open local-only workspace' }).click();
  await expect(page.locator('[data-state="unlock-required"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-state="unlock-required"]')).toBeVisible();
  await page.getByLabel('Device-lock code', { exact: true }).fill(accountCode);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('[data-state="unlock-failed"]')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Use another account', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Device-lock code', { exact: true }).fill(localCode);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.day-panel[data-active="true"] .card')).toHaveCount(1);
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await page
    .getByRole('button', { name: `Unlock Another person, account ${id}`, exact: true })
    .click();
  await reopen(page, accountCode);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.day-panel[data-active="true"] .card')).toHaveCount(1);
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Only the other person’s writing',
  );
});

test('password-manager app switching preserves code-saving and confirmation steps', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    const sockets: WebSocket[] = [];
    Object.assign(window, {
      setupPageInstance: crypto.randomUUID(),
      setupDevelopmentSockets: sockets,
    });
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (protocols === 'vite-hmr') sockets.push(this);
      }
    };
  });
  await page.goto(entry);
  const instance = await page.evaluate(() => (window as any).setupPageInstance);
  const cdp = await page.context().newCDPSession(page);
  const awayAndBack = async () => {
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      // The former preview reloads after this socket loss, without any app lock request.
      for (const socket of (window as any).setupDevelopmentSockets as WebSocket[])
        if (socket.readyState === WebSocket.OPEN) socket.close();
    });
    await page.context().setOffline(true);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.context().setOffline(false);
    await page.evaluate(() => {
      delete (document as any).visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(await page.evaluate(() => (window as any).setupPageInstance)).toBe(instance);
  };
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Mobile setup');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await awayAndBack();
  await expect(page.getByLabel('Generated device-lock code')).toHaveText(code);
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await awayAndBack();
  await expect(page.getByLabel('Device-lock code', { exact: true })).toHaveValue(code);
  await page.getByRole('button', { name: 'Confirm device-lock code', exact: true }).click();
  await authenticator(page);
  const recovery = await recoveryCode(page);
  await awayAndBack();
  await expect(page.getByLabel('Generated recovery code')).toHaveText(recovery);
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await awayAndBack();
  await expect(page.getByLabel('Recovery code', { exact: true })).toHaveValue(recovery);
  await page.getByRole('button', { name: 'Finish account setup', exact: true }).click();
  await expect(page.locator('.shell')).toBeVisible();
  expect(await page.evaluate(() => (window as any).setupPageInstance)).toBe(instance);
  // Explicit lock still ends the open session and requires its factors again.
  await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
  await phase(page, 'unlock');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('homepage welcome opens account choice and a first account reopens through either entry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await phase(page, 'account-choice');
  await expect(page.getByRole('heading', { name: 'Choose an account', exact: true })).toBeVisible();
  await page.reload();
  await phase(page, 'account-choice');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your Workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await phase(page, 'account-choice');
  await authenticator(page);
  const code = await startNewAccount(page, 'Alex');
  const recovery = await recoveryCode(page);
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Finish account setup', exact: true }).click();
  await expect(page.locator('.shell')).toBeVisible();
  const id = (await page.getByLabel('Account ID', { exact: true }).textContent())!;
  for (const url of [entry, '/local.html', '/']) {
    await page.goto(url);
    if (url === '/') {
      await expect(
        page.getByRole('heading', { name: 'Your Workspace', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
      await page.getByRole('button', { name: `Unlock Alex, account ${id}`, exact: true }).click();
    }
    await phase(page, 'unlock');
    await expect(page.getByLabel('Account ID', { exact: true })).toHaveText(id);
    await expect(
      page.getByRole('button', { name: 'Confirm code and unlock with passkey', exact: true }),
    ).toBeVisible();
    await reopen(page, code);
    await expect(page.locator('.shell')).toBeVisible();
  }
});

test('root splash preserves Local writing and an unfinished account until explicitly selected', async ({
  page,
}) => {
  const code = await local(page, '/');
  const before = await slot(page);
  await page.goto('/private/account-enrollment.html');
  await page.evaluate(() => history.back());
  await phase(page, 'account-choice');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your Workspace', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your Workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Create a new account', exact: true }),
  ).toBeVisible();
  const selected = await page.evaluate(() =>
    sessionStorage.getItem('done.account-setup.selected-slot'),
  );
  await page.reload();
  await phase(page, 'intro');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your Workspace', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Create a new account', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Continue setup for new account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Create a new account', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem('done.account-setup.selected-slot')),
  ).toBe(selected);
  await page.getByRole('button', { name: 'Choose an account', exact: true }).click();
  await page.getByRole('button', { name: 'Open local-only workspace' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
  expect(await slot(page)).toEqual(before);
});

test('create a second account on this device, resume it, and switch between isolated writing and factors', async ({
  page,
}, testInfo) => {
  const a = await connectedAccount(page);
  const beforeA = await slot(page);
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  const bCode = await startNewAccount(page, 'Alex');
  expect(bCode).not.toBe(a.code);
  const bSlot = await page.evaluate(() =>
    sessionStorage.getItem('done.account-setup.selected-slot'),
  );
  expect(bSlot).toMatch(/^account-[a-f0-9]{32}$/);
  const beforeB = await slot(page, bSlot!);
  expect(beforeB.stores[0].principal).not.toBe(beforeA.stores[0].principal);
  expect(beforeB.stores[0].workspace).not.toBe(beforeA.stores[0].workspace);
  expect(beforeB.stores[0].dbName).not.toBe(beforeA.stores[0].dbName);
  await page.reload();
  await phase(page, 'unlock');
  await reopen(page, a.code);
  await expect(page.getByRole('alert')).toContainText('Check your device-lock code');
  await reopen(page, bCode);
  await phase(page, 'passkey');
  const recovery = await recoveryCode(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await reopen(page, bCode);
  await phase(page, 'confirm-recovery');
  await expect(page.getByLabel('Generated recovery code')).toHaveCount(0);
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Finish account setup', exact: true }).click();
  await expect(page.locator('.shell')).toBeVisible();
  const bId = (await page.getByLabel('Account ID', { exact: true }).textContent())!;
  expect(bId).not.toBe(a.id);
  await expect(page.locator('.day-panel[data-active="true"] .card')).toHaveCount(0);
  await expect(page.getByLabel('Actor name', { exact: true })).toHaveValue('Alex');
  const compose = page.locator('.day-panel[data-active="true"] .compose-field');
  await compose.fill('Only in the second account');
  await compose.press('Enter');
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Only in the second account',
  );
  expect(await slot(page)).toEqual(beforeA);
  const b = await slot(page, bSlot!);
  expect(b.stores).toEqual(beforeB.stores);
  expect(b.account).toBeDefined();
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  const list = page.getByRole('list', { name: 'Saved accounts' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(
    list.getByRole('button', { name: `Unlock Alex, account ${a.id}`, exact: true }),
  ).toBeVisible();
  await expect(
    list.getByRole('button', { name: `Unlock Alex, account ${bId}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('two-saved-accounts.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath('two-saved-accounts-narrow.png'),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 900 });
  await list.getByRole('button', { name: `Unlock Alex, account ${a.id}`, exact: true }).click();
  await reopen(page, a.code);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.day-panel[data-active="true"] .card')).toHaveCount(1);
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await list.getByRole('button', { name: `Unlock Alex, account ${bId}`, exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Account ID', { exact: true })).toHaveText(bId);
  await page.route('**/__account-setup/**', (route) => route.abort('internetdisconnected'));
  await reopen(page, bCode);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.day-panel[data-active="true"] .card')).toHaveCount(1);
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Only in the second account',
  );
});

test('leaving a new account before code confirmation keeps one resumable draft and preserves the original account', async ({
  page,
}) => {
  const a = await connectedAccount(page);
  const beforeA = await slot(page);
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('New person');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const firstCode = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'Choose an account', exact: true }).click();
  const list = page.getByRole('list', { name: 'Saved accounts' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByLabel('Generated device-lock code')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue new account setup', exact: true }).click();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('New person');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  expect(code).not.toBe(firstCode);
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(firstCode);
  await page.getByRole('button', { name: 'Confirm device-lock code' }).click();
  await expect(page.getByRole('alert')).toContainText('That code does not match');
  await page.getByRole('button', { name: 'Choose an account', exact: true }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  expect(await slot(page)).toEqual(beforeA);
  await list.getByRole('button', { name: `Unlock Alex, account ${a.id}`, exact: true }).click();
  await reopen(page, a.code);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
});
test('existing writing survives recovery reload, wrong code, lost admission reply, and offline Account reopen', async ({
  page,
}) => {
  const code = await local(page),
    before = await slot(page);
  await page.getByLabel('Actor name', { exact: true }).fill('Original name');
  await page.getByLabel('Device name', { exact: true }).fill('Original device');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();
  await authenticator(page);
  await start(page, code);
  const recovery = await recoveryCode(page);
  // A reload cannot show the code again or silently replace it.
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await phase(page, 'unlock');
  await reopen(page, code);
  await phase(page, 'confirm-recovery');
  await expect(page.getByLabel('Generated recovery code')).toHaveCount(0);
  await page.getByLabel('Recovery code', { exact: true }).fill('wrong-code');
  await page.getByRole('button', { name: 'Confirm and connect' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await slot(page)).account).toBeUndefined();
  let lost = false;
  await page.route('**/__account-setup/promotion/finish', async (route) => {
    if (lost) return route.continue();
    lost = true;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Confirm and connect' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(lost).toBe(true);
  await page.reload();
  await reopen(page, code);
  await phase(page, 'confirm-recovery');
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Confirm and connect' }).click();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20000 });
  expect((await slot(page)).stores).toEqual(before.stores);
  expect((await slot(page)).account).toBeDefined();
  await expect(page.getByLabel('Actor name', { exact: true })).toHaveValue('Original name');
  await expect(page.getByLabel('Device name', { exact: true })).toHaveValue('Original device');
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
  const compose = page.locator('.day-panel[data-active="true"] .compose-field');
  await compose.fill('Writing after account setup');
  await compose.press('Enter');
  await expect(page.locator('.day-panel[data-active="true"] .card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await phase(page, 'unlock');
  await expect(page.getByRole('heading', { name: 'Unlock Original name’s account' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Account setup progress' })).toHaveCount(0);
  await expect(page.getByText('Recovery code', { exact: true })).toHaveCount(0);
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await page.reload();
  await phase(page, 'unlock');
  await expect(page.getByRole('list', { name: 'Account setup progress' })).toHaveCount(0);
  await page.route('**/__account-setup/**', (route) => route.abort('internetdisconnected'));
  await reopen(page, code);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.day-panel[data-active="true"] .card')).toHaveCount(2);
  await expect(
    page.getByText('Account connected. Device sync is not enabled in this preview.'),
  ).toBeVisible();
});

test('one tab owns setup across idle screens and releases it when closed', async ({
  page,
  context,
}) => {
  const code = await local(page);
  await authenticator(page);
  await start(page, code);
  const second = await context.newPage();
  await second.goto(entry);
  await expect(second.getByRole('alert')).toHaveText(
    'Account setup is open in another tab. Continue there or close it.',
  );
  await expect(second.getByRole('button', { name: 'Create passkey', exact: true })).toHaveCount(0);
  await page.close();
  await reopen(second, code);
  await phase(second, 'passkey');
});

test('daily unlock rejects a wrong code before prompting and lets a cancelled passkey retry offline', async ({
  page,
}) => {
  const code = await local(page);
  await authenticator(page);
  await start(page, code);
  const recovery = await recoveryCode(page);
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Confirm and connect' }).click();
  await expect(page.locator('.shell')).toBeVisible();
  const before = await slot(page);
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await phase(page, 'unlock');
  await expect(page.getByText('You can unlock on this device offline.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unlock Alex’s account' })).toBeVisible();

  type Probe = { calls: number; cancelNext: boolean };
  await page.evaluate(() => {
    const probe: Probe = { calls: 0, cancelNext: true };
    (window as typeof window & { dailyAccessProbe: Probe }).dailyAccessProbe = probe;
    const nativeGet = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = (options) => {
      probe.calls++;
      if (probe.cancelNext) {
        probe.cancelNext = false;
        return Promise.reject(new DOMException('User cancelled', 'NotAllowedError'));
      }
      return nativeGet(options);
    };
  });
  const calls = () =>
    page.evaluate(
      () => (window as typeof window & { dailyAccessProbe: Probe }).dailyAccessProbe.calls,
    );
  let serviceRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/__account-setup/')) serviceRequests++;
  });
  await page.route('**/__account-setup/**', (route) => route.abort('internetdisconnected'));

  await reopen(page, 'wrong-code');
  await expect(page.getByRole('alert')).toContainText('Check your device-lock code');
  expect(await calls()).toBe(0);
  await expect(page.getByRole('button', { name: 'Start setup again' })).toHaveCount(0);
  await reopen(page, code);
  await expect(page.getByRole('alert')).toHaveText('Passkey request cancelled. You can try again.');
  await expect(page.getByLabel('Device-lock code', { exact: true })).toHaveValue('');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Account setup progress' })).toHaveCount(0);
  expect(await calls()).toBe(1);
  expect(await slot(page)).toEqual(before);

  await reopen(page, code);
  await expect(page.locator('.shell')).toBeVisible();
  expect(await calls()).toBe(2);
  expect(serviceRequests).toBe(0);
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await reopen(page, code);
  await expect(page.locator('.shell')).toBeVisible();
  expect(await calls()).toBe(3);
  expect(serviceRequests).toBe(0);
});

test('an existing unnamed preview account gains its name after unlock and remembers later edits', async ({
  page,
}, testInfo) => {
  const code = await local(page);
  const { cdp, authenticatorId } = await authenticator(page);
  await start(page, code);
  const recovery = await recoveryCode(page);
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Confirm and connect' }).click();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.getByLabel('Actor name', { exact: true })).toHaveValue('Alex');
  const credentials = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  expect(credentials.credentials).toHaveLength(1);
  expect(credentials.credentials[0]?.userName).toBe(
    await page.getByLabel('Account ID', { exact: true }).textContent(),
  );
  // Model the prior preview: its encrypted identity is still "You" and the UI
  // record predates name/connected fields. Its actual keys and writing stay intact.
  await page.getByLabel('Actor name', { exact: true }).fill('You');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await phase(page, 'unlock');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('done.first-device-setup.v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempt', 'readwrite');
        const store = tx.objectStore('attempt');
        const request = store.get('current');
        request.onsuccess = () => {
          const saved = request.result;
          delete saved.name;
          delete saved.connected;
          delete saved.requestedName;
          store.put(saved, 'current');
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await reopen(page, code);
  await phase(page, 'name');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Account setup progress' })).toHaveCount(0);
  await page.getByLabel('Your name', { exact: true }).fill('Thomas');
  await page.getByRole('button', { name: 'Continue to writing' }).click();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.getByLabel('Actor name', { exact: true })).toHaveValue('Thomas');
  expect((await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials).toHaveLength(
    1,
  );
  await page.getByLabel('Actor name', { exact: true }).fill('Tom');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Tom’s account' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unlock Tom’s account' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('named-account-unlock.png') });
  await reopen(page, code);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.getByLabel('Actor name', { exact: true })).toHaveValue('Tom');
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
});

test('development service refuses uncredentialed API calls and does not serve its private files', async ({
  request,
}) => {
  expect(
    (
      await request.post('/__account-setup/begin', {
        data: { operation: 'register', retryKey: 'x' },
      })
    ).status(),
  ).toBe(403);
  for (const path of [
    '/.dev/account-setup-browser-tests/operator.key',
    '/.dev/account-setup-browser-tests/account.sqlite',
    '/.dev/account-setup-browser-tests/pin.json',
  ])
    expect((await request.get(path)).status()).toBe(403);
});

test('use another account opens device connection without a passkey or changing saved writing', async ({
  page,
}) => {
  const a = await connectedAccount(page);
  const before = await slot(page);
  await page.addInitScript(() => {
    const nativeGet = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = (options) => {
      sessionStorage.setItem('connection-passkey-prompted', 'yes');
      return nativeGet(options);
    };
  });
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await phase(page, 'account-choice');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await page.reload();
  await phase(page, 'account-choice');
  await expect(page.getByRole('link', { name: 'Connect another device' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect devices', exact: true })).toBeVisible();
  await expect(page.getByLabel('Invitation from your other device')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create invitation for Alex', exact: true }),
  ).toBeVisible();
  for (const invalid of [
    'not an invitation',
    'https://example.com/private/account-enrollment.html',
  ]) {
    await page.getByLabel('Invitation from your other device').fill(invalid);
    await page.getByRole('button', { name: 'Connect this device', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('complete device invitation link');
    await expect(page.getByRole('heading', { name: 'Connect devices', exact: true })).toBeVisible();
  }
  expect(
    await page.evaluate(() => sessionStorage.getItem('connection-passkey-prompted')),
  ).toBeNull();
  expect(await slot(page)).toEqual(before);
  await page.getByRole('link', { name: 'Close and return to accounts' }).click();
  await page
    .getByRole('list', { name: 'Saved accounts' })
    .getByRole('button', { name: `Unlock Alex, account ${a.id}`, exact: true })
    .click();
  await phase(page, 'unlock');
  await reopen(page, a.code);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
});

test('saved account choice works by keyboard and still requires local unlock', async ({
  page,
}, testInfo) => {
  const a = await connectedAccount(page);
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
  const savedAccounts = page.getByRole('list', { name: 'Saved accounts' });
  await expect(savedAccounts.getByRole('listitem')).toHaveCount(1);
  const savedAccount = savedAccounts.getByRole('button', {
    name: `Unlock Alex, account ${a.id}`,
    exact: true,
  });
  await expect(savedAccount).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to saved account' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('saved-account-picker.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('saved-account-picker-narrow.png') });
  await savedAccount.focus();
  await savedAccount.press('Enter');
  await phase(page, 'unlock');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.getByLabel('Account ID', { exact: true })).toHaveText(a.id);
  await reopen(page, a.code);
  await expect(page.locator('.shell')).toBeVisible();
});

test('wrong local code never starts registration; a lost registration reply reuses the same passkey', async ({
  page,
}) => {
  const code = await local(page);
  const { cdp, authenticatorId } = await authenticator(page);
  let begins = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/__account-setup/begin')) begins++;
  });
  await page.getByRole('button', { name: 'Connect this workspace' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Alex');
  await page.getByRole('button', { name: 'Get started' }).click();
  await reopen(page, 'wrong-code');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(begins).toBe(0);
  await reopen(page, code);
  await phase(page, 'passkey');
  let lost = false;
  await page.route('**/__account-setup/finish', async (route) => {
    if (lost) return route.continue();
    lost = true;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await reopen(page, code);
  await phase(page, 'confirm-passkey');
  expect((await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials).toHaveLength(
    1,
  );
  await page.getByRole('button', { name: 'Use my passkey' }).click();
  await phase(page, 'save-recovery');
});

test('an unsaved recovery code can be abandoned without changing Local writing', async ({
  page,
}) => {
  const code = await local(page),
    before = await slot(page);
  await authenticator(page);
  await start(page, code);
  await recoveryCode(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await reopen(page, code);
  await phase(page, 'confirm-recovery');
  await page.getByRole('button', { name: 'I didn’t save the code — start again' }).click();
  await phase(page, 'intro');
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.shell')).toBeVisible();
  expect(await slot(page)).toEqual(before);
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
});

// Browser history is driven without waiting for a document load: a blocked POP
// can intentionally stay in the same document while its owner drains.
const back = (page: Page) => page.evaluate(() => history.back());
const forward = (page: Page) => page.evaluate(() => history.forward());

test('browser Back retains unconfirmed device codes and name drafts, then skips committed creation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a local-only workspace' }).click();
  const localCode = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my code', exact: true }).click();
  await back(page);
  await expect(page.getByLabel('Generated device-lock code')).toHaveText(localCode);
  await back(page);
  await expect(page.getByRole('heading', { name: 'Your Workspace' })).toBeVisible();
  await forward(page);
  await expect(page.getByLabel('Generated device-lock code')).toHaveText(localCode);
  await page.getByRole('button', { name: 'I saved my code', exact: true }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(localCode);
  await page.getByRole('button', { name: 'Confirm and create' }).click();
  await expect(page.locator('.shell')).toBeVisible();
  const before = await slot(page);
  await back(page);
  await phase(page, 'account-choice');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Remember this draft');
  await back(page);
  await phase(page, 'account-choice');
  await page.getByRole('button', { name: 'Continue new account setup', exact: true }).click();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Remember this draft');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await back(page);
  await expect(page.getByLabel('Generated device-lock code')).toHaveText(code);
  await back(page);
  await phase(page, 'intro');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByLabel('Generated device-lock code')).toHaveText(code);
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm device-lock code' }).click();
  await phase(page, 'passkey');
  const selected = await page.evaluate(() =>
    sessionStorage.getItem('done.account-setup.selected-slot'),
  );
  const created = await slot(page, selected!);
  await back(page);
  await phase(page, 'account-choice');
  await page.getByRole('button', { name: /^Continue setup for Remember this draft/ }).click();
  await reopen(page, code);
  await phase(page, 'passkey');
  expect(await slot(page, selected!)).toEqual(created);
  expect(await slot(page)).toEqual(before);
});

test('browser Back redisplays recovery only within its unfinished ceremony and warns before retiring it', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  const code = await startNewAccount(page, 'Recovery navigation');
  const auth = await authenticator(page);
  await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
  await phase(page, 'confirm-passkey');
  const credentials = await auth.cdp.send('WebAuthn.getCredentials', {
    authenticatorId: auth.authenticatorId,
  });
  await back(page);
  await phase(page, 'account-choice');
  await page.getByRole('button', { name: /^Continue setup for Recovery navigation/ }).click();
  await reopen(page, code);
  await phase(page, 'confirm-passkey');
  const retained = await auth.cdp.send('WebAuthn.getCredentials', {
    authenticatorId: auth.authenticatorId,
  });
  expect(retained.credentials.map((value) => value.credentialId)).toEqual(
    credentials.credentials.map((value) => value.credentialId),
  );
  await page.getByRole('button', { name: 'Use my passkey' }).click();
  const recovery = (await page.getByLabel('Generated recovery code').textContent())!;
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await back(page);
  await expect(page.getByLabel('Generated recovery code')).toHaveText(recovery);
  await forward(page);
  await phase(page, 'confirm-recovery');
  await back(page);
  await phase(page, 'save-recovery');
  const warning = page.waitForEvent('dialog');
  await back(page);
  const dialog = await warning;
  expect(dialog.message()).toContain('discard the recovery code');
  await dialog.dismiss();
  await expect(page).toHaveURL(/\/save-recovery$/);
  await expect(page.getByLabel('Generated recovery code')).toHaveText(recovery);
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Choose an account', exact: true }).click();
  await phase(page, 'account-choice');
  await page.getByRole('button', { name: /^Continue setup for Recovery navigation/ }).click();
  await reopen(page, code);
  await phase(page, 'confirm-recovery');
  await expect(page.getByLabel('Generated recovery code')).toHaveCount(0);
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Finish account setup', exact: true }).click();
  await expect(page.locator('.shell')).toBeVisible();
  await back(page);
  await phase(page, 'account-choice');
  await expect(page.getByLabel('Generated recovery code')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finish account setup', exact: true })).toHaveCount(
    0,
  );
  const retainedState = await page.evaluate(() =>
    JSON.stringify({
      history: history.state,
      session: { ...sessionStorage },
      local: { ...localStorage },
    }),
  );
  expect(retainedState).not.toContain(code);
  expect(retainedState).not.toContain(recovery);
});

test('Back during registration drains the owner and resumes the saved passkey proof after a lost reply', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  const code = await startNewAccount(page, 'Pending registration');
  const auth = await authenticator(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committed!: () => void;
  const received = new Promise<void>((resolve) => {
    committed = resolve;
  });
  await page.route(
    '**/__account-setup/finish',
    async (route) => {
      const response = await route.fetch();
      committed();
      await gate;
      await route.fulfill({ response }).catch(() => {});
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
  await received;
  await back(page);
  await phase(page, 'account-choice');
  release();
  await page.getByRole('button', { name: /^Continue setup for Pending registration/ }).click();
  await reopen(page, code);
  await phase(page, 'confirm-passkey');
  const { credentials } = await auth.cdp.send('WebAuthn.getCredentials', {
    authenticatorId: auth.authenticatorId,
  });
  expect(credentials).toHaveLength(1);
});

test('legacy entry read failure keeps an explicit error instead of guessing a fresh account', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
      if (args[0] === 'done.first-device-setup.v1') throw Error('Focused saved setup read failure');
      return open(...args);
    };
  });
  await page.goto(entry);
  await expect(page.getByRole('alert')).toHaveText(
    'Saved setup could not be read. Your browser data has been kept.',
  );
  await expect(page.getByRole('button', { name: 'Create a new account' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Return to done' }).click();
  await expect(page.getByRole('heading', { name: 'Your Workspace' })).toBeVisible();
});
