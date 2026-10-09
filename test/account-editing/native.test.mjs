import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  open,
  edit,
  close,
  cold,
  snapshot,
  args,
  inventory,
  boundary,
  waitHit,
  classify,
  handoff,
  editingBundle,
} from './fixtures.mjs';
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

test(
  'Account editor activates, preserves journal-only edits and cold reopens offline',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'main');
    assert.equal((await open(f.page, item)).master, 'base original');
    assert.equal((await snapshot(f.page, item)).marker.stage, 'account-active');
    assert.equal(await edit(f.page, 4, 0, ' later'), 'base later original');
    await close(f.page);
    await cold(f);
    await f.page.route('**/account/**', (r) => r.abort());
    assert.equal((await open(f.page, item)).master, 'base later original');
    await edit(f.page, 0, 4, 'start');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'base later original');
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'base later original');
    await close(f.page);
  },
);

for (const side of ['before', 'after'])
  test(
    `activation interruption ${side} commit never admits initialization early`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'activation-' + side),
        before = await inventory(f.page);
      await boundary(f.page, 'account-active', side);
      await f.page.evaluate((item) => {
        window.work = openEditor(item).then(
          (v) => v,
          (e) => String(e),
        );
      }, args(item));
      await waitHit(f.page);
      assert.equal((await snapshot(f.page, item)).marker.v, side === 'before' ? 4 : 5);
      const after = JSON.parse(await inventory(f.page)),
        old = JSON.parse(before);
      assert.deepEqual(
        after[0].filter((row) => row[0] !== 'done.custody'),
        old[0].filter((row) => row[0] !== 'done.custody'),
      );
      assert.deepEqual(after[1], old[1]);
      assert.equal(await f.page.evaluate(() => !!window.editor), false);
      if (side === 'before')
        assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
      else {
        const cdp = await f.context.newCDPSession(f.page),
          crashed = f.page.waitForEvent('crash');
        void cdp.send('Page.crash').catch(() => {});
        await crashed;
      }
      await cold(f);
      assert.equal((await open(f.page, item)).master, 'base original');
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
            await Harness.openOwnedAccountWorkspace(o);
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
      window.pending = Harness.openOwnedAccountWorkspace(o).then(
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
  'detected authenticated generation change closes the Account lifetime',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'generation');
    await open(f.page, item);
    await edit(f.page, 0, 0, 'retained ');
    await f.page.evaluate(
      (item) => Harness.contentFault(item.slotId, item.code, 'generation'),
      args(item),
    );
    assert.match(
      await f.page.evaluate(async () => {
        try {
          await editor.whenDurable();
          return 'accepted';
        } catch (e) {
          return String(e);
        }
      }),
      /generation|closed|inactive/i,
    );
    await f.page.waitForFunction(() => editor.status.state === 'closed');
    assert.equal(
      await f.page.evaluate(() => {
        try {
          surface.read();
          return true;
        } catch {
          return false;
        }
      }),
      false,
    );
    await cold(f);
    await assert.rejects(open(f.page, item), /generation|Invalid.*counter|opener/);
  },
);

test(
  'missing genesis refuses without restoring it; ancestry control actually opens an empty replacement',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'ancestry');
    const original = await open(f.page, item);
    await close(f.page);
    await f.page.evaluate(
      (item) => Harness.contentFault(item.slotId, item.code, 'erase'),
      args(item),
    );
    const before = await inventory(f.page);
    await assert.rejects(open(f.page, item), /checkpoint differs/);
    const refusedInventory = await inventory(f.page);
    assert.equal(refusedInventory, before);
    await f.page.evaluate(await editingBundle('ancestry'));
    const bad = await open(f.page, item);
    assert.equal(bad.master, '');
    assert.equal(bad.cards.length, 0);
    await close(f.page);
    artifact('control-ancestry.json', {
      normal: 'refused',
      baselineUnchanged: refusedInventory === before,
      original: { master: original.master, cards: original.cards },
      mutant: { master: bad.master, cards: bad.cards },
    });
  },
);

