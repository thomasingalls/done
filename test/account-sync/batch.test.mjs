import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  syncing,
  settled,
  syncStatus,
  online,
  edit,
  view,
  captures,
  close,
  cold,
  crash,
  spoolBoundary,
  waitPredicate,
  requestWire,
} from './fixtures.mjs';
import { report } from '../account-liveness/fixtures.mjs';

async function backlog(t, name) {
  const f = await native(t),
    item = await selected(f, name);
  await syncing(f.page, item);
  await settled(f.page);
  const before = (await syncStatus(f.page)).send.acceptedThrough;
  await online(f.page, false);
  let expected = await view(f.page);
  for (let i = 0; i < 8; i++) {
    await edit(f.page, expected.length, 0, 'b');
    expected += 'b';
  }
  await f.page.evaluate(() => editor.whenDurable());
  return { f, item, before, expected, originals: await captures(f.page) };
}
for (const type of ['position-batch', 'attempt', 'envelope'])
  for (const side of ['before', 'after'])
    test(
      `batch ${type} ${side} commit survives renderer death with exact sources and fresh grants`,
      { timeout: 60000 },
      async (t) => {
        const { f, item, before, expected, originals } = await backlog(
          t,
          'batch-' + type + '-' + side,
        );
        await spoolBoundary(f.page, type, side);
        await online(f.page, true);
        await waitPredicate(f.page, () => globalThis.hit === true);
        await crash(f);
        const attempts = f.invocations.length;
        await cold(f);
        await syncing(f.page, item);
        await settled(f.page);
        assert.equal(await view(f.page), expected);
        assert.deepEqual(await captures(f.page), originals);
        const spool = await f.page.evaluate(() => opened.spoolStatus());
        assert.equal(spool.positions.length, before + 1);
        assert.equal(spool.positions.at(-1).additional.length, 7);
        assert(spool.attempts >= f.invocations.length);
        if (type === 'envelope' && side === 'after') assert.equal(f.invocations.length, attempts);
        else assert.equal(f.invocations.length, attempts + 1);
        report('batch-' + type + '-' + side, {
          status: 'passed',
          sources: 8,
          positions: 1,
          attempts: spool.attempts,
          observedInvocations: f.invocations.length,
          coldReopen: true,
        });
        await close(f.page);
      },
    );

test(
  'lost batch reply retries exact persisted bytes and preserves later local sources',
  { timeout: 60000 },
  async (t) => {
    const { f, item, before, expected: initial } = await backlog(t, 'batch-lost');
    const sent = [];
    let lose = true;
    await f.context.route(f.server.origin + '/account/delivery/submit', async (route) => {
      sent.push(requestWire(route));
      const response = await route.fetch();
      if (lose) await route.abort();
      else await route.fulfill({ response });
    });
    await online(f.page, true);
    await waitPredicate(f.page, () => opened.sync.status.send.failures > 0);
    let expected = initial;
    for (let i = 0; i < 3; i++) {
      await edit(f.page, expected.length, 0, 'z');
      expected += 'z';
    }
    await f.page.evaluate(() => editor.whenDurable());
    const originals = await captures(f.page),
      attempts = f.invocations.length;
    await close(f.page);
    await cold(f);
    lose = false;
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(sent[0], sent[1]);
    const spool = await f.page.evaluate(() => opened.spoolStatus());
    assert.equal(spool.positions.length, before + 2);
    assert.deepEqual(
      spool.positions.slice(before).map((p) => 1 + (p.additional?.length ?? 0)),
      [8, 3],
    );
    assert.equal(f.invocations.length, attempts + 1);
    assert.equal(await view(f.page), expected);
    assert.deepEqual(await captures(f.page), originals);
    report('batch-exact-retry', {
      status: 'passed',
      groups: [8, 3],
      sameRetryBytes: true,
      laterSourcesPreserved: true,
    });
    await close(f.page);
  },
);
