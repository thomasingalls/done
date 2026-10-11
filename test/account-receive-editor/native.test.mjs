import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import * as Y from 'yjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountBatchPolicy } from '../../src/crdt/accountBatchPolicy.ts';
import {
  ready,
  open,
  receive,
  request,
  status,
  view,
  captures,
  envelope,
  answer,
  close,
  cold,
  crash,
  receiveBoundary,
  waitPredicate,
  editorBundle,
  configure,
  edit,
} from './fixtures.mjs';
const artifact = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name),
      JSON.stringify(value, null, 2) + '\n',
    );
};
const observe = async (page) => ({
  visible: await view(page),
  status: await status(page),
  captures: await captures(page),
});
const frames = (basis, edits) => {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, new Uint8Array(basis));
  doc.clientID = 7000007;
  const updates = [];
  doc.on('update', (b) => updates.push([...b]));
  for (const edit of edits) edit(doc.getText('master'));
  doc.destroy();
  return updates;
};
const prefix = (basis, text = 'REMOTE ') => frames(basis, [(t) => t.insert(0, text)])[0];
async function startReceive(page, bytes) {
  await page.evaluate(
    (b) => {
      window.result = undefined;
      window.work = opened.receivePage(new Uint8Array(b)).then(
        (r) => {
          window.result = r;
          return r;
        },
        (e) => {
          window.result = String(e);
          return String(e);
        },
      );
    },
    [...bytes],
  );
}
async function queueLocal(page, text) {
  await page.evaluate((text) => {
    const n = editor.read().master.length;
    window.local = surface
      .input({ name: 'insert', text }, { ranges: [{ anchor: n, head: n }], main: 0 })
      .accepted.then(
        () => true,
        (e) => String(e),
      );
  }, text);
}
test(
  'owned remote publication bypasses source capture/undo/outgoing; startup and duplicates allocate no source',
  { timeout: 45000 },
  async (t) => {
    const { f, item, initial, snapshot } = await ready(t, 'ordered-basic'),
      u = prefix(snapshot),
      wire = await envelope(f.page, item, 1, [u]);
    await open(f.page, item);
    const before = await captures(f.page);
    await f.page.evaluate(() => {
      window.events = [];
      window.sent = [];
      editor.subscribe(() => events.push(editor.read().master));
      editor.outgoing((b) => sent.push([...b]));
    });
    const a = answer(f, item, await request(f.page), wire);
    const r = await receive(f.page, a.bytes);
    assert.equal(r.status.receivedThrough, 1);
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    assert.equal(await f.page.evaluate(() => editor.read().undo), 0);
    assert.deepEqual(await captures(f.page), before);
    assert.equal(await f.page.evaluate(() => sent.length), 0);
    assert.equal((await receive(f.page, a.bytes)).kind, 'duplicate');
    assert.equal(await f.page.evaluate(() => events.length), 1);
    await assert.rejects(
      f.page.evaluate((u) => editor.receive(new Uint8Array(u)).accepted, u),
      /validation/,
    );
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    await edit(f.page, 0, 0, 'LOCAL ');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    assert.equal(await f.page.evaluate(() => sent.length), 2);
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    assert.equal((await status(f.page)).receivedThrough, 1);
    const after = await captures(f.page);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.deepEqual(await captures(f.page), after);
    await close(f.page);
  },
);
for (const side of ['before', 'after'])
  test(
    `ordered receive ${side} commit crash leaves no early edit or local recapture`,
    { timeout: 45000 },
    async (t) => {
      const { f, item, initial, snapshot } = await ready(t, 'ordered-cut-' + side),
        u = prefix(snapshot),
        wire = await envelope(f.page, item, 1, [u]);
      await open(f.page, item);
      const before = await captures(f.page),
        a = answer(f, item, await request(f.page), wire);
      await receiveBoundary(f.page, side);
      await startReceive(f.page, a.bytes);
      await waitPredicate(f.page, () => !!window.hit);
      const held = {
        visible: await view(f.page),
        resultPending: await f.page.evaluate(() => result === undefined),
      };
      assert.equal(held.visible, initial);
      await queueLocal(f.page, 'LATER');
      held.queuedVisible = await view(f.page);
      assert.equal(held.queuedVisible, initial);
      if (side === 'before') await waitPredicate(f.page, () => editor.status.state === 'blocked');
      await crash(f);
      await cold(f);
      await open(f.page, item);
      assert.equal(await view(f.page), (side === 'after' ? 'REMOTE ' : '') + initial);
      assert.deepEqual(await captures(f.page), before);
      assert.equal((await status(f.page)).receivedThrough, side === 'after' ? 1 : 0);
      const recovered = await observe(f.page);
      const retry = answer(f, item, await request(f.page, 0), wire);
      const result = await receive(f.page, retry.bytes);
      artifact('baseline-' + side + '.json', {
        side,
        initial,
        before,
        held,
        recovered,
        result,
        final: await observe(f.page),
      });
      assert.equal(result.recorded, side === 'before');
      assert.equal(await view(f.page), 'REMOTE ' + initial);
      await close(f.page);
    },
  );
