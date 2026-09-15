import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  prepare,
  abandon,
  snapshot,
  text,
  edit,
  inventory,
  boundary,
  args,
  bundle,
} from './fixtures.mjs';

test(
  'native preparation resumes exact credentials, preserves journal/content/Local identity and restores Local only through abandonment',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('main');
    await edit(f.page, item);
    await f.page.evaluate((item) => Harness.importedClaim(item.slotId, item.code), args(item));
    const before = await snapshot(f.page, item),
      all = await inventory(f.page),
      expectedText = await text(f.page, item);
    const result = await prepare(f.page, item),
      after = await snapshot(f.page, item);
    assert.equal(result.kind, 'promotion-prepared');
    assert.equal(after.record.seal_reserved, before.record.seal_reserved + 2);
    for (const key of ['envelope', 'credentials', 'seals', 'store_id', 'root_id'])
      assert.deepEqual(after.record[key], before.record[key]);
    assert.notDeepEqual(
      result.credentials.map((c) => c.id),
      before.record.credentials.map((c) => c.id),
    );
    const nonCustody = (raw) =>
      JSON.stringify(JSON.parse(raw)[0].filter((r) => r[0] !== 'done.custody')) +
      JSON.stringify(JSON.parse(raw)[1]);
    assert.equal(nonCustody(await inventory(f.page)), nonCustody(all));
    await assert.rejects(text(f.page, item), /retained storage format/);
    await f.setup(f.page);
    assert.deepEqual(await prepare(f.page, item), result);
    assert.deepEqual(await snapshot(f.page, item), after);
    const calls = await f.page.evaluate(() => calls);
    await assert.rejects(prepare(f.page, { ...item, code: 'wrong' }));
    assert.equal(await f.page.evaluate(() => calls), calls);
    await assert.rejects(prepare(f.page, { ...item, accountId: 'AA'.repeat(21) + 'A' }));
    assert.equal((await abandon(f.page, item)).kind, 'promotion-abandoned');
    assert.equal(await text(f.page, item), expectedText);
    assert.equal((await snapshot(f.page, item)).record.seal_reserved, after.record.seal_reserved);
    assert.equal((await abandon(f.page, item)).kind, 'no-promotion');
    await assert.rejects(prepare(f.page, item));
  },
);
for (const stage of ['reserved', 'prepared'])
  for (const side of ['before', 'after'])
    test(
      `native ${side} ${stage} commit interruption preserves reservation and winning keys`,
      { timeout: 30000 },
      async (t) => {
        const f = await native(t),
          item = await f.ready(stage + side);
        await edit(f.page, item);
        const before = await snapshot(f.page, item);
        await boundary(f.page, stage, side);
        await f.page.evaluate((item) => {
          window.work = Harness.prepareLocalPromotion({
            ...item,
            pin,
            proveAuthority: prove,
            transport,
          }).then(
            (v) => v,
            (e) => String(e),
          );
        }, args(item));
        await f.page.waitForFunction(() => window.hit === true);
        const retained = await snapshot(f.page, item);
        if (side === 'before')
          assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
        const cdp = await f.context.newCDPSession(f.page);
        if (side === 'after') {
          const crashed = f.page.waitForEvent('crash');
          void cdp.send('Page.crash').catch(() => {});
          await crashed;
        }
        await f.page.close();
        f.page = await f.context.newPage();
        await f.setup(f.page);
        const result = await prepare(f.page, item),
          after = await snapshot(f.page, item);
        assert.equal(
          after.record.seal_reserved,
          before.record.seal_reserved +
            (stage === 'reserved' && side === 'before'
              ? 2
              : stage === 'prepared' && side === 'after'
                ? 2
                : 4),
        );
        if (stage === 'prepared' && side === 'after')
          assert.deepEqual(
            result.credentials,
            retained.marker.credentials.map((c) => ({
              role: c.role,
              id: c.id,
              publicKey: Buffer.from(Object.values(c.publicKey)).toString('hex'),
            })),
          );
        assert.deepEqual(after.record.credentials, before.record.credentials);
        await abandon(f.page, item);
        assert.match(await text(f.page, item), /written before promotion/);
      },
    );

