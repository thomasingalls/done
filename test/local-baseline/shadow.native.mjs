import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  syncing,
  settled,
  edit,
  close,
  cold,
  online,
  args,
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
const check = (p) => p.evaluate(() => opened.checkLocalBaseline());
const durable = (p) => p.evaluate(() => editor.whenDurable());
// Read the actual disk independently; no owner methods or cached plaintext views participate.
const disk = (p) =>
  p.evaluate(async () => {
    const result = {};
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((yes, no) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => yes(r.result);
        r.onerror = () => no(r.error);
      });
      try {
        result[name] = await new Promise((yes, no) => {
          const tx = db.transaction([...db.objectStoreNames], 'readonly'),
            contents = {};
          for (const name of db.objectStoreNames) {
            const store = tx.objectStore(name),
              keys = store.getAllKeys(),
              values = store.getAll();
            values.onsuccess = () => {
              contents[name] = [keys.result, values.result];
            };
          }
          tx.oncomplete = () => yes(contents);
          tx.onabort = () => no(tx.error);
        });
      } finally {
        db.close();
      }
    }
    result.journal = Object.fromEntries(
      Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b)),
    );
    return JSON.stringify(result, (_key, value) =>
      value instanceof Uint8Array ? [...value] : value,
    );
  });
const holdAuthentication = (p) =>
  p.evaluate(() => {
    const sign = crypto.subtle.sign.bind(crypto.subtle);
    let once = true;
    window.shadowHeld = false;
    crypto.subtle.sign = async (...args) => {
      const bytes = args[2];
      if (
        once &&
        new TextDecoder().decode(bytes).startsWith('done/account-local-baseline-auth/draft-2\0')
      ) {
        once = false;
        shadowHeld = true;
        await new Promise((resolve) => {
          window.releaseShadow = resolve;
        });
      }
      return sign(...args);
    };
  });
const begin = (p) =>
  p.evaluate(() => {
    window.shadowWork = opened.checkLocalBaseline().then(
      (r) => r,
      (e) => ({ error: e.message }),
    );
  });

test(
  'ordinary composed workspace does not expose the shadow experiment',
  {
    timeout: 60000,
    skip: process.env.ACCOUNT_BASELINE_SHADOW === '1',
  },
  async (t) => {
    const { f } = await setup(t, 'shadow-disabled');
    assert.equal(await f.page.evaluate(() => 'checkLocalBaseline' in opened), false);
    await edit(f.page, 0, 0, 'NORMAL INPUT ');
    await durable(f.page);
    assert.ok((await f.page.evaluate(() => editor.read().master)).startsWith('NORMAL INPUT '));
    await close(f.page);
  },
);

test(
  'real owner builds and continues a shadow baseline without modifying any persistent record, then cold-opens full history',
  { timeout: 60000 },
  async (t) => {
    const { f, item } = await setup(t, 'shadow-real');
    const before = await disk(f.page);
    const first = await check(f.page);
    assert.equal(first.kind, 'matched', JSON.stringify(first));
    assert.equal(first.mode, 'created');
    assert.equal(await disk(f.page), before);
    const continued = await check(f.page);
    assert.equal(continued.mode, 'continued');
    assert.equal(await disk(f.page), before);
    await edit(f.page, 0, 0, 'AFTER BASELINE ');
    await durable(f.page);
    const afterEdit = await disk(f.page);
    const tail = await check(f.page);
    assert.equal(tail.kind, 'matched', JSON.stringify(tail));
    assert.equal(tail.mode, 'continued');
    assert.ok(tail.suffixRows > 0);
    assert.equal(await disk(f.page), afterEdit);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const acceptedDisk = await disk(f.page);
    const acceptedTail = await check(f.page);
    assert.equal(acceptedTail.kind, 'matched', JSON.stringify(acceptedTail));
    assert.equal(acceptedTail.mode, 'continued');
    assert.ok(acceptedTail.suffixRows > tail.suffixRows);
    assert.equal(await disk(f.page), acceptedDisk);
    await f.page.evaluate(() => document.dispatchEvent(new Event('resume')));
    assert.equal((await check(f.page)).mode, 'created');
    const text = await f.page.evaluate(() => editor.read().master);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    assert.equal(await f.page.evaluate(() => editor.read().master), text);
    assert.equal((await check(f.page)).mode, 'created');
    await close(f.page);
  },
);

