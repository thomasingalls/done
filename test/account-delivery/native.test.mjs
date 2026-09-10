import test from 'node:test';
import fc from 'fast-check';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  open,
  close,
  cold,
  prepare,
  envelopes,
  captures,
  edit,
  subjects,
  args,
  deliveryStatus,
  submission,
  pending,
  record,
  deliveryBoundary,
  waitHit,
  crash,
  deliveryBundle,
  configure,
  pauseSigning,
} from './fixtures.mjs';
import {
  fixtureAcceptance,
  head,
  refusal,
  response,
  link,
  key,
} from '../account-decisions/oracle.mjs';
import { inventory, snapshot } from '../account-capture/fixtures.mjs';
const ZERO = '00'.repeat(32),
  old = JSON.parse(readFileSync('test/vectors/antireplay.json')),
  foreign = key(old.keys.k_accept_retired.seed);
const artifact = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name),
      JSON.stringify(value, null, 2) + '\n',
    );
};
async function ready(t, id) {
  const f = await native(t),
    item = await selected(f, id);
  await open(f.page, item);
  await prepare(f.page);
  await f.page.evaluate(() => editor.whenDurable());
  return {
    f,
    item,
    s: (await subjects(f.page))[0],
    signer: fixtureAcceptance(f, item.scope.workspaceId),
  };
}
test(
  'first submission is persisted exactly, idempotent, retained through compaction and suppressed after acceptance',
  { timeout: 30000 },
  async (t) => {
    const { f, item, s, signer } = await ready(t, 'submission'),
      sources = await captures(f.page),
      wire = await envelopes(f.page),
      calls = f.invocations.length;
    await assert.rejects(submission(f.page, 2), /earliest pending/);
    const first = await submission(f.page);
    assert.equal(first.kind, 'ready');
    const before = await inventory(f.page);
    assert.deepEqual(await submission(f.page), first);
    assert.equal(await inventory(f.page), before);
    assert.equal(f.invocations.length, calls);
    await f.page.evaluate(() => opened.compactContent());
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.deepEqual(await submission(f.page), first);
    const retained = await captures(f.page);
    for (const source of sources)
      assert.deepEqual(
        retained.find((c) => c.id === source.id),
        source,
      );
    assert.deepEqual(await envelopes(f.page), wire);
    const r = await record(
      f.page,
      1,
      response({ kind: 'accepted', head: head(s, ZERO, 1, signer), leaf: s }),
    );
    assert.equal(r.recorded, true);
    assert.equal(r.status.acceptedThrough, 1);
    assert.deepEqual(await pending(f.page), []);
    assert.equal((await submission(f.page)).kind, 'accepted');
    assert.deepEqual((await deliveryStatus(f.page)).submissions, [1]);
    await prepare(f.page);
    const second = await submission(f.page, 2);
    assert.equal(second.kind, 'ready');
    assert.deepEqual(
      (await pending(f.page)).map((x) => x.position),
      [2],
    );
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.deepEqual(await submission(f.page, 2), second);
    await close(f.page);
  },
);
for (const kind of ['closed', 'conflict', 'finalized'])
  test(
    `${kind} evidence survives cold restart, blocks outbound preparation and preserves local editing`,
    { timeout: 30000 },
    async (t) => {
      const { f, item, s, signer } = await ready(t, kind);
      await submission(f.page);
      const other = { ...s, digest: 'ff'.repeat(32) },
        answer =
          kind === 'closed'
            ? response({ kind: 'refused', refusal: refusal(s, signer) })
            : response({
                kind: 'accepted',
                head: head(kind === 'conflict' ? other : s, ZERO, 1, signer, kind === 'finalized'),
                leaf: kind === 'conflict' ? other : s,
              });
      assert.equal((await record(f.page, 1, answer)).status.state, kind);
      assert.equal((await submission(f.page)).kind, 'blocked');
      assert.deepEqual(await pending(f.page), []);
      await assert.rejects(prepare(f.page), /Delivery blocked/);
      await edit(f.page, 0, 0, 'retained ');
      await close(f.page);
      await cold(f);
      await open(f.page, item);
      assert.equal((await deliveryStatus(f.page)).state, kind);
      assert.ok((await f.page.evaluate(() => editor.read().master)).startsWith('retained '));
      await close(f.page);
    },
  );
