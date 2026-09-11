import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  open,
  close,
  cold,
  edit,
  prepare,
  submission,
  args,
  captures,
  status,
  view,
  remote,
  path,
  next,
  start,
  answer,
  waitPredicate,
  receiveBoundary,
  local,
  crash,
  inventory,
} from './fixtures.mjs';

test(
  'actual v2 HTTP pages advance owned durable progress without local recapture, including cold end',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'receive-http-service');
    await f.page.evaluate(async (item) => {
      window.opened = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
    }, args(item));
    await edit(f.page, 0, 0, 'HTTP initial ');
    for (let n = 1; n <= 2; n++) {
      await prepare(f.page);
      await submission(f.page, n);
      assert.equal(
        (await f.page.evaluate((token) => opened.submitPending(token), f.testOperatorToken)).kind,
        'accepted',
      );
    }
    await close(f.page);
    await open(f.page, item);
    const initial = await view(f.page),
      before = await captures(f.page),
      queries = [];
    await f.context.route(path(f), async (route) => {
      queries.push(JSON.parse(route.request().postData()));
      await route.continue();
    });
    for (let n = 1; n <= 2; n++) {
      const r = await next(f);
      assert.equal(r.kind, 'received');
      assert.equal(r.status.receivedThrough, n);
      assert.equal(queries.at(-1)[10], n - 1);
      assert.equal(queries.at(-1)[11], 1);
    }
    assert.equal((await next(f)).kind, 'empty');
    assert.deepEqual(await captures(f.page), before);
    assert.equal(await view(f.page), initial);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal((await status(f.page)).receivedThrough, 2);
    assert.equal((await next(f)).kind, 'empty');
    assert.equal(await view(f.page), initial);
    await close(f.page);
  },
);

test(
  'HTTP refusal, truncation, overflow, redirect, lost reply and stale signed page advance no cursor',
  { timeout: 60000 },
  async (t) => {
    const { f, item, wire, initial } = await remote(t, 'receive-http-refusals');
    const before = await inventory(f.page);
    assert.equal((await next(f, 'B'.repeat(43))).kind, 'unknown');
    let saved;
    for (const mode of [
      'status',
      'type',
      'truncated',
      'oversized',
      'redirect',
      'lost',
      'good',
      'stale',
    ]) {
      await f.context.route(path(f), async (route) => {
        const q = Buffer.from(route.request().postData());
        const page = answer(f, item, q, wire).bytes;
        if (mode === 'lost') {
          saved = page;
          await route.abort();
          return;
        }
        await route.fulfill(
          mode === 'redirect'
            ? { status: 307, headers: { Location: path(f) } }
            : {
                status: mode === 'status' ? 409 : 200,
                contentType: mode === 'type' ? 'application/json' : 'application/octet-stream',
                body:
                  mode === 'oversized'
                    ? Buffer.alloc(4 * 1024 * 1024 + 1)
                    : mode === 'truncated'
                      ? page.subarray(0, -9)
                      : mode === 'stale'
                        ? saved
                        : page,
              },
        );
      });
      const r = await next(f).catch((e) => ({ error: String(e) }));
      if (mode === 'good') {
        assert.equal(r.kind, 'received');
        assert.equal(await view(f.page), 'REMOTE ' + initial);
      } else
        assert.ok(r.kind === 'unknown' || r.error?.includes('AdmissionError'), JSON.stringify(r));
      assert.equal(
        (await status(f.page)).receivedThrough,
        ['good', 'stale'].includes(mode) ? 1 : 0,
      );
      if (!['good', 'stale'].includes(mode)) assert.equal(await inventory(f.page), before);
      await f.context.unroute(path(f));
    }
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    assert.equal((await status(f.page)).receivedThrough, 1);
    await close(f.page);
  },
);

test(
  'fetch serializes outstanding reads; a manually superseding request refuses the older response',
  { timeout: 45000 },
  async (t) => {
    const { f, item, wire, initial } = await remote(t, 'receive-http-superseded');
    let release,
      hit = false,
      calls = 0;
    await f.context.route(path(f), async (route) => {
      calls++;
      hit = true;
      const q = Buffer.from(route.request().postData());
      await new Promise((r) => {
        release = r;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: answer(f, item, q, wire).bytes,
      });
    });
    await start(f);
    const end = Date.now() + 10000;
    while (!hit && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
    assert.equal(hit, true);
    assert.equal((await next(f)).kind, 'busy');
    assert.equal(calls, 1);
    // Queued behind the fetch's task, but ahead of the eventual receive task.
    await f.page.evaluate(() => {
      window.superseding = opened.prepareRead();
    });
    release();
    const r = await f.page.evaluate(() => work);
    assert.match(r.error, /superseded/);
    await f.page.evaluate(() => superseding);
    assert.equal((await status(f.page)).receivedThrough, 0);
    assert.equal(await view(f.page), initial);
    await f.context.unroute(path(f));
    await close(f.page);
  },
);

test(
  'remote native commit holds ordered publication and later local input through HTTP',
  { timeout: 45000 },
  async (t) => {
    const { f, item, wire, initial } = await remote(t, 'receive-http-order');
    await f.context.route(path(f), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: answer(f, item, Buffer.from(route.request().postData()), wire).bytes,
      }),
    );
    const before = (await captures(f.page)).length;
    await receiveBoundary(f.page, 'after');
    await start(f);
    await waitPredicate(f.page, () => !!window.hit);
    await local(f.page);
    assert.equal(await view(f.page), initial);
    assert.equal((await next(f)).kind, 'busy');
    await f.page.evaluate(() => release());
    assert.equal((await f.page.evaluate(() => work)).kind, 'received');
    assert.equal(await f.page.evaluate(() => local), true);
    await f.page.evaluate(() => editor.whenDurable());
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LATER');
    assert.equal((await captures(f.page)).length, before + 1);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LATER');
    assert.equal((await status(f.page)).receivedThrough, 1);
    await close(f.page);
  },
);

