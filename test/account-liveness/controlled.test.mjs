import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  createLocal,
  openLocal,
  prepareRecovery,
  select,
  insert,
  close,
  read,
  sync,
  settle,
  sample,
  report,
} from './fixtures.mjs';

test(
  'held reads and submissions allow local flush; late pages retry with fresh requests automatically',
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(t),
      item = await createLocal(f, 'liveness-controls');
    await openLocal(f, item);
    await insert(f, 'Baseline.');
    await close(f);
    await prepareRecovery(f, item);
    await select(f, item);
    await sync(f, item);
    await settle(f);
    let expected = (await read(f)).master;
    for (const endpoint of ['read-v2', 'submit']) {
      const path = f.origin + '/account/delivery/' + endpoint;
      let release, hit, responseBytes;
      const barrier = new Promise((r) => (release = r)),
        arrived = new Promise((r) => (hit = r));
      await f.context.route(path, async (route) => {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        responseBytes = (await response.body()).length;
        hit();
        await barrier;
        await route.fulfill({ response });
      });
      try {
        if (endpoint === 'submit') {
          expected += ' Trigger held submission.';
          assert.equal(await insert(f, ' Trigger held submission.'), expected);
        } else await f.page.evaluate(() => opened.sync.retry('receive'));
        await Promise.race([
          arrived,
          new Promise((_, reject) => {
            const timer = setTimeout(() => reject(Error('Held HTTP not reached')), 10000);
            timer.unref();
          }),
        ]);
        const at = performance.now();
        expected += ' During held ' + endpoint + '.';
        assert.equal(await insert(f, ' During held ' + endpoint + '.'), expected);
        const acceptedMs = performance.now() - at;
        await f.page.evaluate(() => {
          globalThis.flushSettled = false;
          globalThis.flushWork = editor.whenDurable().then(() => {
            flushSettled = true;
          });
        });
        await f.page.waitForFunction(() => flushSettled, {}, { timeout: 5000 });
        const settledWhileHeld = await f.page.evaluate(() => flushSettled);
        const flushMs = performance.now() - at;
        // A fresh storage census must also finish before the genuine response is released.
        await f.page.evaluate(() => opened.receiveStatus());
        release();
        await f.page.evaluate(() => flushWork);
        assert.equal(settledWhileHeld, true);
        report(endpoint === 'read-v2' ? 'held-fetch' : 'held-submit', {
          status: 'passed',
          acceptedMs,
          flushMs,
          settledWhileHeld,
          genuineResponseBytes: responseBytes,
        });
      } finally {
        release();
        await f.context.unroute(path);
      }
      await settle(f);
    }
    await settle(f);
    await close(f);
    await f.cold();
    await sync(f, item);
    assert.equal((await read(f)).master, expected);
    await settle(f);
    const initial = await f.page.evaluate(() => opened.sync.status.receive.receivedThrough);
    const requests = [];
    f.page.on('request', (request) => {
      if (request.url().endsWith('/read-v2')) requests.push(request.postData());
    });
    const shifted = await sample(f, 'commit-expiry', async () => {
      await f.page.evaluate(() => {
        globalThis.livenessCommitClockShift = 60000;
      });
      expected += ' Late genuine page.';
      assert.equal(await insert(f, ' Late genuine page.'), expected);
      await f.page.waitForFunction(
        () => opened.sync.status.send.acceptedThrough > opened.sync.status.receive.receivedThrough,
        {},
        { timeout: 30000 },
      );
      await f.page.evaluate(() => opened.sync.retry('receive'));
      await f.page.waitForFunction(
        () => opened.sync.status.receive.phase === 'retrying',
        {},
        { timeout: 30000 },
      );
      const state = await f.page.evaluate(() => ({
        status: opened.sync.status,
        expiredAtCommit: globalThis.livenessCommitExpiryObserved === true,
      }));
      assert.equal(state.status.receive.reason, null);
      assert.equal(state.status.receive.failures, 1);
      assert(state.status.receive.nextAttemptAt !== null);
      assert.equal(state.status.receive.receivedThrough, initial);
      assert(state.expiredAtCommit);
      await f.page.evaluate(() => {
        globalThis.livenessCommitClockShift = 0;
      });
      await settle(f, initial + 1, false); // No manual retry or online wake after expiry.
      return state;
    });
    assert(new Set(requests).size >= 2, 'Automatic retry signs a fresh request');
    const through = await f.page.evaluate(() => opened.sync.status.receive.receivedThrough);
    assert.equal((await read(f)).master, expected);
    await close(f);
    await f.cold();
    await sync(f, item, false);
    assert.equal((await read(f)).master, expected);
    await close(f);
    report('expiry', {
      status: 'passed',
      shifted,
      automaticFreshRetryThrough: through,
      distinctRequests: new Set(requests).size,
      coldReopen: true,
      expected,
    });
  },
);
