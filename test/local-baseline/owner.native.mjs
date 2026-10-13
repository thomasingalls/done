import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  syncBundle,
  configure,
  args,
  selected,
  syncing,
  settled,
  edit,
  close,
  cold,
  online,
  waitPredicate,
} from '../account-sync/fixtures.mjs';
import { answer } from '../account-receive/fixtures.mjs';

async function setup(t, id) {
  const f = await native(t),
    item = await selected(f, id);
  await syncing(f.page, item);
  await settled(f.page);
  await online(f.page, false);
  return { f, item };
}
const install = (p) => p.evaluate(() => opened.installLocalBaseline());
const durable = (p) => p.evaluate(() => editor.whenDurable());
const history = (p, _item) =>
  p.evaluate(async () => {
    const name = opened.dbName;
    if (!name) throw Error('Missing actual account database name');
    const db = await new Promise((yes, no) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => yes(r.result);
      r.onerror = () => no(r.error);
    });
    try {
      return await new Promise((yes, no) => {
        const tx = db.transaction(['meta', 'content', 'heads', 'outbound'], 'readonly'),
          rows = {};
        for (const name of ['meta', 'content', 'heads', 'outbound']) {
          const store = tx.objectStore(name),
            keys = store.getAllKeys(),
            values = store.getAll();
          values.onsuccess = () => {
            rows[name] = [keys.result, values.result];
          };
        }
        tx.oncomplete = () =>
          yes(JSON.parse(JSON.stringify(rows, (_k, v) => (v instanceof Uint8Array ? [...v] : v))));
        tx.onabort = () => no(tx.error);
      });
    } finally {
      db.close();
    }
  });
const noDeletion = (before, after) => {
  for (const store of ['content', 'heads', 'outbound']) {
    for (let i = 0; i < before[store][0].length; i++) {
      const at = after[store][0].indexOf(before[store][0][i]);
      assert.ok(at >= 0, 'retained history key');
      assert.deepEqual(after[store][1][at], before[store][1][i]);
    }
  }
};
const counter = (h) => h.meta[1][h.meta[0].indexOf('counter')];
const hold = (p, draft = 2) =>
  p.evaluate((draft) => {
    const sign = crypto.subtle.sign.bind(crypto.subtle);
    let once = true;
    crypto.subtle.sign = async (...args) => {
      if (
        once &&
        new TextDecoder()
          .decode(args[2])
          .startsWith(`done/account-local-baseline-auth/draft-${draft}\0`)
      ) {
        once = false;
        window.baselineHeld = true;
        await new Promise((resolve) => {
          window.releaseBaseline = resolve;
        });
      }
      return sign(...args);
    };
  }, draft);
const begin = (p) =>
  p.evaluate(() => {
    window.installWork = opened.installLocalBaseline().then(
      (r) => r,
      (e) => ({ error: e.message }),
    );
  });

test(
  'actual Account installs without deletion, preserves undo, appends under v3, and cold reopens',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'baseline-owner');
    const original = await f.page.evaluate(() => editor.read().master);
    await edit(f.page, 0, 0, 'UNDO ACROSS ANCHOR ');
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const before = await history(f.page, item);
    assert.deepEqual(await install(f.page), { kind: 'installed' });
    const anchored = await history(f.page, item);
    noDeletion(before, anchored);
    assert.equal(counter(anchored).v, 3);
    assert.deepEqual(await install(f.page), { kind: 'already-installed' });
    await f.page.evaluate(async () => {
      await editor.command({ kind: 'undo' }).accepted;
    });
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(async () => {
      await editor.command({ kind: 'redo' }).accepted;
    });
    assert.equal(
      await f.page.evaluate(() => editor.read().master),
      'UNDO ACROSS ANCHOR ' + original,
    );
    await edit(f.page, 0, 0, 'AFTER ANCHOR ');
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const after = await history(f.page, item);
    noDeletion(anchored, after);
    assert.equal(counter(after).v, 3);
    assert.deepEqual(counter(after).baseline, counter(anchored).baseline);
    assert.ok(counter(after).next_seq > counter(anchored).next_seq);
    assert.equal((await f.page.evaluate(() => opened.compactContent())).status, 'retained');
    noDeletion(after, await history(f.page, item));
    const expected = await f.page.evaluate(() => editor.read().master);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), expected);
    assert.deepEqual(await install(f.page), { kind: 'already-installed' });
    await close(f.page);
  },
);

test(
  'admission fences input during anchoring; the later edit is journalled before apply and remains undoable',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'baseline-fence');
    const original = await f.page.evaluate(() => editor.read().master);
    await hold(f.page);
    await begin(f.page);
    await waitPredicate(f.page, () => window.baselineHeld);
    await f.page.evaluate(() => {
      window.appliedInput = false;
      const original = editor.read().master,
        set = Storage.prototype.setItem;
      window.journalBeforeApplySeen = false;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('done.pending-update.'))
          journalBeforeApplySeen ||= editor.read().master === original;
        return set.call(this, key, value);
      };
      window.inputWork = surface
        .input(
          { name: 'insert', text: 'QUEUED INPUT ' },
          { ranges: [{ anchor: 0, head: 0 }], main: 0 },
        )
        .accepted.then(() => {
          appliedInput = true;
        });
    });
    assert.equal(await f.page.evaluate(() => window.appliedInput), false);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    assert.equal(counter(await history(f.page, item)).v, 2);
    await f.page.evaluate(() => releaseBaseline());
    assert.deepEqual(await f.page.evaluate(() => installWork), { kind: 'installed' });
    await f.page.evaluate(() => inputWork);
    assert.equal(await f.page.evaluate(() => journalBeforeApplySeen), true);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'QUEUED INPUT ' + original);
    await durable(f.page);
    await f.page.evaluate(async () => {
      await editor.command({ kind: 'undo' }).accepted;
    });
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await durable(f.page);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await close(f.page);
  },
);

