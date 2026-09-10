import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const artifact = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name),
      JSON.stringify(value, null, 2) + '\n',
    );
};
import {
  native,
  selected,
  open,
  edit,
  close,
  cold,
  prepare,
  envelopes,
  status,
  spoolBoundary,
  waitHit,
  crash,
  snapshot,
  captures,
  args,
  spoolBundle,
  configure,
} from './fixtures.mjs';
test(
  'spool persists exact v2 envelopes with separate positions/attempts and retains sources through restart and compaction',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'roundtrip');
    await open(f.page, item);
    assert.equal((await snapshot(f.page, item)).marker.v, 7);
    await edit(f.page, 0, 0, 'spooled ');
    const sources = await captures(f.page),
      saved = [];
    for (let i = 0; i < sources.reduce((n, c) => n + c.sources.length, 0); i++)
      saved.push(await prepare(f.page));
    assert.equal(await prepare(f.page), null);
    assert.equal(saved.length, f.invocations.length);
    const before = await status(f.page);
    assert.equal(before.attempts, saved.length);
    assert.deepEqual(
      before.positions.map((p) => p.position),
      saved.map((_, i) => i + 1),
    );
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'spooled base original');
    assert.deepEqual(await envelopes(f.page), saved);
    assert.equal(f.invocations.length, saved.length);
    for (const c of sources)
      assert.deepEqual(
        (await captures(f.page)).find((x) => x.id === c.id),
        c,
      );
    await close(f.page);
  },
);
for (const type of ['position', 'attempt', 'envelope'])
  for (const side of ['before', 'after'])
    test(
      `${type} ${side} commit restarts with contiguous positions and counts every fresh invocation`,
      { timeout: 30000 },
      async (t) => {
        const f = await native(t),
          item = await selected(f, type + '-' + side);
        await open(f.page, item);
        await edit(f.page, 0, 0, 'durable ');
        await spoolBoundary(f.page, type, side);
        await f.page.evaluate(() => {
          window.work = opened.prepareNextEnvelope().then(
            () => 'ready',
            (e) => String(e),
          );
        });
        await waitHit(f.page);
        if (side === 'before')
          assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
        await crash(f);
        const observed = f.invocations.length;
        await cold(f);
        await open(f.page, item);
        const recovered = await envelopes(f.page),
          s = await status(f.page);
        assert.equal(s.positions.length, type === 'position' && side === 'before' ? 0 : 1);
        assert.equal(recovered.length, type === 'envelope' && side === 'after' ? 1 : 0);
        if (!recovered.length) {
          const first = await prepare(f.page);
          assert.equal(first.position, 1);
        } else {
          assert.equal(recovered[0].position, 1);
          assert.equal(f.invocations.length, observed);
        }
        const now = await status(f.page);
        assert.ok(now.attempts >= f.invocations.length);
        assert.equal(now.positions[0].persisted, true);
        await close(f.page);
      },
    );

for (const side of ['before', 'after'])
  test(
    `v7 activation ${side} commit fences old capture without exposing an editor`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'activate-' + side);
      const { boundary } = await import('../account-capture/fixtures.mjs');
      await boundary(f.page, 'account-spooling', side);
      await f.page.evaluate((item) => {
        window.work = openEditor(item).then(
          () => 'ready',
          (e) => String(e),
        );
      }, args(item));
      await waitHit(f.page);
      assert.equal((await snapshot(f.page, item)).marker.v, side === 'before' ? 6 : 7);
      assert.equal(await f.page.evaluate(() => !!window.editor), false);
      await crash(f);
      await cold(f);
      await open(f.page, item);
      assert.equal((await status(f.page)).positions.length, 0);
      await close(f.page);
      await assert.rejects(
        f.page.evaluate(
          (item) => Harness.openOwnedCapturedAccountWorkspace(optionsFor(item)),
          args(item),
        ),
        /spool owner/,
      );
      await f.page.evaluate(await spoolBundle('old-reader'));
      await configure(f.page);
      await assert.rejects(open(f.page, item), /Malformed|Unsupported/);
    },
  );
