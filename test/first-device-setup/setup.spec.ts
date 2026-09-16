import { test, expect, type Page } from '@playwright/test';
const entry = '/private/account-setup.html';
const phase = (page: Page, name: string) =>
  expect(page.locator('.account-setup')).toHaveAttribute('data-setup-state', name);
async function local(page: Page) {
  await page.goto(entry);
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

test('homepage welcome opens account choice and a first account reopens through either entry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await phase(page, 'account-choice');
  await expect(page.getByRole('heading', { name: 'Choose an account', exact: true })).toBeVisible();
  await page.reload();
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
    await phase(page, 'unlock');
    await expect(page.getByLabel('Account ID', { exact: true })).toHaveText(id);
    await expect(
      page.getByRole('button', { name: 'Confirm code and unlock with passkey', exact: true }),
    ).toBeVisible();
    await reopen(page, code);
    await expect(page.locator('.shell')).toBeVisible();
  }
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

test('another account can be chosen despite matching names, without opening or replacing the saved writing', async ({
  page,
  browser,
}, testInfo) => {
  const a = await connectedAccount(page);
  const before = await slot(page);
  const aCredentials = (
    await a.auth.cdp.send('WebAuthn.getCredentials', { authenticatorId: a.auth.authenticatorId })
  ).credentials;
  const secondContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  let bId: string;
  try {
    const second = await secondContext.newPage();
    const b = await connectedAccount(second);
    bId = b.id;
    expect(bId).not.toBe(a.id);
    await expect(second.getByLabel('Actor name', { exact: true })).toHaveValue('Alex');
    const credentials = (
      await b.auth.cdp.send('WebAuthn.getCredentials', { authenticatorId: b.auth.authenticatorId })
    ).credentials;
    expect(credentials[0]!.userName).toBe(bId);
    expect(aCredentials[0]!.userName).toBe(a.id);
    // Model selecting B in the authenticator: offer only B for this ceremony.
    await a.auth.cdp.send('WebAuthn.removeCredential', {
      authenticatorId: a.auth.authenticatorId,
      credentialId: aCredentials[0]!.credentialId,
    });
    await a.auth.cdp.send('WebAuthn.addCredential', {
      authenticatorId: a.auth.authenticatorId,
      credential: credentials[0]!,
    });
  } finally {
    await secondContext.close();
  }
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await phase(page, 'account-choice');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.getByLabel('Device-lock code', { exact: true })).toHaveCount(0);
  await page.reload();
  await phase(page, 'account-choice');
  await page.evaluate(() => {
    const nativeGet = navigator.credentials.get.bind(navigator.credentials);
    (window as typeof window & { choicePrompts: number }).choicePrompts = 0;
    navigator.credentials.get = (options) => {
      if (options?.publicKey?.allowCredentials?.length)
        throw Error('Account choice must be discoverable');
      (window as typeof window & { choicePrompts: number }).choicePrompts++;
      return nativeGet(options);
    };
  });
  let lost = false;
  await page.route('**/__account-setup/finish', async (route) => {
    if (lost) return route.continue();
    lost = true;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('needs a connection');
  await page.getByRole('button', { name: 'Retry verification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account verified' })).toBeVisible();
  expect(
    await page.evaluate(() => (window as typeof window & { choicePrompts: number }).choicePrompts),
  ).toBe(1);
  expect(await page.getByLabel('Account ID', { exact: true }).allTextContents()).toEqual([
    bId!,
    a.id,
  ]);
  await expect(
    page.getByText(
      'This account’s writing is not on this device. Device linking is not available in this preview yet.',
    ),
  ).toBeVisible();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  expect(await slot(page)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('different-account-verified.png') });
  // Restore A's credential and use its ordinary local unlock after leaving discovery.
  await a.auth.cdp.send('WebAuthn.addCredential', {
    authenticatorId: a.auth.authenticatorId,
    credential: aCredentials[0]!,
  });
  await page
    .getByRole('list', { name: 'Saved accounts' })
    .getByRole('button', { name: `Unlock Alex, account ${a.id}`, exact: true })
    .click();
  await expect(page.getByLabel('Account ID', { exact: true })).toHaveText(a.id);
  // The discovery-only assertion guard is no longer appropriate for a scoped local unlock.
  await page.reload();
  await reopen(page, a.code);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
    'Writing from before account setup',
  );
});

test('cancelled account choice returns safely, and choosing the saved account still requires local unlock', async ({
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
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await page.evaluate(() => {
    const nativeGet = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = () => {
      navigator.credentials.get = nativeGet;
      return Promise.reject(new DOMException('Cancelled', 'NotAllowedError'));
    };
  });
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('selection cancelled');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account verified' })).toBeVisible();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await savedAccount.click();
  await phase(page, 'unlock');
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