test(
  'retained journal cleanup refuses installation, with every original history row intact',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'baseline-journal');
    const before = await history(f.page, item);
    await f.page.evaluate(() => {
      const remove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (key.startsWith('done.pending-update.')) throw Error('test retained journal');
        return remove.call(this, key);
      };
    });
    await edit(f.page, 0, 0, 'DURABLE JOURNAL ');
    assert.deepEqual(await install(f.page), { kind: 'skipped', reason: 'activity-or-journal' });
    const after = await history(f.page, item);
    noDeletion(before, after);
    assert.equal(counter(after).v, 2);
    assert.ok(
      await f.page.evaluate(() =>
        Object.keys(localStorage).some((k) => k.startsWith('done.pending-update.')),
      ),
    );
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    assert.ok((await f.page.evaluate(() => editor.read().master)).startsWith('DURABLE JOURNAL '));
    await close(f.page);
  },
);

test(
  'lost final reply after native anchor commit cold-recovers and retry does not reserve again',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'baseline-lost-reply');
    const before = await history(f.page, item);
    await f.page.evaluate(() => {
      const put = IDBObjectStore.prototype.put,
        marked = new WeakSet();
      IDBObjectStore.prototype.put = function (value, ...args) {
        if (this.name === 'meta' && args[0] === 'counter' && value.v === 3)
          marked.add(this.transaction);
        return put.call(this, value, ...args);
      };
      const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
        ...d,
        set(fn) {
          d.set.call(this, function (event) {
            if (marked.has(this)) window.anchorCommitHeld = true;
            else fn.call(this, event);
          });
        },
      });
    });
    await begin(f.page);
    await waitPredicate(f.page, () => window.anchorCommitHeld);
    const cdp = await f.context.newCDPSession(f.page),
      crashed = f.page.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await crashed;
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    const after = await history(f.page, item);
    noDeletion(before, after);
    assert.equal(counter(after).v, 3);
    assert.deepEqual(await install(f.page), { kind: 'already-installed' });
    assert.deepEqual(await history(f.page, item), after);
    await close(f.page);
  },
);

for (const damage of ['chunk', 'counter', 'old-history'])
  test(
    `cold Account reader refuses ${damage} damage instead of ignoring its durable baseline`,
    { timeout: 90000 },
    async (t) => {
      const { f, item } = await setup(t, 'baseline-damage-' + damage);
      assert.deepEqual(await install(f.page), { kind: 'installed' });
      const name = await f.page.evaluate(() => opened.dbName);
      await close(f.page);
      await f.page.evaluate(
        async ({ name, damage }) => {
          const db = await new Promise((yes, no) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => yes(r.result);
            r.onerror = () => no(r.error);
          });
          try {
            await new Promise((yes, no) => {
              const store = damage === 'old-history' ? 'content' : 'meta',
                tx = db.transaction(store, 'readwrite');
              const s = tx.objectStore(store),
                r =
                  damage === 'old-history'
                    ? s.openCursor()
                    : s.get(damage === 'chunk' ? ['local-baseline', 0] : 'counter');
              r.onsuccess = () => {
                if (damage === 'old-history') {
                  const c = r.result,
                    v = c.value;
                  v.ct[0] ^= 1;
                  c.update(v);
                } else {
                  const v = r.result;
                  (damage === 'chunk' ? v.ct : v.mac)[0] ^= 1;
                  s.put(v, damage === 'chunk' ? ['local-baseline', 0] : 'counter');
                }
              };
              tx.oncomplete = yes;
              tx.onabort = () => no(tx.error);
            });
          } finally {
            db.close();
          }
        },
        { name, damage },
      );
      await cold(f);
      await assert.rejects(syncing(f.page, item), /authentication|repair|corrupt|failed/i);
    },
  );

test(
  'fresh authority change during candidate preparation refuses before installing or deleting history',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'baseline-authority');
    const before = await history(f.page, item);
    await hold(f.page);
    await begin(f.page);
    await waitPredicate(f.page, () => window.baselineHeld);
    await f.page.evaluate(async (slot) => {
      const db = await new Promise((yes, no) => {
        const r = indexedDB.open('done.custody');
        r.onsuccess = () => yes(r.result);
        r.onerror = () => no(r.error);
      });
      try {
        await new Promise((yes, no) => {
          const tx = db.transaction('entries', 'readwrite');
          tx.objectStore('entries').put({}, [slot, 'local-clear-v1']);
          tx.oncomplete = yes;
          tx.onabort = () => no(tx.error);
        });
      } finally {
        db.close();
      }
      releaseBaseline();
    }, item.slotId);
    // Integrity/authority errors deliberately keep the FIFO ticket pending while admission is
    // blocked. Observe that refusal, then close to settle the ticket; do not await it first.
    await waitPredicate(f.page, () => editor.status.state === 'blocked');
    assert.deepEqual(await history(f.page, item), before);
    await close(f.page);
    assert.ok((await f.page.evaluate(() => installWork)).error);
  },
);

