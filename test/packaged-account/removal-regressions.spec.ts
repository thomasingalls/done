import { test, expect } from '@playwright/test';
import { openApp, protectApp } from '../geometry/openApp';
import { startService, stopService } from './server';

for (const freshBeforeReply of [false, true])
  test(`a delayed registration reply cannot recreate removed setup${freshBeforeReply ? ' after Start fresh' : ''}`, async ({
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
    try {
      // Simulate a suspended setup coordinator which misses the cooperative retirement notice.
      // The durable epoch fence must work independently of BroadcastChannel delivery.
      await page.addInitScript(() => {
        const RealChannel = BroadcastChannel;
        window.BroadcastChannel = class extends RealChannel {
          constructor(name: string) {
            super(name);
            if (name === 'done/slot-lifecycle')
              this.addEventListener('message', (event) => event.stopImmediatePropagation());
          }
        };
      });
      await openApp(page);
      await protectApp(page);
      await page.route('**/__account-setup/begin', async (route) => {
        const response = await route.fetch();
        received();
        await held;
        await route.fulfill({ response });
      });
      await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
      await page.getByRole('button', { name: 'Sync this list', exact: true }).click();
      await page.getByRole('button', { name: 'Continue to passkey setup', exact: true }).click();
      await waiting;
      const removal = await context.newPage();
      await removal.goto('/remove/local');
      await removal.getByRole('button', { name: 'Continue to confirmation' }).click();
      await removal.getByLabel('Type REMOVE to confirm').fill('REMOVE');
      await removal.getByRole('button', { name: 'Remove local data', exact: true }).click();
      await expect(
        removal.getByRole('heading', { name: 'Removed from this device' }),
      ).toBeVisible();
      if (freshBeforeReply) {
        await removal.getByRole('button', { name: 'Start fresh', exact: true }).click();
        await expect(removal.locator('.shell')).toBeVisible();
      }
      release();
      await expect(page.locator('[role=alert]')).toContainText(
        freshBeforeReply ? 'retired' : 'removed',
      );
      expect(
        await removal.evaluate(
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
        ),
      ).toBeNull();
      await removal.close();
    } finally {
      release();
      await stopService(service);
    }
  });