test(
  'prepared signer and each original actor bind the actual wire; stored sources remain after mixed work',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'actors');
    await open(f.page, item);
    await f.page.evaluate(
      () =>
        editor.command({
          kind: 'compose',
          to: { date: '2026-09-10', section: 'next' },
          text: 'bulk source',
        }).accepted,
    );
    await f.page.evaluate(
      () => editor.command({ kind: 'bulk', from: '2026-09-10', to: 'master' }).accepted,
    );
    await edit(f.page, 0, 0, 'human ');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    const sources = await captures(f.page);
    let count = 0;
    while (await prepare(f.page)) if (++count > 30) throw Error('Unbounded fixture');
    const verification = await f.page.evaluate(async (item) => {
      const state = await Harness.snapshot(item.scope),
        route = Harness.networkRoute(Harness.captureRoute(state.marker));
      const prepared = await crypto.subtle.importKey(
        'raw',
        state.marker.credentials[1].publicKey,
        'Ed25519',
        false,
        ['verify'],
      );
      const local = await crypto.subtle.importKey(
        'raw',
        state.record.credentials[1].publicKey,
        'Ed25519',
        false,
        ['verify'],
      );
      let verified = 0,
        refused = 0;
      for (const e of await opened.listEnvelopes()) {
        await Harness.verifyNetworkEnvelope(e.bytes, route, prepared);
        verified++;
        try {
          await Harness.verifyNetworkEnvelope(e.bytes, route, local);
        } catch {
          refused++;
        }
      }
      return { verified, refused };
    }, args(item));
    assert.deepEqual(verification, { verified: count, refused: count });
    assert.equal(
      (await status(f.page)).positions.length,
      sources.reduce((n, c) => n + c.sources.length, 0),
    );
    assert.ok(sources.some((c) => c.sources.some((s) => s.kind === 'system')));
    assert.ok(sources.some((c) => c.sources.some((s) => s.kind === 'human')));
    await f.page.evaluate(() => opened.compactContent());
    assert.deepEqual(await captures(f.page), sources);
    await close(f.page);
  },
);
for (const mode of ['source-missing', 'source-changed', 'wire', 'attempt', 'ledger-missing'])
  test(
    `authenticated-at-rest ${mode} corruption refuses restart without writes or new crypto`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'fault-' + mode);
      await open(f.page, item);
      await prepare(f.page);
      await close(f.page);
      await f.page.evaluate(({ item, mode }) => Harness.spoolFault(item.slotId, item.code, mode), {
        item: args(item),
        mode,
      });
      const { inventory } = await import('../account-capture/fixtures.mjs'),
        before = await inventory(f.page),
        attempts = f.invocations.length;
      await assert.rejects(open(f.page, item), /source|sequence|signature|invocation|ledger/i);
      assert.equal(await inventory(f.page), before);
      assert.equal(f.invocations.length, attempts);
    },
  );
test(
  'close drains a paused encryption, withholds wire, and prevents stale and queued owners from reusing its grant',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'drain');
    await open(f.page, item);
    await f.page.evaluate(() => {
      window.pauseNet = true;
      window.work = opened.prepareNextEnvelope().then(
        () => 'ready',
        (e) => String(e),
      );
    });
    await waitHit(f.page);
    await edit(f.page, 0, 0, 'late ');
    await f.page.evaluate((slot) => {
      window.closing = editor.close();
      window.competed = false;
      window.competitor = navigator.locks.request(Harness.slotPermitName(slot), () => {
        window.competed = true;
      });
    }, item.slotId);
    await f.page.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => competed), false);
    await assert.rejects(envelopes(f.page), /inactive|live/i);
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => closing);
    await f.page.evaluate(() => competitor);
    assert.notEqual(await f.page.evaluate(() => work), 'ready');
    await cold(f);
    await open(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'late base original');
    assert.equal((await status(f.page)).attempts, 1);
    assert.equal((await envelopes(f.page)).length, 0);
    await prepare(f.page);
    assert.equal((await status(f.page)).attempts, 2);
    assert.equal(f.invocations.length, 2);
    await close(f.page);
  },
);
test(
  'a lowered budget fence refuses before the first prohibited encryption',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'budget');
    await f.page.evaluate(await spoolBundle('budget'));
    await configure(f.page);
    await open(f.page, item);
    await edit(f.page, 0, 0, 'third');
    await prepare(f.page);
    await prepare(f.page);
    assert.equal(f.invocations.length, 2);
    await assert.rejects(prepare(f.page), /budget exhausted/);
    assert.equal(f.invocations.length, 2);
    assert.equal((await status(f.page)).attempts, 2);
    await close(f.page);
  },
);
test(
  'actual controls expose return-before-persistence and invocation-grant reuse after crash',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'early-return');
    await f.page.evaluate(await spoolBundle('return-before-persist'));
    await configure(f.page);
    await open(f.page, item);
    const early = await prepare(f.page);
    assert.ok(early.bytes.length);
    assert.equal((await envelopes(f.page)).length, 0);
    await crash(f);
    await cold(f);
    await open(f.page, item);
    assert.equal((await envelopes(f.page)).length, 0);
    await close(f.page);
    const next = await selected(f, 'reuse');
    await f.page.evaluate(await spoolBundle('reuse-attempt'));
    await configure(f.page);
    await open(f.page, next);
    await spoolBoundary(f.page, 'envelope', 'before');
    await assert.rejects(prepare(f.page), /transaction did not complete/);
    const prior = f.invocations.length;
    await crash(f);
    await cold(f);
    await f.page.evaluate(await spoolBundle('reuse-attempt'));
    await configure(f.page);
    await open(f.page, next);
    await prepare(f.page);
    assert.equal(f.invocations.length, prior + 1);
    assert.equal((await status(f.page)).attempts, 1);
    await close(f.page);
    artifact('controls.json', {
      earlyReturn: { returnedBytes: early.bytes.length, persistedEnvelopes: 0 },
      reuse: { nativeInvocations: 2, durableAttempts: 1 },
    });
  },
);