test(
  'closing during installation retains exclusion until crypto settles and installs no late anchor',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'baseline-close');
    await hold(f.page);
    await begin(f.page);
    await waitPredicate(f.page, () => window.baselineHeld);
    const contender = await f.context.newPage();
    await f.setup(contender);
    await contender.evaluate((item) => {
      window.acquired = false;
      window.contenderWork = openSync(item).then(() => {
        acquired = true;
      });
    }, args(item));
    await f.page.evaluate(() => {
      window.closeDone = false;
      window.closing = editor.close().then(() => {
        closeDone = true;
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(await f.page.evaluate(() => closeDone), false);
    assert.equal(await contender.evaluate(() => acquired), false);
    await f.page.evaluate(() => releaseBaseline());
    assert.ok((await f.page.evaluate(() => installWork)).error);
    await f.page.evaluate(() => closing);
    assert.equal(counter(await history(f.page, item)).v, 2);
    await waitPredicate(contender, () => acquired);
    await settled(contender);
    await online(contender, false);
    assert.deepEqual(await install(contender), { kind: 'installed' });
    await close(contender);
    await contender.close();
  },
);

test(
  'ordinary Account workspace exposes no installer',
  { timeout: 90000, skip: process.env.ACCOUNT_BASELINE_INSTALL === '1' },
  async (t) => {
    const { f } = await setup(t, 'baseline-disabled');
    assert.equal(await f.page.evaluate(() => 'installLocalBaseline' in opened), false);
    assert.equal(await f.page.evaluate(() => 'replaceLocalBaseline' in opened), false);
    assert.equal(await f.page.evaluate(() => 'advanceLocalRetention' in opened), false);
    assert.equal(await f.page.evaluate(() => 'dryRunLocalRetention' in opened), false);
    await edit(f.page, 0, 0, 'ORDINARY INPUT ');
    await durable(f.page);
    assert.ok((await f.page.evaluate(() => editor.read().master)).startsWith('ORDINARY INPUT '));
    await close(f.page);
  },
);

for (const era of [false, true])
  test(
    `ordinary Account opener refuses an anchored ${era ? 'v4 era' : 'v3'} profile without mutations; the private reader can reopen it`,
    { timeout: 90000 },
    async (t) => {
      const enabled = process.env.ACCOUNT_BASELINE_INSTALL;
      let ordinary;
      try {
        delete process.env.ACCOUNT_BASELINE_INSTALL;
        ordinary = await syncBundle();
      } finally {
        process.env.ACCOUNT_BASELINE_INSTALL = enabled;
      }
      const { f, item } = await setup(t, 'baseline-reader-fence-' + era);
      assert.deepEqual(await install(f.page), { kind: 'installed' });
      if (era) assert.deepEqual(await advance(f.page, 1), { kind: 'replaced' });
      const before = await history(f.page, item);
      await close(f.page);
      await f.page.evaluate(ordinary);
      await configure(f.page, f.testOperatorToken);
      await assert.rejects(syncing(f.page, item), /unknown-content-metadata|reader|required/i);
      assert.deepEqual(await history(f.page, item), before);
      await cold(f);
      await syncing(f.page, item);
      assert.deepEqual(await install(f.page), { kind: 'already-installed' });
      await close(f.page);
    },
  );

test(
  'replacement fences input, preserves undo and retries its expected revision without allocating again',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'baseline-replacement');
    assert.deepEqual(await install(f.page), { kind: 'installed' });
    await edit(f.page, 0, 0, 'BEFORE REPLACEMENT ');
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const before = await history(f.page, item),
      original = await f.page.evaluate(() => editor.read().master);
    await hold(f.page);
    await f.page.evaluate(() => {
      window.replaceWork = opened.replaceLocalBaseline(1);
    });
    await waitPredicate(f.page, () => window.baselineHeld);
    await f.page.evaluate(() => {
      window.inputWork = surface.input(
        { name: 'insert', text: 'AFTER REPLACEMENT ' },
        { ranges: [{ anchor: 0, head: 0 }], main: 0 },
      ).accepted;
    });
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(() => releaseBaseline());
    assert.deepEqual(await f.page.evaluate(() => replaceWork), { kind: 'replaced' });
    await f.page.evaluate(() => inputWork);
    assert.equal(
      await f.page.evaluate(() => editor.read().master),
      'AFTER REPLACEMENT ' + original,
    );
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    await durable(f.page);
    const after = await history(f.page, item);
    noDeletion(before, after);
    assert.equal(counter(after).baseline.revision, 2);
    const expected = await f.page.evaluate(() => editor.read().master);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    await online(f.page, false);
    assert.equal(await f.page.evaluate(() => editor.read().master), expected);
    const reopened = await history(f.page, item);
    assert.deepEqual(await f.page.evaluate(() => opened.replaceLocalBaseline(1)), {
      kind: 'already-installed',
    });
    assert.deepEqual(await history(f.page, item), reopened);
    await close(f.page);
  },
);

