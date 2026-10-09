import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  openReceive,
  closeReceive,
  request,
  receive,
  status,
  census,
  envelope,
  answer,
  cold,
  crash,
  waitPredicate,
  receiveBoundary,
  receiveBundle,
  args,
  boundary,
  snapshot,
} from './fixtures.mjs';
const hex = (bytes) => Buffer.from(bytes).toString('hex');
async function refusal(op, pattern) {
  let reason;
  await assert.rejects(op, (e) => {
    reason = String(e);
    if (pattern) assert.match(reason, pattern);
    return true;
  });
  return reason;
}
const artifact = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name),
      JSON.stringify(value, null, 2) + '\n',
    );
};
async function ready(t, id, text = 'remote-only') {
  const f = await native(t),
    item = await selected(f, id);
  const update = await f.page.evaluate((text) => {
    const doc = new Harness.Y.Doc({ gc: false });
    doc.clientID = 777;
    doc.getText('remote-fixture').insert(0, text);
    const b = [...Harness.Y.encodeStateAsUpdate(doc)];
    doc.destroy();
    return b;
  }, text);
  const wire = await envelope(f.page, item, 1, [update]);
  await openReceive(f.page, item);
  return { f, item, update, wire };
}
test(
  'owned request, atomic original content/evidence, stale duplicate, compaction and expired cold replay',
  { timeout: 40000 },
  async (t) => {
    const { f, item, update, wire } = await ready(t, 'receive');
    const q = await request(f.page),
      a = answer(f, item, q, wire);
    const r = await receive(f.page, a.bytes);
    assert.equal(r.kind, 'received');
    assert.equal(r.status.receivedThrough, 1);
    assert.equal((await receive(f.page, a.bytes)).kind, 'duplicate');
    assert.equal(await f.page.evaluate(() => 'workspace' in receiver), false);
    await closeReceive(f.page);
    const rows = await census(f.page, item),
      event = rows.find(
        (r) =>
          r.kind === 'heads' &&
          Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/v1"'),
      );
    assert.deepEqual(rows.find((r) => r.seq === event.seq - 1).bytes, update);
    assert.ok(
      !rows
        .filter((r) => r.kind === 'outbound')
        .some((r) => Buffer.from(r.bytes).toString().includes(Buffer.from(update).toString('hex'))),
    );
    await cold(f);
    await f.page.evaluate(() => {
      Date.now = () => 1900000000000;
    });
    assert.equal((await openReceive(f.page, item)).receivedThrough, 1);
    await f.page.evaluate(() => receiver.compactContent());
    await closeReceive(f.page);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).receivedThrough, 1);
    await closeReceive(f.page);
    await assert.rejects(
      f.page.evaluate(
        (item) => Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item)),
        args(item),
      ),
      /handoff|Spool requires/,
    );
    await f.page.evaluate(await receiveBundle('old-reader'));
    await assert.rejects(openReceive(f.page, item), /Unsupported|Malformed/);
  },
);
for (const side of ['before', 'after'])
  test(
    `receive ${side} commit renderer death recovers content and event together`,
    { timeout: 40000 },
    async (t) => {
      const { f, item, wire, update } = await ready(t, 'cut-' + side),
        q = await request(f.page),
        a = answer(f, item, q, wire);
      await receiveBoundary(f.page, side);
      await f.page.evaluate(
        (b) => {
          window.work = receiver.receivePage(new Uint8Array(b)).then(
            () => 'ready',
            (e) => String(e),
          );
        },
        [...a.bytes],
      );
      await waitPredicate(f.page, () => !!window.hit);
      if (side === 'before')
        assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
      await crash(f);
      await cold(f);
      const rows = await census(f.page, item),
        has = rows.some((r) => Buffer.from(r.bytes).equals(Buffer.from(update)));
      assert.equal(has, side === 'after');
      assert.equal((await openReceive(f.page, item)).receivedThrough, side === 'after' ? 1 : 0);
      const retry = answer(f, item, await request(f.page, 0), wire);
      assert.equal((await receive(f.page, retry.bytes)).recorded, side === 'before');
      await closeReceive(f.page);
    },
  );
