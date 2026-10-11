import fc from 'fast-check';
import { prepare, open, request, receive, envelope, answer } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  syncing,
  settled,
  syncStatus,
  close,
  cold,
  edit,
  view,
  captures,
  path,
  waitPredicate,
  requestWire,
  args,
  census,
  deliveryBoundary,
} from './fixtures.mjs';
import { decodeSubmission } from '../../account-protocol/submission.ts';
import { decodeEnvelopeBody, decodeNetworkEnvelope } from '../../account-protocol/envelope.ts';
import { crash } from '../account-capture/fixtures.mjs';
const sendPath = (f) => f.server.origin + '/account/delivery/submit';
const parsed = (wire) =>
  decodeNetworkEnvelope(decodeSubmission(new Uint8Array(Buffer.from(wire, 'hex'))).envelope);

test(
  'hidden-page batch close sends promptly; death before the next batch recovers journalled writing',
  {
    timeout: 60000,
    skip: !process.env.ACCOUNT_BATCH_MODE || process.env.ACCOUNT_BATCH_MODE === 'reference',
  },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'batch-lifecycle');
    await syncing(f.page, item);
    await settled(f.page);
    const initial = await view(f.page);
    await f.page.evaluate(() => {
      // Hold ordinary batch deadlines well beyond this test, then exercise the real listener.
      const timeout = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms, ...args) =>
        timeout(fn, ms >= 250 && ms <= 2000 ? 60000 : ms, ...args);
    });
    await edit(f.page, initial.length, 0, ' HIDDEN');
    const before = (await syncStatus(f.page)).send.acceptedThrough;
    await f.page.evaluate((before) => {
      window.expectedThrough = before + 1;
    }, before);
    await f.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitPredicate(
      f.page,
      () =>
        opened.sync.status.send.acceptedThrough >= expectedThrough &&
        opened.sync.status.send.phase === 'idle',
    );
    assert.ok((await syncStatus(f.page)).send.acceptedThrough > before);
    await f.page.evaluate(() => {
      delete document.visibilityState;
    });
    await edit(f.page, initial.length + ' HIDDEN'.length, 0, ' JOURNAL');
    assert.equal(await view(f.page), initial + ' HIDDEN JOURNAL');
    // The delayed flush/send timers have not run. Renderer death must retain the acknowledged edit.
    await crash(f);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), initial + ' HIDDEN JOURNAL');
    assert.ok((await syncStatus(f.page)).send.acceptedThrough > before);
    await close(f.page);
  },
);

