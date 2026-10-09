import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  syncing,
  settled,
  edit,
  view,
  close,
  cold,
  captures,
  args,
  snapshot,
  inventory,
} from './fixtures.mjs';
import { selected } from '../account-editing/fixtures.mjs';
import { freezeFlush, crash, boundary, waitHit } from '../account-capture/fixtures.mjs';

const localOnly = (page, item) =>
  page.evaluate(async (item) => {
    window.opened = await Harness.openOwnedAccountWorkspace(optionsFor(item));
    window.editor = opened.workspace;
    window.surface = editor.text({ kind: 'master' });
  }, args(item));

test(
  'upload activation refuses a substituted actor before changing local custody',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'single-actor');
    await localOnly(f.page, item);
    await edit(f.page, 4, 0, ' retained');
    await close(f.page);
    const before = await inventory(f.page);
    await assert.rejects(
      f.page.evaluate(
        ({ item, token }) => {
          const options = optionsFor(item);
          options.identity.id = 'ab'.repeat(16);
          return Harness.openOwnedSyncingAccountWorkspace(options, token);
        },
        { item: args(item), token: f.testOperatorToken },
      ),
      /Account actor identity changed/,
    );
    assert.equal(await inventory(f.page), before);
    assert.equal((await snapshot(f.page, item)).marker.v, 5);
  },
);

test(
  'a fresh first-device account captures and uploads without a second device',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'single-fresh');
    await syncing(f.page, item);
    await edit(f.page, 4, 0, ' uploaded');
    await settled(f.page);
    assert.equal(await view(f.page), 'base uploaded original');
    assert.ok(f.invocations.length > 0);
    assert.equal((await snapshot(f.page, item)).marker.v, 9);
    await close(f.page);
    await cold(f);
    await assert.rejects(localOnly(f.page, item), /Account handoff needs resumption/);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), 'base uploaded original');
    await close(f.page);
  },
);

for (const interruption of ['fence', 'capsule'])
  test(
    `local-only content and journal survive upload conversion interrupted at ${interruption}`,
    { timeout: 60000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'single-' + interruption);
      await localOnly(f.page, item);
      await edit(f.page, 4, 0, ' compacted');
      await f.page.evaluate(async () => {
        await editor.whenDurable();
        await opened.compactContent();
      });
      await freezeFlush(f.page);
      await edit(f.page, 4, 0, ' journal');
      await crash(f);
      await cold(f);
      if (interruption === 'fence') await boundary(f.page, 'account-capturing', 'after');
      else
        await f.page.evaluate(() => {
          const add = IDBObjectStore.prototype.add;
          let capsules = 0;
          IDBObjectStore.prototype.add = function (v, k) {
            const r = add.call(this, v, k);
            if (v?.kind === 'outbound' && ++capsules === 2)
              r.addEventListener('success', () => this.transaction.abort());
            return r;
          };
        });
      await f.page.evaluate((item) => {
        window.work = openSync(item).then(
          () => 'opened',
          (e) => String(e),
        );
      }, args(item));
      if (interruption === 'fence') {
        await waitHit(f.page);
        await crash(f);
      } else assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
      await cold(f);
      assert.equal((await snapshot(f.page, item)).marker.v, 6);
      assert.ok((await snapshot(f.page, item)).marker.captureBootstrap);
      await syncing(f.page, item);
      await settled(f.page);
      assert.equal(await view(f.page), 'base journal compacted original');
      const sources = await captures(f.page);
      assert.ok(sources.some((c) => c.sources.some((s) => s.actor === 'system')));
      assert.equal(new Set(sources.map((c) => c.id)).size, sources.length);
      assert.equal((await snapshot(f.page, item)).marker.captureBootstrap, undefined);
      await close(f.page);
      await cold(f);
      await syncing(f.page, item);
      await settled(f.page);
      assert.deepEqual(await captures(f.page), sources);
      assert.equal(await view(f.page), 'base journal compacted original');
      await close(f.page);
    },
  );