for (const side of ['before', 'after'])
  test(`v9 activation ${side} commit is resumable and fences v8`, { timeout: 40000 }, async (t) => {
    const f = await native(t),
      item = await selected(f, 'v9-' + side);
    await boundary(f.page, 'account-receiving', side);
    await f.page.evaluate((item) => {
      window.work = Harness.openOwnedAccountReceiveStore(optionsFor(item)).then(
        () => 'ready',
        (e) => String(e),
      );
    }, args(item));
    await waitPredicate(f.page, () => !!window.hit);
    assert.equal((await snapshot(f.page, item)).marker.v, side === 'after' ? 9 : 8);
    await crash(f);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).receivedThrough, 0);
    await closeReceive(f.page);
  });
for (const fault of ['content', 'event', 'ciphertext'])
  test(`cold replay refuses missing or changed ${fault}`, { timeout: 40000 }, async (t) => {
    const { f, item, wire } = await ready(t, fault),
      a = answer(f, item, await request(f.page), wire);
    await receive(f.page, a.bytes);
    await closeReceive(f.page);
    await census(f.page, item, fault);
    await cold(f);
    const normalError = await refusal(
      openReceive(f.page, item),
      /coverage|incomplete|authentication|decrypt|operation|Operation/i,
    );
    if (fault === 'content') {
      // Startup uses full verification before the receive owner uses reuse. Each guard alone must
      // still reject; only their joint omission exposes the forbidden cold admission.
      const single = [];
      for (const branch of ['reuse', 'fallback']) {
        await f.page.evaluate(await receiveBundle('coverage-without-' + branch));
        single.push({ branch, error: await refusal(openReceive(f.page, item), /coverage/i) });
      }
      await f.page.evaluate(await receiveBundle('coverage'));
      const joint = await openReceive(f.page, item);
      assert.equal(joint.receivedThrough, 1);
      await closeReceive(f.page);
      artifact('control-coverage.json', {
        omitted: ['startup fallback', 'owner reuse'],
        normalError,
        single,
        joint,
        outcome:
          'Removing both executed coverage checks admits an event whose unique remote content row was deleted.',
      });
    }
    if (fault === 'event') {
      await f.page.evaluate(await receiveBundle('witness'));
      const changed = await openReceive(f.page, item);
      assert.equal(changed.receivedThrough, 0);
      await closeReceive(f.page);
      artifact('control-witness.json', {
        normalError,
        changed,
        outcome:
          'Removing actual completeness verification silently loses a receive event and resets receipt progress.',
      });
    }
  });