for (const boundary of ['reserved', 'committed'])
  test(
    `replacement renderer death after ${boundary} preserves a usable authenticated anchor`,
    { timeout: 90000 },
    async (t) => {
      const { f, item } = await setup(t, 'baseline-replacement-death-' + boundary);
      await install(f.page);
      const before = await history(f.page, item);
      await f.page.evaluate((boundary) => {
        const put = IDBObjectStore.prototype.put,
          marked = new WeakSet();
        IDBObjectStore.prototype.put = function (value, ...args) {
          if (
            this.name === 'meta' &&
            args[0] === 'counter' &&
            value.v === 3 &&
            value.baseline.revision === (boundary === 'reserved' ? 1 : 2)
          )
            marked.add(this.transaction);
          return put.call(this, value, ...args);
        };
        const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
        Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
          ...descriptor,
          set(fn) {
            descriptor.set.call(this, function (event) {
              if (marked.has(this)) window.replacementCommitHeld = true;
              else fn.call(this, event);
            });
          },
        });
        window.replacementWork = opened
          .replaceLocalBaseline(1)
          .catch((e) => ({ error: e.message }));
      }, boundary);
      await waitPredicate(f.page, () => window.replacementCommitHeld);
      const cdp = await f.context.newCDPSession(f.page),
        crashed = f.page.waitForEvent('crash');
      void cdp.send('Page.crash').catch(() => {});
      await crashed;
      await cold(f);
      await syncing(f.page, item);
      await settled(f.page);
      await online(f.page, false);
      const reopened = await history(f.page, item);
      noDeletion(before, reopened);
      assert.equal(counter(reopened).baseline.revision, boundary === 'committed' ? 2 : 1);
      assert.ok(counter(reopened).next_seq > counter(before).next_seq);
      assert.deepEqual(await f.page.evaluate(() => opened.replaceLocalBaseline(1)), {
        kind: boundary === 'committed' ? 'already-installed' : 'replaced',
      });
      if (boundary === 'committed') assert.deepEqual(await history(f.page, item), reopened);
      await close(f.page);
    },
  );

test(
  'the separate v9 receive-store reader opens a replaced anchor without changing history',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'baseline-receive-reader');
    await install(f.page);
    await f.page.evaluate(() => opened.replaceLocalBaseline(1));
    if (process.env.ACCOUNT_BASELINE_READ === '1') await advance(f.page, 2);
    const before = await history(f.page, item);
    const accepted = await f.page.evaluate(
      async () => (await opened.deliveryStatus()).acceptedThrough,
    );
    await close(f.page);
    const receiving = await f.page.evaluate(async (item) => {
      const receiver = await Harness.openOwnedAccountReceiveStore(optionsFor(item));
      try {
        await receiver.prepareRead();
        return (await receiver.status()).receivedThrough;
      } finally {
        await receiver.close();
      }
    }, args(item));
    if (process.env.ACCOUNT_BASELINE_READ === '1') assert.equal(receiving, accepted);
    assert.deepEqual(await history(f.page, item), before);
  },
);

const advance = (p, revision) => p.evaluate((r) => opened.advanceLocalRetention(r), revision);
const journalEntries = (p) =>
  p.evaluate(() =>
    Object.entries(localStorage).filter(([k]) => k.startsWith('done.pending-update.')),
  );

test(
  'era boundary rejects late signed reads, retains all rows and preserves journal-before-apply and undo',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'era-owner');
    await close(f.page);
    await f.page.evaluate(await syncBundle('retention-owner'));
    await configure(f.page, f.testOperatorToken);
    await syncing(f.page, item);
    await online(f.page, false);
    await install(f.page);
    const query = await f.page.evaluate(async () => [...(await retentionTestOwner.prepareRead())]);
    const late = answer(f, item, query).bytes;
    const before = await history(f.page, item),
      text = await f.page.evaluate(() => editor.read().master);
    assert.deepEqual(await advance(f.page, 1), { kind: 'replaced' });
    const anchored = await history(f.page, item),
      era = counter(anchored).baseline.journalEra;
    assert.equal(counter(anchored).v, 4);
    assert.equal(era.revision, 2);
    assert.equal(era.previous, null);
    noDeletion(before, anchored);
    await assert.rejects(
      f.page.evaluate((b) => retentionTestOwner.receivePage(new Uint8Array(b)), [...late]),
      /authority|changed|superseded/i,
    );
    assert.deepEqual(await history(f.page, item), anchored);
    const fresh = await f.page.evaluate(async () => [...(await retentionTestOwner.prepareRead())]);
    const ok = answer(f, item, fresh).bytes;
    assert.equal(
      (await f.page.evaluate((b) => retentionTestOwner.receivePage(new Uint8Array(b)), [...ok]))
        .kind,
      'empty',
    );
    await f.page.evaluate(() => {
      const set = Storage.prototype.setItem,
        initial = editor.read().master;
      window.eraJournalBeforeApply = false;
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith('done.pending-update.'))
          window.eraJournalBeforeApply ||= editor.read().master === initial;
        return set.call(this, k, v);
      };
    });
    await edit(f.page, 0, 0, 'ERA JOURNAL ');
    assert.equal(await f.page.evaluate(() => eraJournalBeforeApply), true);
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), text);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    await durable(f.page);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'ERA JOURNAL ' + text);
    const reopened = await history(f.page, item);
    assert.deepEqual(await advance(f.page, 1), { kind: 'already-installed' });
    assert.deepEqual(await history(f.page, item), reopened);
    assert.deepEqual(await f.page.evaluate(() => opened.replaceLocalBaseline(2)), {
      kind: 'replaced',
    });
    assert.deepEqual(counter(await history(f.page, item)).baseline.journalEra, era);
    const unchanged = await history(f.page, item);
    await assert.rejects(advance(f.page, 2), /not an era transition|Admission closed/);
    assert.deepEqual(await history(f.page, item), unchanged);
    await close(f.page);
  },
);

