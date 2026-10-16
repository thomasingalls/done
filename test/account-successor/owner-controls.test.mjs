import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeOwner,
  selected,
  syncing,
  settled,
  view,
  edit,
  close,
  cold,
  marker,
  adopt,
  online,
  args,
} from './owner-fixtures.mjs';

for (const omitted of [false, true])
  test(
    `${omitted ? 'omitted' : 'required'} complete-prefix check ${omitted ? 'installs' : 'refuses'} a root-signed head beyond all retained envelopes`,
    { timeout: 60000 },
    async (t) => {
      const f = await nativeOwner(t, omitted ? 'prefix' : undefined),
        item = await selected(f, 'successor-prefix-' + omitted);
      await syncing(f.page, item);
      await settled(f.page);
      await online(f.page, false);
      const artifact = await f.successor(item),
        changed = structuredClone(artifact),
        member = changed.epoch.roster.find((r) => r.state === 'certified');
      const boundary = changed.epoch.heads.find((h) => h.credentialId === member.id);
      boundary.position++;
      boundary.link = 'a1'.repeat(32);
      const wrong = f.resign(changed);
      if (omitted) assert.equal((await adopt(f.page, wrong)).head, wrong.head);
      else {
        await assert.rejects(adopt(f.page, wrong), /retained history/);
        await edit(f.page, (await view(f.page)).length, 0, ' refusal keeps editing');
      }
      await close(f.page);
      const stored = await marker(f.page, item);
      assert.equal(stored.successor?.artifact.head, omitted ? wrong.head : undefined);
      await cold(f);
      await online(f.page, false);
      await syncing(f.page, item);
      if (omitted)
        assert.equal(
          (await adopt(f.page, wrong)).head,
          wrong.head,
          'forbidden head survives cold reopen',
        );
    },
  );

for (const omitted of [false, true])
  test(
    `${omitted ? 'omitted' : 'required'} install-cut check ${omitted ? 'accepts' : 'rejects'} authenticated pre-adoption rows on the wrong side of installation`,
    { timeout: 60000 },
    async (t) => {
      const f = await nativeOwner(t, omitted ? 'cut' : undefined),
        item = await selected(f, 'successor-cut-' + omitted);
      await syncing(f.page, item);
      await settled(f.page);
      await online(f.page, false);
      await adopt(f.page, await f.successor(item));
      await close(f.page);
      await f.page.evaluate(
        (item) => Harness.changeSuccessorCut(item.slotId, item.code),
        args(item),
      );
      await cold(f);
      await online(f.page, false);
      if (omitted) {
        await syncing(f.page, item);
        assert.equal((await f.page.evaluate(() => editor.status)).state, 'active');
      } else await assert.rejects(syncing(f.page, item), /installed authority boundary/);
    },
  );

test(
  'an installed head rejects a different root-signed child and keeps the durable head after reopen',
  { timeout: 60000 },
  async (t) => {
    const f = await nativeOwner(t),
      item = await selected(f, 'successor-held-head');
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    const artifact = await f.successor(item);
    await adopt(f.page, artifact);
    const changed = structuredClone(artifact),
      member = changed.epoch.roster.find((r) => r.state === 'certified');
    changed.epoch.heads.find((h) => h.credentialId === member.id).link = 'b2'.repeat(32);
    const sibling = f.resign(changed);
    await assert.rejects(adopt(f.page, sibling), /cannot be replaced/);
    await edit(f.page, (await view(f.page)).length, 0, ' sibling refused');
    await close(f.page);
    assert.equal((await marker(f.page, item)).successor.artifact.head, artifact.head);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    await assert.rejects(adopt(f.page, sibling), /cannot be replaced/);
  },
);

test(
  'successor storage refuses pre-checkpoint stages and removing its field cannot restore genesis authority',
  { timeout: 60000 },
  async (t) => {
    const f = await nativeOwner(t),
      item = await selected(f, 'successor-marker');
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    await adopt(f.page, await f.successor(item));
    await close(f.page);
    const results = await f.page.evaluate(async (item) => {
      const marker = await Harness.successorMarker(item.slotId, item.code);
      Harness.parsePromotion(marker);
      const attempt = (v) => {
        try {
          Harness.parsePromotion(v);
          return false;
        } catch {
          return true;
        }
      };
      return [
        attempt({ ...marker, v: 5, stage: 'account-active' }),
        attempt({ ...marker, successor: { ...marker.successor, extra: 1 } }),
        attempt({
          ...marker,
          successor: { ...marker.successor, before: { events: -1, hash: '0'.repeat(64) } },
        }),
      ];
    }, args(item));
    assert.deepEqual(results, [true, true, true]);
    await f.page.evaluate((slot) => Harness.stripSuccessor(slot), item.slotId);
    await cold(f);
    await online(f.page, false);
    await assert.rejects(syncing(f.page, item), /Promotion authentication failed/);
  },
);