test(
  'split-content implementation control is rejected on authenticated readback',
  { timeout: 40000 },
  async (t) => {
    const { f, item, wire } = await ready(t, 'split');
    await closeReceive(f.page);
    await f.page.evaluate(await receiveBundle('split'));
    await openReceive(f.page, item);
    const a = answer(f, item, await request(f.page), wire);
    const readbackError = await refusal(receive(f.page, a.bytes), /coverage/);
    await closeReceive(f.page);
    await cold(f);
    const coldError = await refusal(openReceive(f.page, item), /coverage/);
    artifact('control-split.json', {
      readbackError,
      coldError,
      outcome:
        'Actual removal of content inputs commits an evidence-only event, detected by readback and cold replay.',
    });
  },
);
test(
  'pending originals survive compaction and later dependencies without a source capsule',
  { timeout: 40000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'pending');
    const frames = await f.page.evaluate(() => {
      const a = new Harness.Y.Doc({ gc: false }),
        b = new Harness.Y.Doc({ gc: false });
      a.clientID = 901;
      b.clientID = 902;
      a.getText('remote-fixture').insert(0, 'X');
      const dep = Harness.Y.encodeStateAsUpdate(a);
      Harness.Y.applyUpdate(b, dep);
      const sv = Harness.Y.encodeStateVector(b);
      b.getText('remote-fixture').insert(1, 'Y');
      const pending = Harness.Y.encodeStateAsUpdate(b, sv);
      a.destroy();
      b.destroy();
      return [[...pending], [...dep]];
    });
    const wires = [];
    for (let i = 0; i < 2; i++) wires.push(await envelope(f.page, item, i + 1, [frames[i]]));
    await openReceive(f.page, item);
    let previous;
    for (let i = 0; i < 2; i++) {
      const a = answer(f, item, await request(f.page), wires[i], previous, 2);
      previous = a.link;
      await receive(f.page, a.bytes);
      const compact = await f.page.evaluate(() => receiver.compactContent());
      if (i === 0) assert.equal(compact.status, 'retained');
      await closeReceive(f.page);
      await cold(f);
      assert.equal((await openReceive(f.page, item)).receivedThrough, i + 1);
    }
    await closeReceive(f.page);
    const rows = await census(f.page, item);
    const text = await f.page.evaluate((rows) => {
      const d = new Harness.Y.Doc({ gc: false });
      for (const r of rows)
        if (['update', 'state'].includes(r.kind)) Harness.Y.applyUpdate(d, new Uint8Array(r.bytes));
      const text = d.getText('remote-fixture').toString();
      d.destroy();
      return text;
    }, rows);
    assert.equal(text, 'XY');
  },
);
test(
  'a second accepted digest stops receipt and survives cold open',
  { timeout: 40000 },
  async (t) => {
    const { f, item, wire } = await ready(t, 'conflict');
    await closeReceive(f.page);
    const other = await envelope(f.page, item, 1, [[0, 0]]);
    await openReceive(f.page, item);
    await receive(f.page, answer(f, item, await request(f.page), wire).bytes);
    const r = await receive(f.page, answer(f, item, await request(f.page, 0), other).bytes);
    assert.equal(r.kind, 'conflict');
    assert.equal(r.status.state, 'conflict');
    assert.equal(r.status.receivedThrough, 1);
    await assert.rejects(request(f.page), /conflicted/);
    await closeReceive(f.page);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).state, 'conflict');
    await closeReceive(f.page);
  },
);
test(
  'input copies, owned request binding and close drain withhold late crypto results',
  { timeout: 40000 },
  async (t) => {
    const { f, item, wire } = await ready(t, 'close');
    const q = await request(f.page),
      old = answer(f, item, q, wire);
    await request(f.page);
    await assert.rejects(receive(f.page, old.bytes), /request/);
    const a = answer(f, item, await request(f.page), wire);
    await f.page.evaluate(
      (b) => {
        const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async function (alg, key, bytes) {
          const r = await decrypt(alg, key, bytes);
          if (
            alg.additionalData &&
            new TextDecoder().decode(alg.additionalData).includes('done/env/v2')
          ) {
            window.hit = true;
            await new Promise((r) => (window.release = r));
          }
          return r;
        };
        const page = new Uint8Array(b);
        window.work = receiver.receivePage(page).then(
          () => 'ready',
          (e) => String(e),
        );
        page.fill(0);
      },
      [...a.bytes],
    );
    await waitPredicate(f.page, () => !!window.hit);
    await f.page.evaluate((slot) => {
      window.closing = receiver.close();
      window.competed = false;
      window.competitor = navigator.locks.request(Harness.slotPermitName(slot), () => {
        window.competed = true;
      });
    }, item.slotId);
    await waitPredicate(f.page, async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => competed), false);
    await f.page.evaluate(() => release());
    assert.notEqual(await f.page.evaluate(() => work), 'ready');
    await f.page.evaluate(() => closing);
    await f.page.evaluate(() => competitor);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).receivedThrough, 0);
    await closeReceive(f.page);
  },
);
test(
  '12 generated native histories preserve receipt/content together across commit cuts and cold replay',
  { timeout: 180000 },
  async (t) => {
    const f = await native(t),
      histories = [];
    let index = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            cut: fc.constantFrom('none', 'before', 'after'),
            compact: fc.boolean(),
            cold: fc.boolean(),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        async (actions) => {
          const item = await selected(f, 'generated-' + index++),
            frames = await f.page.evaluate((n) => {
              const d = new Harness.Y.Doc({ gc: false });
              d.clientID = 1919;
              const frames = [];
              for (let i = 0; i < n; i++) {
                const sv = Harness.Y.encodeStateVector(d);
                d.getText('remote-fixture').insert(i, String(i));
                frames.push([...Harness.Y.encodeStateAsUpdate(d, sv)]);
              }
              d.destroy();
              return frames;
            }, actions.length),
            wires = [];
          for (let i = 0; i < frames.length; i++)
            wires.push(await envelope(f.page, item, i + 1, [frames[i]]));
          await openReceive(f.page, item);
          let previous;
          const evidence = {
            actions,
            frames: frames.map(hex),
            wires: wires.map(hex),
            observations: [],
            content: null,
            events: null,
            value: null,
            pending: null,
          };
          histories.push(evidence);
          for (const [i, action] of actions.entries()) {
            const query = await request(f.page),
              a = answer(f, item, query, wires[i], previous, frames.length);
            const observed = {
              cutCursor: null,
              request: hex(query),
              page: hex(a.bytes),
              link: a.link,
              result: null,
              status: null,
            };
            if (action.cut === 'none') {
              observed.result = await receive(f.page, a.bytes);
              assert.equal(observed.result.recorded, true);
            } else {
              await receiveBoundary(f.page, action.cut);
              await f.page.evaluate(
                (b) => {
                  window.work = receiver.receivePage(new Uint8Array(b)).then(
                    () => 'ready',
                    (e) => String(e),
                  );
                },
                [...a.bytes],
              );
              await waitPredicate(f.page, () => !!window.hit);
              await crash(f);
              await cold(f);
              observed.cutCursor = (await openReceive(f.page, item)).receivedThrough;
              assert.equal(observed.cutCursor, i + (action.cut === 'after' ? 1 : 0));
              const query = await request(f.page, i),
                retry = answer(f, item, query, wires[i], previous, frames.length);
              observed.result = await receive(f.page, retry.bytes);
              assert.equal(observed.result.recorded, action.cut === 'before');
              if (action.cut === 'before') {
                observed.request = hex(query);
                observed.page = hex(retry.bytes);
              }
            }
            previous = a.link;
            assert.equal((await status(f.page)).receivedThrough, i + 1);
            if (action.compact) await f.page.evaluate(() => receiver.compactContent());
            if (action.cold) {
              await closeReceive(f.page);
              await cold(f);
              assert.equal((await openReceive(f.page, item)).receivedThrough, i + 1);
            }
            observed.status = await status(f.page);
            evidence.observations.push(observed);
            artifact('generated-native.json', {
              seed: 9182026,
              status: 'running',
              runs: histories.length,
              histories,
            });
          }
          await closeReceive(f.page);
          const rows = await census(f.page, item);
          const value = await f.page.evaluate((rows) => {
            const d = new Harness.Y.Doc({ gc: false });
            for (const r of rows)
              if (['update', 'state'].includes(r.kind))
                Harness.Y.applyUpdate(d, new Uint8Array(r.bytes));
            const text = d.getText('remote-fixture').toString(),
              pending = d.store.pendingStructs !== null || d.store.pendingDs !== null;
            d.destroy();
            return { text, pending };
          }, rows);
          evidence.value = value.text;
          evidence.pending = value.pending;
          evidence.content = rows
            .filter((r) => ['update', 'state'].includes(r.kind))
            .map((r) => ({ seq: r.seq, kind: r.kind, bytes: hex(r.bytes) }));
          evidence.events = rows
            .filter(
              (r) =>
                r.kind === 'heads' &&
                Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/v1"'),
            )
            .map((r) => ({ seq: r.seq, bytes: hex(r.bytes) }));
          artifact('generated-native.json', {
            seed: 9182026,
            status: 'running',
            runs: histories.length,
            histories,
          });
          assert.equal(value.text, actions.map((_, i) => String(i)).join(''));
          assert.equal(value.pending, false);
          console.log('Receive history ' + histories.length + '/12 passed');
          await cold(f);
        },
      ),
      { seed: 9182026, numRuns: 12 },
    );
    artifact('generated-native.json', {
      seed: 9182026,
      status: 'passed',
      runs: histories.length,
      histories,
    });
  },
);
for (const mode of ['page', 'baseline'])
  test(
    `cold replay reauthenticates ${mode} behind valid local AEAD and witness`,
    { timeout: 40000 },
    async (t) => {
      const { f, item, wire } = await ready(t, 'reauth-' + mode);
      await receive(f.page, answer(f, item, await request(f.page), wire).bytes);
      await closeReceive(f.page);
      await f.page.evaluate(
        ({ item, mode }) => Harness.rewriteInboundEvidence(item.slotId, item.code, mode),
        { item: args(item), mode },
      );
      await cold(f);
      const normalError = await refusal(
        openReceive(f.page, item),
        mode === 'page' ? /unverified/ : /record/,
      );
      if (mode === 'page') {
        await f.page.evaluate(await receiveBundle('stored-page'));
        const changed = await openReceive(f.page, item);
        assert.equal(changed.receivedThrough, 1);
        await closeReceive(f.page);
        artifact('control-stored-page.json', {
          normalError,
          changed,
          outcome:
            'Actual page-signature removal accepts locally reauthenticated evidence with an invalid service page signature.',
        });
      }
    },
  );
