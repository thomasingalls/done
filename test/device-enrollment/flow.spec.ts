import { test, expect, type Page } from '@playwright/test';
import { authenticator, account, unlock, pending, compared } from './helpers';
test('both certified devices edit, exchange concurrent offline writing, and reopen durably', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext(),
    second = await other.newPage();
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
    await page.getByLabel('Unlock code', { exact: true }).fill(first.code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
    await expect(page.locator('.shell')).toBeVisible();
    const add = async (p: Page, text: string) => {
      const compose = p.locator(
        '.day-panel[data-active="true"] .collection[data-section="done"] .compose-field',
      );
      await compose.fill(text);
      await compose.press('Enter');
      await expect(p.locator('.shell')).toContainText(text);
    };
    const acceptedBeforeOpen = page.waitForResponse(
      (r) => r.url().endsWith('/account/delivery/submit') && r.status() === 200,
    );
    await add(page, 'Stream writing before the second editor opens');
    await acceptedBeforeOpen;
    await second.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(second.locator('.shell')).toBeVisible({ timeout: 15000 });
    await expect(second.locator('.shell')).toContainText('Keep the first device writing');
    await expect(second.locator('.shell')).toContainText(
      'Stream writing before the second editor opens',
    );
    const submissions: string[] = [];
    // Own-stream accepted proofs can settle a lost submit reply without resubmitting.
    // Hold that independent recovery path out of this exact byte-retry schedule.
    await second.route('**/account/delivery/read*', (route) => route.abort());
    let loseReply = true;
    await second.route('**/account/delivery/submit', async (route) => {
      submissions.push(route.request().postDataBuffer()!.toString('hex'));
      if (loseReply) {
        loseReply = false;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await add(second, 'Second device publishes its own writing');
    await expect(page.locator('.shell')).toContainText('Second device publishes its own writing', {
      timeout: 30000,
    });
    await expect.poll(() => submissions.length, { timeout: 30000 }).toBeGreaterThan(1);
    expect(submissions[1]).toBe(submissions[0]);
    await second.unroute('**/account/delivery/read*');
    await add(page, 'First device replies through the encrypted stream');
    await expect(second.locator('.shell')).toContainText(
      'First device replies through the encrypted stream',
      { timeout: 30000 },
    );
    await page.context().setOffline(true);
    await other.setOffline(true);
    await add(page, 'Offline on the first device');
    await add(second, 'Offline on the second device');
    await page.context().setOffline(false);
    await other.setOffline(false);
    for (const p of [page, second]) {
      await expect(p.locator('.shell')).toContainText('Offline on the first device', {
        timeout: 30000,
      });
      await expect(p.locator('.shell')).toContainText('Offline on the second device', {
        timeout: 30000,
      });
    }
    const retainedMarker = await second.evaluate(async () => {
      const workspace = new URL(location.href).searchParams.get('workspace')!;
      const slot = localStorage.getItem('done.pending-device.' + workspace)!;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('done.custody');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        return await new Promise<any>((resolve, reject) => {
          const tx = db.transaction('entries', 'readwrite'),
            store = tx.objectStore('entries'),
            key = [slot, 'application-upgrade'],
            r = store.get(key);
          let marker: any;
          r.onsuccess = () => {
            marker = r.result;
            store.put({ ...marker, phase: 'installing' }, key);
          };
          tx.oncomplete = () => resolve({ key, marker });
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
    await second.reload();
    await unlock(second, next.code);
    await expect(second.getByRole('alert')).toContainText('authentication failed');
    await expect(second.locator('.shell')).toHaveCount(0);
    await second.evaluate(async ({ key, marker }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('done.custody');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('entries', 'readwrite');
          tx.objectStore('entries').put(marker, key);
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }, retainedMarker);
    await second.reload();
    await unlock(second, next.code);
    await expect(second.locator('.shell')).toBeVisible({ timeout: 15000 });
    await page.reload();
    await page.getByLabel('Unlock code', { exact: true }).fill(first.code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
    for (const p of [page, second])
      for (const text of [
        'Keep the first device writing',
        'Second device publishes its own writing',
        'First device replies through the encrypted stream',
        'Offline on the first device',
        'Offline on the second device',
      ])
        await expect(p.locator('.shell')).toContainText(text, { timeout: 15000 });
  } finally {
    await other.close();
  }
});

test('checkpoint retries preserve the source and refuse false coverage or an aborted receiver installation', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext(),
    second = await other.newPage();
  try {
    const next = await pending(second, first.link, first.auth);
    await page.getByLabel('Code on the new device').fill(await compared(page, second));
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    for (const p of [page, second])
      await expect(
        p.getByText('Content access is installed and certified.', { exact: false }),
      ).toBeVisible({ timeout: 30000 });
    const published: string[] = [];
    let lose = true;
    await page.route('**/__account-setup/content/checkpoint', async (route) => {
      if (route.request().postDataJSON().action === 'publish') {
        published.push(JSON.stringify(route.request().postDataJSON().payload));
        if (lose) {
          lose = false;
          await route.fetch();
          await route.abort();
          return;
        }
      }
      await route.continue();
    });
    await page.getByRole('button', { name: 'Make writing available', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.reload();
    await unlock(page, first.code);
    await page.getByRole('button', { name: 'Make writing available', exact: true }).click();
    await expect(
      page.getByText('Your writing is available to the approved device.', { exact: false }),
    ).toBeVisible();
    expect(published.length).toBe(2);
    expect(new Set(published).size).toBe(1);
    const forged = await page.evaluate(async (code) => {
      const vaultPath = '/src/account/ceremonyVault.ts',
        protocolPath = '/account-protocol/admission.ts';
      const { withCeremonyVault } = await import(/* @vite-ignore */ vaultPath);
      const { manifestMessage } = await import(/* @vite-ignore */ protocolPath);
      return withCeremonyVault(
        new URL(location.href).searchParams.get('slot')!,
        code,
        new AbortController().signal,
        async (owner: any) => {
          const c = structuredClone(owner.marker.catchup);
          c.manifest.sv += '00';
          c.manifest.signature = await owner.sign(await manifestMessage(c.manifest));
          return c;
        },
      );
    }, first.code);
    let forge = true,
      admissions = 0;
    await second.route('**/__account-setup/content/checkpoint', async (route) => {
      const action = route.request().postDataJSON().action;
      if (action === 'admit') admissions++;
      if (forge && action === 'read') {
        const response = await route.fetch(),
          body = await response.json();
        await route.fulfill({ response, json: { ...body, checkpoint: forged } });
        return;
      }
      await route.continue();
    });
    await second.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(second.getByRole('alert')).toContainText('coverage');
    await expect(second.locator('.shell')).toHaveCount(0);
    expect(admissions).toBe(0);
    forge = false;
    await second.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      let armed = true;
      IDBObjectStore.prototype.put = function (value: any, ...args: any[]) {
        const r = put.call(this, value, ...args);
        if (armed && value?.approval?.sequence === value?.seal_reserved) {
          armed = false;
          this.transaction.abort();
        }
        return r;
      };
    });
    await second.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(second.getByRole('alert')).toBeVisible();
    await expect(second.locator('.shell')).toHaveCount(0);
    expect(admissions).toBe(0);
    await second.reload();
    await unlock(second, next.code);
    await second.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: any, ...args: any[]) {
        const result = put.call(this, value, ...args);
        if (value?.kind === 'certified-account-device' && value.phase === 'active')
          this.transaction.abort();
        return result;
      };
    });
    await second.getByRole('button', { name: 'Open your writing', exact: true }).click();
    await expect(second.getByRole('alert')).toBeVisible();
    await expect(second.locator('.shell')).toHaveCount(0);
    const fenced = await second.evaluate(async () => {
      const sessionPath = '/src/crdt/writeSession.ts';
      const { openWriteSession } = await import(/* @vite-ignore */ sessionPath);
      const workspace = new URL(location.href).searchParams.get('workspace')!;
      const slot = localStorage.getItem('done.pending-device.' + workspace)!;
      try {
        const s = await openWriteSession(slot);
        await s.close();
        return false;
      } catch {
        return true;
      }
    });
    expect(fenced).toBe(true);
    await second.reload();
    await unlock(second, next.code);
    await expect(second.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 15000,
    });
    expect(admissions).toBe(1);
  } finally {
    await other.close();
  }
});

test('the approved second device can read through the preview delivery adapter using its own key', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext(),
    second = await other.newPage();
  let authorization = '';
  second.on('request', (request) => {
    if (request.url().endsWith('/__account-setup/ceremony/bootstrap'))
      authorization = request.headers()['authorization'] ?? '';
  });
  try {
    const next = await pending(second, first.link, first.auth);
    await page.getByLabel('Code on the new device').fill(await compared(page, second));
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(
      second.getByText('Content access is installed and certified.', { exact: false }),
    ).toBeVisible({ timeout: 30000 });
    const workspace = new URL(first.link).searchParams.get('workspace')!;
    const observed = await second.evaluate(
      async ({ workspace, code, authorization }) => {
        const vaultPath = '/src/account/ceremonyVault.ts',
          protocolPath = '/account-protocol/inboundTransport.ts';
        const { withCeremonyVault } = await import(/* @vite-ignore */ vaultPath);
        const { inboundRequestMessage, encodeInboundRequest, decodeInboundPage } = await import(
          /* @vite-ignore */ protocolPath
        );
        return withCeremonyVault(
          localStorage.getItem('done.pending-device.' + workspace)!,
          code,
          new AbortController().signal,
          async (owner: any) => {
            const p = await owner.load(),
              context = p.context;
            const request = {
              serviceId: context.pin.serviceId,
              origin: context.pin.origin,
              workspace,
              reader: owner.participant.id,
              publisher: context.existing.id,
              lineage: context.lineageId,
              head: p.content.certification.head,
              epoch: 3,
              after: 0,
              limit: 1,
              nonce: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
                b.toString(16).padStart(2, '0'),
              ).join(''),
              expires: Date.now() + 30000,
              signature: '00'.repeat(64),
            };
            request.signature = await owner.sign(inboundRequestMessage(request));
            const send = (body: Uint8Array<ArrayBuffer>, token = authorization) =>
              fetch('/account/delivery/read-v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream', Authorization: token },
                body,
              });
            const response = await send(encodeInboundRequest(request));
            const result = decodeInboundPage(new Uint8Array(await response.arrayBuffer()));
            const damaged = { ...request, publisher: owner.participant.id };
            damaged.signature = await owner.sign(inboundRequestMessage(damaged));
            const otherPublisher = await send(encodeInboundRequest(damaged));
            const unauthenticated = await send(encodeInboundRequest(request), '');
            const oversized = await send(new Uint8Array(4097));
            return {
              status: response.status,
              type: response.headers.get('content-type'),
              cache: response.headers.get('cache-control'),
              through: result.through,
              entries: result.entries.length,
              otherPublisher: otherPublisher.status,
              unauthenticated: unauthenticated.status,
              oversized: oversized.status,
            };
          },
        );
      },
      { workspace, code: next.code, authorization },
    );
    expect(observed).toEqual({
      status: 200,
      type: 'application/octet-stream',
      cache: 'no-store',
      through: 0,
      entries: 0,
      otherPublisher: 200,
      unauthenticated: 403,
      oversized: 413,
    });
  } finally {
    await other.close();
  }
});