test(
  'a local command queued during receive is prepared only after commit and ordered publication',
  { timeout: 45000 },
  async (t) => {
    const { f, item, initial, snapshot } = await ready(t, 'ordered-interleave'),
      u = prefix(snapshot),
      wire = await envelope(f.page, item, 1, [u]);
    await open(f.page, item);
    const before = await captures(f.page),
      a = answer(f, item, await request(f.page), wire);
    await receiveBoundary(f.page, 'after');
    await startReceive(f.page, a.bytes);
    await waitPredicate(f.page, () => !!window.hit);
    await queueLocal(f.page, 'LATER');
    assert.equal(await view(f.page), initial);
    await f.page.evaluate(() => window.release());
    await f.page.evaluate(() => work);
    await f.page.evaluate(() => local);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LATER');
    const after = await captures(f.page);
    assert.equal(after.length, before.length + 1);
    await f.page.evaluate(() => editor.whenDurable());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial + 'LATER');
    await close(f.page);
  },
);
test(
  'invalid page and authenticated stream conflict preserve local editor availability',
  { timeout: 45000 },
  async (t) => {
    const { f, item, initial, snapshot } = await ready(t, 'ordered-conflict'),
      u = prefix(snapshot),
      wire = await envelope(f.page, item, 1, [u]),
      other = await envelope(f.page, item, 1, [prefix(snapshot, 'DIFFERENT ')]);
    await open(f.page, item);
    const q = await request(f.page),
      a = answer(f, item, q, wire),
      original = JSON.parse(Buffer.from(a.bytes).toString('utf8')),
      signature = original.at(-1),
      before = await captures(f.page);
    // Exercise both parsing and signature verification deliberately. XORing a
    // random hex digit sometimes produced non-hex and changed the error message.
    for (const altered of [
      'g' + signature.slice(1),
      (signature[0] === '0' ? '1' : '0') + signature.slice(1),
    ]) {
      const page = [...original];
      page[page.length - 1] = altered;
      const bad = [...Buffer.from(JSON.stringify(page))];
      const refusal = await f.page.evaluate(async (bytes) => {
        try {
          await opened.receivePage(new Uint8Array(bytes));
          return 'accepted';
        } catch (cause) {
          return cause.code;
        }
      }, bad);
      assert.equal(refusal, 'receive-refused');
      assert.equal(await view(f.page), initial);
      assert.deepEqual(await captures(f.page), before);
    }
    await receive(f.page, a.bytes);
    const conflict = answer(f, item, await request(f.page, 0), other);
    assert.equal((await receive(f.page, conflict.bytes)).kind, 'conflict');
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    await edit(f.page, 0, 0, 'LOCAL ');
    await f.page.evaluate(() => editor.whenDurable());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal((await status(f.page)).state, 'conflict');
    assert.equal(await view(f.page), 'LOCAL REMOTE ' + initial);
    await edit(f.page, 0, 0, 'MORE ');
    await close(f.page);
  },
);
test(
  'pending remote deletion and structs survive compaction/cold open, then integrate without relabeling',
  { timeout: 45000 },
  async (t) => {
    const { f, item, initial, snapshot } = await ready(t, 'ordered-pending');
    const [basis, tail, del] = frames(snapshot, [
      (t) => t.insert(0, 'X'),
      (t) => t.insert(1, 'Y'),
      (t) => t.delete(0, 1),
    ]);
    const first = await envelope(f.page, item, 1, [tail, del]),
      second = await envelope(f.page, item, 2, [basis]);
    await open(f.page, item);
    const before = await captures(f.page),
      a = answer(f, item, await request(f.page), first);
    await receive(f.page, a.bytes);
    assert.equal(await view(f.page), initial);
    assert.equal((await status(f.page)).receivedThrough, 1);
    await edit(f.page, initial.length, 0, 'LOCAL');
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    const b = answer(f, item, await request(f.page), second, a.link);
    await receive(f.page, b.bytes);
    assert.equal(await view(f.page), 'Y' + initial + 'LOCAL');
    assert.equal((await captures(f.page)).length, before.length + 1);
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'Y' + initial + 'LOCAL');
    assert.equal((await status(f.page)).receivedThrough, 2);
    await close(f.page);
  },
);
test(
  'storage pressure holds the entire remote/local suffix and discard cannot acknowledge it',
  { timeout: 45000 },
  async (t) => {
    const { f, item, initial, snapshot } = await ready(t, 'ordered-pressure'),
      wire = await envelope(f.page, item, 1, [prefix(snapshot)]);
    await open(f.page, item);
    const before = await captures(f.page),
      a = answer(f, item, await request(f.page), wire);
    await f.page.evaluate(() => {
      const set = Storage.prototype.setItem,
        add = IDBObjectStore.prototype.add;
      window.restoreStorage = () => {
        Storage.prototype.setItem = set;
        IDBObjectStore.prototype.add = add;
      };
      Storage.prototype.setItem = function () {
        throw new DOMException('quota', 'QuotaExceededError');
      };
      IDBObjectStore.prototype.add = function (...args) {
        const r = add.apply(this, args);
        if (this.name === 'content') r.addEventListener('success', () => this.transaction.abort());
        return r;
      };
    });
    await queueLocal(f.page, 'REFUSED');
    await waitPredicate(f.page, () => editor.status.state === 'blocked');
    await startReceive(f.page, a.bytes);
    await queueLocal(f.page, 'LATER');
    assert.equal(await view(f.page), initial);
    assert.equal((await status(f.page)).receivedThrough, 0);
    await f.page.evaluate(() => {
      editor.discardPending();
      restoreStorage();
    });
    assert.match(await f.page.evaluate(() => work), /discard/);
    assert.match(await f.page.evaluate(() => local), /discard/);
    assert.deepEqual(await captures(f.page), before);
    await receive(f.page, a.bytes);
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    await close(f.page);
  },
);
test(
  'close drains a committed receive before releasing the slot, with no late acknowledgement or source',
  { timeout: 45000 },
  async (t) => {
    const { f, item, initial, snapshot } = await ready(t, 'ordered-close'),
      wire = await envelope(f.page, item, 1, [prefix(snapshot)]);
    await open(f.page, item);
    const before = await captures(f.page),
      a = answer(f, item, await request(f.page), wire);
    await receiveBoundary(f.page, 'after');
    await startReceive(f.page, a.bytes);
    await waitPredicate(f.page, () => !!window.hit);
    const other = await f.context.newPage();
    await f.setup(other);
    await other.evaluate((slot) => {
      window.acquired = false;
      window.lock = navigator.locks.request(
        Harness.slotPermitName(slot),
        { mode: 'exclusive' },
        () => {
          window.acquired = true;
        },
      );
    }, item.slotId);
    await f.page.evaluate(() => {
      window.closed = false;
      window.closing = editor.close().then(() => {
        closed = true;
      });
    });
    assert.equal(await f.page.evaluate(() => closed), false);
    assert.equal(await other.evaluate(() => acquired), false);
    await f.page.evaluate(() => window.release());
    await f.page.evaluate(() => closing);
    assert.match(await f.page.evaluate(() => work), /closed|inactive/);
    await waitPredicate(other, () => acquired);
    await other.close();
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'REMOTE ' + initial);
    assert.deepEqual(await captures(f.page), before);
    await close(f.page);
  },
);
for (const control of ['early', 'relabel'])
  test(
    `actual ${control} source mutation violates the publication/source oracle`,
    { timeout: 45000 },
    async (t) => {
      const { f, item, initial, snapshot } = await ready(t, 'ordered-control-' + control),
        original = prefix(snapshot),
        wire = await envelope(f.page, item, 1, [original]);
      await f.page.evaluate(await editorBundle(control));
      await configure(f.page);
      await open(f.page, item);
      const before = await captures(f.page);
      const a = answer(f, item, await request(f.page), wire);
      if (control === 'early') {
        await receiveBoundary(f.page, 'before');
        await startReceive(f.page, a.bytes);
        await waitPredicate(f.page, () => !!window.hit);
        assert.equal(await view(f.page), 'REMOTE ' + initial);
        assert.equal(await f.page.evaluate(() => result), undefined);
        const held = {
          visible: await view(f.page),
          resultPending: await f.page.evaluate(() => result === undefined),
        };
        // Reopen using the normal fixture bundle after killing the mutated owner.
        await crash(f);
        await cold(f);
        await open(f.page, item);
        const recovered = await observe(f.page);
        artifact('control-early.json', { initial, before, held, recovered });
        assert.equal(recovered.visible, initial);
        assert.equal(recovered.status.receivedThrough, 0);
        assert.deepEqual(recovered.captures, before);
        await close(f.page);
      } else {
        await receive(f.page, a.bytes);
        const after = await captures(f.page);
        assert.equal(after.length, before.length + 1);
        artifact('control-relabel.json', {
          initial,
          original,
          before,
          after,
          observed: await observe(f.page),
        });
        await close(f.page);
      }
    },
  );
