import { test, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { openApp, protectApp, openMenuSection } from '../geometry/openApp';
import { startService, stopService } from './server';

const stopped =
  'Sync setup stopped because another tab began removing this device’s data. Reload this tab to continue.';
// Each was untrue on this tab after a removal: the closing screen's note and the failure display.
const untrue = [
  'Your writing stays in this workspace.',
  'The passkey step could not finish. Try unlocking again. Your saved setup and writing have been kept.',
];
const setupWorker = /\/firstDeviceOwner\.worker-[^/]*\.js$/;

async function startSetup(page: Page) {
  await openMenuSection(page, 'Sync');
  await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
  await page.getByRole('button', { name: 'Sync this list', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to passkey setup', exact: true }).click();
}
async function removeLocalData(context: BrowserContext, fresh: boolean) {
  const removal = await context.newPage();
  await removal.goto('/remove/local');
  await removal.getByRole('button', { name: 'Continue to confirmation' }).click();
  await removal.getByLabel('Type REMOVE to confirm').fill('REMOVE');
  await removal.getByRole('button', { name: 'Remove local data', exact: true }).click();
  await expect(removal.getByRole('heading', { name: 'Removed from this device' })).toBeVisible();
  if (fresh) {
    await removal.getByRole('button', { name: 'Start fresh', exact: true }).click();
    await expect(removal.locator('.shell')).toBeVisible();
  }
  return removal;
}
const savedAttempt = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const r = indexedDB.open('done.first-device-setup.v1');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction('attempt'),
            row = tx.objectStore('attempt').get('current');
          tx.oncomplete = () => {
            db.close();
            resolve(row.result ?? null);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );

// The cooperative path: the setup coordinator, in its Worker, hears the retirement notice.
for (const fresh of [false, true])
  test(`removal in another tab ends a waiting setup on its final notice${fresh ? ' after Start fresh' : ''}`, async ({
    page,
    context,
  }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    try {
      await openApp(page);
      await protectApp(page);
      await startSetup(page);
      await expect(page.getByRole('heading', { name: 'Create your passkey' })).toBeVisible();
      expect(page.workers().filter((w) => setupWorker.test(w.url()))).toHaveLength(1);
      // Record every text this tab shows from here on, so a passing glimpse cannot hide.
      await page.evaluate((watched) => {
        const seen: string[] = [];
        const check = () => {
          const text = document.body.innerText;
          for (const value of watched)
            if (text.includes(value) && !seen.includes(value)) seen.push(value);
        };
        new MutationObserver(check).observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        check();
        (window as unknown as { __untrueSeen: string[] }).__untrueSeen = seen;
      }, untrue);
      const removal = await removeLocalData(context, fresh);
      await expect(page.locator('[role=alert]')).toHaveText(stopped);
      await expect
        .poll(() => page.workers().filter((w) => setupWorker.test(w.url())).length)
        .toBe(0);
      await expect(page.locator('[role=alert]')).toHaveText(stopped);
      expect(
        await page.evaluate(() => (window as unknown as { __untrueSeen: string[] }).__untrueSeen),
      ).toEqual([]);
      expect(await savedAttempt(removal)).toBeNull();
      await removal.close();
    } finally {
      await stopService(service);
    }
  });

// Prepended to the setup Worker's script: that realm drops every slot-retirement notice, and counts
// both the notices it dropped and any that still reached a channel's handler.
function withholdRetirement() {
  const Real = BroadcastChannel;
  const counts = { withheld: 0, delivered: 0 };
  (self as unknown as { BroadcastChannel: unknown }).BroadcastChannel = class extends Real {
    constructor(name: string) {
      super(name);
      if (name !== 'done/slot-lifecycle') return;
      this.addEventListener('message', (event) => {
        counts.withheld++;
        event.stopImmediatePropagation();
      });
      let handler: ((event: MessageEvent) => void) | null = null,
        wrapped: ((event: MessageEvent) => void) | undefined;
      Object.defineProperty(this, 'onmessage', {
        get: () => handler,
        set: (value: ((event: MessageEvent) => void) | null) => {
          if (wrapped) this.removeEventListener('message', wrapped);
          handler = value;
          wrapped = undefined;
          if (typeof value === 'function') {
            wrapped = (event) => {
              counts.delivered++;
              value.call(this, event);
            };
            this.addEventListener('message', wrapped);
          }
        },
      });
    }
  };
  Object.defineProperty(self, '__retirementCounts', { value: counts });
}
const retirementCounts = (worker: Worker) =>
  worker.evaluate(
    () =>
      (self as unknown as { __retirementCounts: { withheld: number; delivered: number } })
        .__retirementCounts,
  );

// The missed-notice path: a suspended coordinator never hears the notice. The durable epoch fence
// must refuse its delayed registration reply on its own.
test.describe(() => {
  // Every setup Worker script request reaches the route below only without a service worker.
  test.use({ serviceWorkers: 'block' });
  for (const fresh of [false, true])
    test(`a delayed registration reply cannot recreate removed setup${fresh ? ' after Start fresh' : ''}`, async ({
      page,
      context,
    }, info) => {
      const service = await startService(info.outputPath('service'), undefined, true, true);
      let release!: () => void, received!: () => void;
      const held = new Promise<void>((yes) => {
        release = yes;
      });
      const waiting = new Promise<void>((yes) => {
        received = yes;
      });
      const workers: Worker[] = [];
      page.on('worker', (worker) => {
        if (setupWorker.test(worker.url())) workers.push(worker);
      });
      try {
        await openApp(page);
        await protectApp(page);
        await page.route(setupWorker, async (route) => {
          const response = await route.fetch();
          const headers = response.headers();
          delete headers['content-length'];
          delete headers['content-encoding'];
          await route.fulfill({
            status: response.status(),
            headers,
            body: `(${withholdRetirement})();\n${await response.text()}`,
          });
        });
        await page.route('**/__account-setup/begin', async (route) => {
          const response = await route.fetch();
          received();
          await held;
          await route.fulfill({ response });
        });
        await startSetup(page);
        await waiting;
        expect(workers).toHaveLength(1);
        const removal = await removeLocalData(context, fresh);
        // Control: the notice reached the setup Worker and no handler there received it.
        await expect
          .poll(async () => (await retirementCounts(workers[0]!)).withheld)
          .toBeGreaterThan(0);
        expect((await retirementCounts(workers[0]!)).delivered).toBe(0);
        await expect(
          page.getByRole('heading', { name: 'Preparing encrypted sync…' }),
        ).toBeVisible();
        release();
        await expect(page.locator('[role=alert]')).toContainText(fresh ? 'retired' : 'removed');
        for (const value of untrue) await expect(page.getByText(value)).toHaveCount(0);
        expect(await savedAttempt(removal)).toBeNull();
        await removal.close();
      } finally {
        release();
        await stopService(service);
      }
    });
});
