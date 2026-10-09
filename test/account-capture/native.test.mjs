import { rememberCaptures, verifyCaptures } from './oracles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import {
  native,
  selected,
  open,
  edit,
  close,
  cold,
  captures,
  crash,
  freezeFlush,
  snapshot,
  inventory,
  boundary,
  waitHit,
  args,
  captureBundle,
  configure,
} from './fixtures.mjs';
const artifact = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name),
      JSON.stringify(value, null, 2) + '\n',
    );
};
test(
  'captured Account activates, journals exact sources, cold reopens and retains capsules through compaction',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'capture');
    await open(f.page, item);
    assert.equal((await snapshot(f.page, item)).marker.v, 6);
    const before = await captures(f.page);
    assert.ok(before.length > 0);
    await freezeFlush(f.page);
    await edit(f.page, 4, 0, ' captured');
    const journalled = await captures(f.page),
      added = journalled.filter((c) => !before.some((b) => b.id === c.id));
    assert.equal(added.length, 1);
    assert.equal(added[0].sources[0].actor, item.scope.principalId);
    assert.notEqual(added[0].credential, (await snapshot(f.page, item)).record.credentials[1].id);
    await crash(f);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'base captured original');
    const recovered = await captures(f.page);
    assert.deepEqual(
      recovered.find((c) => c.id === added[0].id),
      added[0],
    );
    await f.page.evaluate(() => opened.compactContent());
    assert.deepEqual(
      (await captures(f.page)).find((c) => c.id === added[0].id),
      added[0],
    );
    await close(f.page);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'base captured original');
    await close(f.page);
  },
);
for (const side of ['before', 'after'])
  test(
    `capture activation ${side} commit prevents premature initialization`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'activation-' + side);
      await boundary(f.page, 'account-capturing', side);
      await f.page.evaluate((item) => {
        window.work = openEditor(item).then(
          () => 'ready',
          (e) => String(e),
        );
      }, args(item));
      await waitHit(f.page);
      assert.equal((await snapshot(f.page, item)).marker.v, side === 'before' ? 4 : 6);
      assert.equal(await f.page.evaluate(() => !!window.editor), false);
      if (side === 'before')
        assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
      else await crash(f);
      await cold(f);
      assert.equal((await open(f.page, item)).master, 'base original');
      await close(f.page);
    },
  );
