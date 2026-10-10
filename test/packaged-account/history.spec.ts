import { test, expect, type Page } from '@playwright/test';
import { createdAccount } from '../device-enrollment/helpers';
import { pairedEditors, openSaved, add } from './devices';
import { startService, stopService } from './server';

const panel = (p: Page) => p.getByRole('region', { name: 'History maintenance', exact: true });
async function inspect(p: Page) {
  await p.getByRole('button', { name: 'History maintenance', exact: true }).click();
  await panel(p).getByRole('button', { name: 'Check history', exact: true }).click();
  await expect(panel(p).getByRole('button', { name: 'Check history', exact: true })).toBeEnabled();
}

test('sole device creates repeated native snapshots, retries lost publication and keeps editing', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    const first = await createdAccount(page);
    await add(page, 'History single device writing');
    await inspect(page);
    await expect(panel(page)).toContainText('No verified history snapshot yet.');
    await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(page)).toContainText('Verified snapshot 1 is saved.');
    await add(page, 'Writing after first snapshot');
    let lost = false;
    await page.route('**/account/history/v1/checkpoint', async (route) => {
      if (!lost && route.request().postDataJSON().action === 'publish') {
        await route.fetch();
        lost = true;
        await route.abort();
      } else await route.continue();
    });
    await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(page).getByRole('alert')).toBeVisible();
    expect(lost).toBe(true);
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await openSaved(page, first.code);
    await inspect(page);
    await panel(page).getByRole('button', { name: 'Resume history snapshot' }).click();
    await expect(panel(page)).toContainText('Verified snapshot 2 is saved.', { timeout: 15000 });
    await add(page, 'Writing after interrupted history');
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    await openSaved(page, first.code);
    await expect(page.locator('.shell')).toContainText('Writing after interrupted history');
  } finally {
    await stopService(service);
  }
});

test('two native device owners independently admit snapshots and keep two-way delivery', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const second = pair.second;
    const timings: { path: string; status: number; elapsed: number }[] = [];
    const started = Date.now();
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/account/'))
        timings.push({ path, status: response.status(), elapsed: Date.now() - started });
    });

    await add(second, 'Second device before snapshot');
    await expect(page.locator('.shell')).toContainText('Second device before snapshot', {
      timeout: 15000,
    });
    // Neither edit reaches delivery. The first is carried only in its admitted snapshot;
    // the second remains an independent local original while that snapshot is installed.
    await page.route('**/account/delivery/submit', (route) => route.abort());
    await second.route('**/account/delivery/submit', (route) => route.abort());
    await add(page, 'First device snapshot-only writing');
    await add(second, 'Second device retained offline original');
    await expect(second.locator('.shell')).not.toContainText('First device snapshot-only writing');
    await inspect(page);
    await panel(page).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(page)).toContainText(
      'Snapshot saved. Verify it from another approved device.',
      { timeout: 15000 },
    );
    // Abort the exact content+heads transaction after its content add. Counter reservations
    // may survive, but neither the content row nor the installation witness may partially commit.
    await second.evaluate(() => {
      const txs = new WeakSet<IDBTransaction>();
      const state = { armed: false, aborted: false };
      (window as unknown as { historyFault: typeof state }).historyFault = state;
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value, key) {
        if (state.armed && !state.aborted && this.transaction.mode === 'readwrite') {
          if (this.name === 'content' && value.kind === 'update') txs.add(this.transaction);
          if (this.name === 'heads' && txs.has(this.transaction)) {
            state.aborted = true;
            this.transaction.abort();
            throw new DOMException('Interrupted history installation', 'AbortError');
          }
        }
        return add.call(this, value, key);
      };
    });
    let intercepted = false;
    await second.route('**/account/history/v1/checkpoint', async (route) => {
      const r = route.request().postDataJSON();
      if (r.action === 'read' && r.payload === 'latest' && !intercepted) {
        const response = await route.fetch(),
          value = await response.json();
        if (value.page?.admission) {
          intercepted = true;
          await second.evaluate(() => {
            (window as unknown as { historyFault: { armed: boolean } }).historyFault.armed = true;
          });
        }
        await route.fulfill({ response });
      } else await route.continue();
    });
    await inspect(second);
    await panel(second).getByRole('button', { name: 'Verify history snapshot' }).click();
    await expect(panel(second)).toContainText('Verified snapshot 1 is saved.');
    await expect
      .poll(
        () =>
          second.evaluate(
            () =>
              (window as unknown as { historyFault: { aborted: boolean } }).historyFault.aborted,
          ),
        { timeout: 20000 },
      )
      .toBe(true);
    await expect(second.locator('.shell')).not.toContainText('First device snapshot-only writing');
    await expect(second.locator('.shell')).toContainText('Second device retained offline original');
    // A new renderer has no test fault, and retries from the unchanged durable witness.
    await second.goto('/');
    await openSaved(second, pair.next.code, true);
    await expect(second.locator('.shell')).toContainText('First device snapshot-only writing', {
      timeout: 20000,
    });
    await expect(second.locator('.shell')).toContainText('Second device retained offline original');
    await second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.other.setOffline(true);
    await second.goto('/');
    await openSaved(second, pair.next.code, true);
    await expect(second.locator('.shell')).toContainText('First device snapshot-only writing');
    await expect(second.locator('.shell')).toContainText('Second device retained offline original');
    await page.unroute('**/account/delivery/submit');
    await second.unroute('**/account/delivery/submit');
    await pair.other.setOffline(false);
    // The first device stayed browser-online while its submit route was unavailable.
    // Removing that fault must announce recovery: local typing deliberately preserves
    // unknown-outcome backoff, which can exceed this journey's 15-second delivery check.
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await inspect(second);
    await add(page, 'First device after maintenance');
    await expect(second.locator('.shell')).toContainText('First device after maintenance', {
      timeout: 15000,
    });
    await add(second, 'Second device after maintenance');
    await expect(page.locator('.shell')).toContainText('Second device after maintenance', {
      timeout: 15000,
    });
    // Reconcile the producer's retained exact proposal after the peer's successful admission.
    await panel(page).getByRole('button', { name: 'Check history', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Resume history snapshot' }).click();
    await expect(panel(page)).toContainText('Verified snapshot 1 is saved.');
    await panel(second).getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(panel(second)).toContainText(
      'Snapshot saved. Verify it from another approved device.',
      { timeout: 15000 },
    );
    await panel(page).getByRole('button', { name: 'Check history', exact: true }).click();
    const verificationStarted = Date.now();
    await panel(page).getByRole('button', { name: 'Verify history snapshot' }).click();
    try {
      await expect(panel(page)).toContainText('Verified snapshot 2 is saved.', { timeout: 15000 });
    } catch (cause) {
      console.log('History request timings:', timings.slice(-25));
      throw cause;
    }
    await info.attach('history-verification-timing', {
      contentType: 'application/json',
      body: JSON.stringify({
        elapsedMs: Date.now() - verificationStarted,
        requests: timings.slice(-25),
      }),
    });
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});

