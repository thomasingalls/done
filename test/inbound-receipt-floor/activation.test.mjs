/** Real Page owner authentication and native marker transaction; no Worker/Joined lifecycle claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import { native, selected, args, cold } from '../account-receive-editor/fixtures.mjs';
const control = process.env.FLOOR_ACTIVATION_CONTROL;
if (control && control !== 'omit-ack') throw Error('Unknown floor activation control');
let controlHits = 0;
const scripts = new Map();
for (const writer of [false, true]) {
  const built = await build({
    configFile: false,
    logLevel: 'error',
    plugins:
      control && writer
        ? [
            {
              name: 'receipt-floor-ack-omission',
              enforce: 'pre',
              transform(code, id) {
                if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
                const anchor = 'if (rangeWrites && inboundReceiptVersion !== 1) {';
                assert.equal(code.split(anchor).length, 2);
                controlHits++;
                return code.replace(anchor, 'if (false) {');
              },
            },
          ]
        : [],
    define: { 'import.meta.env.VITE_ACCOUNT_RANGE_RECEIVE': JSON.stringify(writer ? '1' : '0') },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/inbound-receipt-floor/activation-browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  const chunks = (Array.isArray(built) ? built[0] : built).output.filter((f) => f.type === 'chunk');
  assert.equal(chunks.length, 1);
  scripts.set(writer, chunks[0].code);
}
if (control) assert.equal(controlHits, 1);
const install = (page, writer) => page.evaluate(scripts.get(writer));
async function open(page, item, writer, denied = false) {
  await install(page, writer);
  return page.evaluate(
    async ({ item, denied }) => {
      const options = optionsFor(item),
        original = options.assertPasskey;
      let assertions = 0;
      options.assertPasskey = async (...args) => {
        assertions++;
        if (denied) throw Error('declared passkey denial');
        return original(...args);
      };
      const opened = await Harness.openOwnedReceivingAccountWorkspace(options);
      const writing = opened.workspace.read();
      await opened.workspace.whenDurable();
      await opened.workspace.close();
      return { writing, assertions };
    },
    { item: args(item), denied },
  );
}
const state = (page, item) =>
  page.evaluate(
    (item) =>
      Harness.withPromotionSlot(item.slotId, item.code, async (task) => {
        const current = await Harness.readPromotion(task, item.slotId, item.code);
        return { marker: current.marker, record: current.record };
      }),
    args(item),
  );
async function setup(t, name) {
  const f = await native(t),
    item = await selected(f, name);
  const baseline = await open(f.page, item, false);
  return { f, item, baseline, before: await state(f.page, item) };
}
test(
  'real authenticated Page activation acknowledges once, preserves writing/custody and cold reader-only opening',
  { timeout: 60000 },
  async (t) => {
    const { f, item, baseline, before } = await setup(t, 'floor-activation-page');
    assert.equal(before.marker.v, 9);
    assert.equal(Object.hasOwn(before.marker, 'inboundReceiptVersion'), false);
    const on = await open(f.page, item, true),
      after = await state(f.page, item);
    assert.deepEqual(on.writing, baseline.writing);
    assert.ok(baseline.assertions > 0);
    assert.equal(on.assertions, baseline.assertions, 'floor ACK adds no passkey ceremony');
    assert.deepEqual(after.record, before.record);
    assert.equal(after.marker.inboundReceiptVersion, 1);
    const { mac: oldMac, ...oldMarker } = before.marker;
    const { mac: newMac, inboundReceiptVersion: _, ...newMarker } = after.marker;
    assert.deepEqual(newMarker, oldMarker);
    assert.notDeepEqual(newMac, oldMac);
    assert.deepEqual((await open(f.page, item, true)).writing, baseline.writing);
    assert.deepEqual(await state(f.page, item), after, 'acknowledged floor is byte-idempotent');
    await cold(f);
    assert.deepEqual((await open(f.page, item, false)).writing, baseline.writing);
    assert.deepEqual(await state(f.page, item), after, 'writer-off reader preserves the floor');
  },
);
test(
  'ordinary passkey refusal and wrong local factor cannot acknowledge the floor',
  { timeout: 60000 },
  async (t) => {
    const { f, item, before } = await setup(t, 'floor-denied');
    await assert.rejects(open(f.page, item, true, true), /declared passkey denial/);
    assert.deepEqual(await state(f.page, item), before);
    await assert.rejects(open(f.page, { ...item, code: '00000000000000000000000000' }, true));
    assert.deepEqual(await state(f.page, item), before);
  },
);
test(
  'an aborted native floor transaction keeps the original authenticated marker and retry writing',
  { timeout: 60000 },
  async (t) => {
    const { f, item, baseline, before } = await setup(t, 'floor-aborted');
    await f.page.evaluate(() => {
      window.floorFaultHits = 0;
      const put = IDBObjectStore.prototype.put;
      window.restoreFloorFault = () => {
        IDBObjectStore.prototype.put = put;
      };
      IDBObjectStore.prototype.put = function (value, ...args) {
        const request = put.call(this, value, ...args);
        if (this.name === 'entries' && value?.inboundReceiptVersion === 1) {
          floorFaultHits++;
          request.addEventListener('success', () => this.transaction.abort());
        }
        return request;
      };
    });
    try {
      await assert.rejects(open(f.page, item, true));
    } finally {
      await f.page.evaluate(() => restoreFloorFault());
    }
    assert.equal(await f.page.evaluate(() => floorFaultHits), 1);
    assert.deepEqual(await state(f.page, item), before);
    assert.deepEqual((await open(f.page, item, true)).writing, baseline.writing);
    assert.equal((await state(f.page, item)).marker.inboundReceiptVersion, 1);
  },
);
test(
  'floor acknowledgement reauthenticates saved bytes and refuses stale payloads and non-original ownership',
  { timeout: 60000 },
  async (t) => {
    const { f, item, before } = await setup(t, 'floor-guards');
    await install(f.page, true);
    const result = await f.page.evaluate(async (item) => {
      const attempt = async (work) => {
        try {
          await work();
          return 'unexpected pass';
        } catch (e) {
          return e.message;
        }
      };
      const stale = await Harness.withPromotionSlot(item.slotId, item.code, async (task) => {
        const s = await Harness.readPromotion(task, item.slotId, item.code);
        const payload = Harness.promotionPayload(s.marker);
        payload[0] ^= 1;
        return attempt(() =>
          Harness.acknowledgePromotionInboundReceiptVersion(
            task,
            item.slotId,
            item.code,
            payload,
            s.record,
          ),
        );
      });
      const copied = await Harness.withPromotionSlot(item.slotId, item.code, async (task) =>
        attempt(() =>
          Harness.acknowledgePromotionInboundReceiptVersion(
            { ...task },
            item.slotId,
            item.code,
            new Uint8Array(),
            {},
          ),
        ),
      );
      const genericSlot = item.slotId + '-generic';
      const shared = await Harness.openWriteSession(genericSlot);
      let generic;
      try {
        generic = await shared.run((task) =>
          attempt(() =>
            Harness.acknowledgePromotionInboundReceiptVersion(
              task,
              genericSlot,
              item.code,
              new Uint8Array(),
              {},
            ),
          ),
        );
      } finally {
        await shared.close();
      }
      return { stale, copied, generic };
    }, args(item));
    assert.match(result.stale, /floor authority changed/);
    assert.match(result.copied, /actual format task/);
    assert.match(result.generic, /Account cohort format task/);
    assert.deepEqual(await state(f.page, item), before);
  },
);
test(
  'a marker changed after owner authentication is not blessed with a fresh floor MAC',
  { timeout: 60000 },
  async (t) => {
    const { f, item, before } = await setup(t, 'floor-tampered-after-auth');
    await install(f.page, true);
    const message = await f.page.evaluate(
      (item) =>
        Harness.withPromotionSlot(item.slotId, item.code, async (task) => {
          const saved = (await Harness.rows()).find(
            (r) => r.key[0] === item.slotId && r.key[1] === 'application-upgrade',
          );
          const current = await Harness.readPromotion(task, item.slotId, item.code);
          const changed = structuredClone(saved.value);
          changed.id =
            changed.id[0] === 'a' ? 'b' + changed.id.slice(1) : 'a' + changed.id.slice(1);
          await Harness.put(saved.key, changed);
          try {
            await Harness.acknowledgePromotionInboundReceiptVersion(
              task,
              item.slotId,
              item.code,
              Harness.promotionPayload(current.marker),
              current.record,
            );
            return 'unexpected pass';
          } catch (error) {
            return error.message;
          } finally {
            await Harness.put(saved.key, saved.value);
          }
        }),
      args(item),
    );
    assert.match(message, /Promotion authentication failed/);
    assert.deepEqual(await state(f.page, item), before);
  },
);
