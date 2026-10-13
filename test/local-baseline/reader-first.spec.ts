import { test, expect, type Page } from '@playwright/test';
import { pairedEditors, openSaved, add } from '../packaged-account/devices';
import { startService, stopService } from '../packaged-account/server';
import {
  rolloutBuild,
  switchApplication,
  noConversion,
  disk,
  metadata,
  type RolloutDevice,
  type RolloutOwner,
} from './reader-rollout';

const owner = (p: Page) =>
  p.evaluate(() =>
    (
      globalThis as unknown as { __rolloutOwner: RolloutOwner }
    ).__rolloutOwner.workspace.whenDurable(),
  );
async function inspect(p: Page) {
  await p.getByRole('button', { name: 'History maintenance', exact: true }).click();
  const panel = p.getByRole('region', { name: 'History maintenance', exact: true });
  await panel.getByRole('button', { name: 'Check history', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Check history', exact: true })).toBeEnabled();
  return panel;
}
test('reader-first update, private conversion, compatible rollback and incompatible cached-reader refusal preserve both profiles', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const reader = info.outputPath('reader'),
    writer = info.outputPath('writer'),
    old = info.outputPath('old');
  await rolloutBuild(reader, 'reader');
  await rolloutBuild(writer, 'writer');
  await rolloutBuild(old, 'old');
  const service = await startService(info.outputPath('service'), reader, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const devices: RolloutDevice[] = [
      { page, auth: pair.first.auth, code: pair.first.code, joined: false },
      { page: pair.second, auth: pair.next.auth, code: pair.next.code, joined: true },
    ];
    for (const d of devices) {
      await noConversion(d.page);
      await owner(d.page);
      expect(metadata(await disk(d.page)).counter.v).toBe(2);
    }
    await add(devices[0]!.page, 'Unconverted reader writing');
    await expect(devices[1]!.page.locator('.shell')).toContainText('Unconverted reader writing');
    await switchApplication(service, writer, devices, 'retention-writer');
    for (const d of devices) {
      await openSaved(d.page, d.code, d.joined);
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
    }
    const converted = await Promise.all(devices.map((d) => disk(d.page)));
    const anchors = converted.map(metadata);
    for (const a of anchors) expect(a.counter.v).toBe(5);
    await switchApplication(service, reader, devices, 'retention-reader');
    for (const [i, d] of devices.entries()) {
      await openSaved(d.page, d.code, d.joined);
      await noConversion(d.page);
      const after = metadata(await disk(d.page));
      expect(after.counter.baseline).toEqual(anchors[i]!.counter.baseline);
      expect(after.chunks).toEqual(anchors[i]!.chunks);
      await d.page.context().setOffline(true);
      await add(d.page, 'Offline reader writing ' + i);
      for (const kind of ['undo', 'redo'] as const) {
        await d.page.evaluate(
          (kind) =>
            (
              globalThis as unknown as { __rolloutOwner: RolloutOwner }
            ).__rolloutOwner.workspace.command({ kind }).accepted,
          kind,
        );
        if (kind === 'undo')
          await expect(d.page.locator('.shell')).not.toContainText('Offline reader writing ' + i);
        else await expect(d.page.locator('.shell')).toContainText('Offline reader writing ' + i);
      }
      await owner(d.page);
      await d.page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await d.page.goto('/');
      await openSaved(d.page, d.code, d.joined);
      await expect(d.page.locator('.shell')).toContainText('Offline reader writing ' + i);
    }
    for (const d of devices) await d.page.context().setOffline(false);
    for (const d of devices)
      for (const i of [0, 1])
        await expect(d.page.locator('.shell')).toContainText('Offline reader writing ' + i, {
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
    // Repeated edits/checkpoints may append, but cannot rotate the baseline or its journal era.
    for (const [i, d] of devices.entries()) {
      await owner(d.page);
      const after = metadata(await disk(d.page));
      expect(after.counter.baseline).toEqual(anchors[i]!.counter.baseline);
      expect(after.chunks).toEqual(anchors[i]!.chunks);
    }
    await switchApplication(service, old, devices, 'retention-old');
    const before = await Promise.all(devices.map((d, i) => disk(d.page, converted[i]!.name)));
    for (const [i, d] of devices.entries()) {
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
      await expect
        .poll(() =>
          d.page.evaluate(
            () => (globalThis as unknown as { __rolloutRefusal?: string }).__rolloutRefusal,
          ),
        )
        .toMatch(/^(unknown-content-metadata|app-update-required)$/);
      await expect(d.page.locator('.shell')).toHaveCount(0);
      expect(await disk(d.page, before[i]!.name)).toEqual(before[i]);
    }
    await switchApplication(service, reader, devices, 'retention-reader');
    for (const d of devices) {
      await openSaved(d.page, d.code, d.joined);
      await noConversion(d.page);
      await expect(d.page.locator('.shell')).toContainText('Offline reader writing 0');
      await expect(d.page.locator('.shell')).toContainText('Offline reader writing 1');
    }
    await add(devices[1]!.page, 'Writing after refusing incompatible rollback');
    await expect(devices[0]!.page.locator('.shell')).toContainText(
      'Writing after refusing incompatible rollback',
    );
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
