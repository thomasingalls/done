import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { pairedEditors, add } from '../../../../test/packaged-account/devices';
import { startService, stopService } from '../../../../test/packaged-account/server';

test('observe live background reception and forced browser suspension without changing sync policy', async ({ page, browser }, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const receiver = pair.second;
    const cover = await pair.other.newPage();
    await cover.goto('about:blank'); await cover.bringToFront();
    const visibility = await receiver.evaluate(() => ({ visibility: document.visibilityState, focus: document.hasFocus(), userAgent: navigator.userAgent }));
    const first = 'Arrived while the other page was in front';
    await add(page, first);
    await expect(receiver.locator('.shell')).toContainText(first, { timeout: 15000 });
    const cdp = await pair.other.newCDPSession(receiver);
    await receiver.evaluate(() => {
      const probe = document.createElement('span'); probe.id = 'study-counter'; probe.hidden = true;
      probe.textContent = 'study-tick:0'; document.body.append(probe);
      let ticks = 0; setInterval(() => { probe.textContent = 'study-tick:' + ++ticks; }, 50);
    });
    await page.waitForTimeout(200);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    const before = await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: [] });
    const ticksBefore = before.strings.find(value => /^study-tick:\d+$/.test(value));
    const second = 'Arrived during the forced freeze';
    const accepted = page.waitForResponse(response => response.url().endsWith('/account/delivery/submit') && response.status() === 200);
    await add(page, second); await accepted;
    // Deliberate observation window, not a latency or battery benchmark. Inspect
    // renderer DOM through CDP without scheduling JavaScript in the frozen page.
    await page.waitForTimeout(1500);
    const frozen = await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: [] });
    const ticksAfter = frozen.strings.find(value => /^study-tick:\d+$/.test(value));
    const freezeVerified = ticksBefore !== undefined && ticksBefore === ticksAfter;
    // The protocol says it tries the transition. Without an independent stopped
    // timer, a completed command is not evidence of actual page suspension.
    if (freezeVerified) expect(frozen.strings.includes(second)).toBe(false);
    const resumeAt = Date.now();
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await expect(receiver.locator('.shell')).toContainText(second, { timeout: 15000 });
    const returnMs = Date.now() - resumeAt;
    await writeFile(info.outputPath('observation.json'), JSON.stringify({
      status: 'passed', visibility, liveReceiverCaughtUp: true,
      forcedFreeze: { requested: true, freezeVerified, ticksBefore, ticksAfter, frozenDomContainsNewCard: frozen.strings.includes(second), observationWindowMs: 1500, returnMs },
      limitations: ['Headless Chromium with Playwright defaults; not installed mobile or power-saver coverage.', 'DOM polling and automation affect background scheduling.', 'A CDP freeze request is inconclusive unless the independent timer stops; it does not measure OS scheduling frequency.'],
      realAccountsUsed: false, securityPolicyChanged: false,
    }, null, 2) + '\n');
    await cdp.detach();
  } finally {
    await pair?.other.close(); await stopService(service);
  }
});
