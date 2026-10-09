import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeOwner,
  selected,
  syncing,
  settled,
  edit,
  view,
  close,
  cold,
  marker,
  adopt,
  online,
  syncStatus,
  installBoundary,
  waitPredicate,
} from './owner-fixtures.mjs';
import { decodeSubmission } from '../../account-protocol/submission.ts';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope.ts';
const sentEnvelope = (route) =>
  decodeNetworkEnvelope(
    decodeSubmission(new Uint8Array(Buffer.from(JSON.parse(route.request().postData())[3], 'hex')))
      .envelope,
  );

test(
  'installed successor preserves genesis, queued sources and counters through editing, compaction and cold replay',
  { timeout: 60000 },
  async (t) => {
    const f = await nativeOwner(t),
      item = await selected(f, 'successor-owned');
    await syncing(f.page, item);
    await settled(f.page);
    await close(f.page);
    const original = await marker(f.page, item);
    await syncing(f.page, item);
    await online(f.page, false);
    const initial = await view(f.page);
    await edit(f.page, initial.length, 0, ' before adoption');
    const artifact = await f.successor(item);
    assert.deepEqual(await adopt(f.page, artifact), { epoch: 2, head: artifact.head });
    assert.deepEqual(await adopt(f.page, artifact), { epoch: 2, head: artifact.head });
    const epochs = [];
    await f.context.route(f.server.origin + '/account/delivery/submit', async (route) => {
      epochs.push(sentEnvelope(route).epoch);
      await route.fulfill({ response: await route.fetch() });
    });
    await edit(f.page, (await view(f.page)).length, 0, ' after adoption');
    await online(f.page, true);
    await settled(f.page);
    assert(epochs.length > 0);
    assert(epochs.every((e) => e === 2));
    await f.page.evaluate(() => opened.compactContent());
    const text = await view(f.page);
    await close(f.page);
    const next = await marker(f.page, item);
    for (const field of ['admission', 'genesis', 'handoff', 'credentials', 'sealReserved'])
      assert.deepEqual(next[field], original[field], field);
    assert.equal(next.successor.artifact.head, artifact.head);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), text);
    assert.equal((await syncStatus(f.page)).send.phase, 'idle');
  },
);
for (const side of ['before', 'after'])
  test(
    `native interruption ${side} successor commit reopens exactly one authority`,
    { timeout: 60000 },
    async (t) => {
      const f = await nativeOwner(t),
        item = await selected(f, 'successor-' + side);
      await syncing(f.page, item);
      await settled(f.page);
      await online(f.page, false);
      await edit(f.page, (await view(f.page)).length, 0, ' durable at interruption');
      const text = await view(f.page),
        artifact = await f.successor(item);
      await installBoundary(f.page, side);
      await f.page.evaluate((artifact) => {
        window.installResult = undefined;
        void opened.adoptSuccessor(artifact).then(
          (v) => (window.installResult = v),
          (e) => (window.installResult = { error: String(e) }),
        );
      }, artifact);
      await waitPredicate(f.page, () => window.installHit === true);
      if (side === 'before') {
        await waitPredicate(f.page, () => !!window.installResult?.error);
        assert.equal(await view(f.page), text);
        await edit(f.page, text.length, 0, ' still editable');
      } else {
        await edit(f.page, text.length, 0, ' journal at commit');
      }
      await cold(f);
      const saved = await marker(f.page, item);
      assert.equal(saved.successor?.artifact.head, side === 'after' ? artifact.head : undefined);
      await syncing(f.page, item);
      if (side === 'before') await adopt(f.page, artifact);
      await settled(f.page);
      assert.equal(
        await view(f.page),
        text + (side === 'before' ? ' still editable' : ' journal at commit'),
      );
    },
  );
