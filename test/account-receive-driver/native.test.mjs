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

// Independent contract bounds: decoded envelope and hex-framed HTTP page.
const R01_ENVELOPE_BYTES = 512 * 1024,
  R01_PAGE_BYTES = 1_057_280;
for (const mode of ['wire', 'wire-http', 'count', 'declared', 'streamed'])
  test(
    `R-01 ${mode} size failure is terminal, preserves Local, and retries only explicitly`,
    { timeout: 45000 },
    async (t) => {
      const { f, item, wires, initial } = await remote(t, 'r01-' + mode);
      const oversized = ['wire', 'wire-http', 'count'].includes(mode)
        ? await f.page.evaluate(
            async ({ item, mode }) => {
              const doc = new Harness.Y.Doc({ gc: false });
              try {
                doc
                  .getText('master')
                  .insert(0, 'x'.repeat((mode === 'wire-http' ? 600 : 512) * 1024));
                const updates =
                  mode === 'count'
                    ? Array.from({ length: 256 }, () => [0, 0])
                    : [[...Harness.Y.encodeStateAsUpdate(doc)]];
                return Harness.fixtureInboundEnvelope(item.slotId, item.code, 1, updates);
              } finally {
                doc.destroy();
              }
            },
            { item: args(item), mode },
          )
        : null;
      if (mode === 'wire' || mode === 'wire-http')
        assert.ok(
          oversized.length > R01_ENVELOPE_BYTES,
          'fixture must exceed decoded envelope limit',
        );
      if (mode === 'count')
        assert.ok(
          oversized.length < R01_ENVELOPE_BYTES,
          'count fixture must not hit envelope byte limit',
        );
      let calls = 0,
        bad = true;
      await f.context.route(path(f), (route) => {
        calls++;
        const q = Buffer.from(route.request().postData());
        const body = answer(
          f,
          item,
          q,
          bad ? oversized : JSON.parse(q.toString())[10] === 0 ? wires[0] : null,
        ).bytes;
        if (bad && oversized)
          assert.equal(
            body.length > R01_PAGE_BYTES,
            mode === 'wire-http',
            'independent signed-page bytes must reach the intended HTTP/decoded boundary',
          );
        return route.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          body,
        });
      });
      if (!oversized)
        await f.page.evaluate((mode) => {
          window.sizeFault = true;
          const fetch = window.fetch;
          window.fetch = (...args) =>
            window.sizeFault && String(args[0]).includes('/delivery/read-v2')
              ? Promise.resolve(
                  new Response(new Uint8Array(mode === 'streamed' ? 4 * 1024 * 1024 + 1 : 1), {
                    headers: {
                      'content-type': 'application/octet-stream',
                      ...(mode === 'declared'
                        ? { 'content-length': String(4 * 1024 * 1024 + 1) }
                        : {}),
                    },
                  }),
                )
              : fetch(...args);
        }, mode);
      await polling(f.page, item);
      await waitPredicate(f.page, () => opened.receiver.status.phase === 'blocked');
      assert.equal(
        (await driverStatus(f.page)).reason,
        mode === 'wire' || mode === 'count' ? 'inbound-size' : 'response-too-large',
      );
      assert.equal((await driverStatus(f.page)).receivedThrough, 0);
      assert.equal(await view(f.page), initial);
      const before = calls;
      await online(f.page, false);
      await online(f.page, true);
      assert.equal(calls, before);
      assert.equal((await driverStatus(f.page)).nextAttemptAt, null);
      bad = false;
      await f.page.evaluate(() => {
        window.sizeFault = false;
      });
      await retry(f.page);
      await waitPredicate(f.page, () => opened.receiver.status.receivedThrough === 1);
      await idle(f.page);
      assert.equal(await view(f.page), 'REMOTE0 ' + initial);
      await close(f.page);
      await cold(f);
      await polling(f.page, item);
      await idle(f.page);
      assert.equal((await driverStatus(f.page)).receivedThrough, 1);
      assert.equal(await view(f.page), 'REMOTE0 ' + initial);
      await close(f.page);
    },
  );