test('content delivery resumes exact bytes after sender restart and receiver certifies only its saved installation', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext(),
    second = await other.newPage();
  try {
    const next = await pending(second, first.link, first.auth),
      sas = await compared(page, second);
    const sent: string[] = [];
    let loseDelivery = true;
    await page.route('**/ceremony/transfer', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'deliver') {
        sent.push(JSON.stringify(body.payload));
        if (loseDelivery) {
          loseDelivery = false;
          await route.fetch();
          await route.abort();
          return;
        }
      }
      await route.continue();
    });
    let refuseInstall = true,
      installationReached = false;
    await second.route('**/ceremony/transfer', async (route) => {
      if (route.request().postDataJSON().action === 'install' && refuseInstall) {
        installationReached = true;
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.getByLabel('Code on the new device').fill(sas);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect.poll(() => installationReached).toBe(true);
    const workspace = new URL(first.link).searchParams.get('workspace')!;
    const installed = await second.evaluate(
      async ({ workspace, code }) => {
        const path = '/src/account/ceremonyVault.ts';
        const { withCeremonyVault } = await import(/* @vite-ignore */ path);
        return withCeremonyVault(
          localStorage.getItem('done.pending-device.' + workspace)!,
          code,
          new AbortController().signal,
          async (owner: any) => {
            const p = await owner.load();
            // Factor-protected sealed key and recovery state precede the installation request.
            return p.content;
          },
        );
      },
      { workspace, code: next.code },
    );
    expect(installed.key.ct).toMatch(/^[a-f0-9]{96}$/);
    expect(installed.installation.deliveryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(installed.certification).toBeNull();
    await page.reload();
    await unlock(page, first.code);
    await expect.poll(() => sent.length).toBeGreaterThan(1);
    expect(new Set(sent).size).toBe(1);
    // Close the receiver after durable installation but before the service sees its countersignature.
    await second.close();
    const reopened = await other.newPage();
    refuseInstall = false;
    let loseCertification = true;
    const installations: unknown[] = [];
    await reopened.route('**/ceremony/transfer', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'install') {
        installations.push(body.payload);
        if (loseCertification) {
          loseCertification = false;
          await route.fetch();
          await route.abort();
          return;
        }
      }
      await route.continue();
    });
    await reopened.goto(first.link);
    await unlock(reopened, next.code);
    await expect(reopened.getByRole('alert')).toBeVisible();
    await reopened.reload();
    await unlock(reopened, next.code);
    await expect(reopened.locator('[data-enrollment-state="certified"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('[data-enrollment-state="certified"]')).toBeVisible({
      timeout: 15000,
    });
    await reopened.reload();
    await unlock(reopened, next.code);
    await expect(reopened.locator('[data-enrollment-state="certified"]')).toBeVisible();
    const recovered = await reopened.evaluate(
      async ({ workspace, code }) => {
        const path = '/src/account/ceremonyVault.ts';
        const { withCeremonyVault } = await import(/* @vite-ignore */ path);
        return withCeremonyVault(
          localStorage.getItem('done.pending-device.' + workspace)!,
          code,
          new AbortController().signal,
          async (owner: any) => (await owner.load()).content,
        );
      },
      { workspace, code: next.code },
    );
    expect(recovered.key).toEqual(installed.key);
    expect(recovered.installation).toEqual(installed.installation);
    expect(installations.length).toBeGreaterThan(1);
    expect(
      installations.every((i) => JSON.stringify(i) === JSON.stringify(installed.installation)),
    ).toBe(true);
    expect(recovered.certification.epoch.epoch).toBe(3);
    expect(recovered.delivery).toEqual(installed.delivery);
  } finally {
    await other.close();
  }
});

