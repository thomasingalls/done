import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './service-fixture.mjs';
import { client as c } from './client.mjs';
import { HISTORY_PAGE_LIMIT } from '../../account-protocol/historyExchange.ts';

test('history transport carries the exact signed request under the pinned scoped access', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await setup(t),
    request = await f.makeRequest('read', 'latest');
  let sent = 0;
  const exchange = c.createHistoryTransport(
    f.membership,
    {
      kind: 'scoped-account',
      pin: f.authority.pin,
      async fetch(path, init) {
        sent++;
        assert.equal(path, '/account/history/v1/checkpoint');
        assert.equal(init.credentials, 'omit');
        assert.equal(init.cache, 'no-store');
        assert.equal(init.redirect, 'error');
        assert.deepEqual(JSON.parse(init.body), request);
        const value = await f.exchange(request);
        return new Response(JSON.stringify(value), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    new AbortController().signal,
  );
  const page = await exchange(request);
  assert.equal(page.catalog.sequence, 0);
  assert.deepEqual(page.sources, []);
  assert.equal(sent, 1);
  await assert.rejects(exchange({ ...request, workspaceId: 'ab'.repeat(16) }));
  assert.equal(sent, 1, 'wrong-scope requests stop before network access');
});
test('history transport cancels oversized, incomplete, and aborted reply streams and rejects forged replies', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await setup(t),
    request = await f.makeRequest('read', 'latest');
  const reply = await f.exchange(request);
  const stop = new AbortController();
  let response;
  const exchange = c.createHistoryTransport(
    f.membership,
    {
      kind: 'scoped-account',
      pin: f.authority.pin,
      fetch: async () => response,
    },
    stop.signal,
  );
  let cancelled = false;
  response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(HISTORY_PAGE_LIMIT + 65),
      },
    },
  );
  await assert.rejects(exchange(request), /unavailable/);
  assert(cancelled);
  response = new Response(JSON.stringify(reply), {
    headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
  });
  await assert.rejects(exchange(request), /incomplete/);
  response = new Response(
    JSON.stringify({ ...reply, page: { ...reply.page, signature: '00'.repeat(64) } }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
  await assert.rejects(exchange(request));
  let reading;
  const started = new Promise((resolve) => {
    reading = resolve;
  });
  cancelled = false;
  response = new Response(
    new ReadableStream(
      {
        pull() {
          reading();
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    ),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
  const pending = exchange(request);
  await started;
  stop.abort();
  await assert.rejects(pending);
  assert(cancelled);
});
