import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  prepare,
  genesis,
  seed,
  admit,
  snapshot,
  args,
  inventory,
  bundle,
} from './fixtures.mjs';
import { inspectReceipt } from '../account-admission/oracle.mjs';
import { history } from './histories.mjs';
const evidence = (name, data) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(data, null, 2) + '\n',
    );
};
async function ready(f, name, h) {
  const item = await f.ready(name);
  if (h)
    await f.page.evaluate(
      ({ item, update }) => Harness.seedHistory(item.scope, item.code, update),
      { item: args(item), update: [...h.update] },
    );
  else await seed(f.page, item, []);
  await prepare(f.page, item);
  await genesis(f.page, item);
  return item;
}
async function retainOffer(f, item) {
  await f.page.evaluate(() => {
    admissionTransport.finish = async () => {
      throw Error('stop-before-finish');
    };
  });
  await assert.rejects(admit(f.page, item), /stop-before-finish/);
  assert.equal((await snapshot(f.page, item)).marker.stage, 'admission-offered');
}
for (const kind of ['sv', 'ds'])
  test(
    `long ${kind} history survives HTTP admission, independent decrypt and cold retry; old reader refuses`,
    { timeout: 60000 },
    async (t) => {
      const f = await native(t),
        h = history(kind),
        item = await ready(f, 'long-' + kind, h);
      const r = await admit(f.page, item),
        retained = (await snapshot(f.page, item)).marker;
      const m = r.completion.manifest;
      assert.equal(m.v, 2);
      assert.equal(r.completion.admission.v, 2);
      assert.ok(m[kind].length / 2 > 32767);
      inspectReceipt(r, retained.admission.request, item, h.visible);
      const before = await inventory(f.page),
        marker = structuredClone(retained);
      await f.page.close();
      f.page = await f.context.newPage();
      await f.setup(f.page);
      assert.deepEqual(await admit(f.page, item), r);
      assert.deepEqual((await snapshot(f.page, item)).marker, marker);
      assert.equal(await inventory(f.page), before);
      await f.page.evaluate(await bundle('old'));
      await assert.rejects(
        f.page.evaluate((item) => Harness.readRetained(item.slotId, item.code), args(item)),
        /Unsupported|Malformed/,
      );
      await assert.rejects(admit(f.page, item), /Unsupported|Malformed/);
      assert.equal(await inventory(f.page), before);
      evidence('native-long-' + kind, {
        v: 2,
        svBytes: m.sv.length / 2,
        dsBytes: m.ds.length / 2,
        updateBytes: h.update.length,
        independentReplay: true,
        coldRetryExact: true,
        oldReaderRefused: true,
      });
    },
  );
for (const kind of ['sv', 'ds'])
  test(
    `genuine retained ${kind} lie refuses without a completion submission or carrier change`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await ready(f, 'lie-' + kind);
      await retainOffer(f, item);
      await f.page.evaluate(
        ({ item, kind }) => Harness.forgeOffered(item.slotId, item.code, kind),
        { item: args(item), kind },
      );
      const saved = await snapshot(f.page, item),
        before = await inventory(f.page);
      await f.page.evaluate(async (a) => {
        await Harness.verifyCompletion(a.completion, a.request, a.offer);
      }, saved.marker.admission);
      await f.setup(f.page);
      await f.page.evaluate(() => {
        window.finishCalls = 0;
        const previous = admissionTransport.finish;
        admissionTransport.finish = (i) => {
          finishCalls++;
          return previous(i);
        };
      });
      await assert.rejects(admit(f.page, item), /Retained completion changed/);
      assert.equal(await f.page.evaluate(() => finishCalls), 0);
      assert.deepEqual(await snapshot(f.page, item), saved);
      assert.equal(await inventory(f.page), before);
      evidence('native-lie-' + kind, {
        genuineSignatures: true,
        clientRefused: true,
        finishCalls: 0,
        carrierUnchanged: true,
      });
    },
  );
test(
  'genuine v1 offered carrier is retained unchanged and refused by new owner',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'old-offer');
    await f.page.evaluate(await bundle('old'));
    await retainOffer(f, item);
    const saved = await snapshot(f.page, item),
      before = await inventory(f.page);
    assert.equal(saved.marker.admission.completion.manifest.v, 1);
    await f.page.evaluate(
      (a) => Harness.verifyCompletion(a.completion, a.request, a.offer),
      saved.marker.admission,
    );
    await f.setup(f.page);
    await assert.rejects(admit(f.page, item), /Unsupported|Malformed/);
    assert.deepEqual(await snapshot(f.page, item), saved);
    assert.equal(await inventory(f.page), before);
    evidence('native-v1', {
      stage: 'offered',
      genuineSignatures: true,
      rootMacFromOldOwner: true,
      newOwnerRefuses: true,
      unchanged: true,
    });
  },
);
test(
  'coverage preflight refuses before requested carrier or admission network call',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'preflight', history('sv', 100));
    const saved = await snapshot(f.page, item),
      before = await inventory(f.page);
    await f.page.evaluate(await bundle('small-bound'));
    await f.page.evaluate(() => {
      window.admissionCalls = 0;
      admissionTransport.begin = async () => {
        admissionCalls++;
        throw Error('unexpected admission');
      };
    });
    await assert.rejects(admit(f.page, item), /coverage/);
    assert.equal(await f.page.evaluate(() => admissionCalls), 0);
    assert.deepEqual(await snapshot(f.page, item), saved);
    assert.equal(await inventory(f.page), before);
    evidence('native-preflight', {
      testBound: 32,
      stage: 'genesis',
      admissionCalls: 0,
      carrierUnchanged: true,
    });
  },
);
