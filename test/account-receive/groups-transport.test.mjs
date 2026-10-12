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
  const links = ['00'.repeat(32)];
  let hold, entered;
  const hit = new Promise((r) => (entered = r));
  let mode = 'normal';
  await f.context.route(path(f), async (route) => {
    const q = Buffer.from(route.request().postData()),
      cursor = JSON.parse(q)[10];
    if (cursor === 2 && mode !== 'normal') {
      entered();
      await new Promise((r) => (hold = r));
      if (mode === 'lost') {
        mode = 'normal';
        await route.abort();
        return;
      }
    }
    const response = answer(f, item, q, wires[cursor] ?? null, links[cursor], 5);
    if (wires[cursor]) links[cursor + 1] = response.link;
    await route
      .fulfill({ status: 200, contentType: 'application/octet-stream', body: response.bytes })
      .catch(() => {});
  });
  assert.equal((await next(f)).status.receivedThrough, 1);
  return {
    ...fxt,
    hit,
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
