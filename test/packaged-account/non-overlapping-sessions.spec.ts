import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { decodeSubmit } from '../../account-protocol/deliveryTransport';
import { decodeSubmission } from '../../account-protocol/submission';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
import { decodePositionResponse } from '../../account-protocol/positionDecision';
import { openMenuSection } from '../geometry/openApp';
import { pairedEditors, credentials, restoreAuthenticator, openSaved, add } from './devices';
import { startService, stopService, startBackend, stopProcess, origin } from './server';

async function settledSending(page: Page) {
  await openMenuSection(page, 'Sync');
  const sync = page.locator('.sync-details');
  await expect(sync.getByText('Sending: idle', { exact: true })).toBeVisible({ timeout: 20000 });
  const position = await sync.getByText(/^Accepted position: \d+$/).textContent();
  return Number(position!.match(/\d+$/)![0]);
}

async function closeDevice(page: Page) {
  const context = page.context();
  await page.close();
  await context.setOffline(true);
  expect(context.pages()).toHaveLength(0);
}

async function openOffline(
  context: BrowserContext,
  saved: Awaited<ReturnType<typeof credentials>>,
  code: string,
  joining: boolean,
) {
  expect(context.pages()).toHaveLength(0);
  const page = await context.newPage();
  const auth = await restoreAuthenticator(page, saved);
  await context.setOffline(true);
  await page.goto(origin + '/');
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const reachable = await page.evaluate(async () => {
    try {
      return (
        await fetch('/__account-setup/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          cache: 'no-store',
        })
      ).status;
    } catch {
      return null;
    }
  });
  expect(reachable).toBeNull();
  // Chromium's emulated network denial can leave onLine=true on a new document.
  // The uncached POST proves isolation; the OS connectivity hint is not that proof.
  const onlineHint = await page.evaluate(() => navigator.onLine);
  await openSaved(page, code, joining);
  return { page, auth, onlineHint };
}

