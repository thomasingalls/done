import * as Y from 'yjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  syncing,
  close,
  waitPredicate,
  syncStatus,
  path,
  answer,
  envelope,
  open,
} from './fixtures.mjs';

test(
  'own-stream reconciliation refuses a valid but different local envelope without closing editing',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'own-poll-binding');
    await open(f.page, item);
    const snapshot = await f.page.evaluate(() => [...editor.snapshot()]);
    await close(f.page);
    const doc = new Y.Doc({ gc: false });
    let original;
    try {
      Y.applyUpdate(doc, new Uint8Array(snapshot));
      doc.on('update', (b) => {
        original = [...b];
      });
      doc.getText('master').insert(0, 'DIFFERENT ');
    } finally {
      doc.destroy();
    }
    const wire = await envelope(f.page, item, 1, [original]);
    await f.context.route(f.server.origin + '/account/delivery/submit', (r) => r.abort());
    await f.context.route(path(f), (r) => {
      const q = Buffer.from(r.request().postData());
      return r.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: answer(f, item, q, JSON.parse(q)[10] === 0 ? wire : null).bytes,
      });
    });
    await syncing(f.page, item);
    await waitPredicate(f.page, () => opened.sync.status.receive.phase === 'blocked');
    const status = await syncStatus(f.page);
    assert.equal(status.receive.reason, 'integrity');
    assert.equal(status.receive.receivedThrough, 0);
    assert.equal(await f.page.evaluate(() => editor.status.state), 'active');
    await close(f.page);
  },
);
