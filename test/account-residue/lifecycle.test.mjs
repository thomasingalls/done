import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, checkpoint, marker, report, factor, args } from './fixtures.mjs';
import {
  createLocal,
  openLocal,
  read,
  insert,
  close,
  flush,
  compactLocal,
  projection,
  prepareRecovery,
  select,
  sync,
  settled,
  writingNeedles,
  writeAll,
  scan,
  contentCount,
  journalCount,
} from './lifecycle.mjs';

test(
  'P0–P6 actual Local and browser recovery owners through selected Account HTTP delivery and cold replay',
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(t),
      ns = writingNeedles(),
      points = [];
    await checkpoint(f, ns, 'P0-empty');
    points.push('P0-empty');
    const item = await createLocal(f);
    await scan(f, item, ns, 'P1-genesis');
    points.push('P1-genesis');
    await openLocal(f, item);
    const diskBefore = await contentCount(f);
    const expected = await writeAll(f, ns);
    assert.equal(
      await contentCount(f),
      diskBefore,
      'No content DB commit before held journal point',
    );
    assert((await journalCount(f)) >= 5, 'Actual synchronous admitted writes');
    await scan(f, item, ns, 'P2-journal');
    points.push('P2-journal');
    await flush(f);
    assert.equal(await journalCount(f), 0);
    await scan(f, item, ns, 'P3-flushed');
    points.push('P3-flushed');
    await close(f);
    await scan(f, item, ns, 'P3-locked');
    points.push('P3-locked');
    await compactLocal(f, item);
    await scan(f, item, ns, 'P3-compacted');
    points.push('P3-compacted');
    await f.cold();
    await openLocal(f, item, false);
    await flush(f);
    assert.deepEqual(projection(await read(f)), expected);
    await scan(f, item, ns, 'P3-cold');
    points.push('P3-cold');
    await close(f);
    await prepareRecovery(f, item, async (stage) => {
      const result = await scan(f, item, ns, 'P4-' + stage);
      points.push('P4-' + stage);
      const paths = new Set(result.exposures.map((e) => JSON.stringify(e.location)));
      assert(
        paths.has(
          JSON.stringify([
            'done.account-recovery-preparation.v1',
            'progress',
            'value',
            'pending',
            'retryKey',
          ]),
        ),
      );
      if (stage !== 'generated')
        assert(
          paths.has(
            JSON.stringify([
              'done.account-recovery-preparation.v1',
              'progress',
              'value',
              'pending',
              'finalization',
              'retryKey',
            ]),
          ),
        );
    });
    await select(f, item, {
      lostReply: true,
      observe: async (stage) => {
        await scan(f, item, ns, 'P5-' + stage);
        points.push('P5-' + stage);
      },
    });
    await sync(f, item);
    let count = await settled(f);
    const later = { id: 'later', values: [marker('later')] };
    ns.push(later);
    await insert(f, later.values[0]);
    count = await settled(f, count);
    await flush(f);
    const accountExpected = projection(await read(f));
    assert.equal(accountExpected.master, expected.master + later.values[0]);
    await scan(f, item, ns, 'P6-delivered');
    points.push('P6-delivered');
    await f.page.evaluate(() => opened.compactContent());
    await close(f);
    await scan(f, item, ns, 'P6-locked');
    points.push('P6-locked');
    await f.cold();
    await sync(f, item);
    await settled(f);
    await flush(f);
    assert.deepEqual(projection(await read(f)), accountExpected);
    await scan(f, item, ns, 'P6-cold');
    points.push('P6-cold');
    await close(f);
    report('lifecycle', {
      points,
      assertions: {
        journalOnly: true,
        localColdReplay: true,
        realBrowserRecovery: true,
        lostActualFinalReply: true,
        accountColdReplay: true,
      },
      acceptedThrough: count,
    });
  },
);

test(
  'P7 wrong factor, cancellation and actual journal storage failure retain acknowledged writing',
  { timeout: 60000 },
  async (t) => {
    const f = await fixture(t),
      item = await createLocal(f, 'refusal-local'),
      ns = [{ id: 'retained', values: [marker('retained')] }];
    await openLocal(f, item);
    await insert(f, ns[0].values[0]);
    await flush(f);
    await close(f);
    const refused = await f.page.evaluate(async (item) => {
      const opts = {
        ...ownerOptions(item),
        validateReceive: () => {
          throw Error('No network');
        },
      };
      const other = Product.beginLocalGenesis('refusal-other'),
        wrongCode = other.displayCode;
      other.cancel();
      const wrong = await Product.openLocalWorkspace(item.slotId, wrongCode, opts),
        abort = new AbortController();
      abort.abort();
      const cancelled = await Product.openLocalWorkspace(item.slotId, item.code, {
        ...opts,
        signal: abort.signal,
      });
      return { wrong: wrong.kind, cancelled: cancelled.kind, wrongCode };
    }, args(item));
    assert.equal(refused.wrong, 'unlock-failed');
    ns.push(factor('wrongFactor', refused.wrongCode));
    assert.equal(refused.cancelled, 'cancelled');
    await scan(f, item, ns, 'P7-refused');
    await openLocal(f, item);
    await flush(f);
    await f.page.evaluate(() => {
      globalThis.realSetItem = Storage.prototype.setItem;
      globalThis.journalFailures = 0;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('done.pending-update.')) {
          journalFailures++;
          throw new DOMException('Synthetic journal full', 'QuotaExceededError');
        }
        return realSetItem.call(this, key, value);
      };
    });
    ns.push({ id: 'fallback', values: [marker('fallback')] });
    await insert(f, ns.at(-1).values[0]);
    await flush(f);
    assert((await f.page.evaluate(() => journalFailures)) > 0);
    await scan(f, item, ns, 'P7-journal-failure');
    await close(f);
    await f.cold();
    await openLocal(f, item, false);
    await flush(f);
    assert.equal(
      (await read(f)).master,
      ns
        .filter((n) => n.id !== 'wrongFactor')
        .map((n) => n.values[0])
        .join(''),
    );
    await scan(f, item, ns, 'P7-cold');
    await close(f);
    report('failure-branches', {
      refused: { wrong: refused.wrong, cancelled: refused.cancelled },
      journalStorageFailure: 'observed; fallback persisted through cold reopen',
    });
  },
);

test(
  'native write-path plaintext side-record is detected after the actual edit is acknowledged',
  { timeout: 60000 },
  async (t) => {
    for (const leak of [false, true]) {
      const f = await fixture(t, { leak }),
        item = await createLocal(f, 'write-control'),
        n = { id: 'writeLeak', values: [marker('writeLeak')] };
      await openLocal(f, item);
      await insert(f, n.values[0]);
      assert.equal((await read(f)).master, n.values[0]);
      assert((await journalCount(f)) > 0);
      const r = await scan(f, item, [n], leak ? 'write-control-leak' : 'write-control-baseline', {
        expected: leak ? 'prohibited-match' : 'complete-no-prohibited-match',
      });
      if (leak)
        assert(
          r.matches.some(
            (m) =>
              m.needle === n.id &&
              m.surface === 'localStorage' &&
              m.location[1] === 'unexpected-plaintext-side-write',
          ),
        );
      // No application mutation after a detected leak; fixture teardown closes the renderer.
      await f.dispose();
    }
  },
);