test(
  'generated histories exercise restart, damaged markers, failed reservations, writing and abandonment against an independent ledger',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t);
    let runs = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom('prepare', 'restart', 'wrong', 'tamper', 'abort', 'abandon', 'edit'),
          { minLength: 2, maxLength: 9 },
        ),
        async (commands) => {
          const item = await f.ready('generated-' + runs++);
          let prepared = null,
            spent = 3,
            abandoned = false;
          try {
            for (const command of commands) {
              if (command === 'restart') {
                await f.setup(f.page);
                continue;
              }
              if (command === 'wrong') {
                await assert.rejects(prepare(f.page, { ...item, code: 'wrong' }));
                continue;
              }
              if (command === 'tamper' && prepared) {
                await f.page.evaluate(async (slot) => {
                  window.saved = (await Harness.rows()).find(
                    (r) => r.key[0] === slot && r.key[1] === 'application-upgrade',
                  );
                  const changed = structuredClone(saved.value);
                  changed.id = 'ef'.repeat(16);
                  await Harness.put(saved.key, changed);
                }, item.slotId);
                await assert.rejects(prepare(f.page, item), /authentication/);
                await f.page.evaluate(() => Harness.put(saved.key, saved.value));
                continue;
              }
              if (command === 'edit') {
                if (prepared) await assert.rejects(edit(f.page, item));
                else await edit(f.page, item);
                continue;
              }
              if (command === 'abandon') {
                await abandon(f.page, item);
                if (prepared) {
                  prepared = null;
                  abandoned = true;
                }
                continue;
              }
              if (command === 'abort' && !prepared && !abandoned) {
                await boundary(f.page, 'reserved', 'before');
                await assert.rejects(prepare(f.page, item));
                await f.setup(f.page);
                continue;
              }
              if (abandoned) {
                await assert.rejects(prepare(f.page, item));
                continue;
              }
              const next = await prepare(f.page, item);
              if (prepared) assert.deepEqual(next, prepared);
              else {
                prepared = next;
                spent += 2;
              }
              assert.equal((await snapshot(f.page, item)).record.seal_reserved, spent);
            }
          } catch (error) {
            if (process.env.ACCOUNT_REPORT_DIR)
              writeFileSync(
                join(process.env.ACCOUNT_REPORT_DIR, 'counterexample.json'),
                JSON.stringify({ seed: 9192026, commands, error: String(error) }, null, 2),
              );
            throw error;
          }
        },
      ),
      { numRuns: 45, seed: 9192026, endOnFailure: true },
    );
    assert.equal(runs, 45);
  },
);

test(
  'observed MAC fault control admits a substituted preparation identity only with authentication disabled',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('control'),
      original = await prepare(f.page, item);
    const substitutedId = await f.page.evaluate(async (slot) => {
      const row = (await Harness.rows()).find(
        (r) => r.key[0] === slot && r.key[1] === 'application-upgrade',
      );
      row.value.id = 'ef'.repeat(16);
      await Harness.put(row.key, row.value);
      return row.value.id;
    }, item.slotId);
    await assert.rejects(prepare(f.page, item), /authentication/);
    await f.page.evaluate(await bundle(true));
    const accepted = await prepare(f.page, item);
    assert.equal(accepted.id, 'ef'.repeat(16));
    assert.notEqual(accepted.id, original.id);
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-mac.json'),
        JSON.stringify(
          {
            baseline: 'refused',
            mutant: 'accepted-substituted-intent',
            originalId: original.id,
            substitutedId,
            acceptedId: accepted.id,
          },
          null,
          2,
        ),
      );
  },
);

test(
  'missing completed counter and exhausted seal budget refuse without replacement or network authority',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('missing-counter');
    await f.page.evaluate((scope) => Harness.removeCounter(scope), item.scope);
    const before = await inventory(f.page),
      calls = await f.page.evaluate(() => calls);
    await assert.rejects(prepare(f.page, item), /initialized-content-missing/);
    assert.equal(await inventory(f.page), before);
    assert.equal(await f.page.evaluate(() => calls), calls);
    const full = await f.ready('budget');
    await f.page.evaluate(
      (item) => Harness.budget(item.slotId, item.code, 2 ** 32 - 2),
      args(full),
    );
    const exhausted = await inventory(f.page);
    await assert.rejects(prepare(f.page, full), /budget exhausted/);
    assert.equal(await inventory(f.page), exhausted);
  },
);

test(
  'competing preparers converge; cancellation retains exclusion until native network work settles',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('competition'),
      other = await f.context.newPage();
    await f.setup(other);
    const [a, b] = await Promise.all([prepare(f.page, item), prepare(other, item)]);
    assert.deepEqual(a, b);
    assert.equal((await snapshot(f.page, item)).record.seal_reserved, 5);
    await f.page.evaluate((item) => {
      window.controller = new AbortController();
      window.work = Harness.prepareLocalPromotion({
        ...item,
        pin,
        proveAuthority: prove,
        signal: controller.signal,
        transport: {
          ...transport,
          inspect: async (input) => {
            window.entered = true;
            await new Promise((resolve) => (window.release = resolve));
            return transport.inspect(input);
          },
        },
      }).then(
        () => 'success',
        (error) => error.code ?? String(error),
      );
    }, args(item));
    await f.page.waitForFunction(() => window.entered === true);
    await f.page.evaluate(() => controller.abort());
    await other.evaluate((item) => {
      window.completed = false;
      window.waiter = Harness.prepareLocalPromotion({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
      }).then((result) => {
        window.completed = true;
        return result;
      });
    }, args(item));
    assert.equal(await other.evaluate(() => window.completed), false);
    await f.page.evaluate(async () => {
      release();
      await work;
    });
    assert.notEqual(await f.page.evaluate(() => work), 'success');
    assert.deepEqual(await other.evaluate(() => waiter), a);
  },
);