test(
  '10 generated native histories preserve authored content, receive progress and exact local source counts',
  { timeout: 200000 },
  async (t) => {
    const seed = 9202026,
      histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom('receive', 'local', 'duplicate', 'invalid', 'compact', 'restart'),
          { minLength: 3, maxLength: 6 },
        ),
        async (actions) => {
          const index = histories.length;
          const history = { actions, observations: [] };
          histories.push(history);
          const save = () =>
            artifact('generated-editor.json', { seed, runs: 10, status: 'running', histories });
          save();
          const { f, item, initial, snapshot } = await ready(t, 'ordered-generated-' + index);
          const edits = actions
            .filter((x) => x === 'receive')
            .map((_, i) => (t) => t.insert(0, `R${i} `));
          const originals = frames(snapshot, edits),
            wires = [];
          for (let i = 0; i < originals.length; i++)
            wires.push(await envelope(f.page, item, i + 1, [originals[i]]));
          await open(f.page, item);
          history.initial = initial;
          history.before = await captures(f.page);
          const originalCaptures = history.before.length;
          save();
          let expected = initial,
            position = 0,
            previous = '00'.repeat(32),
            localCount = 0,
            prior = '00'.repeat(32);
          for (const action of actions) {
            let outcome = null;
            if (action === 'receive') {
              const a = answer(f, item, await request(f.page), wires[position], previous);
              outcome = await receive(f.page, a.bytes);
              expected = `R${position} ` + expected;
              prior = previous;
              previous = a.link;
              position++;
            } else if (action === 'local') {
              await edit(f.page, expected.length, 0, 'L');
              expected += 'L';
              localCount++;
            } else if (action === 'restart') {
              await f.page.evaluate(() => editor.whenDurable());
              await close(f.page);
              await cold(f);
              await open(f.page, item);
            } else if (action === 'compact') await f.page.evaluate(() => opened.compactContent());
            else if (action === 'invalid') {
              outcome = await f.page.evaluate(async () => {
                try {
                  await opened.receivePage(new TextEncoder().encode('not a signed page'));
                  return 'accepted';
                } catch (cause) {
                  return cause.code;
                }
              });
              assert.equal(outcome, 'receive-refused');
            } else if (position) {
              const a = answer(
                f,
                item,
                await request(f.page, position - 1),
                wires[position - 1],
                prior,
                position,
              );
              outcome = await receive(f.page, a.bytes);
              assert.equal(outcome.kind, 'duplicate');
            }
            history.observations.push({ action, outcome, ...(await observe(f.page)) });
            save();
            assert.equal(await view(f.page), expected);
            assert.equal((await status(f.page)).receivedThrough, position);
            assert.equal((await captures(f.page)).length, originalCaptures + localCount);
          }
          await f.page.evaluate(() => editor.whenDurable());
          await close(f.page);
          await cold(f);
          await open(f.page, item);
          history.final = await observe(f.page);
          save();
          assert.equal(await view(f.page), expected);
          assert.equal((await captures(f.page)).length, originalCaptures + localCount);
          await close(f.page);
          // Generated fixtures own independent contexts; close promptly instead of accumulating until test end.
          await f.context.close();
        },
      ),
      { seed, numRuns: 10, endOnFailure: true },
    );
    artifact('generated-editor.json', { seed, runs: 10, status: 'passed', histories });
  },
);
test(
  'close from a publication observer stops remaining promotion and cold replay restores the whole committed batch',
  { timeout: 45000 },
  async (t) => {
    const { f, item, initial, snapshot } = await ready(t, 'ordered-observer-close'),
      originals = frames(snapshot, [(t) => t.insert(0, 'A'), (t) => t.insert(0, 'B')]);
    const wire = await envelope(f.page, item, 1, originals);
    await open(f.page, item);
    const before = await captures(f.page),
      a = answer(f, item, await request(f.page), wire);
    await f.page.evaluate(() => {
      window.seen = [];
      window.once = false;
      editor.subscribe(() => {
        if (!once) {
          once = true;
          seen.push(editor.read().master);
          window.closing = editor.close();
        }
      });
    });
    await assert.rejects(receive(f.page, a.bytes), /inactive|closed/);
    await f.page.evaluate(() => closing);
    assert.deepEqual(await f.page.evaluate(() => seen), [
      (accountBatchPolicy(process.env.ACCOUNT_BATCH_MODE).publication ? 'BA' : 'A') + initial,
    ]);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'BA' + initial);
    assert.equal((await status(f.page)).receivedThrough, 1);
    assert.deepEqual(await captures(f.page), before);
    await close(f.page);
  },
);

