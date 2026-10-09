import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  sending,
  close,
  driverBundle,
  intercept,
  driverStatus,
} from './fixtures.mjs';
test(
  'actual dispatch guard control sends after connectivity changes at the final fetch boundary',
  { timeout: 40000 },
  async (t) => {
    const results = [];
    for (const mode of ['dispatch-baseline', 'dispatch']) {
      const f = await native(t),
        item = await selected(f, mode);
      let sent = 0;
      await intercept(f, (route) => {
        sent++;
        return route.continue();
      });
      await f.page.evaluate(await driverBundle(mode));
      await f.page.evaluate(() => {
        window.driverDispatchBoundary = () => {
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
          dispatchEvent(new Event('offline'));
        };
      });
      await sending(f.page, item);
      await f.page.waitForFunction(() => opened.driver.status.phase === 'offline');
      if (mode === 'dispatch')
        await f.page.waitForFunction(() => opened.driver.status.acceptedThrough === 1);
      await close(f.page);
      assert.equal(sent, mode === 'dispatch' ? 1 : 0);
      results.push({ mode, sent, status: await driverStatus(f.page) });
    }
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-dispatch.json'),
        JSON.stringify(results, null, 2) + '\n',
      );
  },
);