test(
  'v5 histories and old readers refuse; public receive cannot acquire capture authority',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'v5');
    await f.page.evaluate(async (item) => {
      const old = await Harness.openOwnedAccountWorkspace(optionsFor(item));
      await old.workspace.close();
    }, args(item));
    const before = await inventory(f.page);
    await assert.rejects(open(f.page, item), /catch-up checkpoint/);
    assert.equal(await inventory(f.page), before);
    const fresh = await selected(f, 'old-reader');
    await open(f.page, fresh);
    await close(f.page);
    await f.page.evaluate(await captureBundle('old-reader'));
    await configure(f.page);
    await assert.rejects(
      open(f.page, fresh),
      /Malformed preparation|Unsupported promotion|promotion|Unsupported/,
    );
    await cold(f);
    await open(f.page, fresh);
    await assert.rejects(
      f.page.evaluate(() => editor.receive(new Uint8Array([0, 0])).accepted),
      /validation/,
    );
    await close(f.page);
  },
);
test(
  'pressured database admission is atomic; aborted capture leaves input pending and retry captures once',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'abort');
    await open(f.page, item);
    const before = await captures(f.page);
    await f.page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new DOMException('quota', 'QuotaExceededError');
      };
      window.restoreSet = () => (Storage.prototype.setItem = set);
      const add = IDBObjectStore.prototype.add;
      window.failCapture = true;
      IDBObjectStore.prototype.add = function (v, k) {
        const r = add.call(this, v, k);
        if (v?.kind === 'outbound' && window.failCapture)
          r.addEventListener('success', () => this.transaction.abort());
        return r;
      };
      window.ticket = surface.input(
        { name: 'insert', text: ' pending' },
        { ranges: [{ anchor: 4, head: 4 }], main: 0 },
      );
    });
    await f.page.waitForFunction(() => editor.status.state === 'blocked');
    assert.equal(await f.page.evaluate(() => editor.read().master), 'base original');
    assert.deepEqual(await captures(f.page), before);
    await f.page.evaluate(() => {
      window.failCapture = false;
      editor.retry();
    });
    await f.page.evaluate(() => ticket.accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'base pending original');
    assert.equal((await captures(f.page)).length, before.length + 1);
    await close(f.page);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'base pending original');
    await close(f.page);
  },
);
test(
  'journal cleanup failure retains exact overlap; cold recovery deduplicates capsule identity',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'overlap');
    await open(f.page, item);
    await freezeFlush(f.page);
    await edit(f.page, 4, 0, ' overlap');
    const before = await captures(f.page);
    await f.page.evaluate(() => {
      Storage.prototype.removeItem = function () {
        throw Error('injected cleanup failure');
      };
    });
    await assert.rejects(
      f.page.evaluate(() => editor.whenDurable()),
      /cleanup|retry/,
    );
    assert.deepEqual(await captures(f.page), before);
    await crash(f);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'base overlap original');
    for (const c of before)
      assert.deepEqual(
        (await captures(f.page)).find((x) => x.id === c.id),
        c,
      );
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
  },
);
test(
  'capture controls expose lost durable attribution and wrong-workspace acceptance',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      baselineItem = await selected(f, 'retention-baseline');
    await open(f.page, baselineItem);
    const before = (await captures(f.page)).length;
    await edit(f.page, 4, 0, ' control');
    await f.page.evaluate(() => editor.whenDurable());
    const baseline = {
      before,
      after: (await captures(f.page)).length,
      text: await f.page.evaluate(() => editor.read().master),
    };
    assert.equal(baseline.after, before + 1);
    assert.equal(baseline.text, 'base control original');
    await close(f.page);
    await cold(f);
    const item = await selected(f, 'retention-control');
    await f.page.evaluate(await captureBundle('retention'));
    await configure(f.page);
    await open(f.page, item);
    await edit(f.page, 4, 0, ' control');
    await f.page.evaluate(() => editor.whenDurable());
    const mutant = {
      captures: (await captures(f.page)).length,
      text: await f.page.evaluate(() => editor.read().master),
    };
    assert.equal(mutant.captures, 0);
    assert.equal(mutant.text, 'base control original');
    await close(f.page);
    // A validly encoded capsule from another workspace must fail before it can be journalled.
    const next = await selected(f, 'route-control');
    await cold(f);
    await open(f.page, next);
    const check = async () =>
      f.page.evaluate(async () => {
        const c = (await opened.listCaptures())[0];
        try {
          c.workspace = 'ab'.repeat(16);
          const b = Harness.encodeSourceCapsule(c);
          try {
            Harness.decodeSourceCapsule(b, {
              workspace: opened.workspaceId,
              principal: c.principal,
              credential: c.credential,
              epoch: c.epoch,
              generation: c.generation,
            });
            return {
              status: 'accepted',
              actualWorkspace: c.workspace,
              expectedWorkspace: opened.workspaceId,
            };
          } catch {
            return {
              status: 'refused',
              actualWorkspace: c.workspace,
              expectedWorkspace: opened.workspaceId,
            };
          } finally {
            b.fill(0);
          }
        } finally {
          Harness.eraseCapsule(c);
        }
      });
    const routeBaseline = await check();
    assert.equal(routeBaseline.status, 'refused');
    assert.notEqual(routeBaseline.actualWorkspace, routeBaseline.expectedWorkspace);
    await f.page.evaluate(await captureBundle('route'));
    const routeMutant = await check();
    assert.deepEqual(routeMutant, { ...routeBaseline, status: 'accepted' });
    await close(f.page);
    artifact('controls.json', {
      retention: { baseline, mutant },
      route: { baseline: routeBaseline, mutant: routeMutant },
    });
  },
);
test(
  'generated real editing, flush, compaction and cold restart histories preserve source bytes',
  { timeout: 90000 },
  async (t) => {
    const f = await native(t),
      seed = 9322026,
      histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            text: fc.constantFrom('x', 'é', '🙂', 'abc'),
            cut: fc.boolean(),
            boundary: fc.constantFrom('flush', 'compact', 'reopen', 'crash'),
          }),
          { minLength: 2, maxLength: 6 },
        ),
        async (history) => {
          const evidence = { commands: history, initial: [], steps: [] };
          histories.push(evidence);
          artifact('generated.json', {
            seed,
            runs: histories.length,
            histories,
            status: 'running',
          });
          console.log(`capture history ${histories.length}/16: ${JSON.stringify(history)}`);
          const item = await selected(f, 'generated-' + histories.length);
          await open(f.page, item);
          let expected = 'base original';
          const retained = new Map();
          evidence.initial = await captures(f.page);
          rememberCaptures(retained, evidence.initial);
          for (const step of history) {
            await freezeFlush(f.page);
            const n = step.cut ? (Array.from(expected)[0]?.length ?? 0) : 0;
            await edit(f.page, 0, n, step.text);
            expected = step.text + expected.slice(n);
            const admitted = await captures(f.page);
            rememberCaptures(retained, admitted);
            if (step.boundary === 'flush') await f.page.evaluate(() => editor.whenDurable());
            if (step.boundary === 'compact') await f.page.evaluate(() => opened.compactContent());
            if (step.boundary === 'reopen' || step.boundary === 'crash') {
              if (step.boundary === 'crash') await crash(f);
              else await close(f.page);
              await cold(f);
              await open(f.page, item);
            }
            const observed = await f.page.evaluate(() => editor.read().master);
            assert.equal(observed, expected);
            const recovered = await captures(f.page);
            evidence.steps.push({ admitted, recovered, observed });
            artifact('generated.json', {
              seed,
              runs: histories.length,
              histories,
              status: 'running',
            });
            verifyCaptures(
              retained,
              recovered,
              ['reopen', 'crash'].includes(step.boundary) ? evidence.initial[0] : undefined,
            );
          }
          await close(f.page);
        },
      ),
      { seed, numRuns: 16, endOnFailure: true },
    );
    artifact('generated.json', { seed, runs: histories.length, histories, status: 'passed' });
  },
);

