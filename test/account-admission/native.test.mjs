import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  prepare,
  genesis,
  seed,
  admit,
  snapshot,
  args,
  abandon,
  inventory,
  boundary,
  admissionBundle,
} from './fixtures.mjs';
const ops = [
  { at: 4, remove: 0, insert: ' journal-only text', disk: false },
  { at: 0, remove: 1, insert: 'new', disk: true },
];
const stable = (raw) => {
  const rows = JSON.parse(raw);
  for (const r of rows[0])
    if (r[0] === 'done.custody') {
      const kept = r[2]
        .map((k, i) => [k, r[3][i]])
        .filter(([k]) => !Array.isArray(k) || k[1] !== 'application-upgrade');
      r[2] = kept.map((x) => x[0]);
      r[3] = kept.map((x) => x[1]);
    }
  return JSON.stringify(rows);
};
const ready = async (f, id) => {
  const item = await f.ready(id);
  await seed(f.page, item, ops);
  await prepare(f.page, item);
  await genesis(f.page, item);
  return item;
};
const waitForBoundary = async (page) => {
  await page.evaluate(() => {
    window.work.then((value) => {
      window.earlyResult = String(value);
    });
  });
  await page.waitForFunction(() => window.hit === true || window.earlyResult !== undefined);
  assert.equal(
    await page.evaluate(() => window.hit),
    true,
    await page.evaluate(() => window.earlyResult),
  );
};
test(
  'admission commits one verified first head and retains Local carriers through cold restart',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'main'),
      before = await inventory(f.page);
    const result = await admit(f.page, item);
    assert.equal(result.kind, 'promotion-receipt');
    assert.equal((await snapshot(f.page, item)).marker.stage, 'admission-receipted');
    assert.equal(stable(await inventory(f.page)), stable(before));
    assert.equal(
      f.server.core.pendingPreparation({ retryKey: item.retryKey, accountId: item.accountId }).ok,
      false,
    );
    const after = await inventory(f.page);
    await f.setup(f.page);
    assert.deepEqual(await admit(f.page, item), result);
    assert.equal(await inventory(f.page), after);
    await assert.rejects(abandon(f.page, item));
    assert.equal(await inventory(f.page), after);
  },
);

for (const stage of ['admission-requested', 'admission-offered', 'admission-receipted'])
  for (const side of ['before', 'after'])
    test(`renderer interruption ${side} ${stage} commit`, { timeout: 30000 }, async (t) => {
      const f = await native(t),
        item = await ready(f, stage + side),
        before = await inventory(f.page);
      await boundary(f.page, stage, side);
      await f.page.evaluate((item) => {
        window.work = Harness.admitLocalPromotion({
          ...item,
          pin,
          proveAuthority: prove,
          transport,
          admissionTransport,
          assertActivation,
        }).then(
          (v) => v,
          (e) => String(e),
        );
      }, args(item));
      await waitForBoundary(f.page);
      const retained = (await snapshot(f.page, item)).marker;
      if (side === 'before')
        assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
      else {
        const cdp = await f.context.newCDPSession(f.page),
          crashed = f.page.waitForEvent('crash');
        void cdp.send('Page.crash').catch(() => {});
        await crashed;
      }
      await f.page.close();
      f.page = await f.context.newPage();
      await f.setup(f.page);
      const receipt = await admit(f.page, item);
      assert.equal(receipt.kind, 'promotion-receipt');
      assert.equal(stable(await inventory(f.page)), stable(before));
      if (retained.admission?.offer) assert.deepEqual(receipt.offer, retained.admission.offer);
      if (retained.admission?.receipt) assert.deepEqual(receipt, retained.admission.receipt);
    });
for (const phase of ['begin', 'finish'])
  test(`lost ${phase} response resumes exact service outcome`, { timeout: 30000 }, async (t) => {
    const f = await native(t),
      item = await ready(f, 'lost-' + phase),
      before = await inventory(f.page);
    await f.page.evaluate((phase) => {
      const call = admissionTransport[phase];
      admissionTransport[phase] = async (input) => {
        window.serviceResult = await call(input);
        throw Error('lost response');
      };
    }, phase);
    await assert.rejects(admit(f.page, item), /lost response/);
    const result = await f.page.evaluate(() => window.serviceResult);
    await f.setup(f.page);
    const receipt = await admit(f.page, item);
    assert.deepEqual(phase === 'begin' ? receipt.offer : receipt, result);
    assert.equal(stable(await inventory(f.page)), stable(before));
  });
