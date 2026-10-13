import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  syncing,
  settled,
  online,
  edit,
  close,
  cold,
  waitPredicate,
  syncBundle,
  configure,
  args,
} from '../account-sync/fixtures.mjs';
import { answer } from '../account-receive/fixtures.mjs';

const remove = (p, revision = 0) => p.evaluate((r) => opened.removeLocalHistory(r), revision);
const durable = (p) => p.evaluate(() => editor.whenDurable());
async function setup(t, id) {
  const f = await native(t),
    item = await selected(f, id);
  await syncing(f.page, item);
  await settled(f.page);
  await online(f.page, false);
  return { f, item };
}
test(
  'reduced owner reuses baseline through journal flush and publication; resume forces full replay',
  { timeout: 90000, skip: process.env.ACCOUNT_AUTHORITY_REUSE !== '1' },
  async (t) => {
    const { f } = await setup(t, 'removal-warm');
    await remove(f.page);
    await f.page.evaluate(() => opened.deliveryStatus());
    const before = await f.page.evaluate(() => __doneLedgerMetrics().work);
    for (let i = 0; i < 3; i++) await f.page.evaluate(() => opened.deliveryStatus());
    await edit(f.page, 0, 0, 'WARM JOURNAL ');
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const after = await f.page.evaluate(() => __doneLedgerMetrics().work);
    assert.ok(after.baselineWarmReuses > before.baselineWarmReuses);
    assert.ok(after.baselineIncrementalReuses > before.baselineIncrementalReuses);
    assert.ok(after.authorityChecks > before.authorityChecks);
    assert.equal(after.baselineFullReplays, before.baselineFullReplays);
    assert.equal(after.loadedRows, before.loadedRows);
    await f.page.evaluate(() => document.dispatchEvent(new Event('resume')));
    await f.page.evaluate(() => opened.deliveryStatus());
    const resumed = await f.page.evaluate(() => __doneLedgerMetrics().work);
    assert.ok(resumed.baselineFullReplays > after.baselineFullReplays);
    t.diagnostic(JSON.stringify({ before, after, resumed }));
    await close(f.page);
  },
);
const inventory = (p) =>
  p.evaluate(async () => {
    const db = await new Promise((yes, no) => {
      const r = indexedDB.open(opened.dbName);
      r.onsuccess = () => yes(r.result);
      r.onerror = () => no(r.error);
    });
    try {
      return await new Promise((yes, no) => {
        const tx = db.transaction(['meta', 'content', 'heads', 'outbound'], 'readonly'),
          result = {};
        for (const name of ['meta', 'content', 'heads', 'outbound']) {
          const s = tx.objectStore(name),
            keys = s.getAllKeys(),
            values = s.getAll();
          values.onsuccess = () => {
            result[name] = [keys.result, values.result];
          };
        }
        tx.oncomplete = () =>
          yes(
            JSON.parse(JSON.stringify(result, (_k, v) => (v instanceof Uint8Array ? [...v] : v))),
          );
        tx.onabort = () => no(tx.error);
      });
    } finally {
      db.close();
    }
  });
const counter = (i) => i.meta[1][i.meta[0].indexOf('counter')];
const count = (i) => ['content', 'heads', 'outbound'].reduce((n, s) => n + i[s][0].length, 0);
const journal = (p) =>
  p.evaluate(() =>
    Object.entries(localStorage).filter(([k]) => k.startsWith('done.pending-update.')),
  );
const begin = (p, r = 0) =>
  p.evaluate((r) => {
    window.removal = opened.removeLocalHistory(r).catch((e) => ({ error: e.message }));
  }, r);
const hold = (p, boundary) =>
  p.evaluate((boundary) => {
    const put = IDBObjectStore.prototype.put,
      marked = new WeakSet();
    IDBObjectStore.prototype.put = function (value, ...rest) {
      if (
        this.name === 'meta' &&
        rest[0] === 'counter' &&
        ((boundary === 'reserved' && value.v !== 5) || (boundary === 'committed' && value.v === 5))
      )
        marked.add(this.transaction);
      return put.call(this, value, ...rest);
    };
    const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      ...d,
      set(fn) {
        d.set.call(this, function (event) {
          if (marked.has(this)) window.removalHeld = true;
          else fn.call(this, event);
        });
      },
    });
  }, boundary);