test(
  'exclusive lifetime queues another editor; cancellation, pagehide and stale surfaces revoke access',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'queue');
    await open(f.page, item);
    const second = await f.context.newPage();
    await f.setup(second);
    await second.evaluate((item) => {
      window.controller = new AbortController();
      window.proofs = 0;
      const o = optionsFor(item);
      o.signal = controller.signal;
      o.assertPasskey = async (r) => {
        proofs++;
        return assertPasskey(r);
      };
      window.pending = Harness.openOwnedCapturedAccountWorkspace(o).then(
        () => 'opened',
        (e) => String(e),
      );
    }, args(item));
    await second.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await second.evaluate(() => proofs), 0);
    await second.evaluate(() => controller.abort());
    assert.match(await second.evaluate(() => pending), /cancelled|acquisition failed/i);
    await edit(f.page, 4, 0, ' accepted');
    await f.page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    await f.page.waitForFunction(() => editor.status.state === 'closed');
    const failures = await f.page.evaluate(() =>
      [
        () => editor.read(),
        () => surface.read(),
        () => surface.input({ name: 'insert', text: 'bad' }),
        () => editor.snapshot(),
        () => editor.exportArchive(),
      ].map((fn) => {
        try {
          fn();
          return false;
        } catch {
          return true;
        }
      }),
    );
    assert.ok(failures.every(Boolean));
    assert.equal((await open(second, item)).master, 'base accepted original');
    await close(second);
    await second.close();
  },
);