test(
  'passkey fault control actually opens and edits without a valid assertion',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'passkey-control'),
      before = await inventory(f.page);
    await f.page.evaluate(() => {
      const actual = assertPasskey;
      window.assertPasskey = async (r) => {
        const a = await actual(r);
        a.signature.fill(0);
        window.invalidEditingSignature = a.signature;
        return a;
      };
    });
    await assert.rejects(open(f.page, item), /passkey refused/);
    const refusedInventory = await inventory(f.page);
    assert.equal(refusedInventory, before);
    await f.page.evaluate(await editingBundle('passkey'));
    const openedState = await open(f.page, item);
    const bad = await edit(f.page, 0, 0, 'unauthorized ');
    assert.equal(bad, 'unauthorized base original');
    await close(f.page);
    artifact('control-passkey.json', {
      normal: 'refused',
      baselineUnchanged: refusedInventory === before,
      signature: await f.page.evaluate(() =>
        Array.from(invalidEditingSignature, (b) => b.toString(16).padStart(2, '0')).join(''),
      ),
      before: openedState.master,
      insert: 'unauthorized ',
      mutant: bad,
    });
  },
);

test(
  'previous reader, handoff and ordinary Local owners refuse editable Account progress',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'old');
    await open(f.page, item);
    await edit(f.page, 0, 0, 'later ');
    await close(f.page);
    await assert.rejects(handoff(f.page, item), /requires retained admission receipt/);
    assert.equal((await classify(f.page, item)).kind, 'account');
    const before = await inventory(f.page);
    await assert.rejects(
      f.page.evaluate((item) => Harness.append(item.scope, item.code, 'disk'), args(item)),
      /application-upgrade|unsupported|upgrade/i,
    );
    await f.page.evaluate(await editingBundle('old-reader'));
    await assert.rejects(open(f.page, item), /Malformed|Unsupported/);
    assert.equal(await inventory(f.page), before);
  },
);

test(
  'durable pending dependencies coexist with editable Account ancestry and recover after delivery',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'pending');
    await open(f.page, item);
    await close(f.page);
    await f.page.evaluate(async (item) => {
      const remote = new Harness.Y.Doc();
      const text = remote.getText('remote');
      text.insert(0, 'parent');
      window.parentUpdate = [...Harness.Y.encodeStateAsUpdate(remote)];
      const sv = Harness.Y.encodeStateVector(remote);
      text.insert(text.length, ' child');
      const tail = Harness.Y.encodeStateAsUpdate(remote, sv);
      remote.destroy();
      const { carrier } = await Harness.openAccountJournalSession(
        optionsFor(item),
        item.scope.principalId,
      );
      await carrier.appendBatch([{ kind: 'update', bytes: tail }]);
      await carrier.close();
    }, args(item));
    const parent = await f.page.evaluate(() => parentUpdate);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'base original');
    await edit(f.page, 0, 0, 'local ');
    await close(f.page);
    await f.page.evaluate(
      async ({ item, parent }) => {
        const { carrier } = await Harness.openAccountJournalSession(
          optionsFor(item),
          item.scope.principalId,
        );
        await carrier.appendBatch([{ kind: 'update', bytes: new Uint8Array(parent) }]);
        await carrier.close();
      },
      { item: args(item), parent },
    );
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'local base original');
    assert.equal(
      await f.page.evaluate(() => {
        const d = new Harness.Y.Doc();
        Harness.Y.applyUpdate(d, editor.snapshot());
        try {
          return d.getText('remote').toString();
        } finally {
          d.destroy();
        }
      }),
      'parent child',
    );
    await close(f.page);
  },
);