for (const mode of ['fetch', 'stream'])
  test(
    `close aborts and drains pending ${mode} before another owner acquires`,
    { timeout: 45000 },
    async (t) => {
      const { f, item, initial } = await remote(t, 'receive-http-close-' + mode);
      await f.page.evaluate((mode) => {
        window.oldFetch = fetch;
        window.hit = false;
        window.cancelled = false;
        window.fetch = async (_url, init) => {
          window.fetchSignal = init.signal;
          if (mode === 'fetch') {
            window.hit = true;
            await new Promise((r) => {
              window.release = r;
            });
            return new Response(new Uint8Array([0]), {
              headers: { 'Content-Type': 'application/octet-stream' },
            });
          }
          return new Response(
            new ReadableStream({
              pull() {
                window.hit = true;
              },
              cancel() {
                window.cancelled = true;
                return new Promise((r) => {
                  window.release = r;
                });
              },
            }),
            { headers: { 'Content-Type': 'application/octet-stream' } },
          );
        };
      }, mode);
      await start(f);
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
      assert.equal(await f.page.evaluate(() => fetchSignal.aborted), true);
      assert.equal(await f.page.evaluate(() => competed || closed), false);
      if (mode === 'stream') assert.equal(await f.page.evaluate(() => cancelled), true);
      await f.page.evaluate(() => release());
      assert.ok((await f.page.evaluate(() => work)).error);
      await f.page.evaluate(() => closing);
      await f.page.evaluate(() => competitor);
      await cold(f);
      await open(f.page, item);
      assert.equal((await status(f.page)).receivedThrough, 0);
      assert.equal(await view(f.page), initial);
      await close(f.page);
    },
  );

for (const side of ['before', 'after'])
  test(
    `HTTP receive ${side} native commit crash cold-retries from actual durable progress`,
    { timeout: 45000 },
    async (t) => {
      const { f, item, wire, initial } = await remote(t, 'receive-http-crash-' + side);
      await f.context.route(path(f), (route) => {
        const q = Buffer.from(route.request().postData());
        return route.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          body: answer(f, item, q, JSON.parse(q.toString())[10] === 0 ? wire : null).bytes,
        });
      });
      await receiveBoundary(f.page, side);
      await start(f);
      await waitPredicate(f.page, () => !!window.hit);
      assert.equal(await view(f.page), initial);
      if (side === 'before') await waitPredicate(f.page, () => editor.status.state === 'blocked');
      await crash(f);
      await cold(f);
      await open(f.page, item);
      assert.equal((await status(f.page)).receivedThrough, side === 'after' ? 1 : 0);
      assert.equal((await next(f)).kind, side === 'after' ? 'empty' : 'received');
      assert.equal(await view(f.page), 'REMOTE ' + initial);
      await close(f.page);
    },
  );

test(
  'local journal admission remains responsive during fetch and the eventual page preserves that edit',
  { timeout: 45000 },
  async (t) => {
    const { f, item, wire, initial } = await remote(t, 'receive-http-local-during-fetch');
    await f.page.evaluate(() => {
      window.originalFetch = fetch;
      window.hit = false;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        window.hit = true;
        await new Promise((r) => {
          window.release = r;
        });
        return response;
      };
    });
    await f.context.route(path(f), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: answer(f, item, Buffer.from(route.request().postData()), wire).bytes,
      }),
    );
    const before = (await captures(f.page)).length;
    await start(f);
    await waitPredicate(f.page, () => hit);
    await local(f.page, 'WHILE FETCHING');
    // This awaits only journal admission, not a flush queued behind HTTP.
    assert.equal(await f.page.evaluate(() => local), true);
    assert.equal(await view(f.page), initial + 'WHILE FETCHING');
    await f.page.evaluate(() => release());
    assert.equal((await f.page.evaluate(() => work)).kind, 'received');
    await f.page.evaluate(() => editor.whenDurable());
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'WHILE FETCHING');
    assert.equal((await captures(f.page)).length, before + 1);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'WHILE FETCHING');
    await close(f.page);
  },
);
