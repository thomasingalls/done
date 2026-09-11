import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  polling,
  path,
  driverBundle,
  configure,
  waitPredicate,
  close,
} from './fixtures.mjs';
for (const gate of ['offline', 'pressure'])
  test(
    `final ${gate} dispatch guard prevents a queued poll from fetching`,
    { timeout: 45000 },
    async (t) => {
      const observations = [];
      for (const mode of ['baseline', 'dispatch']) {
        const f = await native(t),
          item = await selected(f, `poll-${gate}-${mode}`);
        let calls = 0;
        await f.context.route(path(f), (r) => {
          calls++;
          return r.continue();
        });
        await f.page.evaluate(await driverBundle(mode));
        await configure(f.page, f.testOperatorToken);
        await f.page.evaluate((gate) => {
          window.hit = false;
          window.receiveDispatchBoundary = () => {
            window.hit = true;
            if (gate === 'offline') {
              Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
              dispatchEvent(new Event('offline'));
            } else {
              // Test-owned quota pressure, through the real journal admission path.
              Storage.prototype.setItem = function () {
                throw new DOMException('fixture quota', 'QuotaExceededError');
              };
              IDBDatabase.prototype.transaction = function () {
                throw new DOMException('fixture unavailable', 'InvalidStateError');
              };
              const n = editor.read().master.length;
              window.localJob = surface
                .input(
                  { name: 'insert', text: 'BLOCKED' },
                  { ranges: [{ anchor: n, head: n }], main: 0 },
                )
                .accepted.catch(() => {});
            }
          };
        }, gate);
        await polling(f.page, item);
        await waitPredicate(f.page, () => hit);
        // The marker read after HTTP may also refuse after the test-induced storage failure.
        await waitPredicate(f.page, () =>
          ['offline', 'blocked'].includes(opened.receiver.status.phase),
        );
        await close(f.page);
        assert.equal(calls, mode === 'dispatch' ? 1 : 0);
        observations.push({ mode, calls });
        await f.context.close();
      }
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, `control-dispatch-${gate}.json`),
          JSON.stringify({ effective: true, observations }, null, 2) + '\n',
        );
    },
  );