test(
  'journalled input during preparation abandons the cut, preserves input and undo, and never installs a late candidate',
  { timeout: 60000 },
  async (t) => {
    const { f } = await setup(t, 'shadow-input');
    await holdAuthentication(f.page);
    const before = await f.page.evaluate(() => editor.read().master);
    await begin(f.page);
    await waitPredicate(f.page, () => shadowHeld);
    await edit(f.page, 0, 0, 'DURING SHADOW ');
    await f.page.evaluate(() => releaseShadow());
    assert.deepEqual(await f.page.evaluate(() => shadowWork), {
      kind: 'skipped',
      reason: 'activity-or-journal',
    });
    await durable(f.page);
    assert.equal((await check(f.page)).mode, 'created');
    await f.page.evaluate(async () => {
      await editor.command({ kind: 'undo' }).accepted;
    });
    assert.equal(await f.page.evaluate(() => editor.read().master), before);
    await durable(f.page);
    const r = await check(f.page);
    assert.equal(r.kind, 'matched', JSON.stringify(r));
    await close(f.page);
  },
);

test(
  'a nonempty journal is skipped without flush or clearing, including failed cleanup of already durable input',
  { timeout: 60000 },
  async (t) => {
    const { f } = await setup(t, 'shadow-journal');
    await f.page.evaluate(() => {
      const remove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (key.startsWith('done.pending-update.')) throw Error('test cleanup refusal');
        return remove.call(this, key);
      };
      window.restoreRemoval = () => {
        Storage.prototype.removeItem = remove;
      };
    });
    await edit(f.page, 0, 0, 'RETAINED JOURNAL ');
    // Check immediately on this turn as well as after the ordinary flush attempt below.
    const initial = await check(f.page);
    assert.equal(initial.kind, 'skipped');
    await assert.rejects(durable(f.page), /cleanup.*retry/);
    const before = await disk(f.page);
    assert.deepEqual(await check(f.page), { kind: 'skipped', reason: 'activity-or-journal' });
    assert.equal(await disk(f.page), before);
    await f.page.evaluate(() => {
      restoreRemoval();
      editor.retry();
    });
    await durable(f.page);
    await close(f.page);
  },
);

test(
  'close retains the Web Lock until outstanding shadow crypto settles and cold startup ignores the abandoned candidate',
  { timeout: 60000 },
  async (t) => {
    const { f, item } = await setup(t, 'shadow-close');
    await holdAuthentication(f.page);
    await begin(f.page);
    await waitPredicate(f.page, () => shadowHeld);
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
    await f.page.evaluate(() => releaseShadow());
    const result = await f.page.evaluate(() => shadowWork);
    assert.ok(result.error, JSON.stringify(result));
    await f.page.evaluate(() => closing);
    await waitPredicate(contender, () => acquired);
    await settled(contender);
    await online(contender, false);
    assert.equal((await check(contender)).mode, 'created');
    await close(contender);
    await contender.close();
  },
);

test(
  'fresh final authority check rejects a custody change during shadow verification',
  { timeout: 60000 },
  async (t) => {
    const { f, item } = await setup(t, 'shadow-authority');
    await holdAuthentication(f.page);
    await begin(f.page);
    await waitPredicate(f.page, () => shadowHeld);
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
      releaseShadow();
    }, item.slotId);
    const report = await f.page.evaluate(() => shadowWork);
    assert.match(report.error, /clear|invalid|repair/i);
    await close(f.page);
  },
);

test(
  'shadow queues behind native flush completion and observes only the settled, exactly cleared journal',
  { timeout: 60000 },
  async (t) => {
    const { f } = await setup(t, 'shadow-settlement');
    await f.page.evaluate(() => {
      const marked = new WeakSet(),
        add = IDBObjectStore.prototype.add;
      let once = true;
      IDBObjectStore.prototype.add = function (value, ...args) {
        if (once && this.name === 'content') {
          once = false;
          marked.add(this.transaction);
        }
        return add.call(this, value, ...args);
      };
      const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
        ...d,
        set(fn) {
          d.set.call(this, function (event) {
            if (marked.has(this)) {
              window.flushHeld = true;
              window.releaseFlush = () => fn.call(this, event);
            } else fn.call(this, event);
          });
        },
      });
    });
    await edit(f.page, 0, 0, 'SETTLED INPUT ');
    await f.page.evaluate(() => {
      window.flushWork = editor.whenDurable();
    });
    await waitPredicate(f.page, () => window.flushHeld);
    await f.page.evaluate(() => {
      window.shadowFinished = false;
      window.shadowWork = opened.checkLocalBaseline().then((result) => {
        shadowFinished = true;
        return result;
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(await f.page.evaluate(() => shadowFinished), false);
    await f.page.evaluate(() => releaseFlush());
    await f.page.evaluate(() => flushWork);
    const result = await f.page.evaluate(() => shadowWork);
    assert.equal(result.kind, 'matched', JSON.stringify(result));
    assert.equal(result.mode, 'created');
    assert.equal(
      await f.page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) => key.startsWith('done.pending-update.')).length,
      ),
      0,
    );
    await close(f.page);
  },
);