test(
  'atomic removal keeps live undo, exact era/journal ordering, absolute send position and repeated/cold replay',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'removal-live'),
      original = await f.page.evaluate(() => editor.read().master);
    await edit(f.page, 0, 0, 'BEFORE RETENTION ');
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const before = await inventory(f.page),
      text = await f.page.evaluate(() => editor.read().master),
      accepted = await f.page.evaluate(async () => (await opened.deliveryStatus()).acceptedThrough);
    assert.ok(count(before) > 0);
    const result = await remove(f.page);
    assert.deepEqual(result, { kind: 'removed', revision: 1, removed: count(before) });
    const after = await inventory(f.page);
    assert.equal(counter(after).v, 5);
    assert.equal(counter(after).baseline.history, 'baseline-plus-suffix');
    assert.equal(count(after), 0);
    assert.equal(await f.page.evaluate(() => editor.read().master), text);
    assert.deepEqual(await remove(f.page), { kind: 'already-removed' });
    assert.deepEqual(await inventory(f.page), after);
    assert.deepEqual(await remove(f.page, 1), { kind: 'removed', revision: 2, removed: 0 });
    assert.notEqual(
      counter(await inventory(f.page)).baseline.journalEra.current,
      counter(after).baseline.journalEra.current,
    );
    await f.page.evaluate(() => {
      const set = Storage.prototype.setItem,
        before = editor.read().master;
      window.retentionJournalFirst = false;
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith('done.pending-update.'))
          retentionJournalFirst ||= editor.read().master === before;
        return set.call(this, k, v);
      };
    });
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    assert.equal(await f.page.evaluate(() => retentionJournalFirst), true);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), text);
    await edit(f.page, 0, 0, 'AFTER RETENTION ');
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    assert.ok(
      await f.page.evaluate(
        async (n) => (await opened.deliveryStatus()).acceptedThrough > n,
        accepted,
      ),
    );
    const next = await remove(f.page, 2);
    assert.equal(next.kind, 'removed');
    assert.ok(next.removed > 0);
    const expected = await f.page.evaluate(() => editor.read().master);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    await online(f.page, false);
    assert.equal(await f.page.evaluate(() => editor.read().master), expected);
    assert.deepEqual(await remove(f.page, 2), { kind: 'already-removed' });
    await close(f.page);
  },
);

async function crash(f) {
  const cdp = await f.context.newCDPSession(f.page),
    crashed = f.page.waitForEvent('crash');
  void cdp.send('Page.crash').catch(() => {});
  await crashed;
  await cold(f);
}
for (const boundary of ['reserved', 'committed'])
  test(
    `renderer death after ${boundary}: old-or-new storage, cold recovery and exact retry`,
    { timeout: 90000 },
    async (t) => {
      const { f, item } = await setup(t, 'remove-crash-' + boundary);
      const before = await inventory(f.page),
        text = await f.page.evaluate(() => editor.read().master);
      await hold(f.page, boundary);
      await begin(f.page);
      await waitPredicate(f.page, () => window.removalHeld);
      await crash(f);
      await online(f.page, false);
      await syncing(f.page, item);
      const after = await inventory(f.page);
      assert.equal(await f.page.evaluate(() => editor.read().master), text);
      assert.ok(counter(after).next_seq > counter(before).next_seq);
      if (boundary === 'reserved') {
        assert.equal(counter(after).v, 2);
        for (const s of ['content', 'heads', 'outbound']) assert.deepEqual(after[s], before[s]);
        assert.equal((await remove(f.page)).kind, 'removed');
        assert.equal(
          counter(await inventory(f.page)).baseline.firstSequence,
          counter(after).next_seq,
        );
      } else {
        assert.equal(counter(after).v, 5);
        assert.equal(count(after), 0);
        assert.deepEqual(await remove(f.page), { kind: 'already-removed' });
        assert.deepEqual(await inventory(f.page), after);
      }
      await close(f.page);
    },
  );

test(
  'native abort after first deletion rolls back every store; a new owner retries past burned reservation',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'remove-abort'),
      before = await inventory(f.page);
    await f.page.evaluate(() => {
      const del = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function (...a) {
        const result = del.apply(this, a);
        if (this.name !== 'meta' && !window.removalAborted) {
          window.removalAborted = true;
          this.transaction.abort();
        }
        return result;
      };
    });
    await assert.rejects(remove(f.page));
    assert.equal(await f.page.evaluate(() => removalAborted), true);
    assert.equal(await f.page.evaluate(() => editor.status.state), 'closed');
    const after = await inventory(f.page);
    for (const s of ['content', 'heads', 'outbound']) assert.deepEqual(after[s], before[s]);
    assert.equal(counter(after).v, 2);
    assert.ok(counter(after).next_seq > counter(before).next_seq);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.equal((await remove(f.page)).kind, 'removed');
    assert.equal(counter(await inventory(f.page)).baseline.firstSequence, counter(after).next_seq);
    await close(f.page);
  },
);