for (const boundary of ['reserved', 'committed'])
  test(
    `era renderer death after ${boundary} has an exact, idempotent retry`,
    { timeout: 90000 },
    async (t) => {
      const { f, item } = await setup(t, 'era-crash-' + boundary);
      await install(f.page);
      const before = await history(f.page, item);
      await f.page.evaluate((boundary) => {
        const put = IDBObjectStore.prototype.put,
          marked = new WeakSet();
        IDBObjectStore.prototype.put = function (value, ...args) {
          if (
            this.name === 'meta' &&
            args[0] === 'counter' &&
            value.baseline?.revision === (boundary === 'reserved' ? 1 : 2)
          )
            marked.add(this.transaction);
          return put.call(this, value, ...args);
        };
        const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
        Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
          ...d,
          set(fn) {
            d.set.call(this, function (e) {
              if (marked.has(this)) window.eraCommitHeld = true;
              else fn.call(this, e);
            });
          },
        });
        window.eraWork = opened.advanceLocalRetention(1).catch((e) => ({ error: e.message }));
      }, boundary);
      await waitPredicate(f.page, () => window.eraCommitHeld);
      const cdp = await f.context.newCDPSession(f.page),
        crashed = f.page.waitForEvent('crash');
      void cdp.send('Page.crash').catch(() => {});
      await crashed;
      await cold(f);
      await syncing(f.page, item);
      await settled(f.page);
      await online(f.page, false);
      const reopened = await history(f.page, item);
      noDeletion(before, reopened);
      assert.equal(counter(reopened).v, boundary === 'reserved' ? 3 : 4);
      assert.deepEqual(await advance(f.page, 1), {
        kind: boundary === 'reserved' ? 'replaced' : 'already-installed',
      });
      if (boundary === 'committed') assert.deepEqual(await history(f.page, item), reopened);
      await close(f.page);
    },
  );

for (const direction of ['old-journal', 'old-database'])
  test(
    `restored ${direction} across an era is refused with every byte preserved`,
    { timeout: 90000 },
    async (t) => {
      const { f, item } = await setup(t, 'era-pair-' + direction);
      await install(f.page);
      await advance(f.page, 1);
      const saveJournal = async (text) => {
        await f.page.evaluate(() => {
          window.savedRemove = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function (k) {
            if (k.startsWith('done.pending-update.')) throw Error('retain fixture journal');
            return savedRemove.call(this, k);
          };
        });
        await edit(f.page, 0, 0, text);
        await assert.rejects(durable(f.page), /cleanup/);
        const pairs = await journalEntries(f.page);
        assert.ok(pairs.length);
        await f.page.evaluate(() => {
          Storage.prototype.removeItem = savedRemove;
        });
        await f.page.evaluate(() => editor.retry());
        await durable(f.page);
        await online(f.page, true);
        await settled(f.page);
        await online(f.page, false);
        return pairs;
      };
      const oldJournal = await saveJournal('OLD ERA ');
      const name = await f.page.evaluate(() => opened.dbName);
      const oldDisk = await f.page.evaluate(async (name) => {
        const db = await new Promise((yes, no) => {
          const r = indexedDB.open(name);
          r.onsuccess = () => yes(r.result);
          r.onerror = () => no(r.error);
        });
        try {
          return await new Promise((yes, no) => {
            const tx = db.transaction(['meta', 'content', 'heads', 'outbound'], 'readonly'),
              rows = {};
            for (const n of ['meta', 'content', 'heads', 'outbound']) {
              const s = tx.objectStore(n),
                k = s.getAllKeys(),
                v = s.getAll();
              v.onsuccess = () => {
                rows[n] = [k.result, v.result];
              };
            }
            tx.oncomplete = () =>
              yes(
                JSON.stringify(rows, (_k, v) => (v instanceof Uint8Array ? { $bytes: [...v] } : v)),
              );
            tx.onabort = () => no(tx.error);
          });
        } finally {
          db.close();
        }
      }, name);
      assert.deepEqual(await advance(f.page, 2), { kind: 'replaced' });
      const newJournal = await saveJournal('NEW ERA ');
      await close(f.page);
      await f.page.evaluate(
        async ({ name, disk, journal }) => {
          if (disk) {
            const rows = JSON.parse(disk, (_k, v) => (v?.$bytes ? new Uint8Array(v.$bytes) : v));
            const db = await new Promise((yes, no) => {
              const r = indexedDB.open(name);
              r.onsuccess = () => yes(r.result);
              r.onerror = () => no(r.error);
            });
            try {
              await new Promise((yes, no) => {
                const tx = db.transaction(['meta', 'content', 'heads', 'outbound'], 'readwrite');
                for (const [n, [keys, values]] of Object.entries(rows)) {
                  const s = tx.objectStore(n);
                  s.clear();
                  keys.forEach((k, i) => s.put(values[i], k));
                }
                tx.oncomplete = yes;
                tx.onabort = () => no(tx.error);
              });
            } finally {
              db.close();
            }
          }
          for (const [k, v] of journal) localStorage.setItem(k, v);
        },
        {
          name,
          disk: direction === 'old-database' ? oldDisk : null,
          journal: direction === 'old-database' ? newJournal : oldJournal,
        },
      );
      const diskBefore = await history(f.page, item),
        journalsBefore = await journalEntries(f.page);
      await cold(f);
      await assert.rejects(syncing(f.page, item), /pairing/);
      // history helper uses the previous owner's name; failed open deliberately never publishes a new owner.
      await f.page.evaluate((name) => {
        window.opened = { dbName: name };
      }, name);
      assert.deepEqual(await history(f.page, item), diskBefore);
      assert.deepEqual(await journalEntries(f.page), journalsBefore);
    },
  );