test(
  'one owner advances from submit receipts without self content readback, through compaction and cold replay',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-roundtrip');
    const sent = [],
      reads = [],
      pages = [];
    let active = 0,
      maximum = 0;
    for (const [endpoint, list] of [
      [sendPath(f), sent],
      [path(f), reads],
    ])
      await f.context.route(endpoint, async (route) => {
        active++;
        maximum = Math.max(maximum, active);
        list.push(route.request().postData());
        try {
          const response = await route.fetch();
          if (endpoint === path(f)) pages.push(await response.json());
          await route.fulfill({ response });
        } finally {
          active--;
        }
      });
    await syncing(f.page, item);
    const initial = await view(f.page);
    await settled(f.page);
    const metrics = await f.page.evaluate(() => Harness.accountLedgerMetrics());
    if (process.env.ACCOUNT_LEDGER_MODE !== 'reference') {
      assert.ok(metrics.incremental > 0, 'incremental path actually executed');
      assert.equal(metrics.mismatches, 0);
      if (process.env.ACCOUNT_LEDGER_AUDIT === 'every') assert.ok(metrics.audits > 0);
    } else {
      assert.equal(metrics.incremental, 0, 'reference override never extends a verified ledger');
    }
    const baseline = await captures(f.page);
    const readsBeforeEdit = reads.length;
    await edit(f.page, initial.length, 0, ' COMPOSED');
    await settled(f.page);
    const c = await captures(f.page),
      expected = (await f.page.evaluate(() => opened.spoolStatus())).positions.length;
    assert.equal(c.length, baseline.length + 1);
    assert.equal(
      reads.length,
      readsBeforeEdit,
      'successful submit must not schedule self readback',
    );
    assert.equal(await view(f.page), initial + ' COMPOSED');
    assert.equal(maximum, 1);
    assert.deepEqual(
      sent.map((s) => parsed(JSON.parse(s)[3]).seq),
      Array.from({ length: expected }, (_, i) => i + 1),
    );
    assert.equal(f.invocations.length, expected);
    const bodies = (await f.page.evaluate(() => netBodies)).map((b) =>
      decodeEnvelopeBody(new Uint8Array(b)),
    );
    assert.deepEqual(
      bodies.flatMap((b) => b.updates.map((u) => [b.actor_id, b.actor_kind, [...u]])),
      c.flatMap((c) => c.sources.map((s) => [s.actor, s.kind, s.bytes])),
    );
    assert.equal((await syncStatus(f.page)).receive.receivedThrough, expected);
    assert.deepEqual(
      await f.page.evaluate(() =>
        [
          'prepareNextEnvelope',
          'prepareSubmission',
          'submitPending',
          'recordResponse',
          'readAcceptedPage',
          'prepareRead',
          'receiveNext',
          'receivePage',
          'outbound',
        ].filter((k) => k in opened),
      ),
      [],
    );
    const spool = await f.page.evaluate(() => opened.spoolStatus());
    assert.deepEqual(
      spool.positions.flatMap((p) =>
        [p.source, ...(p.additional ?? [])].map((s) => [s.id, s.index]),
      ),
      c.flatMap((c) => c.sources.map((_, i) => [c.id, i])),
    );
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    const rows = await census(f.page, item),
      entries = rows
        .filter((r) => r.kind === 'heads')
        .map((r) => JSON.parse(Buffer.from(r.bytes)))
        .filter((r) => r[0] === 'done/account-inbound/v1');
    assert.equal(entries.length, 0);
    // Existing v2 read remains an empty repair check beyond the signed accepted prefix.
    assert.ok(reads.length > 0);
    assert.ok(
      pages.every((p) => p[5].length === 0),
      'normal self checks returned content',
    );
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), initial + ' COMPOSED');
    assert.deepEqual(await captures(f.page), c);
    await close(f.page);
    for (const factory of ['openOwnedAccountDeliveryWorkspace', 'openOwnedAccountSpoolWorkspace']) {
      const result = await f.page.evaluate(
        async ({ item, factory }) => {
          try {
            const o = await Harness[factory](optionsFor(item));
            await o.workspace.close();
            return 'opened';
          } catch (e) {
            return String(e);
          }
        },
        { item: args(item), factory },
      );
      assert.notEqual(result, 'opened');
    }
  },
);

test(
  'lost submit answer reconciles through the delivery ledger without self content writes or cold resubmission',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-lost'),
      sent = [];
    let lose = true;
    await f.context.route(sendPath(f), async (route) => {
      sent.push(requestWire(route));
      const answer = await route.fetch();
      if (lose) await route.abort();
      else await route.fulfill({ response: answer });
    });
    await syncing(f.page, item);
    await waitPredicate(f.page, () => opened.sync.status.receive.receivedThrough >= 1);
    const status = await syncStatus(f.page);
    assert.equal(status.send.acceptedThrough, 0);
    assert.ok(status.receive.receivedThrough >= 1);
    const c = await captures(f.page),
      count = f.invocations.length;
    await close(f.page);
    await cold(f);
    lose = false;
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(sent.filter((wire) => parsed(wire).seq === 1).length, 1);
    assert.equal(
      f.invocations.length,
      count + (await f.page.evaluate(() => opened.spoolStatus())).positions.length - 1,
    );
    assert.deepEqual(await captures(f.page), c);
    await close(f.page);
    const rows = await census(f.page, item);
    assert.equal(
      rows.filter(
        (r) =>
          r.kind === 'heads' &&
          Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/v1"'),
      ).length,
      0,
    );
  },
);

for (const fault of ['submission', 'response'])
  test(
    'native ' + fault + ' abort retains work for cold restart',
    { timeout: 60000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'sync-abort-' + fault);
      await deliveryBoundary(f.page, fault, 'before');
      await syncing(f.page, item);
      const initial = await view(f.page);
      await waitPredicate(
        f.page,
        () =>
          opened.sync.status.send.reason === 'operation-failed' ||
          editor.status.state === 'blocked',
      );
      const c = await captures(f.page);
      await close(f.page);
      await cold(f);
      await syncing(f.page, item);
      await settled(f.page);
      assert.equal(await view(f.page), initial);
      assert.deepEqual(await captures(f.page), c);
      await close(f.page);
    },
  );

