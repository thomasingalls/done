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
  receiveBoundary,
} from './fixtures.mjs';
import { decodeSubmission } from '../../account-protocol/submission.ts';
import { decodeEnvelopeBody, decodeNetworkEnvelope } from '../../account-protocol/envelope.ts';
const sendPath = (f) => f.server.origin + '/account/delivery/submit';
const parsed = (wire) =>
  decodeNetworkEnvelope(decodeSubmission(new Uint8Array(Buffer.from(wire, 'hex'))).envelope);

test(
  'one owner sends and reads back actual service bytes, preserves sources through edits, compaction and cold replay',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-roundtrip');
    const sent = [],
      reads = [];
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
          await route.fulfill({ response: await route.fetch() });
        } finally {
          active--;
        }
      });
    await syncing(f.page, item);
    const initial = await view(f.page);
    await settled(f.page);
    const baseline = await captures(f.page);
    await edit(f.page, initial.length, 0, ' COMPOSED');
    await settled(f.page);
    const c = await captures(f.page),
      expected = (await f.page.evaluate(() => opened.spoolStatus())).positions.length;
    assert.equal(c.length, baseline.length + 1);
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
    assert.equal(entries.length, expected);
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
  'lost submit answer can be received before delivery resolves; cold retry uses exact bytes without resealing',
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
    assert.equal(sent[0], sent[1]);
    assert.equal(
      f.invocations.length,
      count + (await f.page.evaluate(() => opened.spoolStatus())).positions.length - 1,
    );
    assert.deepEqual(await captures(f.page), c);
    await close(f.page);
  },
);

for (const fault of ['submission', 'receive'])
  test(
    'native ' + fault + ' abort retains work for cold restart',
    { timeout: 60000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'sync-abort-' + fault);
      if (fault === 'submission') await deliveryBoundary(f.page, 'submission', 'before');
      else await receiveBoundary(f.page, 'before');
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