test(
  'one mixed capsule maps to separate exact actor envelopes, including a pending frame and a large source',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'mixed-pending');
    const fixture = await f.page.evaluate(async (item) => {
      const { carrier } = await Harness.openAccountCaptureSession(
        optionsFor(item),
        item.scope.principalId,
      );
      const d = new Harness.Y.Doc();
      d.getText('large').insert(0, 'a'.repeat(10000));
      const large = Harness.Y.encodeStateAsUpdate(d);
      d.destroy();
      const pending = new Harness.Y.Doc();
      pending.getText('pending').insert(0, 'parent');
      const sv = Harness.Y.encodeStateVector(pending);
      pending.getText('pending').insert(6, ' child');
      const child = Harness.Y.encodeStateAsUpdate(pending, sv);
      pending.destroy();
      const capsule = carrier.captureLocal(large, [
        { actor: item.scope.principalId, kind: 'human', bytes: large },
        { actor: 'system', kind: 'system', bytes: child },
      ]);
      const attempt = carrier.appendLocal(capsule);
      if (attempt.status === 'journalled') throw Error('Expected oversized capsule');
      await carrier.appendBatch([{ kind: 'update', bytes: capsule }]);
      await carrier.close();
      return { large: [...large], child: [...child] };
    }, args(item));
    await open(f.page, item);
    let count = 0;
    while (await prepare(f.page)) if (++count > 20) throw Error('Unbounded fixture');
    const source = (await captures(f.page)).find((c) => c.sources.length === 2);
    assert.deepEqual(
      source.sources.map((s) => s.bytes),
      [fixture.large, fixture.child],
    );
    const refs = (await status(f.page)).positions.filter((p) => p.source.id === source.id);
    assert.deepEqual(
      refs.map((p) => p.source.index),
      [0, 1],
    );
    assert.ok(refs.every((p) => p.persisted));
    const saved = await envelopes(f.page);
    assert.equal((await f.page.evaluate(() => opened.compactContent())).status, 'retained');
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.deepEqual(await envelopes(f.page), saved);
    await close(f.page);
  },
);
test(
  'generated native crash histories preserve exact wire, source references and an external invocation bound',
  { timeout: 180000 },
  async (t) => {
    const f = await native(t),
      seed = 9502026,
      histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            text: fc.constantFrom('x', 'é', '🙂'),
            boundary: fc.constantFrom(
              'normal',
              'position-before',
              'position-after',
              'attempt-before',
              'attempt-after',
              'envelope-before',
              'envelope-after',
              'compact',
            ),
          }),
          { minLength: 2, maxLength: 4 },
        ),
        async (history) => {
          histories.push(history);
          artifact('generated.json', { seed, histories, status: 'running' });
          console.log(`spool history ${histories.length}/8: ${JSON.stringify(history)}`);
          const item = await selected(f, 'generated-' + histories.length),
            base = f.invocations.length,
            saved = new Map();
          await open(f.page, item);
          let expected = 'base original';
          for (const step of history) {
            expected = step.text + expected;
            await edit(f.page, 0, 0, step.text);
            if (step.boundary === 'normal' || step.boundary === 'compact') await prepare(f.page);
            else {
              const [type, side] = step.boundary.split('-');
              await spoolBoundary(f.page, type, side);
              await f.page.evaluate(() => {
                window.work = opened.prepareNextEnvelope().then(
                  () => 'ready',
                  (e) => String(e),
                );
              });
              await waitHit(f.page);
              await crash(f);
              await cold(f);
              await open(f.page, item);
            }
            const ledger = await status(f.page);
            assert.ok(ledger.attempts >= f.invocations.length - base);
            if (ledger.positions.at(-1) && !ledger.positions.at(-1).persisted)
              await prepare(f.page);
            if (step.boundary === 'compact') await f.page.evaluate(() => opened.compactContent());
            const current = await envelopes(f.page);
            for (const [pos, bytes] of saved)
              assert.deepEqual(current.find((e) => e.position === pos)?.bytes, bytes);
            for (const e of current) saved.set(e.position, e.bytes);
            assert.equal(await f.page.evaluate(() => editor.read().master), expected);
            const now = await status(f.page);
            assert.deepEqual(
              now.positions.map((p) => p.position),
              now.positions.map((_, i) => i + 1),
            );
            assert.equal(
              new Set(now.positions.map((p) => p.source.id + ':' + p.source.index)).size,
              now.positions.length,
            );
          }
          let n = 0;
          while (await prepare(f.page)) if (++n > 30) throw Error('Unbounded fixture drain');
          const final = await status(f.page),
            sources = await captures(f.page);
          assert.equal(
            final.positions.length,
            sources.reduce((n, c) => n + c.sources.length, 0),
          );
          assert.ok(final.attempts >= f.invocations.length - base);
          await close(f.page);
        },
      ),
      { seed, numRuns: 8, endOnFailure: true },
    );
    artifact('generated.json', { seed, histories, status: 'passed' });
  },
);