const holdCrypto = (p, final = false) =>
  p.evaluate((final) => {
    const sign = crypto.subtle.sign.bind(crypto.subtle);
    let once = true;
    crypto.subtle.sign = async (...args) => {
      if (
        once &&
        (final
          ? new TextDecoder().decode(args[2]).startsWith('["done/content-counter/')
          : new TextDecoder()
              .decode(args[2])
              .startsWith('done/account-local-baseline-auth/draft-3\0'))
      ) {
        once = false;
        window.cryptoHeld = true;
        await new Promise((resolve) => {
          window.releaseCrypto = resolve;
        });
      }
      return sign(...args);
    };
  }, final);

test(
  'queued input waits for removal/readback, journals before apply and preserves undo',
  { timeout: 90000 },
  async (t) => {
    const { f } = await setup(t, 'remove-input'),
      original = await f.page.evaluate(() => editor.read().master);
    await holdCrypto(f.page, true);
    await begin(f.page);
    await waitPredicate(f.page, () => window.cryptoHeld);
    await f.page.evaluate(() => {
      const before = editor.read().master,
        set = Storage.prototype.setItem;
      window.journalFirst = false;
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith('done.pending-update.')) journalFirst ||= editor.read().master === before;
        return set.call(this, k, v);
      };
      window.inputWork = surface.input(
        { name: 'insert', text: 'QUEUED ' },
        { ranges: [{ anchor: 0, head: 0 }], main: 0 },
      ).accepted;
    });
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(() => releaseCrypto());
    assert.equal((await f.page.evaluate(() => removal)).kind, 'removed');
    await f.page.evaluate(() => inputWork);
    assert.equal(await f.page.evaluate(() => journalFirst), true);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'QUEUED ' + original);
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await durable(f.page);
    await close(f.page);
  },
);

test(
  'input during preparation admits before held crypto settles, skips without reserving, and preserves undo/reopen',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'remove-preparation-input');
    const before = await inventory(f.page),
      original = await f.page.evaluate(() => editor.read().master);
    await holdCrypto(f.page);
    await begin(f.page);
    await waitPredicate(f.page, () => window.cryptoHeld);
    assert.deepEqual(await remove(f.page), { kind: 'skipped', reason: 'already-preparing' });
    await f.page.evaluate(async () => {
      const original = editor.read().master,
        set = Storage.prototype.setItem;
      window.journalFirst = false;
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith('done.pending-update.'))
          journalFirst ||= editor.read().master === original;
        return set.call(this, k, v);
      };
      await surface.input(
        { name: 'insert', text: 'DURING PREPARATION ' },
        { ranges: [{ anchor: 0, head: 0 }], main: 0 },
      ).accepted;
    });
    assert.equal(
      await f.page.evaluate(() => editor.read().master),
      'DURING PREPARATION ' + original,
    );
    assert.equal(await f.page.evaluate(() => journalFirst), true);
    assert.deepEqual(await inventory(f.page), before);
    assert.ok((await journal(f.page)).length);
    await f.page.evaluate(() => releaseCrypto());
    assert.deepEqual(await f.page.evaluate(() => removal), {
      kind: 'skipped',
      reason: 'activity-or-journal',
    });
    assert.equal(await f.page.evaluate(() => editor.status.state), 'active');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    await durable(f.page);
    assert.equal(counter(await inventory(f.page)).v, 2);
    await close(f.page);
    await cold(f);
    await syncing(f.page, item);
    await online(f.page, false);
    assert.equal(
      await f.page.evaluate(() => editor.read().master),
      'DURING PREPARATION ' + original,
    );
    await close(f.page);
  },
);

for (const event of ['resume', 'freeze'])
  test(
    `lifecycle ${event} invalidates preparation without mutation and a new attempt works`,
    { timeout: 90000 },
    async (t) => {
      const { f } = await setup(t, 'remove-prepare-' + event),
        before = await inventory(f.page);
      await holdCrypto(f.page);
      await begin(f.page);
      await waitPredicate(f.page, () => window.cryptoHeld);
      await f.page.evaluate((event) => {
        document.dispatchEvent(new Event(event));
        releaseCrypto();
      }, event);
      assert.deepEqual(await f.page.evaluate(() => removal), {
        kind: 'skipped',
        reason: 'activity-or-journal',
      });
      assert.deepEqual(await inventory(f.page), before);
      assert.equal((await remove(f.page)).kind, 'removed');
      await close(f.page);
    },
  );

