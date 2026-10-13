// Copy to test/local-baseline/reader-image.spec.ts in the clean candidate archive.
// Only the disposable writer is instrumented. Reader and predecessor use extracted image bytes.
import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  pairedEditors,
  openSaved,
  credentials,
  restoreAuthenticator,
} from '../packaged-account/devices';
import {
  startService,
  stopService,
  startApplication,
  stopProcess,
} from '../packaged-account/server';
import {
  rolloutBuild,
  disk,
  metadata,
  type RolloutDevice,
  type RolloutOwner,
} from './reader-rollout';

const goals = (p: Page) => p.locator('.goals .cm-content');
const append = async (p: Page, text: string) => {
  await goals(p).click();
  await p.keyboard.press('ControlOrMeta+End');
  await p.keyboard.insertText('\n' + text);
  await expect(goals(p)).toContainText(text);
};
async function inspect(p: Page) {
  await p.getByRole('button', { name: 'History maintenance', exact: true }).click();
  const panel = p.getByRole('region', { name: 'History maintenance', exact: true });
  await panel.getByRole('button', { name: 'Check history', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Check history', exact: true })).toBeEnabled();
  return panel;
}
async function switchImage(
  service: Awaited<ReturnType<typeof startService>>,
  dir: string,
  devices: RolloutDevice[],
) {
  for (const d of devices) {
    if (await d.page.locator('.shell').count())
      await d.page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await d.page.goto('/');
    expect(await d.page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  }
  await stopProcess(service.app);
  service.app = await startApplication(dir);
  for (const d of devices) {
    await d.page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect
      .poll(() =>
        d.page.evaluate(
          async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state,
        ),
      )
      .toBe('installed');
  }
  const expected = createHash('sha256')
    .update(readFileSync(resolve(dir, 'index.html')))
    .digest('hex');
  for (const d of devices) {
    const saved = await credentials(d.auth),
      context = d.page.context();
    await d.page.close();
    d.page = await context.newPage();
    d.auth = await restoreAuthenticator(d.page, saved);
    await d.page.goto('/');
    // Observe the cached response rather than adding an identity probe to either image.
    const html = await d.page.evaluate(async () => await (await fetch('/index.html')).text());
    expect(createHash('sha256').update(html).digest('hex')).toBe(expected);
  }
}

test('exact reader image rolls back private conversion with offline undo, checkpoint continuation and predecessor refusal', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const reader = resolve('dist'),
    predecessor = process.env['DONE_PREDECESSOR_DIST']!;
  expect(predecessor).toBeTruthy();
  const writer = info.outputPath('writer');
  await rolloutBuild(writer, 'writer');
  const service = await startService(info.outputPath('service'), writer, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const devices: RolloutDevice[] = [
      { page, auth: pair.first.auth, code: pair.first.code, joined: false },
      { page: pair.second, auth: pair.next.auth, code: pair.next.code, joined: true },
    ];
    const names: string[] = [];
    for (const d of devices) {
      await expect
        .poll(
          () =>
            d.page.evaluate(() =>
              (globalThis as unknown as { __rolloutOwner: RolloutOwner }).__rolloutOwner
                .removeLocalHistory!(0),
            ),
          { timeout: 20000 },
        )
        .toMatchObject({ kind: 'removed' });
      names.push(
        await d.page.evaluate(
          () => (globalThis as unknown as { __rolloutOwner: RolloutOwner }).__rolloutOwner.dbName,
        ),
      );
    }
    const anchors = await Promise.all(
      devices.map(async (d, i) => metadata(await disk(d.page, names[i]))),
    );
    for (const a of anchors) expect(a.counter.v).toBe(5);
    await switchImage(service, reader, devices);
    for (const [i, d] of devices.entries()) {
      await openSaved(d.page, d.code, d.joined);
      await expect(
        d.page.locator('.menu-row').filter({ hasText: 'Version' }).locator('.menu-value'),
      ).toHaveText('890fc677');
      const after = metadata(await disk(d.page, names[i]));
      expect(after.counter.baseline).toEqual(anchors[i]!.counter.baseline);
      expect(after.chunks).toEqual(anchors[i]!.chunks);
      await d.page.context().setOffline(true);
      const text = 'Offline rollback Goals ' + i;
      await append(d.page, text);
      await d.page.keyboard.press('ControlOrMeta+z');
      await expect(goals(d.page)).not.toContainText(text);
      await d.page.keyboard.press('ControlOrMeta+Shift+z');
      await expect(goals(d.page)).toContainText(text);
      await d.page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await d.page.goto('/');
      await openSaved(d.page, d.code, d.joined);
      await expect(goals(d.page)).toContainText(text);
    }
    for (const d of devices) await d.page.context().setOffline(false);
    for (const d of devices)
      for (const i of [0, 1])
        await expect(goals(d.page)).toContainText('Offline rollback Goals ' + i, {
          timeout: 20000,
        });
    const a = await inspect(devices[0]!.page);
    await a.getByRole('button', { name: 'Create history snapshot' }).click();
    await expect(a).toContainText('Snapshot saved. Verify it from another approved device.');
    const b = await inspect(devices[1]!.page);
    await b.getByRole('button', { name: 'Verify history snapshot' }).click();
    await expect(b).toContainText('Verified snapshot 1 is saved.');
    await a.getByRole('button', { name: 'Check history', exact: true }).click();
    await a.getByRole('button', { name: 'Resume history snapshot', exact: true }).click();
    await expect(a).toContainText('Verified snapshot 1 is saved.');
    for (const [i, d] of devices.entries()) {
      const after = metadata(await disk(d.page, names[i]));
      expect(after.counter.baseline).toEqual(anchors[i]!.counter.baseline);
      expect(after.chunks).toEqual(anchors[i]!.chunks);
    }
    await switchImage(service, predecessor, devices);
    for (const [i, d] of devices.entries()) {
      const before = await disk(d.page, names[i]);
      await d.page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
      await d.page
        .getByRole('button', {
          name: d.joined ? /Resume device connection/ : /^Unlock Device owner/,
        })
        .click();
      await d.page.getByLabel('Device-lock code', { exact: true }).fill(d.code);
      await d.page
        .getByRole('button', {
          name: d.joined ? 'Unlock enrollment' : 'Confirm code and unlock with passkey',
          exact: true,
        })
        .click();
      await expect(d.page.getByRole('alert')).toBeVisible();
      await expect(d.page.locator('.shell')).toHaveCount(0);
      expect(await disk(d.page, names[i])).toEqual(before);
      console.log(
        'Predecessor refusal',
        d.joined ? 'joined' : 'original',
        await d.page.getByRole('alert').allTextContents(),
      );
    }
    await switchImage(service, reader, devices);
    for (const d of devices) {
      await openSaved(d.page, d.code, d.joined);
      for (const i of [0, 1])
        await expect(goals(d.page)).toContainText('Offline rollback Goals ' + i);
    }
    await append(devices[1]!.page, 'Writing after compatible rollback');
    await expect(goals(devices[0]!.page)).toContainText('Writing after compatible rollback', {
      timeout: 20000,
    });
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