test(
  'missing final envelope refuses reopening a previously exposed position',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'missing-tail');
    await open(f.page, item);
    const before = await prepare(f.page);
    await close(f.page);
    await f.page.evaluate(
      (item) => Harness.spoolFault(item.slotId, item.code, 'envelope-missing'),
      args(item),
    );
    let refused = false;
    try {
      await open(f.page, item);
    } catch {
      refused = true;
    }
    if (!refused) {
      const after = await prepare(f.page);
      artifact('missing-tail-counterexample.json', {
        before,
        after,
        invocations: f.invocations.length,
      });
      await close(f.page);
      assert.equal(after.position, before.position);
      assert.notDeepEqual(after.bytes, before.bytes);
    }
    assert.equal(refused, true, 'A deleted persisted wire must not reopen as permission to remint');
  },
);

for (const side of ['before', 'after'])
  test(
    `spool metadata activation ${side} commit resumes before admission`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'meta-' + side);
      await f.page.evaluate((side) => {
        const put = IDBObjectStore.prototype.put,
          marked = new WeakSet();
        IDBObjectStore.prototype.put = function (value, ...args) {
          const r = put.call(this, value, ...args);
          if (this.name === 'meta' && value.v === 2 && value.spool.events === 0) {
            marked.add(this.transaction);
            if (side === 'before')
              r.addEventListener('success', () => {
                window.hit = true;
                this.transaction.abort();
              });
          }
          return r;
        };
        const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
        Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
          ...d,
          set(fn) {
            d.set.call(this, function (e) {
              if (marked.has(this) && side === 'after') {
                window.hit = true;
                window.release = () => fn.call(this, e);
              } else fn.call(this, e);
            });
          },
        });
      }, side);
      await f.page.evaluate((item) => {
        window.work = openEditor(item).then(
          () => 'ready',
          (e) => String(e),
        );
      }, args(item));
      await waitHit(f.page);
      assert.equal(await f.page.evaluate(() => !!window.editor), false);
      assert.equal((await snapshot(f.page, item)).marker.v, 7);
      await crash(f);
      await cold(f);
      await open(f.page, item);
      assert.equal((await prepare(f.page)).position, 1);
      await close(f.page);
    },
  );
test(
  'removing the actual witness check reproduces remint after a missing final row',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'witness-control');
    await open(f.page, item);
    const before = await prepare(f.page);
    await close(f.page);
    await f.page.evaluate(
      (item) => Harness.spoolFault(item.slotId, item.code, 'envelope-missing'),
      args(item),
    );
    await f.page.evaluate(await spoolBundle('no-witness'));
    await configure(f.page);
    await open(f.page, item);
    const after = await prepare(f.page);
    assert.equal(after.position, before.position);
    assert.notDeepEqual(after.bytes, before.bytes);
    artifact('missing-tail-control.json', { before, after, invocations: f.invocations.length });
    await close(f.page);
  },
);
