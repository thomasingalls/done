import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalBundle } from '../../scripts/lib/historical-bundle.mjs';
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
} from './fixtures.mjs';

async function setup(t, id, bound) {
  const f = await native(t),
    item = await selected(f, id);
  const updates = await f.page.evaluate((bound) => {
    const d = new Harness.Y.Doc({ gc: false }),
      rows = [];
    d.clientID = 8177;
    d.on('update', (b) => rows.push([...b]));
    for (let i = 0; i < 5; i++)
      d.getText('group-test').insert(
        d.getText('group-test').length,
        bound === 'bytes' && i > 0 ? 'x'.repeat(300000) : 'receipt-' + i,
      );
    d.destroy();
    return rows;
  }, bound);
  const wires = [];
  for (let i = 0; i < 5; i++)
    wires.push(
      await envelope(
        f.page,
        item,
        i + 1,
        bound === 'records' && i === 1 ? Array(255).fill(updates[i]) : [updates[i]],
      ),
    );
  await openReceive(f.page, item);
  const first = answer(f, item, await request(f.page), wires[0], undefined, 5);
  await receive(f.page, first.bytes);
  const queries = await prepare(f.page);
  assert.equal(queries.length, 4);
  let previous = first.link;
  const pages = queries.map((q, i) => {
    const result = answer(f, item, q, wires[i + 1], previous, 5);
    previous = result.link;
    return [...result.bytes];
  });
  return { f, item, updates, queries, pages, wires, first };
}
const prepare = (p) => p.evaluate(async () => (await receiver.prepareGroup()).map((b) => [...b]));
const apply = (p, pages, queries) =>
  p.evaluate(
    ({ pages, queries }) =>
      receiver.receiveGroup(
        pages.map((b) => new Uint8Array(b)),
        queries.map((b) => new Uint8Array(b)),
      ),
    { pages, queries },
  );
const start = (p, pages, queries) =>
  p.evaluate(
    ({ pages, queries }) => {
      window.work = receiver
        .receiveGroup(
          pages.map((b) => new Uint8Array(b)),
          queries.map((b) => new Uint8Array(b)),
        )
        .then(
          (v) => v,
          (e) => String(e),
        );
    },
    { pages, queries },
  );

async function oldReader(reference = false) {
  return historicalBundle(
    '534252e1dde26a02020491b2f42e2481513abb98',
    "export { openOwnedAccountReceiveStore } from './src/crdt/accountReceive';",
    reference ? { 'import.meta.env.VITE_ACCOUNT_LEDGER': JSON.stringify('reference') } : {},
  );
}

test(
  'four original receipts commit in one transaction and reopen in the pre-group reference reader',
  { timeout: 60000 },
  async (t) => {
    const { f, item, pages, queries } = await setup(t, 'group-compat');
    await f.page.evaluate(() => {
      const add = IDBObjectStore.prototype.add,
        ids = new WeakMap();
      let id = 0;
      window.groupWrites = [];
      IDBObjectStore.prototype.add = function (value, ...args) {
        if (this.name === 'heads') {
          if (!ids.has(this.transaction)) ids.set(this.transaction, ++id);
          groupWrites.push(ids.get(this.transaction));
        }
        return add.call(this, value, ...args);
      };
    });
    const result = await apply(f.page, pages, queries);
    assert.equal(result.status.receivedThrough, 5);
    assert.deepEqual(result.kinds, Array(4).fill('received'));
    assert.deepEqual(await f.page.evaluate(() => groupWrites), [1, 1, 1, 1]);
    await closeReceive(f.page);
    const rows = await census(f.page, item),
      entries = rows.filter(
        (r) =>
          r.kind === 'heads' &&
          Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/v1"'),
      );
    assert.equal(entries.length, 5);
    for (let i = 1; i < entries.length; i++) {
      const record = JSON.parse(Buffer.from(entries[i].bytes));
      assert.equal(record[11], Buffer.from(queries[i - 1]).toString('hex'));
      assert.equal(record[12], Buffer.from(pages[i - 1]).toString('hex'));
      assert.equal(rows.find((r) => r.seq === entries[i].seq - 1).kind, 'update');
    }
    await cold(f);
    await f.page.evaluate(await oldReader(true));
    assert.equal((await openReceive(f.page, item)).receivedThrough, 5);
    await f.page.evaluate(() => receiver.compactContent());
    await closeReceive(f.page);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).receivedThrough, 5);
    await closeReceive(f.page);
  },
);

for (const side of ['before', 'after'])
  test(
    `group ${side} commit crash keeps all content and receipts atomic`,
    { timeout: 60000 },
    async (t) => {
      const { f, item, pages, queries, wires, first } = await setup(t, 'group-' + side);
      await receiveBoundary(f.page, side);
      await start(f.page, pages, queries);
      await waitPredicate(f.page, () => !!window.hit);
      if (side === 'before')
        assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
      await crash(f);
      await cold(f);
      assert.equal((await openReceive(f.page, item)).receivedThrough, side === 'before' ? 1 : 5);
      if (side === 'before') {
        const fresh = await prepare(f.page);
        let previous = first.link;
        const retry = fresh.map((q, i) => {
          const a = answer(f, item, q, wires[i + 1], previous, 5);
          previous = a.link;
          return [...a.bytes];
        });
        assert.equal((await apply(f.page, retry, fresh)).status.receivedThrough, 5);
      }
      await closeReceive(f.page);
    },
  );