test(
  'batch limit refuses before reservation; quota abort and retry preserve the full 256-record batch',
  { timeout: 40000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'batch');
    const large = await envelope(
        f.page,
        item,
        1,
        Array.from({ length: 256 }, () => [0, 0]),
      ),
      fit = await envelope(
        f.page,
        item,
        1,
        Array.from({ length: 255 }, () => [0, 0]),
      );
    await openReceive(f.page, item);
    const before = await f.page.evaluate(() => Harness.inventory());
    await assert.rejects(
      receive(f.page, answer(f, item, await request(f.page), large).bytes),
      /size/,
    );
    assert.deepEqual(await f.page.evaluate(() => Harness.inventory()), before);
    const a = answer(f, item, await request(f.page), fit);
    await f.page.evaluate(() => {
      window.originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === 'heads') throw new DOMException('fixture quota', 'QuotaExceededError');
        return originalAdd.apply(this, args);
      };
    });
    await assert.rejects(receive(f.page, a.bytes));
    assert.equal((await status(f.page)).receivedThrough, 0);
    await f.page.evaluate(() => {
      IDBObjectStore.prototype.add = originalAdd;
    });
    assert.equal((await receive(f.page, a.bytes)).recorded, true);
    await closeReceive(f.page);
    const rows = await census(f.page, item),
      event = rows.find(
        (r) =>
          r.kind === 'heads' &&
          Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/v1"'),
      );
    assert.equal(
      rows.filter((r) => r.kind === 'update' && r.seq >= event.seq - 255 && r.seq < event.seq)
        .length,
      255,
    );
    await cold(f);
    assert.equal((await openReceive(f.page, item)).receivedThrough, 1);
    await closeReceive(f.page);
  },
);
test(
  'authority changed during sealing refuses before the receive commit',
  { timeout: 40000 },
  async (t) => {
    const { f, item, wire } = await ready(t, 'authority');
    const a = answer(f, item, await request(f.page), wire);
    await f.page.evaluate(
      (b) => {
        const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = async function (alg, key, bytes) {
          const r = await encrypt(alg, key, bytes);
          if (new TextDecoder().decode(bytes).startsWith('["done/account-inbound/v1"')) {
            window.hit = true;
            await new Promise((r) => (window.release = r));
          }
          return r;
        };
        window.work = receiver.receivePage(new Uint8Array(b)).then(
          () => 'ready',
          (e) => String(e),
        );
      },
      [...a.bytes],
    );
    await waitPredicate(f.page, () => !!window.hit);
    await f.page.evaluate((slot) => Harness.changeReceiveFence(slot), item.slotId);
    await f.page.evaluate(() => release());
    assert.match(await f.page.evaluate(() => work), /authentication|authority/i);
    await closeReceive(f.page);
    await f.page.evaluate((slot) => Harness.changeReceiveFence(slot, true), item.slotId);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).receivedThrough, 0);
    await closeReceive(f.page);
  },
);
