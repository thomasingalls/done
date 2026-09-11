import * as Y from 'yjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  syncBundle,
  configure,
  syncing,
  settled,
  close,
  cold,
  census,
  waitPredicate,
  syncStatus,
  path,
  answer,
  envelope,
  open,
} from './fixtures.mjs';
const save = (mode, observations) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'control-' + mode + '.json'),
      JSON.stringify({ effective: true, observations }, null, 2) + '\n',
    );
};
for (const gate of ['offline', 'pressure'])
  test('actual final ' + gate + ' submit dispatch control', { timeout: 60000 }, async (t) => {
    const observations = [];
    for (const mutant of [false, true]) {
      const f = await native(t),
        item = await selected(f, 'sync-' + gate + '-' + mutant);
      let calls = 0;
      await f.context.route(f.server.origin + '/account/delivery/submit', (route) => {
        calls++;
        return route.continue();
      });
      await f.page.evaluate(await syncBundle(mutant ? 'dispatch' : 'dispatch-baseline'));
      await configure(f.page, f.testOperatorToken);
      await f.page.evaluate((gate) => {
        window.hit = false;
        window.syncDispatchBoundary = () => {
          window.hit = true;
          if (gate === 'offline') {
            Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
            dispatchEvent(new Event('offline'));
          } else {
            Storage.prototype.setItem = function () {
              throw new DOMException('fixture quota', 'QuotaExceededError');
            };
            IDBDatabase.prototype.transaction = function () {
              throw new DOMException('fixture unavailable', 'InvalidStateError');
            };
            const n = editor.read().master.length;
            window.localJob = surface
              .input(
                { name: 'insert', text: 'PRESSURE' },
                { ranges: [{ anchor: n, head: n }], main: 0 },
              )
              .accepted.catch(() => {});
          }
        };
      }, gate);
      await syncing(f.page, item);
      await waitPredicate(f.page, () => hit);
      // Drain the operation, not just its runtime gate publication, before counting actual requests.
      await f.page.evaluate(() => opened.deliveryStatus().catch(() => {}));
      assert.equal(calls, mutant ? 1 : 0);
      await close(f.page);
      observations.push({ mutant, calls });
      await f.context.close();
    }
    save('dispatch-' + gate, observations);
  });

test(
  'omitting the union witness admits missing retained receive evidence on cold open',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-witness');
    await syncing(f.page, item);
    await settled(f.page);
    await close(f.page);
    await census(f.page, item, 'last-event');
    await cold(f);
    let refused = false;
    try {
      await syncing(f.page, item);
    } catch {
      refused = true;
    }
    assert.equal(refused, true);
    await f.page.evaluate(await syncBundle('witness'));
    await configure(f.page, f.testOperatorToken);
    // Pause network; the prohibited observation is successful cold admission with a missing ledger entry.
    await f.page.evaluate(() =>
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }),
    );
    await syncing(f.page, item);
    await close(f.page);
    save('witness', [
      { mutant: false, opened: false },
      { mutant: true, opened: true },
    ]);
  },
);

test(
  'self-stream byte binding refuses a different valid envelope from the same synthetic credential',
  { timeout: 60000 },
  async (t) => {
    const observations = [];
    for (const mode of ['baseline', 'self', 'classification']) {
      const mutant = mode === 'self';
      const f = await native(t),
        item = await selected(f, 'sync-self-' + mode);
      await open(f.page, item);
      const snapshot = await f.page.evaluate(() => [...editor.snapshot()]);
      await close(f.page);
      const doc = new Y.Doc({ gc: false });
      Y.applyUpdate(doc, new Uint8Array(snapshot));
      let original;
      doc.on('update', (b) => (original = [...b]));
      doc.getText('master').insert(0, 'REMOTE ');
      doc.destroy();
      const wire = await envelope(f.page, item, 1, [original]);
      await f.context.route(f.server.origin + '/account/delivery/submit', (r) => r.abort());
      await f.context.route(path(f), (r) => {
        const q = Buffer.from(r.request().postData()),
          after = JSON.parse(q)[10];
        return r.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          body: answer(f, item, q, after === 0 ? wire : null).bytes,
        });
      });
      if (mode !== 'baseline') {
        await f.page.evaluate(await syncBundle(mode));
        await configure(f.page, f.testOperatorToken);
      }
      await syncing(f.page, item);
      await waitPredicate(
        f.page,
        () =>
          opened.sync.status.receive.receivedThrough === 1 ||
          opened.sync.status.receive.reason === 'operation-failed' ||
          editor.status.state === 'blocked' ||
          editor.status.state === 'closed',
      ).catch(async (cause) => {
        console.log(
          JSON.stringify({
            mutant,
            sync: await syncStatus(f.page),
            editor: await f.page.evaluate(() => editor.status),
          }),
        );
        throw cause;
      });
      const advanced = (await syncStatus(f.page)).receive.receivedThrough === 1;
      assert.equal(advanced, mutant);
      const editorState = await f.page.evaluate(() => editor.status.state);
      assert.equal(editorState, mode === 'classification' ? 'closed' : 'active');
      await close(f.page);
      observations.push({ mode, advanced, editorState });
      await f.context.close();
    }
    save('self', observations.slice(0, 2));
    save('classification', [observations[0], observations[2]]);
  },
);
