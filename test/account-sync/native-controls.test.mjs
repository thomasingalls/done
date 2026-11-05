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
  args,
  prepare,
  request,
  receive,
  view,
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
      const held = await syncStatus(f.page);
      await close(f.page);
      const closed = await syncStatus(f.page);
      observations.push({ mutant, calls, held, closed });
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
    // Current self readback records the delivery decision without an inbound row.
    // Seed a genuine legacy self receipt through the existing native receive API.
    await f.page.evaluate(async (item) => {
      window.opened = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
    }, args(item));
    const wire = await prepare(f.page);
    await close(f.page);
    await open(f.page, item);
    const query = await request(f.page, 0);
    await receive(f.page, answer(f, item, query, wire.bytes).bytes);
    await close(f.page);
    await syncing(f.page, item);
    await settled(f.page);
    await close(f.page);
    await census(f.page, item, 'last-event');
    await cold(f);
    let refused = false,
      normalError;
    try {
      await syncing(f.page, item);
    } catch (cause) {
      refused = true;
      normalError = String(cause);
    }
    assert.equal(refused, true);
    await f.page.evaluate(await syncBundle('witness'));
    await configure(f.page, f.testOperatorToken);
    // Pause network; the prohibited observation is successful cold admission with a missing ledger entry.
    await f.page.evaluate(() =>
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }),
    );
    const recovered = await syncing(f.page, item);
    const status = await syncStatus(f.page);
    await close(f.page);
    save('witness', [
      { mutant: false, opened: !refused, error: normalError },
      { mutant: true, opened: recovered !== undefined, master: recovered.master, status },
    ]);
  },
);

test(
  'self-stream byte binding refuses a different valid envelope from the same synthetic credential',
  { timeout: 60000 },
  async (t) => {
    const observations = [];
    for (const mode of ['baseline', 'self', 'self-and-decision', 'classification']) {
      const mutant = mode === 'self-and-decision';
      const f = await native(t),
        item = await selected(f, 'sync-self-' + mode);
      await open(f.page, item);
      const initial = await view(f.page);
      const snapshot = await f.page.evaluate(() => [...editor.snapshot()]);
      await close(f.page);
      const doc = new Y.Doc({ gc: false });
      Y.applyUpdate(doc, new Uint8Array(snapshot));
      let original;
      doc.on('update', (b) => (original = [...b]));
      doc.getText('master').insert(0, 'REMOTE ');
      doc.destroy();
      const wire = await envelope(f.page, item, 1, [original]);
      const before = await census(f.page, item);
      let reads = 0;
      await f.context.route(f.server.origin + '/account/delivery/submit', (r) => r.abort());
      await f.context.route(path(f), (r) => {
        reads++;
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
      if (mode === 'self') {
        await waitPredicate(
          f.page,
          () =>
            opened.sync.status.receive.receivedThrough === 1 ||
            (opened.sync.status.receive.phase === 'blocked' &&
              opened.sync.status.send.phase === 'blocked') ||
            editor.status.state === 'blocked' ||
            editor.status.state === 'closed',
        );
      } else if (mode === 'self-and-decision') {
        await waitPredicate(
          f.page,
          () =>
            opened.sync.status.receive.receivedThrough === 1 ||
            opened.sync.status.receive.phase === 'blocked' ||
            opened.sync.status.receive.phase === 'retrying' ||
            editor.status.state === 'blocked' ||
            editor.status.state === 'closed',
        );
      } else {
        await waitPredicate(
          f.page,
          () =>
            opened.sync.status.receive.receivedThrough === 1 ||
            opened.sync.status.receive.reason === 'integrity' ||
            editor.status.state === 'blocked' ||
            editor.status.state === 'closed',
        );
      }
      const status = await syncStatus(f.page);
      const advanced = status.receive.receivedThrough === 1;
      const editorState = await f.page.evaluate(() => editor.status.state);
      const visible = await view(f.page);
      await close(f.page);
      const after = await census(f.page, item);
      const incoming = (rows) =>
        rows.filter(
          (r) =>
            r.kind === 'update' ||
            (r.kind === 'heads' &&
              Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/')),
        );
      const decisions = after.filter((r) => {
        if (r.kind !== 'heads' || before.some((b) => b.seq === r.seq)) return false;
        const text = Buffer.from(r.bytes).toString();
        return text.startsWith('["done/account-delivery/v1"') && JSON.parse(text)[9] === 'response';
      });
      observations.push({
        mode,
        advanced,
        editorState,
        status,
        reads,
        initial,
        visible,
        storage: { before, after, newDeliveryDecisions: decisions.length },
      });
      // Preserve every completed arm, including a failed double omission.
      save('self-layered', observations);
      assert(reads > 0, 'The alternate self page must actually be offered');
      if (mode === 'baseline') {
        assert.equal(status.receive.phase, 'blocked');
        assert.equal(status.receive.reason, 'integrity');
      }
      if (mode === 'self') {
        for (const lane of ['send', 'receive']) {
          assert.equal(status[lane].phase, 'blocked');
          assert.equal(status[lane].reason, 'conflict');
        }
      }
      if (mode === 'baseline' || mode === 'self') {
        assert.equal(status.send.acceptedThrough, 0);
        assert.equal(status.receive.receivedThrough, 0);
        assert.equal(visible, initial, 'Refused self writing must not enter the editor');
        assert.deepEqual(
          incoming(after),
          incoming(before),
          'Refused self writing must not enter stored content or inbound receipts',
        );
      }
      assert.equal(advanced, mutant);
      assert.equal(editorState, mode === 'classification' ? 'closed' : 'active');
      await f.context.close();
    }
    save('self', observations.slice(0, 3));
    save('classification', [observations[0], observations[3]]);
  },
);