for (const fault of ['invalid-tail', 'reordered', 'superseded'])
  test(
    `group refuses ${fault} without retaining a partial prefix`,
    { timeout: 60000 },
    async (t) => {
      const { f, pages, queries } = await setup(t, 'group-' + fault);
      if (fault === 'invalid-tail') {
        const value = JSON.parse(Buffer.from(pages[3]));
        value[6] = '00'.repeat(64);
        pages[3] = [...Buffer.from(JSON.stringify(value))];
      } else if (fault === 'reordered') [pages[1], pages[2]] = [pages[2], pages[1]];
      else await prepare(f.page);
      await assert.rejects(
        apply(f.page, pages, queries),
        /unverified|request|superseded|Invalid inbound frame/i,
      );
      assert.equal((await status(f.page)).receivedThrough, 1);
      await closeReceive(f.page);
    },
  );

for (const fault of ['expiry', 'authority'])
  test(`group ${fault} during sealing cannot commit`, { timeout: 60000 }, async (t) => {
    const { f, item, pages, queries } = await setup(t, 'group-' + fault);
    await f.page.evaluate(() => {
      const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
      let seen = false;
      crypto.subtle.encrypt = async (alg, key, bytes) => {
        const result = await encrypt(alg, key, bytes);
        if (!seen && new TextDecoder().decode(bytes).startsWith('["done/account-inbound/v1"')) {
          seen = true;
          window.hit = true;
          await new Promise((r) => (window.release = r));
        }
        return result;
      };
    });
    await start(f.page, pages, queries);
    await waitPredicate(f.page, () => !!window.hit);
    if (fault === 'expiry')
      await f.page.evaluate(() => {
        const now = Date.now();
        Date.now = () => now + 31000;
      });
    else await f.page.evaluate((slot) => Harness.changeReceiveFence(slot), item.slotId);
    await f.page.evaluate(() => release());
    assert.match(
      await f.page.evaluate(() => work),
      fault === 'expiry' ? /expired/i : /authentication|authority/i,
    );
    await closeReceive(f.page);
    if (fault === 'authority')
      await f.page.evaluate((slot) => Harness.changeReceiveFence(slot, true), item.slotId);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).receivedThrough, 1);
    await closeReceive(f.page);
  });

for (const bound of ['records', 'bytes'])
  test(
    `group cuts at the ${bound} bound and retains a retryable valid tail`,
    { timeout: 60000 },
    async (t) => {
      const { f, item, pages, queries, wires } = await setup(t, 'group-' + bound, bound);
      const result = await apply(f.page, pages, queries),
        through = result.status.receivedThrough;
      assert.ok(through > 1 && through < 5);
      let link = result.status.link;
      while ((await status(f.page)).receivedThrough < 5) {
        const before = await status(f.page),
          q = await request(f.page);
        const a = answer(f, item, q, wires[before.receivedThrough], before.link, 5);
        link = (await receive(f.page, a.bytes)).status.link;
      }
      assert.notEqual(link, result.status.link);
      await closeReceive(f.page);
      await cold(f);
      assert.equal((await openReceive(f.page, item)).receivedThrough, 5);
      await closeReceive(f.page);
    },
  );

test(
  'group amortizes fresh content-counter reads and transactions while preserving each receipt',
  { timeout: 60000 },
  async (t) => {
    const measured = {};
    for (const mode of ['single', 'group']) {
      const { f, item, wires, first } = await setup(t, 'group-count-' + mode);
      await f.page.evaluate(() => {
        window.groupCounts = { loads: 0, readonly: 0, readwrite: 0, verify: 0 };
        const get = IDBObjectStore.prototype.get,
          tx = IDBDatabase.prototype.transaction,
          verify = crypto.subtle.verify.bind(crypto.subtle);
        IDBObjectStore.prototype.get = function (...args) {
          if (
            this.name === 'meta' &&
            args[0] === 'counter' &&
            this.transaction.db.objectStoreNames.contains('content')
          )
            groupCounts.loads++;
          return get.apply(this, args);
        };
        IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
          groupCounts[mode ?? 'readonly']++;
          return tx.call(this, stores, mode, ...args);
        };
        crypto.subtle.verify = (...args) => {
          groupCounts.verify++;
          return verify(...args);
        };
      });
      if (mode === 'group') {
        const fresh = await prepare(f.page);
        let previous = first.link;
        const group = fresh.map((q, i) => {
          const a = answer(f, item, q, wires[i + 1], previous, 5);
          previous = a.link;
          return [...a.bytes];
        });
        await apply(f.page, group, fresh);
      } else {
        let previous = first.link;
        for (let i = 0; i < 4; i++) {
          const q = await request(f.page),
            a = answer(f, item, q, wires[i + 1], previous, 5);
          previous = a.link;
          await receive(f.page, a.bytes);
        }
      }
      measured[mode] = await f.page.evaluate(() => ({ ...groupCounts }));
      assert.equal((await status(f.page)).receivedThrough, 5);
      await closeReceive(f.page);
    }
    console.log('receive-group-counts', JSON.stringify(measured));
    assert.ok(measured.group.loads < measured.single.loads / 2);
    assert.ok(measured.group.readonly < measured.single.readonly / 2);
    assert.equal(measured.group.readwrite, 2); // reservation and atomic receipt commit
    assert.equal(measured.single.readwrite, 8);
  },
);