test(
  '200 generated ancestry comparisons retain later deletion and pending state without repairing source',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seedText: fc.string({ minLength: 1, maxLength: 20 }),
          at: fc.nat(30),
          remove: fc.nat(20),
          insert: fc.string({ maxLength: 20 }),
          pending: fc.boolean(),
        }),
        async (history) => {
          const result = await f.page.evaluate((h) => {
            const Y = Harness.Y,
              genesis = new Y.Doc({ gc: false }),
              current = new Y.Doc({ gc: false }),
              missing = new Y.Doc();
            try {
              genesis.getText('master').insert(0, h.seedText);
              Y.applyUpdate(current, Y.encodeStateAsUpdate(genesis));
              const text = current.getText('master'),
                at = h.at % (text.length + 1),
                n = Math.min(h.remove, text.length - at);
              if (n) text.delete(at, n);
              text.insert(at, h.insert);
              if (h.pending) {
                const remote = new Y.Doc();
                remote.getText('unrelated').insert(0, 'parent');
                const sv = Y.encodeStateVector(remote);
                remote.getText('unrelated').insert(6, 'child');
                Y.applyUpdate(current, Y.encodeStateAsUpdate(remote, sv));
                remote.destroy();
              }
              const before = [...Y.encodeStateAsUpdate(current)];
              const accepted = Harness.coversGenesis(current, genesis),
                refused = !Harness.coversGenesis(missing, genesis);
              return {
                accepted,
                refused,
                before,
                after: [...Y.encodeStateAsUpdate(current)],
                text: text.toString(),
              };
            } finally {
              genesis.destroy();
              current.destroy();
              missing.destroy();
            }
          }, history);
          const at = history.at % (history.seedText.length + 1),
            n = Math.min(history.remove, history.seedText.length - at);
          assert.equal(
            result.text,
            history.seedText.slice(0, at) + history.insert + history.seedText.slice(at + n),
          );
          assert.ok(result.accepted);
          assert.ok(result.refused);
          assert.deepEqual(result.after, result.before);
          const sha = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
          histories.push({
            ...history,
            observed: {
              text: result.text,
              accepted: result.accepted,
              refused: result.refused,
              beforeSha256: sha(result.before),
              afterSha256: sha(result.after),
            },
          });
        },
      ),
      { seed: 9282026, numRuns: 200, endOnFailure: true },
    );
    artifact('generated-ancestry.json', { seed: 9282026, histories });
  },
);

test(
  '24 generated editing histories preserve independent writing, provenance and cold recovery',
  { timeout: 180000 },
  async (t) => {
    const f = await native(t),
      histories = [];
    let id = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            at: fc.nat(50),
            remove: fc.nat(12),
            insert: fc.string({ maxLength: 10 }),
            undo: fc.boolean(),
            mode: fc.constantFrom('journal', 'flush', 'compact', 'crash'),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        async (commands) => {
          const item = await selected(f, 'generated-' + id++);
          await open(f.page, item);
          const provenance = await snapshot(f.page, item);
          let expected = 'base original';
          const observed = [];
          for (const c of commands) {
            await f.page.evaluate(() => {
              const set = window.setTimeout;
              window.setTimeout = (fn, ms, ...a) => (ms === 250 ? 0 : set(fn, ms, ...a));
            });
            const at = c.at % (expected.length + 1),
              remove = Math.min(c.remove, expected.length - at),
              previous = expected;
            expected = expected.slice(0, at) + c.insert + expected.slice(at + remove);
            assert.equal(await edit(f.page, at, remove, c.insert), expected);
            if (c.undo && previous !== expected) {
              await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
              expected = previous;
            }
            if (c.mode === 'flush') await f.page.evaluate(() => editor.whenDurable());
            if (c.mode === 'compact') await f.page.evaluate(() => opened.compactContent());
            assert.equal(await f.page.evaluate(() => editor.read().master), expected);
            if (c.mode === 'crash') {
              const cdp = await f.context.newCDPSession(f.page),
                crashed = f.page.waitForEvent('crash');
              void cdp.send('Page.crash').catch(() => {});
              await crashed;
            } else await close(f.page);
            await cold(f);
            assert.equal((await open(f.page, item)).master, expected);
            observed.push(expected);
            assert.deepEqual(await snapshot(f.page, item), provenance);
          }
          await close(f.page);
          histories.push({ commands, observed, expected });
        },
      ),
      { seed: 9292026, numRuns: 24, endOnFailure: true },
    );
    artifact('generated-native.json', { seed: 9292026, histories });
  },
);

