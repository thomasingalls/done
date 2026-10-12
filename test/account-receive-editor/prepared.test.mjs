import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  ready,
  editorBundle,
  configure,
  open,
  request,
  envelope,
  answer,
  view,
  edit,
  close,
  cold,
  crash,
  status,
  receiveBoundary,
  waitPredicate,
} from './fixtures.mjs';
assert.equal(
  process.env.ACCOUNT_PREPARED_RECEIVE,
  '1',
  'Select the prepared product path explicitly',
);
function remote(snapshot) {
  const d = new Y.Doc({ gc: false });
  Y.applyUpdate(d, new Uint8Array(snapshot));
  let frame;
  d.on('update', (b) => {
    frame = [...b];
  });
  d.getText('master').insert(0, 'REMOTE ');
  d.destroy();
  return frame;
}
async function held(t, name) {
  const { f, item, initial, snapshot } = await ready(t, name);
  const wire = await envelope(f.page, item, 1, [remote(snapshot)]);
  await open(f.page, item);
  const response = answer(f, item, await request(f.page), wire);
  await receiveBoundary(f.page, 'after');
  await f.page.evaluate(
    (bytes) => {
      window.receiveResult = undefined;
      window.pendingReceive = opened.receivePage(new Uint8Array(bytes)).then(
        (value) => {
          window.receiveResult = value;
          return value;
        },
        (error) => {
          window.receiveResult = String(error);
          return String(error);
        },
      );
    },
    [...response.bytes],
  );
  await waitPredicate(f.page, () => !!window.hit);
  assert.equal(await view(f.page), initial);
  return { f, item, initial };
}
test(
  'prepared native commit lets journalled text and undo proceed, then promotes without undoing remote writing',
  { timeout: 60000 },
  async (t) => {
    const { f, item, initial } = await held(t, 'prepared-live');
    await edit(f.page, initial.length, 0, 'LOCAL');
    assert.equal(await view(f.page), initial + 'LOCAL');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await view(f.page), initial);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    assert.equal(await view(f.page), initial + 'LOCAL');
    assert.equal(await f.page.evaluate(() => receiveResult), undefined);
    await f.page.evaluate(() => release());
    const received = await f.page.evaluate(() => pendingReceive);
    assert.equal(received.status.receivedThrough, 1);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LOCAL');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    await f.page.evaluate(() => editor.whenDurable());
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LOCAL');
    assert.equal((await status(f.page)).receivedThrough, 1);
    await close(f.page);
  },
);
test(
  'renderer death replays the durable undisplayed receipt together with later journalled local edits',
  { timeout: 60000 },
  async (t) => {
    const { f, item, initial } = await held(t, 'prepared-crash');
    await edit(f.page, initial.length, 0, 'LOCAL');
    assert.equal(await view(f.page), initial + 'LOCAL');
    await crash(f);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LOCAL');
    assert.equal((await status(f.page)).receivedThrough, 1);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LOCAL');
    await close(f.page);
  },
);
test(
  'a changed custody inventory after commit cannot authorize final promotion',
  { timeout: 60000 },
  async (t) => {
    const { f, initial } = await held(t, 'prepared-authority');
    await edit(f.page, initial.length, 0, 'LOCAL');
    await f.page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('done.custody');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite');
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
        const r = tx.objectStore('entries').openCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (!c) return;
          // Existing fixture has one slot. Add the same authenticated-authority interlock
          // that normal startup refuses, without inspecting or emitting its contents.
          if (Array.isArray(c.key)) {
            tx.objectStore('entries').put({}, [c.key[0], 'local-clear-v1']);
            return;
          }
          c.continue();
        };
      });
      db.close();
      release();
    });
    const result = await f.page.evaluate(() => pendingReceive);
    assert.equal(typeof result, 'string');
    await waitPredicate(f.page, () => ['closed', 'failed'].includes(editor.status.state));
  },
);

