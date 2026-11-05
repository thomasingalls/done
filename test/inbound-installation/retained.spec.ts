import { test, expect } from '@playwright/test';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { pairedEditors, add, openSaved } from '../packaged-account/devices';
import { startService, stopService, origin } from '../packaged-account/server';
import { observer, slot, lock, exportWriting } from '../inbound-native/fixtures';
import { openMenuSection } from '../geometry/openApp';
test('authenticated binary retained reading installs its native floor even with range writing disabled', async ({
  page,
  browser,
}, info) => {
  const build = process.env['INBOUND_INSTALL_BUILD'];
  if (!build || !isAbsolute(build) || !existsSync(build + '/index.html'))
    throw Error('Expected declared retained-reading fixture');
  const service = await startService(info.outputPath('service'), build, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const evidence: Record<string, unknown> = {};
  try {
    pair = await pairedEditors(page, browser, true);
    const joined = pair.second,
      identity = await slot(joined, true);
    expect(identity.floor).toBe(1);
    const installed = await exportWriting(joined, info.outputPath('installed.zip'));
    expect(installed.some((x) => x.content.includes('Keep the first device writing'))).toBe(true);
    await lock(joined);
    await joined.evaluate(await observer());
    const native = await joined.evaluate(
      async ({ slot, code }) =>
        (
          Reflect.get(
            globalThis,
            'nativeReceiptObserver',
          ) as typeof import('../inbound-native/inspect')
        ).inspectNativeReceipts(slot, code, true),
      { slot: identity.slotId, code: pair.next.code },
    );
    expect(native.readOnlyUnchanged).toBe(true);
    expect(native.receipts.some((x) => x.kind === 'page')).toBe(true);
    evidence['installed'] = native;
    await joined.goto(origin + '/');
    await openSaved(joined, pair.next.code, true);
    expect(await exportWriting(joined, info.outputPath('reopened.zip'))).toEqual(installed);
    await add(page, 'Original writing after binary installation');
    await expect(joined.locator('.shell')).toContainText(
      'Original writing after binary installation',
      {
        timeout: 15000,
      },
    );
    await add(joined, 'Joined writing after binary installation');
    await expect(page.locator('.shell')).toContainText('Joined writing after binary installation', {
      timeout: 15000,
    });
    const accepted = await exportWriting(joined, info.outputPath('accepted.zip'));
    await add(joined, 'LOCAL UNDO AFTER BINARY INSTALLATION');
    await openMenuSection(joined, 'Data');
    await joined.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await exportWriting(joined, info.outputPath('undo.zip'))).toEqual(accepted);
    await lock(joined);
    await pair.other.setOffline(true);
    await joined.goto(origin + '/');
    await openSaved(joined, pair.next.code, true);
    expect(await exportWriting(joined, info.outputPath('cold.zip'))).toEqual(accepted);
    expect((await slot(joined, true)).floor).toBe(1);
    evidence['coldExact'] = true;
    await lock(joined);
  } finally {
    await info.attach('retained-binary-installation', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
    await pair?.other.close();
    await stopService(service);
  }
});