test('failed local installation save sends no countersignature; a cold retry installs the same delivery', async ({
  page,
  browser,
}) => {
  const first = await account(page),
    other = await browser.newContext(),
    second = await other.newPage();
  try {
    const next = await pending(second, first.link, first.auth),
      sas = await compared(page, second);
    let installs = 0;
    second.on('request', (r) => {
      if (r.url().endsWith('/ceremony/transfer') && r.postDataJSON().action === 'install')
        installs++;
    });
    // Abort the custody transaction after the sealed incoming key has been produced.
    // This is a real IndexedDB commit failure; reopening removes this process-local injection.
    await second.evaluate(() => {
      let incomingSealed = false;
      const encrypt = SubtleCrypto.prototype.encrypt;
      SubtleCrypto.prototype.encrypt = async function (algorithm, key, data) {
        const result = await encrypt.call(this, algorithm, key, data);
        const aad = (algorithm as AesGcmParams).additionalData;
        if (aad && new TextDecoder().decode(aad).includes('done/installed-content-key/v1'))
          incomingSealed = true;
        return result;
      };
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: unknown, ...args: []) {
        const r = value as { approval?: { sequence: number }; seal_reserved?: number };
        const request = put.call(this, value, ...args);
        if (
          this.transaction.db.name === 'done.custody' &&
          incomingSealed &&
          r.approval?.sequence === r.seal_reserved
        ) {
          this.transaction.abort();
        }
        return request;
      };
    });
    await page.getByLabel('Code on the new device').fill(sas);
    await page.getByRole('button', { name: 'Compare and approve' }).click();
    await expect(second.getByRole('alert')).toBeVisible({ timeout: 15000 });
    expect(installs).toBe(0);
    await second.reload();
    await unlock(second, next.code);
    await expect(second.locator('[data-enrollment-state="certified"]')).toBeVisible({
      timeout: 15000,
    });
    expect(installs).toBe(1);
  } finally {
    await other.close();
  }
});

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
        second.getByRole('heading', { name: 'Choose an account', exact: true }),
      ).toBeVisible();
      await second.reload();
      await expect(
        second.getByRole('heading', { name: 'Choose an account', exact: true }),
      ).toBeVisible();
      await second
        .getByRole('button', {
          name: `Resume device connection, workspace ${workspaceId}`,
          exact: true,
        })
        .click();
      expect(new URL(second.url()).searchParams.has('invitation')).toBe(false);
      await expect(second.getByLabel('Unlock code', { exact: true })).toBeVisible();
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
    await second.getByRole('button', { name: 'Cancel connection' }).click();
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
    const code = (await second.getByLabel('Generated unlock code').textContent())!;
    await second.getByRole('button', { name: 'I saved my unlock code' }).click();
    await back(second);
    await expect(second.getByLabel('Generated unlock code')).toHaveText(code);
    await back(second);
    await expect(second.getByRole('button', { name: 'Prepare this device' })).toBeVisible();
    await second.getByRole('button', { name: 'Prepare this device' }).click();
    await expect(second.getByLabel('Generated unlock code')).toHaveText(code);
    await second.getByRole('button', { name: 'I saved my unlock code' }).click();
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