test(
  'acceptance committed before renderer death advances self progress on cold open without resubmitting',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'self-receipt-crash'),
      sent = [];
    await f.context.route(sendPath(f), async (route) => {
      sent.push(requestWire(route));
      await route.fulfill({ response: await route.fetch() });
    });
    await deliveryBoundary(f.page, 'response', 'after');
    await syncing(f.page, item);
    await waitPredicate(f.page, () => window.hit === true);
    const first = sent[0];
    await crash(f);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(sent.filter((wire) => wire === first).length, 1);
    const status = await f.page.evaluate(() => opened.receiveStatus());
    assert.equal(status.receivedThrough, (await syncStatus(f.page)).send.acceptedThrough);
    await close(f.page);
  },
);

test(
  'lost reply and unavailable reconciliation retry the exact retained submission after cold open',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'self-receipt-unknown'),
      sent = [];
    let lose = true;
    await f.context.route(sendPath(f), async (route) => {
      sent.push(requestWire(route));
      const response = await route.fetch();
      if (lose) await route.abort();
      else await route.fulfill({ response });
    });
    await f.context.route(path(f), async (route) => {
      if (lose) await route.fulfill({ status: 503, body: '' });
      else await route.fulfill({ response: await route.fetch() });
    });
    await syncing(f.page, item);
    await waitPredicate(f.page, () => opened.sync.status.send.phase === 'retrying');
    assert.equal((await f.page.evaluate(() => opened.receiveStatus())).receivedThrough, 0);
    const first = sent[0],
      seals = f.invocations.length;
    await close(f.page);
    await cold(f);
    lose = false;
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(sent[1], first);
    assert.equal(
      f.invocations.length,
      seals + (await f.page.evaluate(() => opened.spoolStatus())).positions.length - 1,
    );
    await close(f.page);
  },
);

test(
  'verifying an empty self check does not occupy the editor admission queue',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'self-check-queue');
    await f.page.evaluate(() => {
      const verify = crypto.subtle.verify.bind(crypto.subtle);
      let held = false;
      crypto.subtle.verify = async function (...args) {
        if (!held && new TextDecoder().decode(args[3]).startsWith('["done/private-read-page/v2"')) {
          held = true;
          window.selfCheckWaiting = true;
          await new Promise((resolve) => {
            window.releaseSelfCheck = resolve;
          });
        }
        return verify(...args);
      };
    });
    await syncing(f.page, item);
    await waitPredicate(f.page, () => window.selfCheckWaiting === true);
    const initial = await view(f.page);
    await f.page.evaluate(() => {
      const n = editor.read().master.length;
      surface
        .input(
          { name: 'insert', text: ' DURING SELF CHECK' },
          {
            ranges: [{ anchor: n, head: n }],
            main: 0,
          },
        )
        .accepted.then(() => {
          window.editDuringSelfCheck = true;
        });
    });
    try {
      await waitPredicate(f.page, () => window.editDuringSelfCheck === true, 3000);
      assert.equal(await view(f.page), initial + ' DURING SELF CHECK');
    } finally {
      await f.page.evaluate(() => window.releaseSelfCheck());
    }
    await settled(f.page);
    await close(f.page);
  },
);

test(
  'close drains a delayed send and prevents queued receive dispatch before releasing the shared permit',
  { timeout: 45000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-close');
    await f.page.evaluate(() => {
      window.hits = [];
      window.fetch = async (url, init) => {
        hits.push(String(url));
        window.pendingSignal = init.signal;
        await new Promise((r) => (window.release = r));
        return new Response('late', { status: 409 });
      };
    });
    await syncing(f.page, item);
    await waitPredicate(f.page, () => hits.length === 1);
    await f.page.evaluate((slot) => {
      window.done = false;
      window.closing = editor.close().then(() => (window.done = true));
      window.competed = false;
      window.competitor = navigator.locks.request(Harness.slotPermitName(slot), () => {
        window.competed = true;
      });
    }, item.slotId);
    await waitPredicate(f.page, async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => pendingSignal.aborted), true);
    assert.equal(await f.page.evaluate(() => done || competed), false);
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => closing);
    await f.page.evaluate(() => competitor);
    assert.equal(await f.page.evaluate(() => hits.length), 1);
    assert.equal((await syncStatus(f.page)).send.phase, 'closed');
    assert.equal((await syncStatus(f.page)).receive.phase, 'closed');
  },
);

