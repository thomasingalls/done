import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  prepared,
  decide,
  open,
  close,
  cold,
  edit,
  record,
  pending,
  captures,
  census,
  assertRetained,
  assertOpen,
  service,
  raw,
  view,
  issue,
  sending,
  driverStatus,
  intercept,
  waitUntil,
  retry,
  deliveryStatus,
  sync,
  evidence,
  hash,
  assertCaptures,
} from './fixtures.mjs';

for (const kind of ['accepted', 'closed', 'conflict'])
  test(
    `actual HTTP ${kind} decision persists exact evidence and original source through cold compaction`,
    { timeout: 45000 },
    async (t) => {
      const f = await native(t),
        x = await prepared(f, 'composed-' + kind, kind);
      await decide(x);
      await open(f.page, x.item);
      const r = await f.page.evaluate((token) => opened.submitPending(token), f.testOperatorToken);
      assert.equal(r.recorded, true);
      await assertOpen(x, true);
      assert.deepEqual(await pending(f.page), []);
      assertCaptures(await captures(f.page), x.captures);
      const before = await raw(f.page);
      assert.equal((await record(f.page, 1, x.answer)).recorded, false);
      const invalid = x.answer.slice();
      invalid[invalid.length - 5] ^= 1;
      assert.equal((await record(f.page, 1, invalid)).recorded, false);
      assert.equal(await raw(f.page), before, 'Duplicate and invalid proof write nothing');
      await close(f.page);
      assertRetained(x, await census(f.page, x.item), true);
      await cold(f);
      await open(f.page, x.item);
      await assertOpen(x, true);
      await f.page.evaluate(() => opened.compactContent());
      await close(f.page);
      assertRetained(x, await census(f.page, x.item), true);
      await cold(f);
      await open(f.page, x.item);
      await assertOpen(x, true);
      assert.deepEqual(service(f), x.service, 'Cold service rows are immutable');
      await close(f.page);
      evidence('direct-' + kind, {
        response: x.answer,
        serviceDigest: hash(x.service),
        ownDigest: hash(x.own.bytes),
        retained: true,
      });
    },
  );

for (const kind of ['closed', 'conflict'])
  for (const lost of [false, true])
    test(
      `automatic sender ${kind}, lost reply ${lost}, halts without reseal and preserves later Local edits`,
      { timeout: 50000 },
      async (t) => {
        const f = await native(t),
          x = await prepared(f, 'sender-' + kind + '-' + lost, kind),
          sent = [];
        await decide(x);
        let lose = lost;
        await intercept(f, async (route) => {
          sent.push(JSON.parse(route.request().postData())[3]);
          const answer = await route.fetch();
          assert.deepEqual([...(await answer.body())], x.answer);
          if (lose) await route.abort();
          else await route.fulfill({ response: answer });
        });
        await sending(f.page, x.item);
        if (lost) {
          await waitUntil(f.page, () => opened.driver.status.phase === 'retrying');
          await assertOpen(x, false);
          assert.deepEqual((await deliveryStatus(f.page)).submissions, [1]);
          await close(f.page);
          assertRetained(x, await census(f.page, x.item), false);
          await cold(f);
          lose = false;
          await sending(f.page, x.item);
        }
        await waitUntil(f.page, () => opened.driver.status.phase === 'blocked');
        assert.equal((await driverStatus(f.page)).reason, kind);
        await assertOpen(x, true);
        await edit(f.page, 0, 0, 'AFTER HALT ');
        await f.page.evaluate(() => editor.whenDurable());
        await retry(f.page);
        await waitUntil(f.page, () => opened.driver.status.phase === 'blocked');
        await assertOpen(x, true, 'AFTER HALT ' + x.text);
        const laterCaptures = await captures(f.page),
          count = sent.length;
        await close(f.page);
        assertRetained(x, await census(f.page, x.item), true);
        await cold(f);
        await sending(f.page, x.item);
        await waitUntil(f.page, () => opened.driver.status.phase === 'blocked');
        await assertOpen(x, true, 'AFTER HALT ' + x.text);
        assertCaptures(await captures(f.page), laterCaptures);
        assert.equal(sent.length, count, 'Retained halt prevents cold redispatch');
        assert(sent.every((wire) => wire === Buffer.from(x.own.bytes).toString('hex')));
        assert.deepEqual(service(f), x.service);
        await close(f.page);
        evidence(`sender-${kind}-${lost}`, {
          sends: sent.length,
          exactRetry: true,
          noReseal: true,
          localEditRecovered: true,
        });
      },
    );

for (const kind of ['closed', 'conflict'])
  test(
    `shared sync scheduler keeps lane-specific outcomes for a real ${kind} delivery decision`,
    { timeout: 50000 },
    async (t) => {
      const f = await native(t),
        x = await prepared(f, 'sync-decision-' + kind, kind),
        sends = [];
      await decide(x);
      await intercept(f, async (route) => {
        sends.push(route.request().postData());
        await route.continue();
      });
      await sync(f.page, x.item);
      await waitUntil(
        f.page,
        (kind) =>
          opened.sync.status.send.phase === 'blocked' &&
          opened.sync.status.receive.phase === (kind === 'closed' ? 'idle' : 'blocked'),
        kind,
      );
      const status = await f.page.evaluate(() => opened.sync.status);
      assert.equal(status.send.reason, kind);
      assert.equal(status.receive.reason, kind === 'closed' ? null : 'operation-failed');
      assert.equal(status.receive.receivedThrough, 0);
      assert.equal(await f.page.evaluate(() => editor.status.state), 'active');
      assert.equal((await deliveryStatus(f.page)).state, kind);
      assert.equal(await view(f.page), x.text);
      assert.equal(f.invocations.length, x.seals);
      await edit(f.page, 0, 0, 'SYNC HALT ');
      await f.page.evaluate(() => editor.whenDurable());
      const count = sends.length;
      await close(f.page);
      await cold(f);
      await sync(f.page, x.item);
      await waitUntil(
        f.page,
        (kind) =>
          opened.sync.status.send.phase === 'blocked' &&
          opened.sync.status.receive.phase === (kind === 'closed' ? 'idle' : 'blocked'),
        kind,
      );
      assert.equal(await view(f.page), 'SYNC HALT ' + x.text);
      assert.equal(sends.length, count);
      assert.equal(f.invocations.length, x.seals);
      assert.deepEqual([...(await issue(f, x.item, x.own.bytes)).bytes], x.answer);
      assert.deepEqual(service(f), x.service);
      await close(f.page);
      evidence('sync-' + kind, { status, coldHalt: true, preservedWriting: true });
    },
  );