test(
  'refused storage keeps the pending edit outside the document and outgoing observations',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'refused-edit');
    await open(f.page, item);
    await f.page.evaluate(() => {
      window.sent = [];
      editor.outgoing((b) => sent.push([...b]));
      const set = Storage.prototype.setItem,
        add = IDBObjectStore.prototype.add;
      window.restoreStorage = () => {
        Storage.prototype.setItem = set;
        IDBObjectStore.prototype.add = add;
      };
      Storage.prototype.setItem = function () {
        throw new DOMException('test quota', 'QuotaExceededError');
      };
      IDBObjectStore.prototype.add = function (...a) {
        const r = add.apply(this, a);
        if (this.name === 'content') r.addEventListener('success', () => this.transaction.abort());
        return r;
      };
      window.ticket = surface.input(
        { name: 'insert', text: 'unaccepted ' },
        { ranges: [{ anchor: 0, head: 0 }], main: 0 },
      );
    });
    await f.page.waitForFunction(() => editor.status.state === 'blocked');
    assert.equal(await f.page.evaluate(() => editor.read().master), 'base original');
    assert.equal(await f.page.evaluate(() => sent.length), 0);
    await f.page.evaluate(() => {
      editor.discardPending();
      restoreStorage();
    });
    assert.match(
      await f.page.evaluate(() =>
        ticket.accepted.then(
          () => 'accepted',
          (e) => String(e),
        ),
      ),
      /discard/i,
    );
    assert.equal(await edit(f.page, 0, 0, 'accepted '), 'accepted base original');
    await close(f.page);
    await cold(f);
    assert.equal((await open(f.page, item)).master, 'accepted base original');
    await close(f.page);
  },
);

test(
  'a queued caller cannot substitute slot, actor or pin; damaged selected routing refuses without repair',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'captured');
    await open(f.page, item);
    const second = await f.context.newPage();
    await f.setup(second);
    await second.evaluate((item) => {
      const o = optionsFor(item);
      window.work = Harness.openOwnedAccountWorkspace(o).then((v) => {
        window.editor = v.workspace;
        return editor.read().master;
      });
      o.slotId = 'substituted';
      o.identity.id = 'ff'.repeat(16);
      o.pin.authRoot = '00'.repeat(32);
    }, args(item));
    await second.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
    await close(f.page);
    assert.equal(await second.evaluate(() => work), 'base original');
    await close(second);
    await second.close();
    const state = await snapshot(f.page, item),
      route = state.marker.handoff.destination;
    for (const bad of [null, { ...route, status: 'closed' }, { ...route, stores: [] }]) {
      await f.page.evaluate(({ id, bad }) => Harness.putSlot(id, bad), { id: item.slotId, bad });
      const before = await inventory(f.page);
      await assert.rejects(open(f.page, item));
      assert.equal(await inventory(f.page), before);
      await f.page.evaluate(({ id, route }) => Harness.putSlot(id, route), {
        id: item.slotId,
        route,
      });
    }
    assert.equal((await open(f.page, item)).master, 'base original');
    await close(f.page);
  },
);

test(
  'abort during a pending passkey drains the ceremony before releasing and does not activate',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'abort-proof'),
      before = await inventory(f.page);
    await f.page.evaluate((item) => {
      window.controller = new AbortController();
      const o = optionsFor(item);
      o.signal = controller.signal;
      o.assertPasskey = async (req) => {
        window.proofEntered = true;
        await new Promise((r) => (window.releaseProof = r));
        return assertPasskey(req);
      };
      window.work = Harness.openOwnedAccountWorkspace(o).then(
        () => 'accepted',
        (e) => String(e),
      );
    }, args(item));
    await f.page.waitForFunction(() => window.proofEntered);
    await f.page.evaluate((slot) => {
      controller.abort();
      window.competed = false;
      window.competitor = navigator.locks.request(Harness.slotPermitName(slot), () => {
        competed = true;
      });
    }, item.slotId);
    await f.page.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => competed), false);
    await f.page.evaluate(() => releaseProof());
    assert.match(await f.page.evaluate(() => work), /live|inactive|cancelled/);
    await f.page.evaluate(() => competitor);
    assert.equal(await inventory(f.page), before);
    assert.equal((await open(f.page, item)).master, 'base original');
    await close(f.page);
  },
);
