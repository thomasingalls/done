import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  args,
  close,
  cold,
  edit,
  prepare,
  submission,
  polling,
  path,
  driverStatus,
  retry,
  online,
  waitPredicate,
  remote,
  answer,
  view,
  captures,
  receiveBoundary,
} from './fixtures.mjs';
const idle = (page) => waitPredicate(page, () => opened.receiver.status.phase === 'idle');

test(
  'actual service empty-to-later-data polling advances durable progress without a local wake',
  { timeout: 45000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'receive-poll-http');
    await f.page.evaluate(async (item) => {
      window.opened = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
    }, args(item));
    await prepare(f.page);
    const w = await submission(f.page);
    await close(f.page);
    const queries = [];
    await f.context.route(path(f), (route) => {
      queries.push(JSON.parse(route.request().postData()));
      return route.continue();
    });
    await polling(f.page, item);
    await idle(f.page);
    assert.equal((await driverStatus(f.page)).receivedThrough, 0);
    const before = await captures(f.page),
      initial = await view(f.page);
    const r = await fetch(f.server.origin + '/account/delivery/submit', {
      method: 'POST',
      headers: {
        Origin: f.server.origin,
        'Content-Type': 'application/octet-stream',
        Authorization: 'Bearer ' + f.testOperatorToken,
      },
      body: JSON.stringify([
        'done/private-submit/v1',
        1,
        item.scope.workspaceId,
        Buffer.from(w.bytes).toString('hex'),
      ]),
    });
    assert.equal(r.status, 200);
    await r.arrayBuffer();
    await waitPredicate(f.page, () => opened.receiver.status.receivedThrough === 1);
    await idle(f.page);
    assert.deepEqual(
      queries.slice(0, 3).map((q) => q[10]),
      [0, 0, 1],
    );
    assert.equal(new Set(queries.map((q) => q[12])).size, queries.length);
    assert.deepEqual(await captures(f.page), before);
    assert.equal(await view(f.page), initial);
    assert.deepEqual(
      await f.page.evaluate(() =>
        ['prepareRead', 'receiveNext', 'receivePage'].filter((k) => k in opened),
      ),
      [],
    );
    await close(f.page);
    await cold(f);
    await polling(f.page, item);
    await idle(f.page);
    assert.equal((await driverStatus(f.page)).receivedThrough, 1);
    assert.equal(queries.at(-1)[10], 1);
    await close(f.page);
  },
);

test(
  'lost replies back off at the unchanged cursor then catch up original remote text without recapture',
  { timeout: 45000 },
  async (t) => {
    const { f, item, initial, wires } = await remote(t, 'receive-poll-lost', 2),
      links = ['00'.repeat(32)],
      queries = [];
    let lose = true;
    await f.context.route(path(f), async (route) => {
      const q = Buffer.from(route.request().postData()),
        r = JSON.parse(q.toString());
      queries.push(r);
      const a = answer(f, item, q, wires[r[10]], links[r[10]], 2);
      if (wires[r[10]]) links[r[10] + 1] = a.link;
      if (lose) {
        lose = false;
        await route.abort();
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: a.bytes });
    });
    await polling(f.page, item);
    await waitPredicate(f.page, () => opened.receiver.status.phase === 'retrying');
    assert.equal((await driverStatus(f.page)).receivedThrough, 0);
    await edit(f.page, (await view(f.page)).length, 0, 'LOCAL');
    await waitPredicate(f.page, () => opened.receiver.status.receivedThrough === 2);
    await idle(f.page);
    assert.deepEqual(
      queries.slice(0, 4).map((q) => q[10]),
      [0, 0, 1, 2],
    );
    assert.notEqual(queries[0][12], queries[1][12]);
    assert.equal(await view(f.page), 'REMOTE1 REMOTE0 ' + initial + 'LOCAL');
    const count = (await captures(f.page)).length;
    await close(f.page);
    await cold(f);
    await polling(f.page, item);
    await idle(f.page);
    assert.equal(await view(f.page), 'REMOTE1 REMOTE0 ' + initial + 'LOCAL');
    assert.equal((await captures(f.page)).length, count);
    await close(f.page);
  },
);

