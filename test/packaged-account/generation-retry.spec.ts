import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { pairedEditors, openSaved, add } from './devices';
import { pending, compared, unlock } from '../device-enrollment/helpers';
import { startService, stopService } from './server';
import { decodeSubmit } from '../../account-protocol/deliveryTransport';
import { decodeSubmission } from '../../account-protocol/submission';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
import { decodePositionResponse } from '../../account-protocol/positionDecision';

test('a native survivor retries its exact old upload after replacement admission and retains journal writing on cold reopen', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const built = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-membership/custody-entry.ts'),
        name: 'MembershipCustody',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(built) ? built[0]! : built;
  if (!('output' in result)) throw Error('No probe');
  const chunk = result.output.find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw Error('No probe');
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const thirdContext = await browser.newContext(),
    fourthContext = await browser.newContext();
  const third = await thirdContext.newPage(),
    fourth = await fourthContext.newPage();
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    await pair.second.getByRole('button', { name: 'Devices', exact: true }).click();
    await pair.second.getByRole('button', { name: 'Connect another device', exact: true }).click();
    await unlock(pair.second, pair.next.code);
    const three = await pending(
      third,
      await pair.second.getByLabel('Device invitation link').inputValue(),
      pair.next.auth,
    );
    const code = await compared(pair.second, third);
    await pair.second.getByLabel('Code on the new device').fill(code);
    await pair.second.getByRole('button', { name: 'Compare and approve', exact: true }).click();
    await third
      .getByRole('button', { name: 'Open your writing', exact: true })
      .click({ timeout: 30000 });
    await expect(third.locator('.shell')).toBeVisible();
    await expect(pair.second.getByText('The device is connected.', { exact: false })).toBeVisible({
      timeout: 30000,
    });
    await pair.second.getByRole('link', { name: 'Close and return to accounts' }).click();
    await pair.second.goto('/');
    await pair.second.evaluate(chunk.code);
    const target = await pair.second.evaluate(
      async (code) =>
        window.MembershipCustody.participant(
          'joined',
          await window.MembershipCustody.accountSlot(),
          code,
        ),
      pair.next.code,
    );
    await add(third, 'Third device is certified and delivering');
    await expect(page.locator('.shell')).toContainText('Third device is certified and delivering', {
      timeout: 30000,
    });
    const attempts: { bytes: string; gen: number; parent: boolean }[] = [];
    let online = false,
      lostRefusal = false;
    await thirdContext.route('**/account/delivery/submit', async (route) => {
      const wire = decodeSubmit(new Uint8Array(route.request().postDataBuffer()!)).bytes;
      const submission = decodeSubmission(wire),
        envelope = decodeNetworkEnvelope(submission.envelope);
      console.log(
        'Submit attempt',
        envelope.gen,
        envelope.seq,
        envelope.epoch,
        submission.parent !== null,
        online,
      );
      attempts.push({
        bytes: Buffer.from(wire).toString('hex'),
        gen: envelope.gen,
        parent: submission.parent !== null,
      });
      if (!online) {
        await route.abort('internetdisconnected');
        return;
      }
      const reply = await route.fetch();
      console.log('Submit status', reply.status());
      if (reply.status() !== 200) {
        await route.fulfill({ response: reply });
        return;
      }
      const answer = decodePositionResponse(new Uint8Array(await reply.body()));
      console.log(
        'Submit outcome',
        answer.kind,
        answer.kind === 'refused' ? answer.refusal.reason : answer.head.position,
      );
      if (answer.kind === 'refused' && !lostRefusal) {
        lostRefusal = true;
        await route.abort('internetdisconnected');
        return;
      }
      await route.fulfill({ response: reply });
    });
    await add(third, 'Retained old upload crosses replacement');
    await expect.poll(() => attempts.length).toBeGreaterThan(0);
    expect(attempts[0]!.gen).toBe(1);
    await thirdContext.setOffline(true);
    await add(third, 'Journal original survives replacement retry');
    await third.getByRole('button', { name: 'Lock workspace', exact: true }).click();

    await page.goto('/');
    await page.evaluate(chunk.code);
    const slot = await page.evaluate(() => window.MembershipCustody.accountSlot());
    await expect
      .poll(
        async () => {
          const result = await page.evaluate(
            ({ slot, code, target }) =>
              window.MembershipCustody.removal('promotion', slot, code, target),
            { slot, code: pair!.first.code, target },
          );
          return result.result;
        },
        { timeout: 45000, intervals: [2000] },
      )
      .toBe('applying');
    await page.goto('/');
    await openSaved(page, pair.first.code);
    await page.getByRole('button', { name: 'Devices', exact: true }).click();
    await expect(page.locator('.account-device-list li')).toHaveCount(2);
    await expect(
      page.locator('.account-device-list li').filter({ hasText: 'Device ' + target.slice(0, 8) }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to writing', exact: true }).click();
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await page.goto('/');
    // This focused boundary check intentionally admits but does not approve the replacement.
    // The product connection button stays gated until its current-generation snapshot is implemented.
    await page.goto('/connect/unlock?slot=' + slot + '&begin=' + 'ad'.repeat(16));
    await unlock(page, pair.first.code);
    await pending(
      fourth,
      await page.getByLabel('Device invitation link').inputValue(),
      pair.next.auth,
    );
    await compared(page, fourth);
    await fourth.goto('about:blank'); // Admission is durable; stop the unused candidate polling.
    await page.getByRole('link', { name: 'Close and return to accounts' }).click();
    await page.goto('/');
    await openSaved(page, pair.first.code);

    online = true;
    await thirdContext.setOffline(false);
    await third.goto('/');
    await openSaved(third, three.code, true);
    // This cold reader had not observed the rotation before locking offline. Discovery retires
    // that old writer; follow the existing unlock screen to activate its retained successor.
    await expect(third.locator('.shell')).toHaveCount(0, { timeout: 30000 });
    await third.goto('/');
    await openSaved(third, three.code, true);
    for (const text of [
      'Retained old upload crosses replacement',
      'Journal original survives replacement retry',
    ]) {
      await expect(third.locator('.shell')).toContainText(text);
      await expect(page.locator('.shell')).toContainText(text, { timeout: 60000 });
    }
    expect(lostRefusal).toBe(true);
    const old = attempts.filter((a) => a.gen === 1);
    expect(old.length).toBeGreaterThanOrEqual(3);
    expect(new Set(old.map((a) => a.bytes)).size).toBe(1);
    expect(attempts.some((a) => a.gen === 2 && a.parent)).toBe(true);
    await third.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await third.goto('/');
    await openSaved(third, three.code, true);
    await expect(third.locator('.shell')).toContainText('Retained old upload crosses replacement');
    await add(third, 'After retry ordinary writing still delivers');
    await expect(page.locator('.shell')).toContainText(
      'After retry ordinary writing still delivers',
      { timeout: 20000 },
    );
  } finally {
    try {
      await Promise.allSettled([thirdContext.close(), fourthContext.close(), pair?.other.close()]);
    } finally {
      await stopService(service);
    }
  }
});