// Instrument only the test bundle; no runtime global or application API grants this access.
const finalBundle = await editorBundle('final-check');
async function heldFinal(t, name) {
  const { f, item, initial, snapshot } = await ready(t, name);
  const wire = await envelope(f.page, item, 1, [remote(snapshot)]);
  await f.page.evaluate(finalBundle);
  await configure(f.page);
  await open(f.page, item);
  const response = answer(f, item, await request(f.page), wire);
  await f.page.evaluate(
    (bytes) => {
      window.__beforeFinalCheck = () =>
        new Promise((resolve) => {
          window.finalHit = true;
          window.releaseFinal = () => {
            window.__beforeFinalCheck = undefined;
            resolve();
          };
        });
      window.pendingReceive = opened.receivePage(new Uint8Array(bytes)).then(
        (v) => v,
        (e) => String(e),
      );
    },
    [...response.bytes],
  );
  await waitPredicate(f.page, () => !!window.finalHit);
  return { f, item, initial };
}
test(
  'fresh final read outside FIFO preserves journal-before-apply, undo and cold replay',
  { timeout: 60000 },
  async (t) => {
    const { f, item, initial } = await heldFinal(t, 'immediate-read');
    await edit(f.page, initial.length, 0, 'LOCAL');
    assert.equal(await view(f.page), initial + 'LOCAL');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await view(f.page), initial);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    await f.page.evaluate(() => releaseFinal());
    const result = await f.page.evaluate(() => pendingReceive);
    assert.equal(result.status.receivedThrough, 1);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LOCAL');
    const metrics = await f.page.evaluate(() => __doneLedgerMetrics().work);
    assert.equal(metrics.finalApplyImmediate, 1);
    assert.equal(metrics.finalApplyFallbacks, 0);
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    await crash(f);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LOCAL');
    await close(f.page);
  },
);
test(
  'crash during the early final read replays undisplayed receipts and newer local journal',
  { timeout: 60000 },
  async (t) => {
    const { f, item, initial } = await heldFinal(t, 'immediate-read-crash');
    await edit(f.page, initial.length, 0, 'LOCAL');
    await crash(f);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LOCAL');
    await close(f.page);
  },
);
for (const change of ['read', 'clear'])
  test(
    'owned task requested after early verification: ' + change,
    { timeout: 60000 },
    async (t) => {
      const { f, initial } = await heldFinal(t, 'immediate-invalidate-' + change);
      await edit(f.page, initial.length, 0, 'LOCAL');
      await f.page.evaluate((change) => {
        window.__afterFinalCheck = async () => {
          const db = await new Promise((resolve, reject) => {
            const r = indexedDB.open('done.custody');
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          try {
            await new Promise((resolve, reject) => {
              const tx = db.transaction('entries', change === 'clear' ? 'readwrite' : 'readonly');
              tx.oncomplete = resolve;
              tx.onabort = () => reject(tx.error);
              const req = tx.objectStore('entries').openCursor();
              req.onsuccess = () => {
                const c = req.result;
                if (!c) return;
                if (change === 'clear' && Array.isArray(c.key)) {
                  tx.objectStore('entries').put({}, [c.key[0], 'local-clear-v1']);
                  return;
                }
                c.continue();
              };
            });
          } finally {
            db.close();
          }
        };
        releaseFinal();
      }, change);
      const result = await f.page.evaluate(() => pendingReceive);
      const metrics = await f.page.evaluate(() => __doneLedgerMetrics().work);
      assert.equal(metrics.finalApplyImmediate, 0);
      assert.equal(metrics.finalApplyFallbacks, 1);
      if (change === 'read') {
        assert.equal(result.status.receivedThrough, 1);
        assert.equal(await view(f.page), 'REMOTE ' + initial + 'LOCAL');
      } else {
        assert.equal(typeof result, 'string');
        await waitPredicate(f.page, () => ['closed', 'failed'].includes(editor.status.state));
      }
      await close(f.page);
    },
  );