test(
  'local journal admission during an outbound seal is captured once and sent after readback gets a turn',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-seal-local');
    const order = [];
    for (const endpoint of ['submit', 'read-v2'])
      await f.context.route(f.server.origin + '/account/delivery/' + endpoint, async (route) => {
        order.push(endpoint);
        await route.continue();
      });
    await f.page.evaluate(() => {
      window.pauseNet = true;
      window.hit = false;
    });
    await syncing(f.page, item);
    await waitPredicate(f.page, () => hit);
    const initial = await view(f.page);
    await edit(f.page, initial.length, 0, ' DURING SEAL');
    assert.equal(order.length, 0);
    await f.page.evaluate(() => {
      window.pauseNet = false;
      release();
    });
    await settled(f.page);
    assert.equal(await view(f.page), initial + ' DURING SEAL');
    assert.deepEqual(order.slice(0, 3), ['submit', 'read-v2', 'submit']);
    const c = await captures(f.page),
      bodies = (await f.page.evaluate(() => netBodies)).map((b) =>
        decodeEnvelopeBody(new Uint8Array(b)),
      );
    assert.deepEqual(
      bodies.flatMap((b) => b.updates.map((u) => [b.actor_id, b.actor_kind, [...u]])),
      c.flatMap((c) => c.sources.map((s) => [s.actor, s.kind, s.bytes])),
    );
    await close(f.page);
  },
);

test(
  'retained signed receive conflict halts both lanes without closing valid Local content',
  { timeout: 45000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-retained-conflict');
    await f.page.evaluate(async (item) => {
      window.opened = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
    }, args(item));
    const wire = await prepare(f.page),
      snapshot = await f.page.evaluate(() => [...editor.snapshot()]);
    await close(f.page);
    const other = await envelope(f.page, item, 1, [snapshot]);
    await open(f.page, item);
    let query = await request(f.page, 0);
    await receive(f.page, answer(f, item, query, wire.bytes).bytes);
    query = await request(f.page, 0);
    await receive(f.page, answer(f, item, query, other).bytes);
    assert.equal(
      await f.page.evaluate(async () => (await opened.receiveStatus()).state),
      'conflict',
    );
    const text = await view(f.page);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    await waitPredicate(
      f.page,
      () =>
        opened.sync.status.send.reason === 'conflict' &&
        opened.sync.status.receive.reason === 'conflict',
    );
    assert.equal(await f.page.evaluate(() => editor.status.state), 'active');
    assert.equal(await view(f.page), text);
    await close(f.page);
  },
);

test(
  'legacy self-inbound evidence remains readable while later submissions need no new self-inbound rows',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-legacy-self');
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
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    const initial = await view(f.page);
    await edit(f.page, initial.length, 0, ' AFTER OLD RECEIPT');
    await settled(f.page);
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    const rows = await census(f.page, item);
    assert.equal(
      rows.filter(
        (r) =>
          r.kind === 'heads' &&
          Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/v1"'),
      ).length,
      1,
    );
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), initial + ' AFTER OLD RECEIPT');
    await close(f.page);
  },
);

// Seed a single actual Yjs original: the text surface intentionally slices large paste intents.
import { selected as captureSelected } from '../account-spool/fixtures.mjs';
import { syncBundle, configure } from './fixtures.mjs';
async function singleSource(f, id, length, bundle, historical) {
  if (bundle) await f.page.evaluate(bundle);
  const item = await captureSelected(f, id);
  await f.page.evaluate(
    async ({ item, length, historical }) => {
      const { carrier } = await Harness.openAccountCaptureSession(
        optionsFor(item),
        item.scope.principalId,
      );
      const doc = new Harness.Y.Doc({ gc: false });
      try {
        doc.getText('r01-source').insert(0, 'x'.repeat(length));
        const update = Harness.Y.encodeStateAsUpdate(doc);
        const capsule = carrier.captureLocal(update, [
          { actor: item.scope.principalId, kind: 'human', bytes: update },
        ]);
        await carrier.appendBatch([{ kind: 'update', bytes: capsule }]);
      } finally {
        doc.destroy();
        await carrier.close();
      }
      const spool = await Harness.openOwnedAccountSpoolWorkspace(optionsFor(item));
      await spool.workspace.close();
      if (!historical) {
        const delivery = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
        await delivery.workspace.close();
      }
    },
    { item: args(item), length, historical },
  );
  return item;
}
const originalLength = (page) =>
  page.evaluate(() => {
    const doc = new Harness.Y.Doc({ gc: false });
    try {
      Harness.Y.applyUpdate(doc, editor.snapshot());
      return doc.getText('r01-source').length;
    } finally {
      doc.destroy();
    }
  });
