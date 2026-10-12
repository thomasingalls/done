import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  ready,
  envelope,
  open,
  close,
  cold,
  view,
  status,
  answer,
  path,
  next,
  start,
  local,
} from '../account-receive-transport/fixtures.mjs';

async function grouped(t, id) {
  const fxt = await ready(t, id),
    { f, item, snapshot } = fxt;
  const doc = new Y.Doc({ gc: false }),
    updates = [];
  Y.applyUpdate(doc, new Uint8Array(snapshot));
  doc.clientID = 48137;
  doc.on('update', (b) => updates.push([...b]));
  for (let i = 0; i < 5; i++)
    doc.getText('master').insert(doc.getText('master').length, 'GROUP' + i + ' ');
  doc.destroy();
  const wires = [];
  for (let i = 0; i < 5; i++) wires.push(await envelope(f.page, item, i + 1, [updates[i]]));
  await open(f.page, item);
  const links = ['00'.repeat(32)],
    requested = [];
  let hold,
    entered,
    laterEntered,
    active = 0,
    maximum = 0;
  const hit = new Promise((r) => (entered = r));
  const laterHit = new Promise((r) => (laterEntered = r));
  let mode = 'normal';
  await f.context.route(path(f), async (route) => {
    const q = Buffer.from(route.request().postData()),
      template = JSON.parse(q),
      cursor = template[10];
    // Derive the complete chain independently of HTTP arrival/fulfilment order.
    if (links.length === 1)
      for (let i = 0; i < wires.length; i++) {
        template[10] = i;
        links.push(
          answer(f, item, Buffer.from(JSON.stringify(template)), wires[i], links[i], 5).link,
        );
      }
    requested.push(cursor);
    maximum = Math.max(maximum, ++active);
    try {
      const response = answer(f, item, q, wires[cursor] ?? null, links[cursor], 5);
      if (cursor === 2) laterEntered();
      const first = ['reversed', 'missing-first'].includes(mode);
      if (
        cursor === (first ? 1 : 2) &&
        ['reversed', 'missing-first', 'lost', 'closing'].includes(mode)
      ) {
        entered();
        await new Promise((r) => (hold = r));
        if (mode === 'lost' || mode === 'missing-first') {
          mode = 'normal';
          await route.abort().catch(() => {});
          return;
        }
      }
      let body = response.bytes;
      if (mode === 'wrong-binding' && cursor === 2) {
        template[10] = 1;
        body = answer(f, item, Buffer.from(JSON.stringify(template)), wires[1], links[1], 5).bytes;
      }
      if (mode === 'oversized' && cursor === 1) body = Buffer.alloc(2 * (512 * 1024 + 4096) + 513);
      await route
        .fulfill({ status: 200, contentType: 'application/octet-stream', body })
        .catch(() => {});
    } finally {
      active--;
    }
  });
  assert.equal((await next(f)).status.receivedThrough, 1);
  return {
    ...fxt,
    hit,
    laterHit,
    requested,
    maximum: () => maximum,
    release: () => hold(),
    mode: (value) => {
      mode = value;
    },
  };
}
test(
  'lost later group reply commits only the fitting prefix; local input stays available during fetch',
  { timeout: 60000 },
  async (t) => {
    const x = await grouped(t, 'group-http-lost'),
      { f } = x;
    x.mode('lost');
    await start(f);
    await x.hit;
    await local(f.page, ' LOCAL-DURING-GROUP ');
    assert.equal(await f.page.evaluate(() => local), true);
    assert.equal((await status(f.page)).receivedThrough, 1);
    x.release();
    assert.equal((await f.page.evaluate(() => work)).status.receivedThrough, 2);
    while ((await status(f.page)).receivedThrough < 5)
      assert.equal((await next(f)).kind, 'received');
    const writing = await view(f.page);
    assert.match(writing, /LOCAL-DURING-GROUP/);
    assert.match(writing, /GROUP4/);
    await close(f.page);
    await cold(f);
    await open(f.page, x.item);
    assert.equal((await status(f.page)).receivedThrough, 5);
    assert.equal(await view(f.page), writing);
    await close(f.page);
  },
);
test(
  'locking during grouped HTTP discards fetched but uncommitted receipts',
  { timeout: 60000 },
  async (t) => {
    const x = await grouped(t, 'group-http-lock'),
      { f } = x;
    x.mode('closing');
    await start(f);
    await x.hit;
    await f.page.evaluate(() => {
      window.closing = editor.close();
    });
    x.release();
    await f.page.evaluate(() => closing);
    const outcome = await f.page.evaluate(() => work);
    assert.ok(outcome.error || outcome.kind === 'unknown');
    await cold(f);
    await open(f.page, x.item);
    assert.equal((await status(f.page)).receivedThrough, 1);
    assert.doesNotMatch(await view(f.page), /GROUP1/);
    await close(f.page);
  },
);