test(
  'cancelled native flush holds permit until drain and destroys projections before release',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'drain');
    await f.page.evaluate(() => {
      window.seenDocs = new Set();
      const get = Harness.Y.Doc.prototype.getText;
      Harness.Y.Doc.prototype.getText = function (...a) {
        seenDocs.add(this);
        return get.apply(this, a);
      };
    });
    await open(f.page, item);
    await edit(f.page, 0, 0, 'journal ');
    await f.page.evaluate(() => {
      const add = IDBObjectStore.prototype.add,
        marked = new WeakSet();
      IDBObjectStore.prototype.add = function (value, ...rest) {
        const r = add.call(this, value, ...rest);
        if (this.name === 'content') marked.add(this.transaction);
        return r;
      };
      const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
        ...d,
        set(fn) {
          d.set.call(this, function (e) {
            if (marked.has(this)) {
              window.hit = true;
              window.release = () => fn.call(this, e);
            } else fn.call(this, e);
          });
        },
      });
      window.work = editor.whenDurable().then(
        () => 'durable',
        (e) => String(e),
      );
    });
    await waitHit(f.page);
    await f.page.evaluate((slot) => {
      window.closing = editor.close();
      window.competed = false;
      window.competitor = navigator.locks.request(Harness.slotPermitName(slot), () => {
        window.atRelease = [...seenDocs].filter((d) => !d.isDestroyed).length;
        window.competed = true;
      });
    }, item.slotId);
    await f.page.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => competed), false);
    assert.equal(
      await f.page.evaluate(() => {
        try {
          editor.read();
          return true;
        } catch {
          return false;
        }
      }),
      false,
    );
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => closing);
    await f.page.evaluate(() => competitor);
    assert.equal(await f.page.evaluate(() => atRelease), 0);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'journal base original');
    await close(f.page);
  },
);

test(
  'wrong pin, factor, passkey and actor refuse activation; receive cannot reach persistence',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'refusals'),
      before = await inventory(f.page);
    for (const kind of ['pin', 'code', 'passkey', 'identity']) {
      const error = await f.page.evaluate(
        async ({ item, kind }) => {
          const o = optionsFor(item);
          if (kind === 'pin') o.pin = { ...o.pin, authRoot: '00'.repeat(32) };
          if (kind === 'code') o.code = '0'.repeat(25);
          if (kind === 'identity') o.identity.id = '01'.repeat(16);
          if (kind === 'passkey')
            o.assertPasskey = async (r) => {
              const a = await assertPasskey(r);
              a.signature.fill(0);
              return a;
            };
          try {
            await Harness.openOwnedCapturedAccountWorkspace(o);
            return 'accepted';
          } catch (e) {
            return String(e);
          }
        },
        { item: args(item), kind },
      );
      assert.notEqual(error, 'accepted');
      assert.equal(await inventory(f.page), before);
    }
    await open(f.page, item);
    const activated = await inventory(f.page);
    assert.match(
      await f.page.evaluate(async () => {
        try {
          await editor.receive(new Uint8Array([0, 0])).accepted;
          return 'accepted';
        } catch (e) {
          return String(e);
        }
      }),
      /Inbound update failed validation/,
    );
    assert.equal(await inventory(f.page), activated);
    await close(f.page);
  },
);