for (const mode of ['fitting', 'oversized', 'no-preflight', 'sealed', 'submitted'])
  test(
    `R-01 v9 singleton ${mode} preserves originals and diagnoses bounds without burning retries`,
    { timeout: mode === 'sealed' || mode === 'submitted' ? 240000 : 90000 },
    async (t) => {
      const f = await native(t),
        historical = mode === 'sealed' || mode === 'submitted';
      const length = mode === 'fitting' ? 80 * 1024 : 600 * 1024;
      const bundle = historical
        ? await syncBundle('r01-old-writer')
        : mode === 'no-preflight'
          ? await syncBundle('r01-no-preflight')
          : null;
      console.log('R01', mode, 'seed original');
      const item = await singleSource(f, 'r01-' + mode, length, bundle, historical);
      console.log('R01', mode, 'seeded');
      if (historical) {
        await f.page.evaluate(async (item) => {
          window.opened = await Harness.openOwnedAccountSpoolWorkspace(optionsFor(item));
          window.editor = opened.workspace;
          let count = 0;
          while (await opened.prepareNextEnvelope()) {
            if (++count > 4) throw Error('Historical fixture allocation loop');
          }
          await editor.close();
          window.opened = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
          window.editor = opened.workspace;
        }, args(item));
        console.log('R01', mode, 'old envelopes sealed');
        const target = await f.page.evaluate(async () => {
          const envelopes = await opened.listEnvelopes();
          try {
            const large = envelopes.filter((e) => e.bytes.length > 512 * 1024);
            if (large.length !== 1)
              throw Error('Expected exactly one historical oversized envelope');
            return large[0].position;
          } finally {
            for (const e of envelopes) e.bytes.fill(0);
          }
        });
        // Bootstrap may contain several originals. Resolve every earlier position in order.
        await f.page.evaluate(
          async ({ token, target }) => {
            for (let p = 1; p < target; p++) {
              await opened.prepareSubmission(p);
              const result = await opened.submitPending(token);
              if (result.kind !== 'accepted')
                throw Error('Historical prefix submission failed: ' + result.kind);
            }
          },
          { token: f.testOperatorToken, target },
        );
        if (mode === 'submitted')
          await f.page.evaluate(async (position) => {
            await opened.prepareSubmission(position);
          }, target);
        const status = await f.page.evaluate(() => opened.deliveryStatus());
        assert.equal(status.acceptedThrough, target - 1);
        assert.equal(status.submissions.includes(target), mode === 'submitted');
        await close(f.page);
        await cold(f); // restore the current bundle
      }
      console.log('R01', mode, 'open current sender');
      await configure(f.page, f.testOperatorToken);
      await syncing(f.page, item);
      if (mode === 'fitting') await settled(f.page);
      else
        await waitPredicate(
          f.page,
          () => opened.sync.status.send.reason === 'envelope-size',
          30000,
        );
      console.log('R01', mode, 'current state reached');
      assert.equal(await originalLength(f.page), length);
      const before = await f.page.evaluate(() => opened.spoolStatus());
      if (historical) {
        const status = await f.page.evaluate(() => opened.deliveryStatus());
        assert.equal(status.submissions.includes(status.acceptedThrough + 1), mode === 'submitted');
      }
      // The omission control must expose the forbidden allocation, not merely throw another error.
      assert.equal(
        before.positions.some((p) => !p.persisted),
        mode === 'no-preflight',
      );
      const calls = f.invocations.length;
      await close(f.page);
      await cold(f);
      await syncing(f.page, item);
      if (mode === 'fitting') await settled(f.page);
      else
        await waitPredicate(
          f.page,
          () => opened.sync.status.send.reason === 'envelope-size',
          30000,
        );
      console.log('R01', mode, 'current state reached');
      assert.equal(await originalLength(f.page), length);
      assert.deepEqual(
        (await f.page.evaluate(() => opened.spoolStatus())).positions,
        before.positions,
      );
      assert.equal(f.invocations.length, calls);
      await close(f.page);
    },
  );

