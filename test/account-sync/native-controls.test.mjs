import * as Y from 'yjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workerReceiveBundle, installWorkerReceiveFixture } from './worker-receive-fixture.mjs';
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
  'Worker receive self-envelope omission exposes the original advance-to-one boundary',
  { timeout: 60000 },
  async (t) => {
    const observations = [];
    for (const mutant of [false, true]) {
      const bundle = await workerReceiveBundle(mutant);
      const f = await native(t);
      await installWorkerReceiveFixture(f, bundle);
      const item = await selected(f, 'worker-self-' + mutant);
      await f.page.evaluate(async (item) => {
        window.opened = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
        window.editor = opened.workspace;
        window.surface = editor.text({ kind: 'master' });
      }, args(item));
      const retained = await prepare(f.page);
      assert.equal(retained.position, 1);
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
      assert.notDeepEqual(
        [...wire],
        retained.bytes,
        'The fork differs from the retained self envelope',
      );
      const before = await census(f.page, item);
      const workerCreated = f.page.waitForEvent('worker');
      void workerCreated.catch(() => {});
      await f.page.evaluate(async (item) => {
        const options = optionsFor(item);
        window.workerSelfSession = await WorkerReceiveHarness.openAccountWorkerSession(options);
        window.workerSelfMirror = await WorkerReceiveHarness.createWindowAccountMirrorController(
          workerSelfSession.cohort,
          workerSelfSession.opening,
          workerSelfSession.worker,
          {
            identity: options.identity,
            deviceLabelId: workerSelfSession.deviceId,
            today: options.today,
          },
        );
        await workerSelfSession.ready();
      }, args(item));
      const worker = await workerCreated;
      assert.match(worker.url(), /accountOwner\.worker-/);
      const nativeBefore = await f.page.evaluate(
        ({ principalId, workspaceId }) =>
          WorkerReceiveHarness.nativeRecords(principalId, workspaceId),
        item.scope,
      );
      const query = await f.page.evaluate(async () => [...(await workerSelfSession.prepareRead())]);
      const page = answer(f, item, Buffer.from(query), wire).bytes;
      const outcome = await f.page.evaluate(
        async ({ page, query }) => {
          let result = null,
            error = null,
            errorCode = null;
          try {
            result = await workerSelfSession.receivePage(
              workerSelfMirror,
              new Uint8Array(page),
              new Uint8Array(query),
            );
          } catch (cause) {
            error = String(cause);
            errorCode = cause.code ?? null;
          }
          const mirrorState = workerSelfMirror.workspace.status.state;
          const visible = result ? workerSelfMirror.workspace.read().master : null;
          const status = result ? await workerSelfSession.status() : null;
          await workerSelfSession.cohort.close();
          const closedState = workerSelfSession.cohort.state;
          return { result, error, errorCode, visible, status, mirrorState, closedState };
        },
        { page: [...page], query },
      );
      const after = await census(f.page, item);
      const nativeAfter = await f.page.evaluate(
        ({ principalId, workspaceId }) =>
          WorkerReceiveHarness.nativeRecords(principalId, workspaceId),
        item.scope,
      );
      observations.push({
        mutant,
        initial,
        ...outcome,
        workerUrl: worker.url(),
        before,
        after,
        nativeBefore,
        nativeAfter,
        bundle: bundle.evidence,
      });
      save('worker-self', observations);
      assert.equal(outcome.result?.status?.receivedThrough ?? 0, mutant ? 1 : 0);
      assert.equal(outcome.status?.receivedThrough ?? 0, mutant ? 1 : 0);
      if (mutant) {
        assert.equal(outcome.error, null);
        assert.equal(outcome.result.recorded, true);
        assert.equal(outcome.visible, 'REMOTE ' + initial);
        assert.equal(outcome.mirrorState, 'active');
        assert.notDeepEqual(nativeAfter, nativeBefore);
        assert(
          after.some(
            (r) =>
              r.kind === 'heads' &&
              Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/v1"'),
          ),
          'The omitted Worker guard persists the original receive receipt',
        );
      } else {
        assert.equal(outcome.result, null);
        assert.equal(outcome.error, 'WorkerChannelError: Worker operation could not finish.');
        assert.equal(outcome.errorCode, 'closed');
        assert.equal(outcome.closedState, 'closed');
        assert.deepEqual(
          nativeAfter,
          nativeBefore,
          'Refused Worker page changes no native records',
        );
      }
      await f.context.close();
    }
  },
);

test(
  'self-stream byte binding refuses a different valid envelope from the same synthetic credential',
  { timeout: 60000 },
  async (t) => {
    const observations = [];
    for (const mode of ['baseline', 'self', 'classification']) {
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
      const visible = mode === 'classification' ? null : await view(f.page);
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
      // Preserve each completed layer and classification observation.
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
      assert.equal(advanced, false);
      assert.equal(editorState, mode === 'classification' ? 'closed' : 'active');
      await f.context.close();
    }
    save('self', observations.slice(0, 2));
    save('classification', [observations[0], observations[2]]);
  },
);