test(
  'abandonment after an offer removes only preparation, while a lost committed reply cannot roll back Local',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'abandon'),
      before = await inventory(f.page);
    await f.page.evaluate(() => {
      const call = admissionTransport.begin;
      admissionTransport.begin = async (input) => {
        await call(input);
        throw Error('lost');
      };
    });
    await assert.rejects(admit(f.page, item));
    await abandon(f.page, item);
    assert.equal((await snapshot(f.page, item)).marker, undefined);
    assert.equal(stable(await inventory(f.page)), stable(before));
    const other = await ready(f, 'committed');
    await f.setup(f.page);
    await f.page.evaluate(() => {
      const call = admissionTransport.finish;
      admissionTransport.finish = async (input) => {
        await call(input);
        throw Error('lost');
      };
    });
    await assert.rejects(admit(f.page, other));
    const retained = await inventory(f.page);
    await assert.rejects(abandon(f.page, other));
    assert.equal(await inventory(f.page), retained);
  },
);
test(
  'changed receipt signature is refused; disabling final verification actually retains it',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'signature');
    const alter = () =>
      f.page.evaluate(() => {
        const call = admissionTransport.finish;
        admissionTransport.finish = async (input) => {
          const r = await call(input);
          return { ...r, signature: '00'.repeat(64) };
        };
      });
    await alter();
    await assert.rejects(admit(f.page, item), /signature/);
    assert.equal((await snapshot(f.page, item)).marker.stage, 'admission-offered');
    // The service is committed: force retry through finish using its identical retained offer.
    await f.page.evaluate(() => {
      const call = admissionTransport.begin;
      admissionTransport.begin = async (input) => (await call(input)).offer;
      const challenge = admissionTransport.challenge;
      admissionTransport.challenge = async (input) => ({
        ...(await challenge(input)),
        signature: '00'.repeat(64),
      });
    });
    await f.page.evaluate(await admissionBundle('receipt'));
    const accepted = await admit(f.page, item);
    assert.equal(accepted.signature, '00'.repeat(64));
    assert.equal((await snapshot(f.page, item)).marker.stage, 'admission-receipted');
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-receipt.json'),
        JSON.stringify(
          { observed: 'invalid service receipt retained with verification disabled', accepted },
          null,
          2,
        ),
      );
  },
);
test(
  'queued owner and cancellation retain the commit until native acknowledgement drains',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'queued'),
      other = await f.context.newPage();
    await f.setup(other);
    await boundary(f.page, 'admission-receipted', 'after');
    await f.page.evaluate((item) => {
      window.abort = new AbortController();
      window.work = Harness.admitLocalPromotion({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        admissionTransport,
        assertActivation,
        signal: abort.signal,
      }).then(
        (v) => v,
        (e) => String(e),
      );
    }, args(item));
    await waitForBoundary(f.page);
    await f.page.evaluate(() => abort.abort());
    await other.evaluate((item) => {
      window.finished = false;
      window.work = Harness.admitLocalPromotion({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        admissionTransport,
        assertActivation,
      }).then((v) => {
        finished = true;
        return v;
      });
    }, args(item));
    const locks = await other.evaluate(() => navigator.locks.query());
    assert.ok(locks.pending.length);
    assert.equal(await other.evaluate(() => finished), false);
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => work);
    const receipt = await other.evaluate(() => work);
    assert.equal(receipt.kind, 'promotion-receipt');
  },
);
test(
  'caller mutation after queuing cannot change the owned slot or request',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'input');
    await f.page.evaluate((item) => {
      window.releaseLock = null;
      window.lock = Harness.withPromotionSlot(
        item.slotId,
        item.code,
        () =>
          new Promise((resolve) => {
            window.releaseLock = resolve;
          }),
      );
    }, args(item));
    await f.page.waitForFunction(() => !!window.releaseLock);
    await f.page.evaluate((item) => {
      const input = {
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        admissionTransport,
        assertActivation,
      };
      window.work = Harness.admitLocalPromotion(input);
      input.slotId = 'elsewhere';
      input.draft.authRoot = 'ff'.repeat(32);
    }, args(item));
    await f.page.evaluate(() => releaseLock());
    const result = await f.page.evaluate(() => work);
    assert.equal(result.offer.epoch.accountId, item.accountId);
  },
);