test(
  'retained Account writing crosses reference, default and rollback builds without migration',
  { timeout: 90000, skip: process.env.ACCOUNT_LEDGER_MODE !== undefined },
  async (t) => {
    const reference = await syncBundle(undefined, 'reference'),
      ordinary = await syncBundle(),
      f = await native(t),
      item = await selected(f, 'ledger-default-rollback');
    let expected;
    for (const [index, script] of [reference, ordinary, reference, ordinary].entries()) {
      if (index) await cold(f);
      await f.page.evaluate(script);
      await configure(f.page, f.testOperatorToken);
      await syncing(f.page, item);
      await settled(f.page);
      expected ??= await view(f.page);
      assert.equal(await view(f.page), expected);
      assert.ok(
        (await f.page.evaluate(() => Harness.accountLedgerMetrics())).full > 0,
        'each build cold-verifies the retained data',
      );
      const added = ' build-' + index;
      await edit(f.page, expected.length, 0, added);
      expected += added;
      await settled(f.page);
      await f.page.evaluate(() => opened.compactContent());
      assert.equal(await view(f.page), expected);
      const metrics = await f.page.evaluate(() => Harness.accountLedgerMetrics());
      if (index % 2) assert.ok(metrics.incremental > 0, 'unset flag selects incremental');
      else assert.equal(metrics.incremental, 0, 'rollback uses reference verification');
      assert.equal(metrics.mismatches, 0);
      assert.equal(await f.page.evaluate(() => '__doneLedgerMetrics' in globalThis), false);
      await close(f.page);
    }
  },
);

test(
  'reference audit disagreement refuses the warm owner and cold replay preserves writing',
  {
    timeout: 60000,
    skip:
      process.env.ACCOUNT_LEDGER_MODE === 'reference' ||
      process.env.ACCOUNT_LEDGER_AUDIT !== 'every',
  },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'ledger-audit-disagreement');
    await f.page.evaluate(await syncBundle('audit-disagreement'));
    await configure(f.page, f.testOperatorToken);
    const errors = [];
    f.page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await syncing(f.page, item);
    await settled(f.page);
    let expected = await view(f.page);
    await edit(f.page, expected.length, 0, ' acknowledged');
    expected += ' acknowledged';
    await settled(f.page);
    const sent = f.invocations.length;
    await f.page.evaluate(() => {
      globalThis.forceLedgerDisagreement = true;
    });
    await assert.rejects(
      f.page.evaluate(() => opened.compactContent()),
      /Account ledger reference mismatch/,
    );
    const metrics = await f.page.evaluate(() => Harness.accountLedgerMetrics());
    assert.equal(metrics.mismatches, 1);
    assert.ok(errors.includes('done/account-ledger-reference-mismatch'));
    await assert.rejects(f.page.evaluate(() => opened.spoolStatus()));
    assert.equal(f.invocations.length, sent, 'the refused view cannot authorize a submission');
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), expected);
    assert.ok((await f.page.evaluate(() => Harness.accountLedgerMetrics())).full > 0);
    assert.equal((await f.page.evaluate(() => Harness.accountLedgerMetrics())).mismatches, 0);
    await close(f.page);
  },
);

// Small differential histories, not a release campaign. AUDIT=every compares every delta to cold replay.
test(
  'generated incremental ledger histories preserve inserts, deletes, compaction and cold continuation',
  {
    timeout: 90000,
    skip:
      process.env.ACCOUNT_LEDGER_MODE === 'reference' ||
      process.env.ACCOUNT_LEDGER_AUDIT !== 'every',
  },
  async (t) => {
    const histories = fc.sample(fc.array(fc.nat(4), { minLength: 8, maxLength: 8 }), {
      seed: 101026,
      numRuns: 3,
    });
    for (const [index, actions] of histories.entries()) {
      const f = await native(t),
        item = await selected(f, 'incremental-generated-' + index);
      await syncing(f.page, item);
      await settled(f.page);
      let expected = await view(f.page);
      for (const [step, action] of actions.entries()) {
        if (action === 0 && expected.length) {
          await edit(f.page, 0, 1, '');
          expected = expected.slice(1);
        } else {
          const added = String.fromCharCode(97 + step);
          await edit(f.page, expected.length, 0, added);
          expected += added;
        }
        await settled(f.page);
        if (action === 2 || step === 3) await f.page.evaluate(() => opened.compactContent());
        const metrics = await f.page.evaluate(() => Harness.accountLedgerMetrics());
        assert.ok(metrics.incremental > 0);
        assert.ok(metrics.audits > 0);
        assert.equal(metrics.mismatches, 0);
        assert.equal(await view(f.page), expected);
        if (action === 3 || step === 7) {
          await cold(f);
          await syncing(f.page, item);
          await settled(f.page);
          assert.equal(await view(f.page), expected);
        }
      }
      await close(f.page);
    }
  },
);