for (const boundary of ['journal-only', 'committed-before-cleanup'])
  test(
    `era journal renderer death at ${boundary} replays exact originals once`,
    { timeout: 90000 },
    async (t) => {
      const { f, item } = await setup(t, 'era-journal-death-' + boundary);
      await install(f.page);
      await advance(f.page, 1);
      const original = await f.page.evaluate(() => editor.read().master);
      await f.page.evaluate((boundary) => {
        if (boundary === 'journal-only') {
          crypto.subtle.encrypt = async () => {
            window.eraFlushHeld = true;
            return new Promise(() => {});
          };
        } else {
          const remove = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function (k) {
            if (k.startsWith('done.pending-update.')) {
              window.eraFlushHeld = true;
              throw Error('retained after commit');
            }
            return remove.call(this, k);
          };
        }
      }, boundary);
      await edit(f.page, 0, 0, 'ERA CRASH ');
      if (boundary === 'committed-before-cleanup') await assert.rejects(durable(f.page), /cleanup/);
      else
        await f.page.evaluate(() => {
          void editor.whenDurable().catch(() => {});
        });
      await waitPredicate(f.page, () => window.eraFlushHeld);
      assert.ok((await journalEntries(f.page)).length);
      const before = await history(f.page, item);
      const cdp = await f.context.newCDPSession(f.page),
        crashed = f.page.waitForEvent('crash');
      void cdp.send('Page.crash').catch(() => {});
      await crashed;
      await cold(f);
      await online(f.page, false);
      await syncing(f.page, item);
      assert.equal(await f.page.evaluate(() => editor.read().master), 'ERA CRASH ' + original);
      const after = await history(f.page, item);
      noDeletion(before, after);
      if (boundary === 'committed-before-cleanup')
        assert.deepEqual(after.outbound, before.outbound);
      assert.deepEqual(await journalEntries(f.page), []);
      await close(f.page);
    },
  );

test(
  'private reduced cold/live owners hide accepted originals, continue absolute positions, and preserve undo and journal-before-apply',
  { timeout: 90000, skip: process.env.ACCOUNT_BASELINE_READ !== '1' },
  async (t) => {
    const { f, item } = await setup(t, 'logical-owner');
    const prefix = await f.page.evaluate(async () => ({
      captures: (await opened.listCaptures()).length,
      positions: (await opened.spoolStatus()).positions.length,
      accepted: (await opened.deliveryStatus()).acceptedThrough,
    }));
    assert.ok(prefix.captures > 0 && prefix.positions > 0);
    await install(f.page);
    await advance(f.page, 1);
    const before = await history(f.page, item);
    assert.equal(await f.page.evaluate(async () => (await opened.listCaptures()).length), 0);
    assert.deepEqual(await f.page.evaluate(async () => (await opened.spoolStatus()).positions), []);
    assert.equal(
      await f.page.evaluate(async () => (await opened.deliveryStatus()).acceptedThrough),
      prefix.accepted,
    );
    const original = await f.page.evaluate(() => editor.read().master);
    await f.page.evaluate(() => {
      const text = editor.read().master,
        set = Storage.prototype.setItem;
      window.logicalJournalBeforeApply = false;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('done.pending-update.'))
          logicalJournalBeforeApply ||= editor.read().master === text;
        return set.call(this, key, value);
      };
    });
    await edit(f.page, 0, 0, 'LOGICAL SUFFIX ');
    assert.equal(await f.page.evaluate(() => logicalJournalBeforeApply), true);
    await f.page.evaluate(async () => {
      await editor.command({ kind: 'undo' }).accepted;
    });
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(async () => {
      await editor.command({ kind: 'redo' }).accepted;
    });
    assert.equal(await f.page.evaluate(() => editor.read().master), 'LOGICAL SUFFIX ' + original);
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const positions = await f.page.evaluate(async () => (await opened.spoolStatus()).positions);
    assert.equal(positions[0].position, prefix.accepted + 1);
    noDeletion(before, await history(f.page, item));
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'LOGICAL SUFFIX ' + original);
    const reads = await f.page.evaluate(() => baselineReadSamples);
    assert.ok(
      reads.length >= 2,
      'cold classification and live recovery both used the logical reader',
    );
    assert.ok(reads.every((r) => r.logical < r.physical && r.firstSuffix > 1));
    assert.ok(
      (await f.page.evaluate(async () => (await opened.spoolStatus()).positions)).every(
        (p) => p.position > prefix.accepted,
      ),
    );
    await close(f.page);
  },
);