test(
  'closing during preparation keeps exclusion until crypto settles, with no late deletion',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'remove-close'),
      before = await inventory(f.page);
    await holdCrypto(f.page);
    await begin(f.page);
    await waitPredicate(f.page, () => window.cryptoHeld);
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
    await f.page.evaluate(() => releaseCrypto());
    assert.ok((await f.page.evaluate(() => removal)).error);
    await f.page.evaluate(() => closing);
    assert.deepEqual(await inventory(f.page), before);
    await waitPredicate(contender, () => acquired);
    await settled(contender);
    await online(contender, false);
    assert.equal((await remove(contender)).kind, 'removed');
    await close(contender);
    await contender.close();
  },
);

for (const boundary of ['journal-only', 'committed-before-cleanup'])
  test(
    `new-era journal death at ${boundary} preserves exact writing once`,
    { timeout: 90000 },
    async (t) => {
      const { f, item } = await setup(t, 'remove-journal-' + boundary);
      await remove(f.page);
      const original = await f.page.evaluate(() => editor.read().master);
      await f.page.evaluate((boundary) => {
        if (boundary === 'journal-only')
          crypto.subtle.encrypt = async () => {
            window.flushHeld = true;
            return new Promise(() => {});
          };
        else {
          const del = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function (k) {
            if (k.startsWith('done.pending-update.')) {
              window.flushHeld = true;
              throw Error('retain after commit');
            }
            return del.call(this, k);
          };
        }
      }, boundary);
      await edit(f.page, 0, 0, 'AFTER CUT CRASH ');
      if (boundary === 'committed-before-cleanup') await assert.rejects(durable(f.page), /cleanup/);
      else
        await f.page.evaluate(() => {
          void editor.whenDurable().catch(() => {});
        });
      await waitPredicate(f.page, () => window.flushHeld);
      assert.ok((await journal(f.page)).length);
      const before = await inventory(f.page);
      await crash(f);
      await online(f.page, false);
      await syncing(f.page, item);
      assert.equal(
        await f.page.evaluate(() => editor.read().master),
        'AFTER CUT CRASH ' + original,
      );
      const after = await inventory(f.page);
      if (boundary === 'committed-before-cleanup')
        assert.deepEqual(after.outbound, before.outbound);
      assert.deepEqual(await journal(f.page), []);
      await close(f.page);
    },
  );

test(
  'old read flight is refused across actual removal; a fresh signed flight succeeds',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'remove-flight');
    await close(f.page);
    await f.page.evaluate(await syncBundle('retention-owner'));
    await configure(f.page, f.testOperatorToken);
    await syncing(f.page, item);
    await online(f.page, false);
    const query = await f.page.evaluate(async () => [...(await retentionTestOwner.prepareRead())]);
    const late = answer(f, item, query).bytes;
    assert.equal((await remove(f.page)).kind, 'removed');
    const after = await inventory(f.page);
    await assert.rejects(
      f.page.evaluate((b) => retentionTestOwner.receivePage(new Uint8Array(b)), [...late]),
      /authority|changed|superseded/i,
    );
    assert.deepEqual(await inventory(f.page), after);
    // A composed stale read can still be registered when maintenance asks for durability.
    // Its pre-persistence rejection must skip that attempt, without blocking local storage.
    const interrupted = await f.page.evaluate(
      async (bytes) => {
        const late = retentionTestOwner.receivePage(new Uint8Array(bytes)).catch((e) => e.message);
        const retry = opened.removeLocalHistory(1);
        await late;
        return { result: await retry, state: editor.status.state };
      },
      [...late],
    );
    assert.deepEqual(interrupted, {
      result: { kind: 'skipped', reason: 'activity-or-journal' },
      state: 'active',
    });
    assert.deepEqual(await inventory(f.page), after);
    const fresh = await f.page.evaluate(async () => [...(await retentionTestOwner.prepareRead())]);
    const ok = answer(f, item, fresh).bytes;
    assert.equal(
      (await f.page.evaluate((b) => retentionTestOwner.receivePage(new Uint8Array(b)), [...ok]))
        .kind,
      'empty',
    );
    await close(f.page);
  },
);

test(
  'v5 reader fence refuses an older private reader without writes; enabled reader reopens',
  { timeout: 90000 },
  async (t) => {
    const enabled = process.env.ACCOUNT_RETENTION;
    let old;
    try {
      delete process.env.ACCOUNT_RETENTION;
      old = await syncBundle();
    } finally {
      process.env.ACCOUNT_RETENTION = enabled;
    }
    const { f, item } = await setup(t, 'remove-old-reader');
    await remove(f.page);
    const before = await inventory(f.page);
    await close(f.page);
    await f.page.evaluate(old);
    await configure(f.page, f.testOperatorToken);
    await assert.rejects(syncing(f.page, item), /unknown-content-metadata|reader|required/i);
    assert.deepEqual(await inventory(f.page), before);
    await cold(f);
    await syncing(f.page, item);
    assert.deepEqual(await remove(f.page), { kind: 'already-removed' });
    await close(f.page);
  },
);

