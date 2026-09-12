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
  'genuine fetch blocks flush; genuine late page halts until fresh retry',
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
    const path = f.origin + '/account/delivery/read-v2';
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
      await f.page.evaluate(() => opened.sync.retry('receive'));
      await Promise.race([
        arrived,
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(Error('Held read not reached')), 10000);
          timer.unref();
        }),
      ]);
      const at = performance.now();
      expected += ' During held fetch.';
      assert.equal(await insert(f, ' During held fetch.'), expected);
      const acceptedMs = performance.now() - at;
      await f.page.evaluate(() => {
        globalThis.flushSettled = false;
        globalThis.flushWork = editor.whenDurable().then(() => {
          flushSettled = true;
        });
      });
      await f.page.waitForTimeout(250); // Deliberate ordering observation, below the actual fetch timeout.
      const settledWhileHeld = await f.page.evaluate(() => flushSettled);
      release();
      await f.page.evaluate(() => flushWork);
      assert.equal(settledWhileHeld, false);
      report('held-fetch', {
        status: 'reproduced',
        acceptedMs,
        flushMs: performance.now() - at,
        holdObservationMs: 250,
        settledWhileHeld,
        genuineResponseBytes: responseBytes,
      });
    } finally {
      release();
      await f.context.unroute(path);
    }
    await settle(f);
    await close(f);
    await f.cold();
    await sync(f, item);
    assert.equal((await read(f)).master, expected);
    await settle(f);
    const initial = await f.page.evaluate(() => opened.sync.status.receive.receivedThrough);
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
        () => opened.sync.status.receive.phase === 'blocked',
        {},
        { timeout: 30000 },
      );
      const state = await f.page.evaluate(() => ({
        status: opened.sync.status,
        expiredAtCommit: globalThis.livenessCommitExpiryObserved === true,
      }));
      assert.equal(state.status.receive.reason, 'operation-failed');
      assert.equal(state.status.receive.receivedThrough, initial);
      assert(state.expiredAtCommit);
      await f.page.evaluate(async () => {
        setOnline(false);
        await editor.whenDurable();
        await opened.receiveStatus();
      });
      return state;
    });
    report('expiry', { status: 'reproduced-awaiting-recovery-control', shifted });
    await f.page.evaluate(() => {
      globalThis.livenessCommitClockShift = 0;
      setOnline(true);
      opened.sync.retry('receive');
    });
    const through = await settle(f, initial + 1);
    assert.equal((await read(f)).master, expected);
    await close(f);
    await f.cold();
    await sync(f, item, false);
    assert.equal((await read(f)).master, expected);
    await close(f);
    report('expiry', {
      status: 'reproduced',
      shifted,
      freshUnshiftedRetryThrough: through,
      coldReopen: true,
      expected,
    });
  },
);
