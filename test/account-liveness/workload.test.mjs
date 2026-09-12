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
  'natural scheduling at 10, 40 and 80 positions and a thirty-edit burst preserves cold writing',
  { timeout: 720000 },
  async (t) => {
    const f = await fixture(t),
      item = await createLocal(f, 'q02-workload');
    await openLocal(f, item);
    await insert(f, 'Synthetic workload.');
    await close(f);
    await prepareRecovery(f, item);
    await select(f, item);
    await f.cold(false); // Timing uses the ordinary product bundle, with no measurement transforms.
    await sync(f, item);
    const initial = await settle(f, 0, false),
      rows = [],
      edits = [];
    let expected = (await read(f)).master;
    const save = (status = 'running', extra = {}) =>
      report('workload', {
        status,
        metadata: f.metadata,
        initial,
        rows,
        edits,
        ...extra,
      });
    save();
    for (let n = 1; n <= 80; n++) {
      const before = await f.page.evaluate(() => opened.sync.status.send.acceptedThrough);
      const start = performance.now();
      expected += ' x';
      assert.equal(await insert(f, ' x'), expected);
      const localMs = performance.now() - start;
      const through = await settle(f, before + 1, false);
      edits.push({ n, localMs, roundTripMs: performance.now() - start, through });
      if ([10, 40, 80].includes(n)) {
        rows.push({ n, lastFive: edits.slice(-5) });
        console.log('Workload settled ' + n + ' positions');
      }
      save();
    }
    const before = await f.page.evaluate(() => opened.sync.status.send.acceptedThrough);
    const start = performance.now();
    for (let n = 0; n < 30; n++) {
      expected += 'b';
      assert.equal(await insert(f, 'b'), expected);
      await new Promise((r) => setTimeout(r, 40));
    }
    const localMs = performance.now() - start;
    const through = await settle(f, before + 1, false);
    const burst = {
      edits: 30,
      intervalMs: 40,
      before,
      through,
      positions: through - before,
      localMs,
      roundTripMs: performance.now() - start,
    };
    assert(burst.positions >= 1 && burst.positions <= 30);
    save('running', { burst });
    await close(f);
    await f.cold(true);
    await sync(f, item);
    assert.equal((await read(f)).master, expected);
    await settle(f, through, false);
    const measured = await sample(f, 'single-edit-after-growth', async () => {
      expected += ' m';
      assert.equal(await insert(f, ' m'), expected);
      return settle(f, through + 1, false);
    });
    await close(f);
    await f.cold(false);
    await sync(f, item, false);
    assert.equal((await read(f)).master, expected);
    await close(f);
    save('passed', { burst, measured, coldReopen: true, expected });
  },
);