test(
  'recovery owner abandons unsaved or cancelled code through current proof, retains lost replies, and permits a fresh registration',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t);
    for (const terminal of [false, true]) {
      const item = await f.local('recover-' + terminal),
        options = { ...args(item), context: item.context };
      await f.page.evaluate(async (item) => {
        window.recoveryOptions = {
          context: item.context,
          accountId: item.accountId,
          retryKey: item.retryKey,
          pin,
          local: { slotId: item.slotId, code: item.code },
          transport: {
            begin: (input) => request('/account/recovery/begin', input),
            finish: (input) => request('/account/recovery/finish', input),
            abandon: transport.abandon,
          },
        };
        await Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.generate());
      }, options);
      const draft = await f.page.evaluate(() =>
        Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.draft()),
      );
      if (terminal) {
        await f.server.core.beginRecovery({ retryKey: item.retryKey, draft });
        f.server.core.cancelRecovery({ retryKey: item.retryKey });
      }
      await assert.rejects(
        f.page.evaluate(() =>
          Harness.withRecoveryOwner(
            {
              ...recoveryOptions,
              transport: {
                ...recoveryOptions.transport,
                abandon: async (input) => {
                  await transport.abandon(input);
                  throw Error('lost reply');
                },
              },
            },
            (owner) => owner.abandon(),
          ),
        ),
        /lost reply/,
      );
      assert.equal(
        await f.page.evaluate(() =>
          Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.status()),
        ),
        'awaiting-code',
      );
      // Owner disposal and a fresh acquisition resolve the service commit after a lost reply.
      await f.page.evaluate(() =>
        Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.abandon()),
      );
      assert.equal(
        await f.page.evaluate(() =>
          Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.status()),
        ),
        'empty',
      );
      assert.equal(
        f.server.core.pendingPreparation({ retryKey: item.retryKey, accountId: item.accountId }).ok,
        false,
      );
    }
  },
);

test(
  'abandonment lost reply and local deletion abort retain exact prepared identity for retry',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('abandon-failure'),
      prepared = await prepare(f.page, item),
      before = await snapshot(f.page, item);
    await assert.rejects(
      f.page.evaluate(
        (item) =>
          Harness.abandonLocalPromotion({
            ...item,
            pin,
            transport: {
              ...transport,
              abandon: async (input) => {
                await transport.abandon(input);
                throw Error('lost abandonment reply');
              },
            },
          }),
        args(item),
      ),
      /lost abandonment reply/,
    );
    assert.deepEqual(await snapshot(f.page, item), before);
    await assert.rejects(prepare(f.page, item));
    await f.page.evaluate(() => {
      const original = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function (key) {
        const r = original.call(this, key);
        if (Array.isArray(key) && key[1] === 'application-upgrade')
          r.addEventListener('success', () => this.transaction.abort());
        return r;
      };
    });
    await assert.rejects(abandon(f.page, item), /transaction did not complete/);
    assert.equal((await snapshot(f.page, item)).marker.id, prepared.id);
    await f.setup(f.page);
    assert.equal((await abandon(f.page, item)).kind, 'promotion-abandoned');
    assert.equal((await snapshot(f.page, item)).record.seal_reserved, 5);
  },
);

test(
  'confirmed recovery draft stays owned until Local promotion is abandoned, and unknown Local references refuse reset',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.local('recovery-reference');
    await f.page.exposeFunction('assertRecovery', (options) =>
      item.key.assert({ options }, { client: { origin: f.server.origin } }),
    );
    await f.page.evaluate(
      async (item) => {
        window.recoveryOptions = {
          context: item.context,
          accountId: item.accountId,
          retryKey: item.retryKey,
          pin,
          local: { slotId: item.slotId, code: item.code },
          transport: {
            begin: (input) => request('/account/recovery/begin', input),
            finish: (input) => request('/account/recovery/finish', input),
            abandon: transport.abandon,
          },
        };
        const generated = await Harness.withRecoveryOwner(recoveryOptions, (owner) =>
          owner.generate(),
        );
        await Harness.withRecoveryOwner(recoveryOptions, (owner) =>
          owner.confirm(generated.code, assertRecovery),
        );
      },
      { ...args(item), context: item.context },
    );
    item.draft = await f.page.evaluate(() =>
      Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.draft()),
    );
    await f.page.evaluate(
      (slot) => Harness.put([slot, 'unknown-reference'], { v: 99 }),
      item.slotId,
    );
    const calls = await f.page.evaluate(() => calls);
    await assert.rejects(
      f.page.evaluate(() => Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.abandon())),
      /unknown-local-creation-carrier/,
    );
    assert.equal(await f.page.evaluate(() => calls), calls);
    await f.page.evaluate((slot) => Harness.remove([slot, 'unknown-reference']), item.slotId);
    await prepare(f.page, item);
    await assert.rejects(
      f.page.evaluate(() => Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.abandon())),
      /Abandon retained Local promotion first/,
    );
    assert.equal(
      await f.page.evaluate(() =>
        Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.status()),
      ),
      'finalization-pending',
    );
    await abandon(f.page, item);
    await f.page.evaluate(() =>
      Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.abandon()),
    );
    assert.equal(
      await f.page.evaluate(() =>
        Harness.withRecoveryOwner(recoveryOptions, (owner) => owner.status()),
      ),
      'empty',
    );
  },
);
