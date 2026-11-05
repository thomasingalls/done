/** A partial first page cannot authorize the next request across an uncommitted gap. */
import { test, expect } from '@playwright/test';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import {
  pairedEditors,
  add,
  credentials,
  restoreAuthenticator,
  openSaved,
} from '../packaged-account/devices';
import { startService, stopService, origin } from '../packaged-account/server';
import { acceptedRows, idle, position, lock, observer, slot, exportWriting } from './fixtures';
test('partial first dense page stops the multi-request turn and continues without losing accepted writing', async ({
  page,
  browser,
}, info) => {
  const build = process.env['INBOUND_NATIVE_BUILD'];
  if (!build || !isAbsolute(build) || !existsSync(build + '/index.html'))
    throw Error('Expected declared interior-cut build');
  const state = info.outputPath('service'),
    service = await startService(state, build, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const evidence: Record<string, unknown> = {};
  let receiver: typeof page | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const auth = await credentials(pair.next.auth),
      context = pair.other,
      identity = await slot(pair.second, true);
    expect(identity.floor).toBe(1);
    await idle(page);
    const baseline = await position(page);
    let previous = baseline;
    await lock(pair.second);
    await pair.second.close();
    await context.setOffline(true);
    let known = new Set(acceptedRows(state).map((x) => x.key));
    const committed: { publisher: string; position: number }[] = [];
    const markers = Array.from({ length: 8 }, (_, i) => `MULTI REQUEST CUT writing ${i + 1}`);
    for (const marker of markers) {
      await add(page, marker);
      await expect.poll(() => position(page), { timeout: 20000 }).toBeGreaterThan(previous);
      await idle(page);
      const current = await position(page);
      expect(current).toBe(previous + 1);
      const rows = acceptedRows(state),
        fresh = rows.filter((x) => !known.has(x.key));
      expect(fresh).toHaveLength(1);
      expect(fresh[0]!.position).toBe(current);
      committed.push({ publisher: fresh[0]!.publisher, position: current });
      known = new Set(rows.map((x) => x.key));
      previous = current;
    }
    expect(new Set(committed.map((x) => x.publisher)).size).toBe(1);
    evidence['committed'] = committed;
    receiver = await context.newPage();
    const keptAuth = await restoreAuthenticator(receiver, auth);
    await receiver.goto(origin + '/');
    await openSaved(receiver, pair.next.code, true);
    await expect(receiver.locator('.shell')).toContainText('Keep the first device writing', {
      timeout: 15000,
    });
    for (const marker of markers)
      await expect(receiver.locator('.shell')).not.toContainText(marker);
    await context.setOffline(false);
    for (const marker of markers)
      await expect(receiver.locator('.shell')).toContainText(marker, { timeout: 15000 });
    await expect(
      receiver.locator('.sync-notice').filter({ hasText: 'receive:integrity' }),
    ).toHaveCount(0);
    const expected = await exportWriting(receiver, info.outputPath('before.zip'));
    await lock(receiver);
    await receiver.evaluate(await observer());
    const inspected = await receiver.evaluate(
      async ({ slot, code }) =>
        (
          Reflect.get(globalThis, 'nativeReceiptObserver') as typeof import('./inspect')
        ).inspectNativeReceipts(slot, code, true),
      { slot: identity.slotId, code: pair.next.code },
    );
    evidence['native'] = inspected;
    expect(inspected.readOnlyUnchanged).toBe(true);
    const newReceipts = inspected.receipts.filter(
      (x) => x.publisher === committed[0]!.publisher && x.position > baseline,
    );
    expect(
      newReceipts.some((x) => x.kind === 'page' && x.count === 2 && x.requestLimit === 4),
    ).toBe(true);
    expect(
      newReceipts.flatMap((x) => Array.from({ length: x.count }, (_, i) => x.position + i)),
    ).toEqual(committed.map((x) => x.position));
    await context.setOffline(true);
    await receiver.goto(origin + '/');
    await openSaved(receiver, pair.next.code, true);
    expect(await exportWriting(receiver, info.outputPath('cold.zip'))).toEqual(expected);
    expect((await slot(receiver, true)).floor).toBe(1);
    evidence['coldExact'] = true;
    evidence['authenticatorRetained'] = !!keptAuth.cdp;
    await lock(receiver);
  } finally {
    if (receiver && !receiver.isClosed()) {
      evidence['lastNotices'] = await receiver
        .locator('.sync-notice')
        .allTextContents()
        .catch(() => []);
      evidence['workers'] = receiver.workers().map((w) => new URL(w.url()).pathname);
    }
    await info.attach('multi-request-cut-evidence', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
    await pair?.other.close();
    await stopService(service);
  }
});
