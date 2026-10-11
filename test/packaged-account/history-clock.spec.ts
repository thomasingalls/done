import { test, expect } from '@playwright/test';
import { pairedEditors, add } from './devices';
import { startService, stopService } from './server';

test('a slightly fast device clock can receive history and writing while continuing to upload', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const failures: { status: number; refusal: string }[] = [];
  try {
    pair = await pairedEditors(page, browser, true);
    const second = pair.second;
    second.on('response', async (response) => {
      if (
        new URL(response.url()).pathname === '/account/history/v1/checkpoint' &&
        response.status() !== 200
      ) {
        const result = await response.json().catch(() => ({}));
        failures.push({ status: response.status(), refusal: result.refusal ?? 'none' });
      }
    });
    // Comparable to the real phone's measured 656–717 ms lead over the server.
    // Change only this renderer; the service and first device retain their clocks.
    await second.evaluate(() => {
      const now = Date.now.bind(Date);
      Date.now = () => now() + 700;
    });
    await add(second, 'Fast clock device still uploads');
    await expect(page.locator('.shell')).toContainText('Fast clock device still uploads', {
      timeout: 15000,
    });
    await add(page, 'Peer writing reaches the fast clock device');
    await expect(second.locator('.shell')).toContainText(
      'Peer writing reaches the fast clock device',
      { timeout: 15000 },
    );
    expect(failures).toEqual([]);
  } catch (cause) {
    console.log('History refusals:', failures);
    throw cause;
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