for (const type of ['submission', 'response'])
  for (const side of ['before', 'after'])
    test(
      `${type} ${side} native commit recovers without rewriting acknowledged bytes`,
      { timeout: 30000 },
      async (t) => {
        const { f, item, s, signer } = await ready(t, type + side),
          answer = response({ kind: 'refused', refusal: refusal(s, signer) });
        await deliveryBoundary(f.page, type, side);
        await f.page.evaluate(
          ({ type, answer }) => {
            window.work = (
              type === 'submission'
                ? opened.prepareSubmission(1)
                : opened.recordResponse(1, new Uint8Array(answer))
            ).then(
              () => 'ready',
              (e) => String(e),
            );
          },
          { type, answer: [...answer] },
        );
        await waitHit(f.page);
        if (side === 'before')
          assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
        await crash(f);
        await cold(f);
        await open(f.page, item);
        const status = await deliveryStatus(f.page);
        assert.equal(
          type === 'submission' ? status.submissions.length : status.responses.length,
          side === 'after' ? 1 : 0,
        );
        if (type === 'submission') assert.equal((await submission(f.page)).kind, 'ready');
        else assert.equal((await record(f.page, 1, answer)).recorded, side === 'before');
        await close(f.page);
      },
    );
for (const side of ['before', 'after'])
  test(
    `v8 activation ${side} commit fences v7 readers before returning the editor`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'activation-' + side);
      const { boundary } = await import('../account-capture/fixtures.mjs');
      await boundary(f.page, 'account-delivering', side);
      await f.page.evaluate((item) => {
        window.work = openEditor(item).then(
          () => 'ready',
          (e) => String(e),
        );
      }, args(item));
      await waitHit(f.page);
      assert.equal((await snapshot(f.page, item)).marker.v, side === 'before' ? 7 : 8);
      assert.equal(await f.page.evaluate(() => !!window.editor), false);
      await crash(f);
      await cold(f);
      await open(f.page, item);
      await close(f.page);
      await assert.rejects(
        f.page.evaluate(
          (item) => Harness.openOwnedAccountSpoolWorkspace(optionsFor(item)),
          args(item),
        ),
        /Spool requires/,
      );
      await f.page.evaluate(await deliveryBundle('old-reader'));
      await configure(f.page);
      await assert.rejects(open(f.page, item), /Unsupported|Malformed/);
    },
  );
test(
  'invalid responses and exact duplicates change no persistent inventory',
  { timeout: 30000 },
  async (t) => {
    const { f, s, signer } = await ready(t, 'no-op'),
      before = await inventory(f.page);
    for (const b of [
      new Uint8Array([255]),
      response({ kind: 'refused', refusal: refusal(s, foreign) }),
      response({ kind: 'refused', refusal: refusal({ ...s, epoch: 2 }, signer) }),
    ])
      assert.equal((await record(f.page, 1, b)).kind, 'unknown');
    assert.equal(await inventory(f.page), before);
    const b = response({ kind: 'refused', refusal: refusal(s, signer) });
    assert.equal((await record(f.page, 1, b)).recorded, true);
    const stored = await inventory(f.page);
    assert.equal((await record(f.page, 1, b)).recorded, false);
    assert.equal(await inventory(f.page), stored);
    await close(f.page);
  },
);
for (const type of ['submission', 'response'])
  test(
    `missing final ${type} refuses reopening with its retained ledger witness`,
    { timeout: 30000 },
    async (t) => {
      const { f, item, s, signer } = await ready(t, 'missing-' + type);
      if (type === 'submission') await submission(f.page);
      else await record(f.page, 1, response({ kind: 'refused', refusal: refusal(s, signer) }));
      await close(f.page);
      await f.page.evaluate(
        ({ item, type }) => Harness.removeDeliveryRow(item.slotId, item.code, type),
        { item: args(item), type },
      );
      const before = await inventory(f.page);
      await assert.rejects(open(f.page, item), /incomplete|commitment/);
      assert.equal(await inventory(f.page), before);
    },
  );