test('a returning editor installs admitted cuts after service pruning and keeps its local writing', async ({
  page,
  browser,
}, info) => {
  const { DatabaseSync } = await import('node:sqlite');
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const second = pair.second;
    // Block the normal receive owner's catalog read. Explicit peer verification still independently
    // reads the latest baseline and accepted suffix, without installing either in the editor.
    await second.route('**/account/history/v1/checkpoint', (route) =>
      route.request().postDataJSON().payload === 'catalog' ? route.abort() : route.continue(),
    );
    const db = new DatabaseSync(info.outputPath('service/account.sqlite'), { readOnly: true });
    try {
      for (let i = 1; i <= 2; i++) {
        const before = Number(
          db.prepare("SELECT count(*) AS n FROM delivery_decisions WHERE kind='accepted'").get()![
            'n'
          ],
        );
        await add(page, 'Covered remote writing ' + i);
        await expect
          .poll(
            () =>
              Number(
                db
                  .prepare("SELECT count(*) AS n FROM delivery_decisions WHERE kind='accepted'")
                  .get()!['n'],
              ),
            { timeout: 15000 },
          )
          .toBeGreaterThan(before);
        if (i === 1) await inspect(page);
        await panel(page)
          .getByRole('button', { name: 'Create history snapshot', exact: true })
          .click();
        await expect(panel(page)).toContainText(
          'Snapshot saved. Verify it from another approved device.',
          { timeout: 15000 },
        );
        if (i === 1) await inspect(second);
        else {
          await panel(second).getByRole('button', { name: 'Check history', exact: true }).click();
          await expect(
            panel(second).getByRole('button', { name: 'Check history', exact: true }),
          ).toBeEnabled();
        }
        await panel(second)
          .getByRole('button', { name: 'Verify history snapshot', exact: true })
          .click();
        await expect(panel(second)).toContainText(`Verified snapshot ${i} is saved.`, {
          timeout: 15000,
        });
        await panel(page).getByRole('button', { name: 'Check history', exact: true }).click();
        await expect(
          panel(page).getByRole('button', { name: 'Resume history snapshot', exact: true }),
        ).toBeVisible();
        await panel(page)
          .getByRole('button', { name: 'Resume history snapshot', exact: true })
          .click();
        await expect(panel(page)).toContainText(`Verified snapshot ${i} is saved.`, {
          timeout: 15000,
        });
      }
      await expect(second.locator('.shell')).not.toContainText('Covered remote writing 2');
      await second.route('**/account/delivery/submit', (route) => route.abort());
      await add(second, 'Unsent local writing survives server pruning');
      await second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await panel(page).getByRole('button', { name: 'Prune covered history', exact: true }).click();
      await expect(panel(page)).toContainText('Covered service history removed.', {
        timeout: 15000,
      });
      expect(
        Number(
          db
            .prepare(
              "SELECT count(*) AS n FROM delivery_decisions WHERE substr(CAST(submission AS TEXT),1,1)='{' ",
            )
            .get()!['n'],
        ),
      ).toBeGreaterThan(0);
      await second.unroute('**/account/history/v1/checkpoint');
      await second.goto('/');
      await openSaved(second, pair.next.code, true);
      for (const text of [
        'Covered remote writing 1',
        'Covered remote writing 2',
        'Unsent local writing survives server pruning',
      ])
        await expect(second.locator('.shell')).toContainText(text, { timeout: 20000 });
      await second.unroute('**/account/delivery/submit');
      await add(page, 'New accepted suffix after pruning');
      await expect(second.locator('.shell')).toContainText('New accepted suffix after pruning', {
        timeout: 20000,
      });
      await second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await pair.other.setOffline(true);
      await second.goto('/');
      await openSaved(second, pair.next.code, true);
      await expect(second.locator('.shell')).toContainText('Covered remote writing 2');
      await expect(second.locator('.shell')).toContainText(
        'Unsent local writing survives server pruning',
      );
    } finally {
      db.close();
    }
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