const dryPlan = (p) => p.evaluate(() => opened.dryRunLocalRetention());
const beginPlan = (p) =>
  p.evaluate(() => {
    window.planWork = opened
      .dryRunLocalRetention()
      .catch((e) => ({ error: e.message }))
      .then((r) => {
        window.planOutcome = r;
        return r;
      });
  });
const dryOptions = { timeout: 90000, skip: process.env.ACCOUNT_BASELINE_READ !== '1' };
test(
  'exact dry run is read-only before/after anchoring and empty-suffix rebase; old reads retire and undo survives',
  dryOptions,
  async (t) => {
    const { f, item } = await setup(t, 'plan-owner');
    await close(f.page);
    await f.page.evaluate(await syncBundle('retention-owner'));
    await configure(f.page, f.testOperatorToken);
    await syncing(f.page, item);
    await online(f.page, false);
    const original = await f.page.evaluate(() => editor.read().master);
    await edit(f.page, 0, 0, 'PLAN UNDO ');
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    for (const revision of [0, 1, 2]) {
      const before = await history(f.page, item),
        text = await f.page.evaluate(() => editor.read().master);
      const query = await f.page.evaluate(async () => [
        ...(await retentionTestOwner.prepareRead()),
      ]);
      const late = answer(f, item, query).bytes;
      // Throw before any product storage mutation, including reservations or chunk replacement.
      await f.page.evaluate(() => {
        const transaction = IDBDatabase.prototype.transaction;
        window.restorePlanGuard = () => {
          IDBDatabase.prototype.transaction = transaction;
        };
        IDBDatabase.prototype.transaction = function (names, mode, ...rest) {
          if (this.name === opened.dbName && mode === 'readwrite')
            throw Error('Dry run attempted a write');
          return transaction.call(this, names, mode, ...rest);
        };
      });
      let report;
      try {
        report = await dryPlan(f.page);
      } finally {
        await f.page.evaluate(() => restorePlanGuard());
      }
      assert.equal(report.kind, 'planned');
      assert.equal(report.previousRevision, revision);
      assert.equal(report.revision, revision + 1);
      assert.equal(report.survivors, 0);
      assert.equal(
        report.rows,
        ['content', 'heads', 'outbound'].reduce((n, s) => n + before[s][0].length, 0),
      );
      assert.deepEqual(await history(f.page, item), before);
      assert.deepEqual(await journalEntries(f.page), []);
      assert.equal(await f.page.evaluate(() => editor.read().master), text);
      await assert.rejects(
        f.page.evaluate((b) => retentionTestOwner.receivePage(new Uint8Array(b)), [...late]),
        /authority|changed|superseded/i,
      );
      const fresh = await f.page.evaluate(async () => [
        ...(await retentionTestOwner.prepareRead()),
      ]);
      const reply = answer(f, item, fresh).bytes;
      assert.equal(
        (
          await f.page.evaluate(
            (b) => retentionTestOwner.receivePage(new Uint8Array(b)),
            [...reply],
          )
        ).kind,
        'empty',
      );
      if (revision === 0) assert.equal((await install(f.page)).kind, 'installed');
      if (revision === 1) assert.equal((await advance(f.page, 1)).kind, 'replaced');
    }
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'PLAN UNDO ' + original);
    await durable(f.page);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'PLAN UNDO ' + original);
    await close(f.page);
  },
);

test(
  'dry-run admission fences later input, keeps journal-before-apply and undo, and makes no era change',
  dryOptions,
  async (t) => {
    const { f, item } = await setup(t, 'plan-input');
    const original = await f.page.evaluate(() => editor.read().master),
      before = await history(f.page, item);
    await hold(f.page, 3);
    await beginPlan(f.page);
    await waitPredicate(f.page, () => window.baselineHeld);
    await f.page.evaluate(() => {
      const original = editor.read().master,
        set = Storage.prototype.setItem;
      window.planJournalBeforeApply = false;
      window.planInputApplied = false;
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith('done.pending-update.'))
          planJournalBeforeApply ||= editor.read().master === original;
        return set.call(this, k, v);
      };
      window.planInput = surface
        .input(
          { name: 'insert', text: 'AFTER PLAN ' },
          { ranges: [{ anchor: 0, head: 0 }], main: 0 },
        )
        .accepted.then(() => {
          planInputApplied = true;
        });
    });
    assert.equal(await f.page.evaluate(() => planInputApplied), false);
    assert.deepEqual(await history(f.page, item), before);
    await f.page.evaluate(() => releaseBaseline());
    assert.equal((await f.page.evaluate(() => planWork)).kind, 'planned');
    await f.page.evaluate(() => planInput);
    assert.equal(await f.page.evaluate(() => planJournalBeforeApply), true);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'AFTER PLAN ' + original);
    await durable(f.page);
    assert.equal(counter(await history(f.page, item)).v, 2);
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await close(f.page);
  },
);