test(
  'batched received page verifies and publishes once while retaining pending frames and undo isolation',
  {
    timeout: 45000,
    skip: !process.env.ACCOUNT_BATCH_MODE || process.env.ACCOUNT_BATCH_MODE === 'reference',
  },
  async (t) => {
    const { f, item, initial, snapshot } = await ready(t, 'batched-page');
    const originals = frames(snapshot, [
      (t) => t.insert(0, 'A'),
      (t) => t.insert(0, 'B'),
      (t) => t.delete(0, 1),
    ]);
    const wire = await envelope(f.page, item, 1, [originals[1], originals[0], originals[2]]);
    await open(f.page, item);
    const before = await captures(f.page);
    const checks = await f.page.evaluate(() => __doneLedgerMetrics().work.projectionChecks);
    await f.page.evaluate(() => {
      window.seen = [];
      window.sent = [];
      editor.subscribe(() => seen.push(editor.read().master));
      editor.outgoing((b) => sent.push([...b]));
    });
    const a = answer(f, item, await request(f.page), wire);
    await receive(f.page, a.bytes);
    assert.deepEqual(await f.page.evaluate(() => seen), ['A' + initial]);
    assert.equal(
      await f.page.evaluate(() => __doneLedgerMetrics().work.projectionChecks),
      checks + 1,
    );
    assert.equal(await f.page.evaluate(() => sent.length), 0);
    assert.equal(await f.page.evaluate(() => editor.read().undo), 0);
    assert.deepEqual(await captures(f.page), before);
    await edit(f.page, 0, 0, 'LOCAL ');
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await view(f.page), 'A' + initial);
    await f.page.evaluate(() => editor.whenDurable());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.equal(await view(f.page), 'A' + initial);
    assert.equal((await status(f.page)).receivedThrough, 1);
    await close(f.page);
  },
);
