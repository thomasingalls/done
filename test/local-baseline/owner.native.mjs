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
const hold = (p) =>
  p.evaluate(() => {
    const sign = crypto.subtle.sign.bind(crypto.subtle);
    let once = true;
    crypto.subtle.sign = async (...args) => {
      if (
        once &&
        new TextDecoder().decode(args[2]).startsWith('done/account-local-baseline-auth/draft-2\0')
      ) {
        once = false;
        window.baselineHeld = true;
        await new Promise((resolve) => {
          window.releaseBaseline = resolve;
        });
      }
      return sign(...args);
    };
  });
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
    await edit(f.page, 0, 0, 'ORDINARY INPUT ');
    await durable(f.page);
    assert.ok((await f.page.evaluate(() => editor.read().master)).startsWith('ORDINARY INPUT '));
    await close(f.page);
  },
);

test(
  'ordinary Account opener refuses an anchored profile without mutations; the private reader can reopen it',
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
    const { f, item } = await setup(t, 'baseline-reader-fence');
    assert.deepEqual(await install(f.page), { kind: 'installed' });
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
