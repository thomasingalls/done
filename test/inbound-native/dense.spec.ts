/** Genuine app/Worker admission and cold replay. The build's only mutation lowers a live
 * allowance to force an interior cut; the storage observer is read-only and syntax-only. */
import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import { resolve, isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decodeSubmission } from '../../account-protocol/submission';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  pairedEditors,
  add,
  openSaved,
  credentials,
  restoreAuthenticator,
} from '../packaged-account/devices';
import { startService, stopService, origin } from '../packaged-account/server';
import { openMenuSection } from '../geometry/openApp';
import { decodePositionResponse } from '../../account-protocol/positionDecision';
import { slotPermitName } from '../../src/crdt/nativeCoordination';
function acceptedRows(state: string) {
  const db = new DatabaseSync(join(state, 'account.sqlite'), { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT submission,response FROM delivery_decisions WHERE kind='accepted' UNION ALL SELECT submission,response FROM publisher_decisions WHERE kind='accepted'",
      )
      .all()
      .map((row) => {
        const envelope = decodeNetworkEnvelope(
            decodeSubmission(new Uint8Array(row['submission'] as Uint8Array)).envelope,
          ),
          decision = decodePositionResponse(new Uint8Array(row['response'] as Uint8Array));
        expect(decision.kind).toBe('accepted');
        if (decision.kind !== 'accepted') throw Error('Expected committed acceptance');
        expect(decision.head.credential).toBe(envelope.credential_id);
        expect(decision.head.position).toBe(envelope.seq);
        expect(decision.leaf.digest).toBe(Buffer.from(envelope.digest).toString('hex'));
        return {
          publisher: envelope.credential_id,
          position: envelope.seq,
          key: envelope.credential_id + '/' + envelope.seq + '/' + decision.leaf.digest,
        };
      });
  } finally {
    db.close();
  }
}
let probe: Promise<string> | undefined;
function observer() {
  return (probe ??= (async () => {
    const output = await build({
      configFile: false,
      logLevel: 'error',
      build: {
        write: false,
        minify: false,
        rollupOptions: { output: { codeSplitting: false } },
        lib: {
          entry: resolve('test/inbound-native/inspect.ts'),
          name: 'NativeReceiptObserver',
          formats: ['iife'],
        },
      },
    });
    const result = Array.isArray(output) ? output[0]! : output;
    if (!('output' in result)) throw Error('Unexpected observer watch build');
    const chunks = result.output.filter((x) => x.type === 'chunk');
    if (chunks.length !== 1) throw Error('Observer must be one isolated script');
    return chunks[0]!.code + '\nglobalThis.nativeReceiptObserver=NativeReceiptObserver;';
  })());
}
async function exportWriting(page: Page, path: string) {
  await openMenuSection(page, 'Data');
  const result = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export markdown', exact: true }).click();
  await (await result).saveAs(path);
  return JSON.parse(
    execFileSync('python3', ['scripts/legacy-export/unzip.py', path], { encoding: 'utf8' }),
  ) as { path: string; content: string }[];
}
async function lock(page: Page) {
  await openMenuSection(page, 'Account');
  await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
  await expect(page.locator('.shell')).toHaveCount(0);
}
async function position(page: Page) {
  await openMenuSection(page, 'Sync');
  const text = await page
    .locator('.sync-details')
    .getByText(/^Accepted position: \d+$/)
    .textContent();
  return Number(text!.match(/\d+$/)![0]);
}
async function idle(page: Page) {
  await openMenuSection(page, 'Sync');
  await expect(
    page.locator('.sync-details').getByText('Sending: idle', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
}
async function slot(page: Page, joined: boolean) {
  return page.evaluate(async (joined) => {
    const db = await new Promise<IDBDatabase>((accept, reject) => {
      const q = indexedDB.open('done.custody');
      q.onupgradeneeded = () => {
        q.transaction!.abort();
        reject(Error('Expected custody'));
      };
      q.onerror = () => reject(q.error);
      q.onsuccess = () => accept(q.result);
    });
    try {
      const rows = await new Promise<Record<string, unknown>[]>((accept, reject) => {
        const tx = db.transaction('entries', 'readonly'),
          q = tx.objectStore('entries').getAll();
        tx.oncomplete = () => accept(q.result);
        tx.onabort = () => reject(tx.error);
      });
      const found = rows.filter(
        (x) => x['kind'] === (joined ? 'certified-account-device' : 'local-promotion'),
      );
      if (found.length !== 1) throw Error('Expected one real account marker');
      const m = found[0]!;
      return {
        slotId: joined ? String(m['slotId']) : (m['source'] as { slotId: string }).slotId,
        floor: m['inboundReceiptVersion'],
      };
    } finally {
      db.close();
    }
  }, joined);
}
for (const direction of ['original-to-joined', 'joined-to-original'] as const)
  test(`dense interior cuts survive expired requests and exact cold replay ${direction}`, async ({
    page,
    browser,
  }, info) => {
    const path = process.env['INBOUND_NATIVE_BUILD'];
    if (!path || !isAbsolute(path) || !existsSync(path + '/index.html'))
      throw Error('Expected declared interior-cut build');
    const state = info.outputPath('service');
    const service = await startService(state, path, true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    const observations: Record<string, unknown> = { direction };
    try {
      pair = await pairedEditors(page, browser, true);
      const sendsOriginal = direction === 'original-to-joined',
        sender = sendsOriginal ? page : pair.second,
        oldReceiver = sendsOriginal ? pair.second : page,
        context = oldReceiver.context(),
        code = sendsOriginal ? pair.next.code : pair.first.code,
        joined = sendsOriginal,
        auth = await credentials(sendsOriginal ? pair.next.auth : pair.first.auth);
      const identity = await slot(oldReceiver, joined);
      expect(identity.floor).toBe(1);
      await idle(sender);
      let previous = await position(sender);
      await lock(oldReceiver);
      await oldReceiver.close();
      await context.setOffline(true);
      let accepted = new Set(acceptedRows(state).map((x) => x.key));
      const committedPositions: { publisher: string; position: number }[] = [];
      const markers = Array.from({ length: 4 }, (_, i) => `DENSE ${direction} accepted ${i + 1}`);
      for (const marker of markers) {
        await add(sender, marker);
        await expect.poll(() => position(sender), { timeout: 20000 }).toBeGreaterThan(previous);
        await idle(sender);
        const current = await position(sender);
        expect(current).toBe(previous + 1);
        const rows = acceptedRows(state),
          added = rows.filter((x) => !accepted.has(x.key));
        expect(added).toHaveLength(1);
        expect(added[0]!.position).toBe(current);
        committedPositions.push({ publisher: added[0]!.publisher, position: current });
        accepted = new Set(rows.map((x) => x.key));
        previous = current;
      }
      expect(new Set(committedPositions.map((x) => x.publisher)).size).toBe(1);
      observations['committedPositions'] = committedPositions;
      const receiver = await context.newPage();
      const keptAuthenticator = await restoreAuthenticator(receiver, auth);
      await receiver.goto(origin + '/');
      expect(await receiver.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await openSaved(receiver, code, joined);
      for (const marker of markers)
        await expect(receiver.locator('.shell')).not.toContainText(marker);
      await expect(receiver.locator('.shell')).toContainText('Keep the first device writing', {
        timeout: 15000,
      });
      const workerPaths = receiver.workers().map((w) => new URL(w.url()).pathname);
      const locks = await receiver.evaluate(async () => (await navigator.locks.query()).held ?? []);
      observations['workerPaths'] = workerPaths;
      observations['locks'] = locks.map((x) => ({ name: x.name, mode: x.mode }));
      expect(
        workerPaths.some((path) =>
          /\/assets\/(?:accountOwner|enrollmentOwner|firstDeviceOwner|recoveryOwner|localStartup)\.worker-[^/]+\.js$/.test(
            path,
          ),
        ),
      ).toBe(true);
      const permit = slotPermitName(identity.slotId),
        held = locks.filter((x) => x.name === permit);
      expect(held).toHaveLength(2);
      expect(held.every((x) => x.mode === 'shared')).toBe(true);
      expect(locks.filter((x) => x.name === permit + '/worker-supervisor')).toEqual([
        expect.objectContaining({ mode: 'exclusive' }),
      ]);
      await context.setOffline(false);
      for (const marker of markers)
        await expect(receiver.locator('.shell')).toContainText(marker, { timeout: 15000 });
      await expect(
        receiver.locator('.sync-notice').filter({ hasText: 'receive:integrity' }),
      ).toHaveCount(0);
      const expected = await exportWriting(receiver, info.outputPath('before.zip'));
      await add(receiver, 'LOCAL UNDO MUST NOT ERASE RECEIVED WRITING');
      await openMenuSection(receiver, 'Data');
      await receiver.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(receiver.locator('.shell')).not.toContainText(
        'LOCAL UNDO MUST NOT ERASE RECEIVED WRITING',
      );
      expect(await exportWriting(receiver, info.outputPath('undo.zip'))).toEqual(expected);
      await lock(receiver);
      await receiver.evaluate(await observer());
      const inspect = await receiver.evaluate(
        async ({ slotId, code, joined }) => {
          const module = Reflect.get(
            globalThis,
            'nativeReceiptObserver',
          ) as typeof import('./inspect');
          return module.inspectNativeReceipts(slotId, code, joined);
        },
        { slotId: identity.slotId, code, joined },
      );
      expect(inspect.readOnlyUnchanged).toBe(true);
      observations['native'] = inspect;
      // Journal entries are already durable and may await carrier packing on lock.
      // Keep them; unchanged native storage and exact cold exports below prove recovery.
      expect(inspect.floor).toBe(1);
      const dense = inspect.receipts.filter((x) => x.kind === 'page');
      expect(dense.some((x) => x.count === 2)).toBe(true);
      expect(dense.some((x) => x.firstEntry > 0)).toBe(true);
      expect(dense.every((x) => x.count <= 4)).toBe(true);
      await receiver.waitForTimeout(31000);
      expect(Date.now()).toBeGreaterThan(Math.max(...dense.map((x) => x.requestExpires)));
      await context.setOffline(true);
      await receiver.goto(origin + '/');
      await openSaved(receiver, code, joined);
      for (const marker of markers) await expect(receiver.locator('.shell')).toContainText(marker);
      const cold = await exportWriting(receiver, info.outputPath('cold.zip'));
      expect(cold).toEqual(expected);
      expect((await slot(receiver, joined)).floor).toBe(1);
      observations['coldArchiveExact'] = true;
      observations['archiveSha256'] = createHash('sha256')
        .update(JSON.stringify(cold))
        .digest('hex');
      observations['authenticatorRetainedThroughCold'] = !!keptAuthenticator.cdp;
      await lock(receiver);
    } finally {
      await info.attach('native-dense-observations', {
        body: JSON.stringify(observations, null, 2),
        contentType: 'application/json',
      });
      await pair?.other.close();
      await stopService(service);
    }
  });