test(
  '30 generated delivery, admission interruption and retry histories preserve independent writing and coverage',
  { timeout: 90000 },
  async (t) => {
    const { default: fc } = await import('fast-check');
    const { inspectReceipt } = await import('./oracle.mjs');
    const { DatabaseSync } = await import('node:sqlite');
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const f = await native(t),
      histories = [];
    let index = 0;
    const arb = fc.record({
      ops: fc.array(
        fc.record({
          at: fc.nat(80),
          remove: fc.nat(5),
          insert: fc.string({ minLength: 1, maxLength: 14 }),
          disk: fc.boolean(),
        }),
        { minLength: 1, maxLength: 10 },
      ),
      reverse: fc.boolean(),
      fault: fc.constantFrom(
        'none',
        'lost-begin',
        'lost-finish',
        'admission-requested',
        'admission-offered',
        'admission-receipted',
        'changed-offer',
      ),
      retries: fc.integer({ min: 1, max: 3 }),
    });
    await fc.assert(
      fc.asyncProperty(arb, async (history) => {
        await f.setup(f.page);
        const item = await f.ready('generated-' + index++);
        let text = 'base';
        for (const op of history.ops) {
          const at = op.at % (text.length + 1);
          text =
            text.slice(0, at) + op.insert + text.slice(at + Math.min(op.remove, text.length - at));
        }
        const expected = await seed(f.page, item, history.ops, history.reverse);
        await prepare(f.page, item);
        await genesis(f.page, item);
        const before = await inventory(f.page);
        if (history.fault.startsWith('admission-')) await boundary(f.page, history.fault, 'before');
        else if (history.fault.startsWith('lost-'))
          await f.page.evaluate((phase) => {
            const call = admissionTransport[phase];
            admissionTransport[phase] = async (input) => {
              window.serviceResult = await call(input);
              throw Error('lost response');
            };
          }, history.fault.slice(5));
        else if (history.fault === 'changed-offer')
          await f.page.evaluate(() => {
            const call = admissionTransport.begin;
            admissionTransport.begin = async (input) => ({
              ...(await call(input)),
              signature: '00'.repeat(64),
            });
          });
        if (history.fault !== 'none') {
          await assert.rejects(admit(f.page, item));
          assert.equal(stable(await inventory(f.page)), stable(before));
        }
        const retained = (await snapshot(f.page, item)).marker;
        const lost = await f.page.evaluate(() => window.serviceResult);
        await f.setup(f.page);
        const receipt = await admit(f.page, item),
          request = (await snapshot(f.page, item)).marker.admission.request;
        if (retained.admission?.offer) assert.deepEqual(receipt.offer, retained.admission.offer);
        if (lost) assert.deepEqual(lost.kind === 'promotion-offer' ? receipt.offer : receipt, lost);
        const update = inspectReceipt(receipt, request, item, text);
        assert.deepEqual(
          await f.page.evaluate((bytes) => Harness.decode(bytes), [...update]),
          expected.state,
        );
        assert.equal(stable(await inventory(f.page)), stable(before));
        for (let i = 0; i < history.retries; i++) {
          await f.setup(f.page);
          assert.deepEqual(await admit(f.page, item), receipt);
        }
        const db = new DatabaseSync(f.dbPath, { readOnly: true });
        try {
          assert.equal(
            db.prepare('SELECT state FROM accounts WHERE id=?').get(item.accountId).state,
            'active',
          );
          const rows = db
            .prepare('SELECT * FROM promotions WHERE account_id=?')
            .all(item.accountId);
          assert.equal(rows.length, 1);
          assert.equal(rows[0].state, 'admitted');
          assert.deepEqual(JSON.parse(rows[0].result), receipt);
        } finally {
          db.close();
        }
        histories.push({ ...history, status: 'passed' });
      }),
      { seed: 9242026, numRuns: 30, endOnFailure: true },
    );
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'generated-native.json'),
        JSON.stringify({ seed: 9242026, histories }, null, 2) + '\n',
      );
  },
);

test(
  'the committed version-2 reader and ordinary Local editor refuse a retained admission',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'old-reader');
    await admit(f.page, item);
    const before = await inventory(f.page);
    await assert.rejects(
      f.page.evaluate((item) => Harness.readText(item.scope, item.code), args(item)),
      /retained storage format/,
    );
    await assert.rejects(genesis(f.page, item), /admission owner/);
    await assert.rejects(prepare(f.page, item), /admission owner/);
    const calls = await f.page.evaluate(() => window.calls);
    await f.page.evaluate(await admissionBundle('old-reader'));
    await assert.rejects(prepare(f.page, item), /Malformed preparation|Unsupported promotion/);
    await assert.rejects(abandon(f.page, item), /Malformed preparation|Unsupported promotion/);
    assert.equal(await f.page.evaluate(() => window.calls), calls);
    assert.equal(await inventory(f.page), before);
  },
);
