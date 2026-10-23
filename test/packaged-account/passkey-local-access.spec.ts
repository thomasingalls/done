import { test, expect, type Page } from '@playwright/test';
import { openApp, protectApp, openMenuSection } from '../geometry/openApp';
import { authenticator, createdAccount } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

const build = process.env['PASSKEY_TEST_BUILD'];
const writing = 'Retain this writing when passkey setup fails';
async function addWriting(page: Page) {
  const input = page.locator('.day-panel[data-active=true] [placeholder="What got done?"]');
  await input.fill(writing);
  await input.press('Enter');
  await expect(page.locator('.shell')).toContainText(writing);
}
async function syncSetup(page: Page, first = true) {
  await expect(page.locator('.shell')).toBeVisible();
  await openMenuSection(page, 'Sync');
  await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
  await page.getByRole('button', { name: 'Sync this list', exact: true }).click();
  if (first)
    await page.getByRole('button', { name: 'Continue to passkey setup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your passkey' })).toBeVisible();
}
async function extensionResponses(page: Page, mode: 'missing' | 'throwing') {
  await page.addInitScript((mode) => {
    const wrap = (credential: Credential | null): Credential | null => {
      if (!credential) return credential;
      const real = credential as PublicKeyCredential;
      // Preserve actual authenticator-signed bytes but remove the browser-specific class brand.
      const result: Record<string, unknown> = {
        id: real.id,
        rawId: real.rawId,
        type: real.type,
        authenticatorAttachment: real.authenticatorAttachment,
        response: real.response,
        getClientExtensionResults: () => real.getClientExtensionResults(),
      };
      if (mode === 'throwing')
        result['toJSON'] = () => {
          throw new TypeError('Wrong native credential brand');
        };
      return result as unknown as Credential;
    };
    const create = navigator.credentials.create.bind(navigator.credentials);
    const get = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.create = async (options) => wrap(await create(options));
    navigator.credentials.get = async (options) => wrap(await get(options));
  }, mode);
}
for (const mode of ['missing', 'throwing'] as const)
  test(`extension response with ${mode} native JSON method completes verified account setup and cold reopen`, async ({
    page,
  }, info) => {
    const service = await startService(info.outputPath('service'), build, true, true);
    try {
      await extensionResponses(page, mode);
      const { code } = await createdAccount(page);
      await addWriting(page);
      await page.reload();
      await page.getByLabel('Unlock code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
      await expect(page.locator('.shell')).toContainText(writing);
    } finally {
      await stopService(service);
    }
  });

test('cancelled passkey setup retains offline Local access and the same resumable attempt', async ({
  page,
  context,
}, info) => {
  const service = await startService(info.outputPath('service'), build, true, true);
  try {
    await openApp(page);
    await addWriting(page);
    const code = await protectApp(page);
    await page.addInitScript(() => {
      navigator.credentials.create = async () => {
        throw new DOMException('Cancelled', 'NotAllowedError');
      };
    });
    await page.reload();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await syncSetup(page);
    await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('cancelled');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Back to local workspace', exact: true }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.shell')).toContainText(writing);
    await page.reload();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.shell')).toContainText(writing);
    await context.setOffline(false);
    await syncSetup(page, false);
    await expect(page.getByLabel('Unlock code', { exact: true })).toHaveCount(0);
  } finally {
    await stopService(service);
  }
});

test('a failed online continuation accepts the correct code and offers Local access without another passkey', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), build, true, true);
  try {
    await openApp(page);
    await addWriting(page);
    const code = await protectApp(page);
    await authenticator(page);
    await syncSetup(page);
    await page.goto('/accounts');
    await page.getByRole('button', { name: /Continue setup for/ }).click();
    await page.route('**/__account-setup/begin', (route) => route.abort());
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('unlock code was accepted');
    await expect(page.getByLabel('Unlock code', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to local workspace', exact: true }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.shell')).toContainText(writing);
  } finally {
    await stopService(service);
  }
});

test('an altered extension assertion is refused while the original protected Local writing stays accessible', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), build, true, true);
  try {
    await openApp(page);
    await addWriting(page);
    const code = await protectApp(page);
    await authenticator(page);
    await syncSetup(page);
    await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Use my passkey', exact: true })).toBeVisible();
    await page.evaluate(() => {
      const get = navigator.credentials.get.bind(navigator.credentials);
      navigator.credentials.get = async (options) => {
        const credential = (await get(options)) as PublicKeyCredential;
        const response = credential.response as AuthenticatorAssertionResponse;
        const signature = new Uint8Array(response.signature.slice(0));
        signature[0] = signature[0]! ^ 1;
        return {
          id: credential.id,
          rawId: credential.rawId,
          type: credential.type,
          getClientExtensionResults: () => credential.getClientExtensionResults(),
          response: {
            clientDataJSON: response.clientDataJSON,
            authenticatorData: response.authenticatorData,
            signature: signature.buffer,
            userHandle: response.userHandle,
          },
        } as unknown as Credential;
      };
    });
    await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('service could not complete');
    await expect(page.locator('.shell')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to local workspace', exact: true }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.shell')).toContainText(writing);
  } finally {
    await stopService(service);
  }
});