test(
  'prefetch completes out of order while local input and single-flight exclusion remain available',
  { timeout: 60000 },
  async (t) => {
    const x = await grouped(t, 'group-http-prefetch'),
      { f } = x;
    x.mode('reversed');
    await start(f);
    await x.hit;
    await x.laterHit;
    assert.equal(x.maximum(), 2);
    assert.equal((await next(f)).kind, 'busy');
    assert.equal((await status(f.page)).receivedThrough, 1);
    await local(f.page, ' LOCAL-WITH-PREFETCH ');
    assert.equal(await f.page.evaluate(() => local), true);
    x.release();
    assert.equal((await f.page.evaluate(() => work)).kind, 'received');
    while ((await status(f.page)).receivedThrough < 5)
      assert.equal((await next(f)).kind, 'received');
    assert.equal(x.maximum(), 2);
    const writing = await view(f.page);
    assert.match(writing, /GROUP0 GROUP1 GROUP2 GROUP3 GROUP4/);
    assert.match(writing, /LOCAL-WITH-PREFETCH/);
    await close(f.page);
    await cold(f);
    await open(f.page, x.item);
    assert.equal((await status(f.page)).receivedThrough, 5);
    assert.equal(await view(f.page), writing);
    await close(f.page);
  },
);

test(
  'an unavailable first reply discards a successful speculative second reply without advancing',
  { timeout: 60000 },
  async (t) => {
    const x = await grouped(t, 'group-http-missing-first'),
      { f } = x;
    const before = await view(f.page);
    x.mode('missing-first');
    await start(f);
    await x.hit;
    await x.laterHit;
    x.release();
    assert.equal((await f.page.evaluate(() => work)).kind, 'unknown');
    assert.equal((await status(f.page)).receivedThrough, 1);
    assert.equal(await view(f.page), before);
    await close(f.page);
    await cold(f);
    await open(f.page, x.item);
    assert.equal((await status(f.page)).receivedThrough, 1);
    while ((await status(f.page)).receivedThrough < 5)
      assert.equal((await next(f)).kind, 'received');
    assert.match(await view(f.page), /GROUP4/);
    await close(f.page);
  },
);

test(
  'a prefetched page bound to another cursor refuses the whole collected group',
  { timeout: 60000 },
  async (t) => {
    const x = await grouped(t, 'group-http-binding'),
      { f } = x;
    const before = await view(f.page);
    x.mode('wrong-binding');
    await start(f);
    const result = await f.page.evaluate(() => work);
    assert.ok(result.error || result.kind === 'rejected');
    assert.equal((await status(f.page)).receivedThrough, 1);
    assert.equal(await view(f.page), before);
    await close(f.page);
    await cold(f);
    await open(f.page, x.item);
    assert.equal((await status(f.page)).receivedThrough, 1);
    await close(f.page);
  },
);

test(
  'a response over the supported single-page reservation is rejected without progress',
  { timeout: 60000 },
  async (t) => {
    const x = await grouped(t, 'group-http-reservation'),
      { f } = x;
    x.mode('oversized');
    const result = await next(f);
    assert.equal(result.kind, 'rejected');
    assert.equal(result.reason, 'response-too-large');
    assert.equal((await status(f.page)).receivedThrough, 1);
    x.mode('normal');
    while ((await status(f.page)).receivedThrough < 5) await next(f);
    await close(f.page);
    await cold(f);
    await open(f.page, x.item);
    assert.equal((await status(f.page)).receivedThrough, 5);
    await close(f.page);
  },
);
