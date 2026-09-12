import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  syncing,
  settled,
  edit,
  view,
  close,
  cold,
} from '../account-sync/fixtures.mjs';
import { report } from '../account-residue/packaged-fixture.mjs';
test(
  'actual stored references survive admission, v9 sync, cold retry and refuse altered locators without writes',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'retained-reference');
    await syncing(f.page, item);
    await settled(f.page);
    const initial = await view(f.page);
    await edit(f.page, initial.length, 0, ' packed marker');
    await settled(f.page);
    await close(f.page);
    const saved = await f.page.evaluate(async (slot) => {
      const rows = await Harness.rows();
      return rows.find(
        (r) => Array.isArray(r.key) && r.key[0] === slot && r.key[1] === 'application-upgrade',
      );
    }, item.slotId);
    assert.equal(saved.value.v, 9);
    assert.equal(saved.value.retainedEncoding, 1);
    assert.deepEqual(saved.value.admission.request.candidate, {
      v: 1,
      kind: 'genesis-reference',
      signature: saved.value.genesis.signature,
    });
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), initial + ' packed marker');
    await close(f.page);
    await f.page.evaluate(async (saved) => {
      const changed = structuredClone(saved.value);
      changed.admission.request.candidate.signature = '00'.repeat(64);
      await Harness.put(saved.key, changed);
    }, saved);
    const before = await f.page.evaluate(() => Harness.inventory());
    await cold(f);
    await assert.rejects(syncing(f.page, item), /reference/);
    assert.equal(await f.page.evaluate(() => Harness.inventory()), before);
    await f.page.evaluate((saved) => Harness.put(saved.key, saved.value), saved);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), initial + ' packed marker');
    await close(f.page);
    report('retained-marker-native', {
      status: 'passed',
      storageVersion: 1,
      logicalVersion: 9,
      coldReplay: true,
      tamperRefusedWithoutWrites: true,
    });
  },
);