for (const refusal of ['unknown', 'blocked'])
  test(
    'self-read decision ' +
      refusal +
      ' stops receive without losing local work and explicit retry recovers',
    { timeout: 60000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'self-decision-' + refusal);
      await f.page.evaluate(await syncBundle('self-decision-refusal'));
      await configure(f.page, f.testOperatorToken);
      await f.page.evaluate((kind) => {
        globalThis.selfDecisionRefusal = kind;
      }, refusal);
      // The service commits the submission, but the sender never receives its answer.
      await f.context.route(sendPath(f), async (route) => {
        await route.fetch();
        await route.abort();
      });
      await syncing(f.page, item);
      const writing = await view(f.page);
      await waitPredicate(
        f.page,
        () => globalThis.selfDecisionCalls > 0 && opened.sync.status.receive.phase !== 'working',
      );
      const state = await syncStatus(f.page);
      assert.equal(state.receive.phase, 'blocked');
      assert.equal(state.receive.reason, 'operation-failed');
      assert.equal(state.receive.receivedThrough, 0);
      assert.equal(state.receive.failures, 0);
      assert.equal(await view(f.page), writing);
      assert.equal(
        await f.page.evaluate(() => globalThis.selfDecisionProof.every((b) => b === 0)),
        true,
      );
      // Online/peer hints must not erase a diagnosed local evidence halt.
      await f.page.evaluate(() => dispatchEvent(new Event('online')));
      assert.equal((await syncStatus(f.page)).receive.phase, 'blocked');
      await f.page.evaluate(() => {
        globalThis.selfDecisionRefusal = undefined;
        opened.sync.retry('receive');
      });
      await waitPredicate(f.page, () => opened.sync.status.receive.receivedThrough >= 1);
      assert.equal(await view(f.page), writing);
      await close(f.page);
      await f.context.unroute(sendPath(f));
      await cold(f);
      await syncing(f.page, item);
      await settled(f.page);
      assert.equal(await view(f.page), writing);
      await close(f.page);
    },
  );

test(
  'concurrent Account readers enter verified storage one at a time',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'verification-order');
    await f.page.evaluate(await syncBundle('verification-order'));
    await configure(f.page, f.testOperatorToken);
    await syncing(f.page, item);
    await settled(f.page);
    await f.page.evaluate(() => {
      globalThis.verificationStarts = 0;
      globalThis.verificationOrderProbe = async () => {
        globalThis.verificationStarts++;
        if (globalThis.verificationStarts === 1)
          await new Promise((r) => {
            globalThis.releaseVerification = r;
          });
      };
      globalThis.readerOne = opened.listCaptures();
    });
    await waitPredicate(f.page, () => globalThis.verificationStarts === 1);
    try {
      await f.page.evaluate(() => {
        globalThis.readerTwo = opened.spoolStatus();
        globalThis.readerThree = opened.listCaptures();
      });
      await f.page.waitForTimeout(100);
      assert.equal(await f.page.evaluate(() => globalThis.verificationStarts), 1);
    } finally {
      await f.page.evaluate(() => globalThis.releaseVerification());
    }
    const reads = await f.page.evaluate(async () => {
      const [first, spool, second] = await Promise.all([readerOne, readerTwo, readerThree]);
      const same = JSON.stringify(first) === JSON.stringify(second);
      first.forEach((c) => Harness.eraseCapsule(c));
      second.forEach((c) => Harness.eraseCapsule(c));
      globalThis.verificationOrderProbe = undefined;
      return { same, positions: spool.positions.length, starts: globalThis.verificationStarts };
    });
    assert.equal(reads.same, true);
    assert.ok(reads.positions > 0);
    assert.ok(reads.starts >= 3);
    await close(f.page);
  },
);