test(
  'human undo and system bulk moves retain each transaction actor',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'actors');
    await open(f.page, item);
    const start = await captures(f.page);
    await edit(f.page, 0, 0, 'human ');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    const human = (await captures(f.page)).filter((c) => !start.some((b) => b.id === c.id));
    assert.equal(human.length, 2);
    assert.ok(
      human.every((c) =>
        c.sources.every((s) => s.actor === item.scope.principalId && s.kind === 'human'),
      ),
    );
    assert.equal(await f.page.evaluate(() => editor.read().master), 'base original');
    await f.page.evaluate(
      () =>
        editor.command({
          kind: 'compose',
          text: 'system-move',
          to: { date: '2026-09-10', section: 'next' },
        }).accepted,
    );
    const before = await captures(f.page);
    await f.page.evaluate(
      () => editor.command({ kind: 'bulk', from: '2026-09-10', to: 'master' }).accepted,
    );
    const system = (await captures(f.page)).filter((c) => !before.some((b) => b.id === c.id));
    assert.equal(system.length, 1);
    assert.ok(system[0].sources.every((s) => s.actor === 'system' && s.kind === 'system'));
    assert.match(await f.page.evaluate(() => editor.read().master), /system-move/);
    const all = await captures(f.page);
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    const recovered = await captures(f.page);
    for (const c of all)
      assert.deepEqual(
        recovered.find((x) => x.id === c.id),
        c,
      );
    await close(f.page);
  },
);

test(
  'original pending structs and delete frames survive journal, flush and compaction until their parent arrives',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'pending');
    const pending = await f.page.evaluate(async (item) => {
      const d = new Harness.Y.Doc(),
        text = d.getText('pending');
      text.insert(0, 'parent');
      const parent = [...Harness.Y.encodeStateAsUpdate(d)],
        sv = Harness.Y.encodeStateVector(d);
      text.insert(text.length, ' child');
      const child = Harness.Y.encodeStateAsUpdate(d, sv),
        sv2 = Harness.Y.encodeStateVector(d);
      text.delete(0, 6);
      const deletion = Harness.Y.encodeStateAsUpdate(d, sv2);
      d.destroy();
      const opened = await Harness.openAccountCaptureSession(
        optionsFor(item),
        item.scope.principalId,
      );
      const bytes = opened.carrier.captureLocal(
        child,
        [child, deletion].map((bytes) => ({ actor: item.scope.principalId, kind: 'human', bytes })),
      );
      const result = opened.carrier.appendLocal(bytes);
      if (result.status !== 'journalled') throw Error('fixture did not journal');
      const [capsule] = await opened.listCaptures();
      const id = capsule.id;
      Harness.eraseCapsule(capsule);
      await opened.carrier.close();
      return { id, parent, child: [...child], deletion: [...deletion] };
    }, args(item));
    await crash(f);
    await cold(f);
    await open(f.page, item);
    const retained = (await captures(f.page)).find((c) => c.id === pending.id);
    assert.deepEqual(
      retained.sources.map((s) => s.bytes),
      [pending.child, pending.deletion],
    );
    await edit(f.page, 0, 0, 'local ');
    assert.equal((await f.page.evaluate(() => opened.compactContent())).status, 'retained');
    await close(f.page);
    await cold(f);
    await f.page.evaluate(
      async ({ item, parent }) => {
        const { carrier } = await Harness.openAccountCaptureSession(
          optionsFor(item),
          item.scope.principalId,
        );
        const bytes = new Uint8Array(parent),
          capsule = carrier.captureLocal(bytes, [
            { actor: item.scope.principalId, kind: 'human', bytes },
          ]);
        await carrier.appendBatch([{ kind: 'update', bytes: capsule }]);
        await carrier.close();
      },
      { item: args(item), parent: pending.parent },
    );
    await open(f.page, item);
    assert.equal(
      await f.page.evaluate(() => {
        const d = new Harness.Y.Doc();
        Harness.Y.applyUpdate(d, editor.snapshot());
        try {
          return d.getText('pending').toString();
        } finally {
          d.destroy();
        }
      }),
      ' child',
    );
    assert.equal(await f.page.evaluate(() => editor.read().master), 'local base original');
    await f.page.evaluate(() => opened.compactContent());
    assert.deepEqual(
      (await captures(f.page)).find((c) => c.id === pending.id),
      retained,
    );
    await close(f.page);
  },
);