test(
  'dry run with a retained journal refuses at durability barrier and preserves the original for cold recovery',
  dryOptions,
  async (t) => {
    const { f, item } = await setup(t, 'plan-journal');
    await f.page.evaluate(() => {
      const remove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (k) {
        if (k.startsWith('done.pending-update.')) throw Error('retained journal');
        return remove.call(this, k);
      };
    });
    await edit(f.page, 0, 0, 'PLAN JOURNAL ');
    await assert.rejects(dryPlan(f.page), /journal cleanup/);
    assert.ok((await journalEntries(f.page)).length);
    assert.equal(counter(await history(f.page, item)).v, 2);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    assert.ok((await f.page.evaluate(() => editor.read().master)).startsWith('PLAN JOURNAL '));
    await close(f.page);
  },
);

test(
  'dry run refuses a fresh authority change during crypto before reporting a plan',
  dryOptions,
  async (t) => {
    const { f, item } = await setup(t, 'plan-authority'),
      before = await history(f.page, item);
    await hold(f.page, 3);
    await beginPlan(f.page);
    await waitPredicate(f.page, () => window.baselineHeld);
    await f.page.evaluate(async (slot) => {
      const db = await new Promise((yes, no) => {
        const r = indexedDB.open('done.custody');
        r.onsuccess = () => yes(r.result);
        r.onerror = () => no(r.error);
      });
      try {
        await new Promise((yes, no) => {
          const tx = db.transaction('entries', 'readwrite');
          tx.objectStore('entries').put({}, [slot, 'local-clear-v1']);
          tx.oncomplete = yes;
          tx.onabort = () => no(tx.error);
        });
      } finally {
        db.close();
      }
      releaseBaseline();
    }, item.slotId);
    await waitPredicate(f.page, () => editor.status.state === 'blocked');
    assert.deepEqual(await history(f.page, item), before);
    await close(f.page);
    assert.ok((await f.page.evaluate(() => planWork)).error);
  },
);

test(
  'renderer death during dry-run preparation leaves no reservation or cut and retries cleanly',
  dryOptions,
  async (t) => {
    const { f, item } = await setup(t, 'plan-death'),
      before = await history(f.page, item);
    await hold(f.page, 3);
    await beginPlan(f.page);
    await waitPredicate(f.page, () => window.baselineHeld);
    const cdp = await f.context.newCDPSession(f.page),
      crashed = f.page.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await crashed;
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.deepEqual(await history(f.page, item), before);
    assert.equal((await dryPlan(f.page)).kind, 'planned');
    assert.deepEqual(await history(f.page, item), before);
    await close(f.page);
  },
);

for (const damage of ['row', 'chunk'])
  test(
    `dry run refuses ${damage} changed after capture and cannot lend a stale plan`,
    dryOptions,
    async (t) => {
      const { f, item } = await setup(t, 'plan-change-' + damage);
      await install(f.page);
      await advance(f.page, 1);
      await hold(f.page, 3);
      await beginPlan(f.page);
      await waitPredicate(f.page, () => window.baselineHeld);
      await f.page.evaluate(async (damage) => {
        const db = await new Promise((yes, no) => {
          const r = indexedDB.open(opened.dbName);
          r.onsuccess = () => yes(r.result);
          r.onerror = () => no(r.error);
        });
        try {
          await new Promise((yes, no) => {
            const tx = db.transaction(damage === 'row' ? 'content' : 'meta', 'readwrite'),
              store = tx.objectStore(damage === 'row' ? 'content' : 'meta'),
              r = damage === 'row' ? store.openCursor() : store.get(['local-baseline', 0]);
            r.onsuccess = () => {
              if (damage === 'row') {
                const c = r.result,
                  v = c.value;
                v.ct[0] ^= 1;
                c.update(v);
              } else {
                const v = r.result;
                v.ct[0] ^= 1;
                store.put(v, ['local-baseline', 0]);
              }
            };
            tx.oncomplete = yes;
            tx.onabort = () => no(tx.error);
          });
        } finally {
          db.close();
        }
      }, damage);
      const damaged = await history(f.page, item);
      await f.page.evaluate(() => releaseBaseline());
      // Carrier integrity failure closes this owner; it does not remain in blocked admission.
      await waitPredicate(f.page, () => editor.status.state === 'closed');
      assert.deepEqual(await history(f.page, item), damaged);
      await close(f.page);
      assert.ok((await f.page.evaluate(() => planWork)).error);
    },
  );