test(
  'contradictory prefix acceptance, refusals and final heads halt in either order',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t);
    for (const mode of [
      'refuse-first',
      'head-first',
      'different-refusal',
      'final-first',
      'head-then-final',
    ]) {
      const item = await selected(f, mode);
      await open(f.page, item);
      await prepare(f.page);
      await edit(f.page, 0, 0, 'second ');
      await f.page.evaluate(() => editor.whenDurable());
      while ((await subjects(f.page)).length < 2) await prepare(f.page);
      const [a, b] = await subjects(f.page),
        signer = fixtureAcceptance(f, item.scope.workspaceId),
        accept = response({ kind: 'accepted', head: head(b, link(a, ZERO), 1, signer), leaf: b }),
        deny = response({ kind: 'refused', refusal: refusal(a, signer) }),
        final = response({ kind: 'accepted', head: head(a, ZERO, 1, signer, true), leaf: a });
      const steps =
        mode === 'refuse-first'
          ? [
              [1, deny],
              [2, accept],
            ]
          : mode === 'head-first'
            ? [
                [2, accept],
                [1, deny],
              ]
            : mode === 'different-refusal'
              ? [
                  [1, deny],
                  [
                    1,
                    response({
                      kind: 'refused',
                      refusal: refusal(a, signer, ZERO, 'retired-generation'),
                    }),
                  ],
                ]
              : mode === 'final-first'
                ? [
                    [1, final],
                    [2, accept],
                  ]
                : [
                    [2, accept],
                    [1, final],
                  ];
      for (const [n, bytes] of steps) assert.equal((await record(f.page, n, bytes)).recorded, true);
      assert.equal((await deliveryStatus(f.page)).state, 'conflict');
      await close(f.page);
      await cold(f);
      await open(f.page, item);
      assert.equal((await deliveryStatus(f.page)).state, 'conflict');
      assert.equal(
        (await deliveryStatus(f.page)).responses.reduce((n, p) => n + p.count, 0),
        2,
      );
      await close(f.page);
    }
  },
);
test(
  'actual early-return and witness controls expose lost submission and resurrected closed delivery',
  { timeout: 30000 },
  async (t) => {
    const { f, item, s, signer } = await ready(t, 'controls');
    await close(f.page);
    await f.page.evaluate(await deliveryBundle('early-return'));
    await configure(f.page);
    await open(f.page, item);
    const escaped = await submission(f.page);
    assert.equal(escaped.kind, 'ready');
    assert.deepEqual(await pending(f.page), []);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    await submission(f.page);
    await record(f.page, 1, response({ kind: 'refused', refusal: refusal(s, signer) }));
    await close(f.page);
    await f.page.evaluate(
      (item) => Harness.removeDeliveryRow(item.slotId, item.code, 'response'),
      args(item),
    );
    await f.page.evaluate(await deliveryBundle('no-witness'));
    await configure(f.page);
    await open(f.page, item);
    assert.equal((await deliveryStatus(f.page)).state, 'ready');
    assert.equal((await pending(f.page)).length, 1);
    artifact('controls.json', {
      earlyReturn: { bytes: escaped.bytes.length, persisted: 0 },
      missingClosure: { state: 'ready', pending: 1 },
    });
    await close(f.page);
  },
);
test(
  'close drains device signing and withholds uncommitted submission bytes',
  { timeout: 30000 },
  async (t) => {
    const { f, item } = await ready(t, 'sign-close');
    await pauseSigning(f.page);
    await f.page.evaluate((slot) => {
      window.closing = editor.close();
      window.competed = false;
      window.competitor = navigator.locks.request(
        Harness.slotPermitName(slot),
        () => (window.competed = true),
      );
    }, item.slotId);
    await f.page.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => competed), false);
    await f.page.evaluate(() => release());
    assert.notEqual(await f.page.evaluate(() => work), 'ready');
    await f.page.evaluate(() => closing);
    await f.page.evaluate(() => competitor);
    await cold(f);
    await open(f.page, item);
    assert.deepEqual(await pending(f.page), []);
    assert.equal((await submission(f.page)).kind, 'ready');
    await close(f.page);
  },
);
test(
  'authority is reauthenticated after signing; an actual omitted-recheck control commits behind a changed fence',
  { timeout: 40000 },
  async (t) => {
    const f = await native(t),
      results = [];
    for (const control of [false, true]) {
      const item = await selected(f, 'authority-' + control),
        prior = (await snapshot(f.page, item)).marker;
      if (control) {
        await f.page.evaluate(await deliveryBundle('no-authority'));
        await configure(f.page);
      }
      await open(f.page, item);
      await prepare(f.page);
      await f.page.evaluate(() => editor.whenDurable());
      const active = (await snapshot(f.page, item)).marker;
      await pauseSigning(f.page);
      await f.page.evaluate(
        ({ slot, marker }) => Harness.put([slot, 'application-upgrade'], marker),
        { slot: item.slotId, marker: prior },
      );
      await f.page.evaluate(() => release());
      const outcome = await f.page.evaluate(() => work);
      if (control) assert.equal(outcome, 'ready');
      else assert.match(outcome, /authority changed/);
      // Restore the fixture's original v8 fence to inspect the result without further fault injection.
      await f.page.evaluate(
        ({ slot, marker }) => Harness.put([slot, 'application-upgrade'], marker),
        { slot: item.slotId, marker: active },
      );
      await close(f.page);
      await cold(f);
      await open(f.page, item);
      const count = (await pending(f.page)).length;
      assert.equal(count, control ? 1 : 0);
      results.push({ control, returned: outcome === 'ready', persisted: count });
      await close(f.page);
    }
    artifact('authority-control.json', results);
  },
);
test(
  'actual leaf-only control misses contradictory prefix proofs in both orders',
  { timeout: 40000 },
  async (t) => {
    const f = await native(t),
      results = [];
    for (const reverse of [false, true]) {
      const item = await selected(f, 'leaf-control-' + reverse);
      await f.page.evaluate(await deliveryBundle('leaf-only'));
      await configure(f.page);
      await open(f.page, item);
      await prepare(f.page);
      await edit(f.page, 0, 0, 'second ');
      while ((await subjects(f.page)).length < 2) await prepare(f.page);
      const [a, b] = await subjects(f.page),
        signer = fixtureAcceptance(f, item.scope.workspaceId);
      const answers = [
        [1, response({ kind: 'refused', refusal: refusal(a, signer) })],
        [2, response({ kind: 'accepted', head: head(b, link(a, ZERO), 1, signer), leaf: b })],
      ];
      for (const [n, b] of reverse ? answers.reverse() : answers) await record(f.page, n, b);
      assert.equal((await deliveryStatus(f.page)).state, 'closed');
      await close(f.page);
      await cold(f);
      await open(f.page, item);
      assert.equal((await deliveryStatus(f.page)).state, 'conflict');
      results.push({ reverse, mutant: 'closed', actual: 'conflict' });
      await close(f.page);
    }
    artifact('prefix-control.json', results);
  },
);
test(
  'eight generated durable histories preserve exact retries, proof-derived status and sources across faults and cold restarts',
  { timeout: 100000 },
  async (t) => {
    const f = await native(t),
      seed = 9812027,
      histories = [];
    const oracle = (events) => {
      const accepted = events.filter((e) => e.kind === 'accepted' || e.kind === 'finalized'),
        refused = events.filter((e) => e.kind === 'refused'),
        finals = accepted.filter((e) => e.kind === 'finalized');
      const conflict =
        events.some((e) => e.kind === 'conflict') ||
        refused.some((n) => accepted.some((a) => n.position <= a.position)) ||
        finals.some((a) => accepted.some((b) => b.position > a.position)) ||
        finals.some((a) => finals.some((b) => b.position !== a.position));
      return {
        state: conflict
          ? 'conflict'
          : refused.length
            ? 'closed'
            : finals.length
              ? 'finalized'
              : 'ready',
        acceptedThrough: Math.max(0, ...accepted.map((a) => a.position)),
        count: events.length,
      };
    };
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          side: fc.constantFrom('before', 'after'),
          compact: fc.boolean(),
          answers: fc.array(
            fc.record({
              kind: fc.constantFrom('accepted', 'refused', 'finalized', 'conflict', 'junk'),
              position: fc.integer({ min: 1, max: 2 }),
            }),
            { minLength: 3, maxLength: 6 },
          ),
        }),
        async (history) => {
          histories.push(history);
          artifact('generated.json', { seed, histories, status: 'running' });
          console.log(`delivery history ${histories.length}/8: ${JSON.stringify(history)}`);
          const item = await selected(f, 'generated-delivery-' + histories.length);
          await open(f.page, item);
          await prepare(f.page);
          await edit(f.page, 0, 0, 'generated ');
          while ((await subjects(f.page)).length < 2) await prepare(f.page);
          await f.page.evaluate(() => editor.whenDurable());
          const sources = await captures(f.page),
            wires = await envelopes(f.page),
            ss = await subjects(f.page),
            signer = fixtureAcceptance(f, item.scope.workspaceId);
          await deliveryBoundary(f.page, 'submission', history.side);
          await f.page.evaluate(() => {
            window.work = opened.prepareSubmission(1).then(
              () => 'ready',
              (e) => String(e),
            );
          });
          await waitHit(f.page);
          if (history.side === 'before')
            assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
          await crash(f);
          await cold(f);
          await open(f.page, item);
          assert.equal((await pending(f.page)).length, history.side === 'after' ? 1 : 0);
          const saved = await submission(f.page);
          assert.deepEqual(await submission(f.page), saved);
          const events = [],
            seen = new Set();
          for (const event of history.answers) {
            const s = ss[event.position - 1],
              previous = event.position === 1 ? ZERO : link(ss[0], ZERO),
              leaf = event.kind === 'conflict' ? { ...s, digest: 'ff'.repeat(32) } : s;
            const bytes =
              event.kind === 'junk'
                ? new Uint8Array([255])
                : event.kind === 'refused'
                  ? response({ kind: 'refused', refusal: refusal(s, signer) })
                  : response({
                      kind: 'accepted',
                      head: head(leaf, previous, 1, signer, event.kind === 'finalized'),
                      leaf,
                    });
            const key = Buffer.from(bytes).toString('hex'),
              before = oracle(events);
            const shouldRecord =
              event.kind !== 'junk' && before.state !== 'conflict' && !seen.has(key);
            const result = await record(f.page, event.position, bytes);
            assert.equal(result.recorded, shouldRecord);
            if (shouldRecord) {
              events.push(event);
              seen.add(key);
            }
            const expected = oracle(events),
              actual = await deliveryStatus(f.page);
            assert.equal(actual.state, expected.state);
            assert.equal(actual.acceptedThrough, expected.acceptedThrough);
            assert.equal(
              actual.responses.reduce((n, p) => n + p.count, 0),
              expected.count,
            );
            assert.equal(
              (await pending(f.page)).length,
              expected.state === 'ready' && expected.acceptedThrough === 0 ? 1 : 0,
            );
          }
          if (history.compact) await f.page.evaluate(() => opened.compactContent());
          const before = await deliveryStatus(f.page);
          await close(f.page);
          await cold(f);
          await open(f.page, item);
          assert.deepEqual(await deliveryStatus(f.page), before);
          assert.deepEqual(await envelopes(f.page), wires);
          const retained = await captures(f.page);
          for (const source of sources)
            assert.deepEqual(
              retained.find((c) => c.id === source.id),
              source,
            );
          await close(f.page);
        },
      ),
      { seed, numRuns: 8, endOnFailure: true },
    );
    artifact('generated.json', { seed, histories, status: 'passed' });
  },
);