for (const acceptedBefore of [false, true])
  test(
    `exact old outbound survives adoption with ${acceptedBefore ? 'a lost epoch-one acceptance' : 'acceptance only in epoch two'}`,
    { timeout: 60000 },
    async (t) => {
      const f = await nativeOwner(t),
        item = await selected(f, 'successor-outbound-' + acceptedBefore);
      await syncing(f.page, item);
      await settled(f.page);
      let release, hit, done;
      const held = new Promise((r) => (release = r)),
        reached = new Promise((r) => (hit = r)),
        finished = new Promise((r) => (done = r));
      let first = true,
        original,
        reply;
      await f.context.route(f.server.origin + '/account/delivery/submit', async (route) => {
        if (!first) return route.fulfill({ response: await route.fetch() });
        first = false;
        original = route.request().postData();
        if (acceptedBefore) reply = await route.fetch();
        hit();
        await held;
        if (!acceptedBefore) reply = await route.fetch();
        await route.fulfill({ response: reply });
        done();
      });
      await edit(f.page, (await view(f.page)).length, 0, ' held outbound');
      await reached;
      const old = sentEnvelope({ request: () => ({ postData: () => original }) });
      assert.equal(old.epoch, 1);
      const artifact = await f.successor(item);
      assert.equal(
        artifact.epoch.heads.find((h) => h.credentialId === old.credential_id).position,
        old.seq - (acceptedBefore ? 0 : 1),
      );
      await adopt(f.page, artifact);
      release();
      await finished;
      await settled(f.page);
      assert.equal((await syncStatus(f.page)).send.acceptedThrough, old.seq);
      const response = JSON.parse(Buffer.from(await reply.body()).toString());
      assert.equal(response[7], acceptedBefore ? 1 : 2);
      assert.equal(response[9], 1, 'acceptance retains exact old envelope epoch');
      const text = await view(f.page);
      await close(f.page);
      await cold(f);
      await syncing(f.page, item);
      await settled(f.page);
      assert.equal(await view(f.page), text);
    },
  );

test(
  'a late old receive page is discarded and current polling resumes without halting the editor',
  { timeout: 60000 },
  async (t) => {
    const f = await nativeOwner(t),
      item = await selected(f, 'successor-late-read');
    await syncing(f.page, item);
    await settled(f.page);
    let release, hit, current;
    const held = new Promise((r) => (release = r)),
      reached = new Promise((r) => (hit = r)),
      next = new Promise((r) => (current = r));
    let first = true;
    await f.context.route(f.server.origin + '/account/delivery/read-v2', async (route) => {
      if (!first) {
        const response = await route.fetch();
        await route.fulfill({ response });
        current(route.request().postData());
        return;
      }
      first = false;
      const response = await route.fetch();
      hit();
      await held;
      await route.fulfill({ response });
    });
    await f.page.evaluate(() => opened.sync.retry('receive'));
    await reached;
    const artifact = await f.successor(item);
    await adopt(f.page, artifact);
    release();
    const raw = JSON.parse(await next);
    assert(raw.includes(artifact.head), 'new request binds successor');
    await edit(f.page, (await view(f.page)).length, 0, ' after late read');
    await settled(f.page);
    assert.notEqual((await syncStatus(f.page)).receive.phase, 'halted');
  },
);

test(
  'zero accepted prefix installs before any network work and publishes pending old captures under epoch two',
  { timeout: 60000 },
  async (t) => {
    const f = await nativeOwner(t),
      item = await selected(f, 'successor-zero');
    await online(f.page, false);
    await syncing(f.page, item);
    await edit(f.page, (await view(f.page)).length, 0, ' before first send');
    const artifact = await f.successor(item);
    assert(artifact.epoch.heads.every((h) => h.position === 0 && h.link === '0'.repeat(64)));
    await adopt(f.page, artifact);
    const text = await view(f.page);
    await close(f.page);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.equal(await view(f.page), text);
    await online(f.page, true);
    await settled(f.page);
    assert((await syncStatus(f.page)).send.acceptedThrough > 0);
  },
);