test(
  'invalid page halts across edits and offline/online, with an explicit retry rechecking durable state',
  { timeout: 45000 },
  async (t) => {
    const { f, item, wires, initial } = await remote(t, 'receive-poll-halt');
    let corrupt = true,
      calls = 0;
    await f.context.route(path(f), (route) => {
      calls++;
      const q = Buffer.from(route.request().postData());
      return route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: corrupt
          ? 'not a signed page'
          : answer(f, item, q, JSON.parse(q.toString())[10] === 0 ? wires[0] : null).bytes,
      });
    });
    await polling(f.page, item);
    await waitPredicate(f.page, () => opened.receiver.status.reason === 'operation-failed');
    assert.equal(calls, 1);
    await edit(f.page, (await view(f.page)).length, 0, 'LOCAL');
    await online(f.page, false);
    await online(f.page, true);
    corrupt = false;
    // Advance past a complete healthy polling interval; connectivity must not clear the failure halt.
    await new Promise((r) => setTimeout(r, 5200));
    assert.equal(calls, 1);
    assert.equal((await driverStatus(f.page)).receivedThrough, 0);
    await retry(f.page);
    await waitPredicate(f.page, () => opened.receiver.status.receivedThrough === 1);
    await idle(f.page);
    assert.equal(await view(f.page), 'REMOTE0 ' + initial + 'LOCAL');
    await close(f.page);
  },
);

test(
  'native storage failure pauses the suffix and requires explicit driver retry after Local repair',
  { timeout: 45000 },
  async (t) => {
    const { f, item, wires, initial } = await remote(t, 'receive-poll-pressure');
    let available = true,
      calls = 0;
    await f.context.route(path(f), (route) => {
      calls++;
      const q = Buffer.from(route.request().postData());
      return route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: answer(f, item, q, JSON.parse(q.toString())[10] === 0 && available ? wires[0] : null)
          .bytes,
      });
    });
    // Let the first attempt become a native blocked receive job; discard that uncommitted suffix.
    await receiveBoundary(f.page, 'before');
    await polling(f.page, item);
    await waitPredicate(f.page, () => editor.status.state === 'blocked');
    assert.equal(await view(f.page), initial);
    assert.equal(calls, 1);
    available = false;
    await f.page.evaluate(() => editor.discardPending());
    await waitPredicate(f.page, () => opened.receiver.status.reason === 'operation-failed');
    await online(f.page, false);
    await online(f.page, true);
    assert.equal(calls, 1);
    await retry(f.page);
    await idle(f.page);
    assert.equal(calls, 2);
    assert.equal((await driverStatus(f.page)).receivedThrough, 0);
    await close(f.page);
  },
);

test(
  'close aborts and drains the active poll before releasing exclusion; backoff closes promptly',
  { timeout: 45000 },
  async (t) => {
    const { f, item } = await remote(t, 'receive-poll-close');
    await f.page.evaluate(() => {
      window.hit = false;
      window.fetch = async (_url, init) => {
        window.pollSignal = init.signal;
        window.hit = true;
        await new Promise((r) => {
          window.release = r;
        });
        return new Response('late', { status: 409 });
      };
    });
    await polling(f.page, item);
    await waitPredicate(f.page, () => hit);
    await f.page.evaluate((slot) => {
      window.closed = false;
      window.closing = editor.close().then(() => {
        window.closed = true;
      });
      window.competed = false;
      window.competitor = navigator.locks.request(Harness.slotPermitName(slot), () => {
        window.competed = true;
      });
    }, item.slotId);
    await waitPredicate(f.page, async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => pollSignal.aborted), true);
    assert.equal(await f.page.evaluate(() => closed || competed), false);
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => closing);
    await f.page.evaluate(() => competitor);
    assert.equal((await driverStatus(f.page)).phase, 'closed');
    await cold(f);
    await f.context.route(path(f), (r) => r.abort());
    await polling(f.page, item);
    await waitPredicate(f.page, () => opened.receiver.status.phase === 'retrying');
    const at = Date.now();
    await close(f.page);
    assert.ok(Date.now() - at < 1500);
    await online(f.page, true);
    await retry(f.page);
    assert.equal((await driverStatus(f.page)).phase, 'closed');
  },
);