test(
  'failed committed readback closes the owner; cold retry authenticates without deleting or reserving again',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'remove-readback');
    await f.page.evaluate(() => {
      const put = IDBObjectStore.prototype.put,
        get = IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.put = function (value, ...a) {
        if (this.name === 'meta' && a[0] === 'counter' && value.v === 5)
          window.finalRemovalStarted = true;
        return put.call(this, value, ...a);
      };
      window.originalGetAll = get;
      IDBObjectStore.prototype.getAll = function (...a) {
        if (window.finalRemovalStarted && this.transaction.mode === 'readonly') {
          window.readbackFailed = true;
          throw Error('injected readback failure');
        }
        return get.apply(this, a);
      };
    });
    await assert.rejects(remove(f.page), /readback|Admission closed/);
    assert.equal(await f.page.evaluate(() => readbackFailed), true);
    assert.equal(await f.page.evaluate(() => editor.status.state), 'closed');
    await f.page.evaluate(() => {
      IDBObjectStore.prototype.getAll = originalGetAll;
    });
    const after = await inventory(f.page);
    assert.equal(counter(after).v, 5);
    assert.equal(count(after), 0);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.deepEqual(await remove(f.page), { kind: 'already-removed' });
    assert.deepEqual(await inventory(f.page), after);
    await close(f.page);
  },
);

test(
  'restored old-era journal is rejected after real removal, preserving every stored byte',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'remove-restored-journal');
    await remove(f.page);
    await f.page.evaluate(() => {
      window.originalRemove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (k) {
        if (k.startsWith('done.pending-update.')) throw Error('hold old journal');
        return originalRemove.call(this, k);
      };
    });
    await edit(f.page, 0, 0, 'OLD ERA COPY ');
    await assert.rejects(durable(f.page), /cleanup/);
    const saved = await journal(f.page);
    assert.ok(saved.length);
    const blocked = await inventory(f.page);
    await assert.rejects(remove(f.page, 1), /blocked pending input/);
    assert.deepEqual(await inventory(f.page), blocked);
    await f.page.evaluate(() => {
      Storage.prototype.removeItem = originalRemove;
    });
    await f.page.evaluate(() => editor.retry());
    await durable(f.page);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    assert.equal((await remove(f.page, 1)).kind, 'removed');
    const name = await f.page.evaluate(() => opened.dbName),
      before = await inventory(f.page);
    await close(f.page);
    await f.page.evaluate((entries) => {
      for (const [k, v] of entries) localStorage.setItem(k, v);
    }, saved);
    await cold(f);
    await assert.rejects(syncing(f.page, item), /pairing/);
    await f.page.evaluate((name) => {
      window.opened = { dbName: name };
    }, name);
    assert.deepEqual(await inventory(f.page), before);
    assert.deepEqual(await journal(f.page), saved);
  },
);

test(
  'unpublished originals survive removal inside the baseline and publish with the same identities after cold open',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'remove-unsent');
    await remove(f.page);
    await edit(f.page, 0, 0, 'UNPUBLISHED ORIGINAL ');
    await durable(f.page);
    const captures = (p) =>
      p.evaluate(async () =>
        (await opened.listCaptures()).map((c) => ({
          ...c,
          sources: c.sources.map((s) => ({ ...s, bytes: [...s.bytes] })),
        })),
      );
    const before = await captures(f.page),
      text = await f.page.evaluate(() => editor.read().master);
    assert.ok(before.length);
    assert.deepEqual(await f.page.evaluate(async () => (await opened.spoolStatus()).positions), []);
    assert.equal((await remove(f.page, 1)).kind, 'removed');
    assert.equal(count(await inventory(f.page)), 0);
    assert.deepEqual(await captures(f.page), before);
    await close(f.page);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), text);
    assert.deepEqual(await captures(f.page), before);
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const ids = await f.page.evaluate(async () =>
      (await opened.spoolStatus()).positions
        .flatMap((p) => [p.source, ...(p.additional ?? [])])
        .map((s) => s.id),
    );
    assert.deepEqual([...new Set(ids)].sort(), before.map((c) => c.id).sort());
    assert.equal((await remove(f.page, 2)).kind, 'removed');
    assert.deepEqual(await captures(f.page), []);
    await close(f.page);
  },
);