test(
  'capsule overhead forces atomic database admission while preserving the original source bytes',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'overhead');
    const result = await f.page.evaluate(async (item) => {
      const { carrier, listCaptures } = await Harness.openAccountCaptureSession(
        optionsFor(item),
        item.scope.principalId,
      );
      const d = new Harness.Y.Doc();
      d.getText('large').insert(0, 'q'.repeat(10000));
      const update = Harness.Y.encodeStateAsUpdate(d);
      d.destroy();
      const capsule = carrier.captureLocal(update, [
        { actor: item.scope.principalId, kind: 'human', bytes: update },
      ]);
      const attempt = carrier.appendLocal(capsule);
      await carrier.appendBatch([{ kind: 'update', bytes: capsule }]);
      const saved = await listCaptures();
      const savedBytes = saved.map((c) => c.sources.map((s) => [...s.bytes]));
      for (const c of saved) Harness.eraseCapsule(c);
      await carrier.close();
      return { attempt, savedBytes, update: [...update] };
    }, args(item));
    assert.deepEqual(
      { status: result.attempt.status, reason: result.attempt.reason },
      { status: 'refused', reason: 'oversize' },
    );
    assert.deepEqual(
      result.savedBytes,
      [[result.update]],
      'Captured bytes must match length and every byte',
    );
    artifact('overhead.json', result);
    await cold(f);
    await open(f.page, item);
    assert.equal(
      await f.page.evaluate(() => {
        const d = new Harness.Y.Doc();
        Harness.Y.applyUpdate(d, editor.snapshot());
        try {
          return d.getText('large').length;
        } finally {
          d.destroy();
        }
      }),
      10000,
    );
    await close(f.page);
  },
);

test(
  'carrier refuses changed routes and conflicting intent reuse before database mutation',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'conflict');
    await open(f.page, item);
    await edit(f.page, 0, 0, 'retained ');
    await f.page.evaluate(() => editor.whenDurable());
    await close(f.page);
    await f.page.evaluate(async (item) => {
      window.captureOwner = await Harness.openAccountCaptureSession(
        optionsFor(item),
        item.scope.principalId,
      );
    }, args(item));
    const before = await inventory(f.page);
    const result = await f.page.evaluate(async () => {
      const [c] = await captureOwner.listCaptures(),
        route = {
          workspace: c.workspace,
          principal: c.principal,
          credential: c.credential,
          epoch: c.epoch,
          generation: c.generation,
        };
      const reasons = [];
      for (const field of ['workspace', 'credential', 'principal', 'epoch']) {
        const wrong = { ...c, [field]: field === 'epoch' ? 2 : 'ab'.repeat(16) };
        if (field === 'principal')
          wrong.sources = [
            { actor: wrong.principal, kind: 'human', bytes: new Uint8Array([0, 0]) },
          ];
        const bytes = Harness.encodeSourceCapsule(wrong);
        try {
          captureOwner.carrier.appendLocal(bytes);
          reasons.push('accepted');
        } catch (e) {
          reasons.push(String(e));
        } finally {
          bytes.fill(0);
        }
      }
      const d = new Harness.Y.Doc();
      d.getText('conflict').insert(0, 'changed');
      const update = Harness.Y.encodeStateAsUpdate(d);
      d.destroy();
      const conflict = Harness.encodeSourceCapsule({
        ...c,
        ...route,
        sources: [{ actor: c.principal, kind: 'human', bytes: update }],
      });
      try {
        await captureOwner.carrier.appendBatch([{ kind: 'update', bytes: conflict }]);
        reasons.push('accepted');
      } catch (e) {
        reasons.push(String(e));
      } finally {
        conflict.fill(0);
        Harness.eraseCapsule(c);
        await captureOwner.carrier.close();
      }
      return reasons;
    });
    assert.ok(result.every((e) => e !== 'accepted'));
    assert.match(result.at(-1), /Conflicting/);
    assert.equal(await inventory(f.page), before);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'retained base original');
    await close(f.page);
  },
);
