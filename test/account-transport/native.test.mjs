import test from 'node:test';
import assert from 'node:assert/strict';
import { sign } from 'node:crypto';
import {
  native,
  selected,
  open,
  close,
  cold,
  prepare,
  submission,
  pending,
  deliveryStatus,
  edit,
  subjects,
  envelopes,
} from '../account-delivery/fixtures.mjs';
import { fixtureAcceptance, head, response } from '../account-decisions/oracle.mjs';
import { inventory } from '../account-capture/fixtures.mjs';
const submit = (f, token = f.testOperatorToken) =>
  f.page.evaluate((token) => opened.submitPending(token), token);
const read = (f, after = 0, limit = 8) =>
  f.page.evaluate(
    async ({ token, after, limit }) => {
      const r = await opened.readAcceptedPage(token, after, limit);
      return r.kind === 'page'
        ? {
            ...r,
            entries: r.entries.map((e) => ({ envelope: [...e.envelope], proof: [...e.proof] })),
          }
        : r;
    },
    { token: f.testOperatorToken, after, limit },
  );
async function ready(t, id) {
  const f = await native(t),
    item = await selected(f, id);
  await open(f.page, item);
  await prepare(f.page);
  return { f, item };
}
const routePath = (f) => f.server.origin + '/account/delivery/submit';
const pagePath = (f) => f.server.origin + '/account/delivery/read';
const signedPage = (v, key) =>
  Buffer.from(
    JSON.stringify([
      ...v.slice(0, 6),
      sign(null, Buffer.from(JSON.stringify(v.slice(0, 6))), key).toString('hex'),
    ]),
  );