for (const direction of ['first-to-second', 'second-to-first']) {
  test(`confirmed uploads survive non-overlapping sessions ${direction}`, async ({
    page,
    browser,
  }, info) => {
    const state = info.outputPath('service');
    const service = await startService(state, undefined, true, true);
    let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
    const errors: string[] = [];
    try {
      pair = await pairedEditors(page, browser, true);
      const firstSends = direction === 'first-to-second';
      const sender = firstSends ? page : pair.second;
      let receiver = firstSends ? pair.second : page;
      const senderContext = sender.context(),
        receiverContext = receiver.context();
      const receiverSaved = await credentials(firstSends ? pair.next.auth : pair.first.auth);
      const receiverCode = firstSends ? pair.next.code : pair.first.code;
      for (const context of [senderContext, receiverContext])
        context.on('page', (p) => p.on('pageerror', (error) => errors.push(error.message)));
      sender.on('pageerror', (error) => errors.push(error.message));
      receiver.on('pageerror', (error) => errors.push(error.message));
      const baselinePosition = await settledSending(sender);
      const marker = `Accepted while the receiver is closed: ${direction}`;
      await expect(receiver.locator('.shell')).not.toContainText(marker);
      await closeDevice(receiver);

      // A successful status alone is insufficient: bind the accepted decision to its exact request,
      // independently inspect committed server bytes, and require the client's verified frontier.
      let accepted:
        | { request: Uint8Array<ArrayBuffer>; response: Uint8Array<ArrayBuffer> }
        | undefined;
      await sender.route('**/account/delivery/submit', async (route) => {
        const response = await route.fetch();
        if (response.status() === 200)
          accepted = {
            request: new Uint8Array(route.request().postDataBuffer()!),
            response: new Uint8Array(await response.body()),
          };
        await route.fulfill({ response });
      });
      await add(sender, marker);
      await expect.poll(() => !!accepted, { timeout: 20000 }).toBe(true);
      const wire = decodeSubmit(accepted!.request);
      const envelope = decodeNetworkEnvelope(decodeSubmission(wire.bytes).envelope);
      const responseBytes = accepted!.response;
      const decision = decodePositionResponse(responseBytes);
      expect(decision.kind).toBe('accepted');
      if (decision.kind !== 'accepted') throw Error('Upload was not accepted');
      expect(decision.head).toMatchObject({
        workspace: wire.workspaceId,
        credential: envelope.credential_id,
        position: envelope.seq,
      });
      expect(decision.leaf).toEqual({
        epoch: envelope.epoch,
        digest: Buffer.from(envelope.digest).toString('hex'),
      });
      expect(envelope.seq).toBeGreaterThan(baselinePosition);
      const db = new DatabaseSync(join(state, 'account.sqlite'), { readOnly: true });
      try {
        const rows = db
          .prepare(`
          SELECT d.kind, d.submission, d.response FROM publisher_decisions d
          JOIN promotions p ON p.account_id=d.account_id
          WHERE p.workspace_id=? AND d.credential_id=? AND d.position=? AND d.digest=?
          UNION ALL
          SELECT d.kind, d.submission, d.response FROM delivery_decisions d
          JOIN promotions p ON p.account_id=d.account_id
          WHERE p.workspace_id=? AND d.position=? AND d.digest=?
        `)
          .all(
            wire.workspaceId,
            envelope.credential_id,
            envelope.seq,
            decision.leaf.digest,
            wire.workspaceId,
            envelope.seq,
            decision.leaf.digest,
          );
        expect(rows).toHaveLength(1);
        expect(rows[0]!['kind']).toBe('accepted');
        expect(new Uint8Array(rows[0]!['submission'] as Uint8Array)).toEqual(wire.bytes);
        expect(new Uint8Array(rows[0]!['response'] as Uint8Array)).toEqual(responseBytes);
      } finally {
        db.close();
      }
      expect(await settledSending(sender)).toBe(envelope.seq);
      expect(receiverContext.pages()).toHaveLength(0);
      await sender.unrouteAll({ behavior: 'wait' });
      await closeDevice(sender);

      // Restarting the API also rules out live sender state or an in-memory delivery queue.
      await stopProcess(service.backend);
      service.backend = await startBackend(state, true, true);
      expect(senderContext.pages()).toHaveLength(0);
      expect(receiverContext.pages()).toHaveLength(0);
      const opened = await openOffline(receiverContext, receiverSaved, receiverCode, firstSends);
      receiver = opened.page;
      await expect(receiver.locator('.shell')).toContainText('Keep the first device writing');
      await expect(receiver.locator('.shell')).not.toContainText(marker);
      const started = performance.now();
      await receiverContext.setOffline(false);
      await expect(receiver.locator('.shell')).toContainText(marker, { timeout: 20000 });
      const catchupMs = performance.now() - started;
      expect(senderContext.pages()).toHaveLength(0);
      const retainedCredentials = await credentials(opened.auth);
      // A second offline document must see admitted storage, not the previous live projection.
      await closeDevice(receiver);
      receiver = (await openOffline(receiverContext, retainedCredentials, receiverCode, firstSends))
        .page;
      await expect(receiver.locator('.shell')).toContainText(marker);
      expect(senderContext.pages()).toHaveLength(0);
      expect(errors).toEqual([]);
      await info.attach('non-overlapping-session-evidence', {
        contentType: 'application/json',
        body: JSON.stringify({
          direction,
          acceptedPosition: envelope.seq,
          exactCommittedUploadAndResponse: true,
          clientVerifiedAcceptance: true,
          senderClosedAndOfflineBeforeReceiverOpened: true,
          receiverInitiallyOfflineAndMissingMarker: true,
          receiverOfflineNetworkProbeFailed: true,
          receiverOfflineNavigatorOnlineHint: opened.onlineHint,
          apiRestartedBetweenUploadAndReceive: true,
          catchupMs,
          receiverOfflineReopenRetainedWriting: true,
          pageErrors: errors,
        }),
      });
    } finally {
      await Promise.all([page.context().close(), pair?.other.close()]);
      await stopService(service);
    }
  });
}
