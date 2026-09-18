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
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await page
    .getByRole('button', { name: 'Create invitation for Device owner', exact: true })
    .click();
  await unlock(page, code);
  await expect(page.getByLabel('Device invitation link')).toBeVisible();
  return { code, auth, link: await page.getByLabel('Device invitation link').inputValue() };
}
async function unlock(page: Page, code: string) {
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page
    .getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ })
    .click();
}
async function pending(page: Page, link: string, auth: Awaited<ReturnType<typeof authenticator>>) {
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
async function compared(first: Page, second: Page) {
  await expect(first.getByLabel('Code on the new device')).toBeVisible({ timeout: 15000 });
  await expect(second.getByLabel('Comparison code')).toBeVisible({ timeout: 30000 });
  return (await second.getByLabel('Comparison code').textContent())!;
}

test('root chooser resumes pending and approved connections; old attempts learn the invitation once without trusting route hints', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext();
  const second = await other.newPage();
  try {
    const next = await pending(second, first.link, first.auth);
    const original = await compared(page, second);
    const workspace = new URL(first.link).searchParams.get('workspace')!;
    const choose = async (workspaceId = workspace) => {
      await second.goto(new URL('/', first.link).href);
      await expect(
        second.getByRole('heading', { name: 'Your Workspace', exact: true }),
      ).toBeVisible();
      await second.reload();
      await expect(
        second.getByRole('heading', { name: 'Your Workspace', exact: true }),
      ).toBeVisible();
      await second.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
      await second
        .getByRole('button', {
          name: `Resume device connection, workspace ${workspaceId}`,
          exact: true,
        })
        .click();
      expect(new URL(second.url()).searchParams.has('invitation')).toBe(false);
      await expect(second.getByLabel('Device-lock code', { exact: true })).toBeVisible();
    };
    await choose();
    let bootstraps = 0;
    second.on('request', (request) => {
      if (request.url().endsWith('/ceremony/bootstrap')) bootstraps++;
    });
    await unlock(second, first.code);
    await expect(second.getByRole('alert')).toBeVisible();
    expect(bootstraps).toBe(0);
    await unlock(second, next.code);
    await expect(second.getByLabel('Comparison code')).toHaveText(original, { timeout: 15000 });
    await page.getByLabel('Code on the new device').fill(original);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(second.getByRole('heading', { name: 'Device approved', exact: true })).toBeVisible(
      { timeout: 15000 },
    );
    await choose();
    await unlock(second, next.code);
    await expect(
      second.getByRole('heading', { name: 'Device approved', exact: true }),
    ).toBeVisible();

    // Simulate the previous build's authenticated state, which had no saved invitation.
    await second.evaluate(
      async ({ workspace, code }) => {
        const path = '/src/account/ceremonyVault.ts';
        const { withCeremonyVault } = await import(/* @vite-ignore */ path);
        const slot = localStorage.getItem('done.pending-device.' + workspace)!;
        await withCeremonyVault(slot, code, new AbortController().signal, async (owner: any) => {
          const progress = await owner.load();
          delete progress.invitation;
          await owner.save(progress);
        });
      },
      { workspace, code: next.code },
    );
    await choose();
    await unlock(second, next.code);
    await expect(second.getByRole('alert')).toContainText('Open the original invitation');
    await second.goto(first.link);
    await unlock(second, next.code);
    await expect(
      second.getByRole('heading', { name: 'Device approved', exact: true }),
    ).toBeVisible();
    await choose();
    await unlock(second, next.code);
    await expect(
      second.getByRole('heading', { name: 'Device approved', exact: true }),
    ).toBeVisible();

    const forged = (workspace[0] === '0' ? '1' : '0') + workspace.slice(1);
    await second.evaluate(
      ({ workspace, forged }) => {
        localStorage.setItem(
          'done.pending-device.' + forged,
          localStorage.getItem('done.pending-device.' + workspace)!,
        );
      },
      { workspace, forged },
    );
    await choose(forged);
    const before = bootstraps;
    await unlock(second, next.code);
    await expect(second.getByRole('alert')).toContainText(
      'Saved approval belongs to a different account',
    );
    await expect(second.getByRole('heading', { name: 'Device approved', exact: true })).toHaveCount(
      0,
    );
    expect(bootstraps).toBe(before);
    await choose();
    await unlock(second, next.code);
    await expect(
      second.getByRole('heading', { name: 'Device approved', exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

async function holdNextBootstrap(page: Page) {
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let intercepted = false;
  const handler = async (route: import('@playwright/test').Route) => {
    if (!intercepted) {
      intercepted = true;
      reached();
      await gate;
    }
    await route.continue();
  };
  await page.route('**/__account-setup/ceremony/bootstrap', handler);
  return {
    held,
    release,
    dispose: async () => {
      release();
      await page.unroute('**/__account-setup/ceremony/bootstrap', handler);
    },
  };
}

test('background checks keep invitation, focus and layout stable; a failed check remains visible and can be retried', async ({
  page,
}) => {
  const first = await account(page);
  const link = page.getByLabel('Device invitation link');
  await link.focus();
  await link.evaluate((element: HTMLInputElement) => element.setSelectionRange(0, 12));
  const position = await page
    .getByRole('link', { name: 'Close and return to accounts' })
    .boundingBox();
  const nonces: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/ceremony/bootstrap')) nonces.push(request.postDataJSON().nonce);
  });
  await page.evaluate(() => {
    (window as any).__busyFlashes = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        if (
          [...record.addedNodes].some((node) =>
            node.textContent?.includes('Saving and checking this step'),
          )
        )
          (window as any).__busyFlashes++;
      }
    }).observe(document.querySelector('.enrollment-panel')!, { childList: true, subtree: true });
  });
  const poll = await holdNextBootstrap(page);
  try {
    await poll.held;
    await expect(page.getByText('Saving and checking this step…', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check again' })).toBeEnabled();
    poll.release();
    // A subsequent automatic request proves the held check finished and polling stayed live.
    await expect.poll(() => nonces.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    expect(new Set(nonces).size).toBe(nonces.length);
    await expect(link).toHaveValue(first.link);
    await expect(link).toBeFocused();
    expect(
      await link.evaluate((element: HTMLInputElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    ).toEqual([0, 12]);
    expect(
      await page.getByRole('link', { name: 'Close and return to accounts' }).boundingBox(),
    ).toEqual(position);
    expect(await page.evaluate(() => (window as any).__busyFlashes)).toBe(0);
  } finally {
    await poll.dispose();
  }
  await page.route('**/__account-setup/ceremony/bootstrap', (route) => route.abort());
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  await expect(link).toHaveValue(first.link);
  await page.unroute('**/__account-setup/ceremony/bootstrap');
  const retried = page.waitForResponse('**/__account-setup/ceremony/bootstrap');
  await page.getByRole('button', { name: 'Check again' }).click();
  await retried;
  await expect(page.getByText('Saving and checking this step…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(link).toHaveValue(first.link);
});

test('a comparison clicked during a background check waits and publishes exactly once', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext();
  const second = await other.newPage();
  let poll: Awaited<ReturnType<typeof holdNextBootstrap>> | undefined;
  try {
    await pending(second, first.link, first.auth);
    const code = await compared(page, second);
    const input = page.getByLabel('Code on the new device');
    await input.fill(code);
    poll = await holdNextBootstrap(page);
    await poll.held;
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(code);
    const approve = page.getByRole('button', { name: 'Compare and approve' });
    await expect(approve).toBeEnabled();
    let decisions = 0;
    page.on('request', (request) => {
      if (
        request.url().endsWith('/ceremony/exchange') &&
        request.postDataJSON().action === 'decide'
      )
        decisions++;
    });
    await approve.click();
    await expect(approve).toBeDisabled();
    expect(decisions).toBe(0);
    poll.release();
    await expect(page.getByRole('heading', { name: 'Device approved', exact: true })).toBeVisible();
    await expect(second.getByRole('heading', { name: 'Device approved', exact: true })).toBeVisible(
      { timeout: 15000 },
    );
    expect(decisions).toBe(1);
  } finally {
    await poll?.dispose();
    await other.close();
  }
});

test('a queued comparison rechecks peer cancellation instead of approving stale displayed state', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext();
  const second = await other.newPage();
  let poll: Awaited<ReturnType<typeof holdNextBootstrap>> | undefined;
  try {
    await pending(second, first.link, first.auth);
    const code = await compared(page, second);
    await page.getByLabel('Code on the new device').fill(code);
    poll = await holdNextBootstrap(page);
    await poll.held;
    let decisions = 0;
    page.on('request', (request) => {
      if (
        request.url().endsWith('/ceremony/exchange') &&
        request.postDataJSON().action === 'decide'
      )
        decisions++;
    });
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await second.getByRole('button', { name: 'Cancel this attempt' }).click();
    await expect(second.getByText('This attempt was cancelled.', { exact: true })).toBeVisible();
    poll.release();
    await expect(page.getByText('This attempt was cancelled.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Code on the new device')).toHaveCount(0);
    await expect(page.getByText('Saving and checking this step…', { exact: true })).toHaveCount(0);
    expect(decisions).toBe(0);
  } finally {
    await poll?.dispose();
    await other.close();
  }
});

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
    await unlock(page, first.code);
    await expect(page.getByLabel('Code on the new device')).toBeVisible();
    const wrong = (original[0] === '0' ? '1' : '0') + original.slice(1);
    await page.getByLabel('Code on the new device').fill(wrong);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(page.getByRole('heading', { name: 'Codes did not match' })).toBeVisible();
    await page.evaluate(() => history.back());
    await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await page
      .getByRole('button', { name: 'Create invitation for Device owner', exact: true })
      .click();
    await page.reload();
    await unlock(page, first.code);
    await expect(page.getByRole('heading', { name: 'Codes did not match' })).toBeVisible();
    await expect(page.getByLabel('Code on the new device')).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test('browser Back locks and resumes both devices without replacing codes, cancelling attempts or replaying approval', async ({
  page,
  browser,
}) => {
  const first = await account(page);
  const back = (target: Page) => target.evaluate(() => history.back());
  await back(page);
  await expect(page.getByRole('heading', { name: 'Use an invitation' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Create invitation for Device owner', exact: true })
    .click();
  await unlock(page, first.code);
  await expect(page.getByLabel('Device invitation link')).toBeVisible();
  expect(
    new URL(await page.getByLabel('Device invitation link').inputValue()).searchParams.get(
      'workspace',
    ),
  ).toBe(new URL(first.link).searchParams.get('workspace'));
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    await second.goto(first.link);
    await expect(second.getByRole('button', { name: 'Prepare this device' })).toBeVisible();
    await back(second);
    await expect(second.getByRole('heading', { name: 'Use an invitation' })).toBeVisible();
    await second.getByLabel('Invitation from your other device').fill(first.link);
    await second.getByRole('button', { name: 'Connect this device', exact: true }).click();
    const nextAuth = await authenticator(second);
    const { credentials } = await first.auth.cdp.send('WebAuthn.getCredentials', {
      authenticatorId: first.auth.authenticatorId,
    });
    for (const credential of credentials)
      await nextAuth.cdp.send('WebAuthn.addCredential', {
        authenticatorId: nextAuth.authenticatorId,
        credential,
      });
    await second.getByRole('button', { name: 'Prepare this device' }).click();
    const code = (await second.getByLabel('Generated device-lock code').textContent())!;
    await second.getByRole('button', { name: 'I saved my device-lock code' }).click();
    await back(second);
    await expect(second.getByLabel('Generated device-lock code')).toHaveText(code);
    await back(second);
    await expect(second.getByRole('button', { name: 'Prepare this device' })).toBeVisible();
    await second.getByRole('button', { name: 'Prepare this device' }).click();
    await expect(second.getByLabel('Generated device-lock code')).toHaveText(code);
    await second.getByRole('button', { name: 'I saved my device-lock code' }).click();
    await unlock(second, code);
    await expect(second.getByRole('button', { name: 'Use account passkey' })).toBeVisible();
    const resume = async () => {
      await second.getByRole('button', { name: /^Resume device connection/ }).click();
      await unlock(second, code);
    };
    await back(second);
    await expect(second.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    await resume();
    await second.getByRole('button', { name: 'Use account passkey' }).click();
    const comparison = await compared(page, second);
    await back(second);
    await expect(second.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    await resume();
    await expect(second.getByLabel('Comparison code')).toHaveText(comparison);
    await page.getByLabel('Code on the new device').fill('unsent text');
    await back(page);
    await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await page
      .getByRole('button', { name: 'Create invitation for Device owner', exact: true })
      .click();
    await unlock(page, first.code);
    await expect(page.getByLabel('Code on the new device')).toHaveValue('');
    const staleComparisonRoute = page.url();
    await page.getByLabel('Code on the new device').fill(comparison);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(page.getByRole('heading', { name: 'Device approved' })).toBeVisible();
    await expect(second.getByRole('heading', { name: 'Device approved' })).toBeVisible({
      timeout: 15000,
    });
    await back(page);
    await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    await page.goto(staleComparisonRoute);
    await unlock(page, first.code);
    await expect(page.getByRole('heading', { name: 'Device approved' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compare and approve' })).toHaveCount(0);
  } finally {
    await other.close();
  }
});