test(
  'actual HTTP send uses exact persisted bytes, readback is bounded and detached, and cold restart retains acceptance',
  { timeout: 45000 },
  async (t) => {
    const { f, item } = await ready(t, 'http-round-trip'),
      sent = [];
    await f.context.route(routePath(f), async (route) => {
      sent.push(route.request().postData());
      await route.continue();
    });
    assert.equal((await submit(f)).kind, 'idle');
    assert.equal(sent.length, 0);
    const wires = [];
    for (let position = 1; position <= 3; position++) {
      if (position > 1) {
        await edit(f.page, 0, 0, 'http edit ' + position + ' ');
        await prepare(f.page);
      }
      const w = await submission(f.page, position);
      wires.push(w);
      assert.equal((await submit(f)).status.acceptedThrough, position);
      assert.equal(JSON.parse(sent.at(-1))[3], Buffer.from(w.bytes).toString('hex'));
    }
    const before = await inventory(f.page),
      calls = f.invocations.length,
      own = await envelopes(f.page);
    for (const [after, count] of [
      [0, 2],
      [2, 1],
      [3, 0],
    ]) {
      const p = await read(f, after, 2);
      assert.equal(p.kind, 'page');
      assert.equal(p.entries.length, count);
      assert.equal(p.next, after + count);
      assert.equal(p.through, 3);
      for (let i = 0; i < count; i++) assert.deepEqual(p.entries[i].envelope, own[after + i].bytes);
    }
    assert.equal(await inventory(f.page), before);
    assert.equal(f.invocations.length, calls);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal((await deliveryStatus(f.page)).acceptedThrough, 3);
    assert.equal((await submit(f)).kind, 'idle');
    assert.equal((await read(f, 3)).entries.length, 0);
    await close(f.page);
  },
);
test(
  'lost HTTP acceptance reply survives browser death and retries the same wrapper',
  { timeout: 35000 },
  async (t) => {
    const { f, item } = await ready(t, 'http-lost'),
      w = await submission(f.page);
    await f.context.route(routePath(f), async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    assert.equal((await submit(f)).kind, 'unknown');
    assert.equal((await pending(f.page)).length, 1);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.deepEqual(await submission(f.page), w);
    await f.context.unroute(routePath(f));
    assert.equal((await submit(f)).status.acceptedThrough, 1);
    assert.equal((await read(f)).kind, 'page');
    await close(f.page);
  },
);
test(
  'operator-only or malformed read requests and HTTP gate failures cannot disclose pages',
  { timeout: 35000 },
  async (t) => {
    const { f } = await ready(t, 'http-gates');
    await submission(f.page);
    assert.equal((await submit(f, 'A'.repeat(43))).kind, 'unknown');
    assert.equal((await pending(f.page)).length, 1);
    assert.equal((await submit(f)).kind, 'accepted');
    let saved;
    await f.context.route(pagePath(f), async (route) => {
      saved = route.request().postData();
      await route.continue();
    });
    assert.equal((await read(f)).kind, 'page');
    await f.context.unroute(pagePath(f));
    const send = async (body, headers = {}) => {
      const r = await fetch(pagePath(f), {
        method: 'POST',
        headers: {
          Origin: f.server.origin,
          'Content-Type': 'application/octet-stream',
          Authorization: 'Bearer ' + f.testOperatorToken,
          ...headers,
        },
        body,
      });
      return { status: r.status, type: r.headers.get('content-type') };
    };
    for (const body of [
      JSON.stringify({ workspaceId: '00'.repeat(16) }),
      saved.replace(/.$/, '0]'),
      'x'.repeat(4097),
    ])
      assert.notEqual((await send(body)).status, 200);
    const forged = JSON.parse(saved);
    forged[13] = '00'.repeat(64);
    assert.notEqual((await send(JSON.stringify(forged))).status, 200);
    for (const headers of [
      { Origin: 'https://foreign.test' },
      { 'Content-Type': 'application/json' },
      { Authorization: 'Bearer ' + 'B'.repeat(43) },
    ])
      assert.equal((await send(saved, headers)).status, 403);
    assert.equal((await send(saved)).status, 200);
    await close(f.page);
  },
);
test(
  'stale nonce, reordered entries, false end, and validly signed wrong-predecessor heads are refused without storage effects',
  { timeout: 45000 },
  async (t) => {
    const { f, item } = await ready(t, 'http-proofs');
    for (let n = 1; n <= 2; n++) {
      if (n === 2) {
        await edit(f.page, 0, 0, 'second ');
        await prepare(f.page);
      }
      await submission(f.page, n);
      await submit(f);
    }
    const key = fixtureAcceptance(f, item.scope.workspaceId),
      ss = await subjects(f.page),
      before = await inventory(f.page);
    let prior;
    await f.context.route(pagePath(f), async (route) => {
      const r = await route.fetch();
      prior = await r.body();
      await route.fulfill({ response: r });
    });
    assert.equal((await read(f)).kind, 'page');
    await f.context.unroute(pagePath(f));
    for (const mode of ['nonce', 'order', 'extent', 'predecessor', 'unsigned']) {
      await f.context.route(pagePath(f), async (route) => {
        const r = await route.fetch(),
          v = JSON.parse((await r.body()).toString());
        if (mode === 'nonce') {
          await route.fulfill({ response: r, body: prior });
          return;
        }
        if (mode === 'order') v[5].reverse();
        if (mode === 'extent') v[4] = 0;
        if (mode === 'predecessor')
          v[5][1][1] = Buffer.from(
            response({ kind: 'accepted', head: head(ss[1], '00'.repeat(32), 1, key), leaf: ss[1] }),
          ).toString('hex');
        if (mode === 'unsigned') v[6] = '00'.repeat(64);
        await route.fulfill({
          response: r,
          body: mode === 'unsigned' ? Buffer.from(JSON.stringify(v)) : signedPage(v, key),
        });
      });
      assert.equal((await read(f)).kind, 'unknown', mode);
      assert.equal(await inventory(f.page), before);
      await f.context.unroute(pagePath(f));
    }
    await close(f.page);
  },
);
for (const mode of ['submit', 'read'])
  test(
    `close aborts ${mode} and drains a late fetch before releasing the slot permit`,
    { timeout: 35000 },
    async (t) => {
      const { f, item } = await ready(t, 'http-cancel-' + mode),
        w = await submission(f.page);
      await f.page.evaluate(
        ({ token, mode }) => {
          const original = fetch;
          window.hit = false;
          window.fetch = async (...args) => {
            if (String(args[0]).endsWith('/account/delivery/' + mode)) {
              window.hit = true;
              window.fetchSignal = args[1].signal;
              await new Promise((resolve) => (window.release = resolve));
              return new Response(new Uint8Array([0]), {
                headers: { 'Content-Type': 'application/octet-stream' },
              });
            }
            return original(...args);
          };
          window.work = (
            mode === 'submit' ? opened.submitPending(token) : opened.readAcceptedPage(token)
          ).then(
            (r) => r.kind,
            (e) => String(e),
          );
        },
        { token: f.testOperatorToken, mode },
      );
      await f.page.waitForFunction(() => hit);
      await f.page.evaluate((slot) => {
        window.closing = editor.close();
        window.competed = false;
        window.competitor = navigator.locks.request(
          Harness.slotPermitName(slot),
          () => (window.competed = true),
        );
      }, item.slotId);
      await f.page.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
      assert.equal(await f.page.evaluate(() => fetchSignal.aborted), true);
      assert.equal(await f.page.evaluate(() => competed), false);
      await f.page.evaluate(() => release());
      assert.notEqual(await f.page.evaluate(() => work), 'page');
      await f.page.evaluate(() => closing);
      await f.page.evaluate(() => competitor);
      await cold(f);
      await open(f.page, item);
      assert.deepEqual(await submission(f.page), w);
      assert.equal((await pending(f.page)).length, 1);
      await close(f.page);
    },
  );
test(
  'malformed, oversized streaming, redirect and reordered submission replies preserve the next wrapper',
  { timeout: 45000 },
  async (t) => {
    const { f } = await ready(t, 'http-replies');
    await submission(f.page);
    let first;
    await f.context.route(routePath(f), async (route) => {
      const r = await route.fetch();
      first = await r.body();
      await route.fulfill({ response: r });
    });
    await submit(f);
    await f.context.unroute(routePath(f));
    await edit(f.page, 0, 0, 'pending ');
    await prepare(f.page);
    const w = await submission(f.page, 2);
    for (const mode of ['old', 'malformed', 'oversized', 'redirect']) {
      await f.context.route(routePath(f), (route) =>
        route.fulfill(
          mode === 'redirect'
            ? { status: 307, headers: { Location: routePath(f) } }
            : {
                status: 200,
                contentType: 'application/octet-stream',
                body:
                  mode === 'old'
                    ? first
                    : mode === 'malformed'
                      ? Buffer.from('{}')
                      : Buffer.alloc(4097),
              },
        ),
      );
      assert.equal((await submit(f)).kind, 'unknown', mode);
      assert.deepEqual(await submission(f.page, 2), w);
      await f.context.unroute(routePath(f));
    }
    await f.page.evaluate((token) => {
      window.callsBefore = 0;
      window.oldFetch = fetch;
      window.cancelled = false;
      window.fetch = async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(4097));
            },
            cancel() {
              window.cancelled = true;
            },
          }),
          { headers: { 'Content-Type': 'application/octet-stream' } },
        );
      window.work = opened.submitPending(token);
    }, f.testOperatorToken);
    assert.equal((await f.page.evaluate(() => work)).kind, 'unknown');
    assert.equal(await f.page.evaluate(() => cancelled), true);
    await f.page.evaluate(() => (window.fetch = oldFetch));
    assert.equal((await submit(f)).status.acceptedThrough, 2);
    await close(f.page);
  },
);
