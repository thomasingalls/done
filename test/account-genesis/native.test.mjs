import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  native,
  prepare,
  abandon,
  snapshot,
  inventory,
  boundary,
  args,
  genesis,
  seed,
  poison,
  genesisBundle,
} from './fixtures.mjs';
import { openCandidate } from './oracle.mjs';
const ops = [
  { at: 4, remove: 0, insert: ' journal-only-secret', disk: false },
  { at: 0, remove: 1, insert: 'replacement', disk: true },
];
const outsideMarker = (raw) => {
  const parsed = JSON.parse(raw);
  for (const row of parsed[0])
    if (row[0] === 'done.custody' && row[1] === 'entries') {
      const keep = row[2]
        .map((key, i) => [key, row[3][i]])
        .filter(([key]) => !(Array.isArray(key) && key[1] === 'application-upgrade'));
      row[2] = keep.map((x) => x[0]);
      row[3] = keep.map((x) => x[1]);
    }
  return JSON.stringify(parsed);
};
const decode = async (f, item, candidate) =>
  f.page.evaluate(
    (update) => Harness.decode(update),
    [...openCandidate(candidate, item.draft, item.recoveryCode)],
  );
const artifact = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
};

test(
  'genesis preserves full database+journal state, attribution, source carriers and exact artifacts on restart',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('main');
    const expected = await seed(f.page, item, ops, true);
    await prepare(f.page, item);
    const before = await inventory(f.page),
      record = (await snapshot(f.page, item)).record;
    const candidate = await genesis(f.page, item);
    assert.deepEqual(await decode(f, item, candidate), expected.state);
    assert.equal(outsideMarker(await inventory(f.page)), outsideMarker(before));
    assert.deepEqual((await snapshot(f.page, item)).record, record);
    assert.equal(candidate.wraps.length, 2);
    assert.equal(candidate.proposedEpoch, 1);
    assert.ok(!JSON.stringify(candidate).includes('journal-only-secret'));
    assert.ok(!JSON.stringify(candidate).includes('Private author'));
    await assert.rejects(
      f.page.evaluate((item) => Harness.readText(item.scope, item.code), args(item)),
      /retained storage format/,
    );
    const retained = await inventory(f.page);
    await f.setup(f.page);
    assert.deepEqual(await genesis(f.page, item), candidate);
    assert.equal(await inventory(f.page), retained);
    await prepare(f.page, item); // Calling the preceding phase must never replace candidate credentials.
    assert.equal(await inventory(f.page), retained);
    await abandon(f.page, item);
    assert.equal(outsideMarker(await inventory(f.page)), outsideMarker(before));
    await assert.rejects(genesis(f.page, item), /prepared promotion/);
  },
);
for (const side of ['before', 'after'])
  test(`renderer restart ${side} genesis commit`, { timeout: 30000 }, async (t) => {
    const f = await native(t),
      item = await f.ready('crash-' + side);
    const expected = await seed(f.page, item, ops);
    await prepare(f.page, item);
    const before = await inventory(f.page);
    await boundary(f.page, 'genesis-prepared', side);
    await f.page.evaluate((item) => {
      window.work = Harness.preparePromotionGenesis({
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
    const won = (await snapshot(f.page, item)).marker;
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
    const result = await genesis(f.page, item);
    assert.deepEqual(await decode(f, item, result), expected.state);
    assert.equal(outsideMarker(await inventory(f.page)), outsideMarker(before));
    if (side === 'after') assert.deepEqual(result, won.genesis);
    else assert.equal(won.stage, 'prepared');
  });
test(
  'wrong factors, foreign owner and current service abandonment preserve preparation',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('refusals');
    await seed(f.page, item, ops);
    await prepare(f.page, item);
    const before = await inventory(f.page);
    for (const patch of [
      { code: 'wrong' },
      { recoveryCode: '0'.repeat(25) },
      { accountId: 'A'.repeat(43) },
      { draft: { ...item.draft, rPub: '11'.repeat(32) } },
    ]) {
      await assert.rejects(genesis(f.page, { ...item, ...patch }));
      assert.equal(await inventory(f.page), before);
    }
    await f.server.core.abandonPreparation({ retryKey: item.retryKey, accountId: item.accountId });
    await assert.rejects(genesis(f.page, item));
    assert.equal(await inventory(f.page), before);
  },
);
for (const invalid of ['actor', 'card'])
  test(
    `unattestable ${invalid} refuses without rewriting content`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await f.ready('invalid-' + invalid);
      await seed(f.page, item, ops, false, invalid);
      await prepare(f.page, item);
      const before = await inventory(f.page);
      await assert.rejects(genesis(f.page, item), /attest|attribution/);
      assert.equal(await inventory(f.page), before);
    },
  );
for (const kind of ['snapshot', 'wrap', 'coverage', 'recipient', 'actor'])
  test(`validly signed ${kind} forgery is refused`, { timeout: 30000 }, async (t) => {
    const f = await native(t),
      item = await f.ready('forged-' + kind);
    const expected = await seed(f.page, item, ops);
    await prepare(f.page, item);
    const original = await genesis(f.page, item);
    await poison(f.page, item, kind, expected.initial);
    const before = await inventory(f.page);
    await assert.rejects(genesis(f.page, item));
    assert.equal(await inventory(f.page), before);
    if (kind === 'snapshot' || kind === 'wrap') {
      await f.page.evaluate(await genesisBundle(kind));
      const accepted = await genesis(f.page, item);
      assert.deepEqual(accepted, (await snapshot(f.page, item)).marker.genesis);
      let semantic;
      if (kind === 'snapshot') {
        const actual = await decode(f, item, accepted);
        assert.notDeepEqual(actual, expected.state);
        const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
        semantic = { expectedSha256: digest(expected.state), actualSha256: digest(actual) };
      } else {
        assert.throws(() => openCandidate(accepted, item.draft, item.recoveryCode));
        semantic = { oracle: 'refused' };
      }
      artifact('control-' + kind, {
        control: kind,
        baseline: 'refused',
        original,
        semantic,
        observed: 'forged artifact accepted with semantic refusal disabled',
        candidate: accepted,
      });
    }
  });
test(
  'competing owners converge and cancellation drains before releasing the exclusive permit',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('competing');
    await seed(f.page, item, ops);
    await prepare(f.page, item);
    const other = await f.context.newPage();
    await f.setup(other);
    await boundary(f.page, 'genesis-prepared', 'after');
    await f.page.evaluate((item) => {
      window.abort = new AbortController();
      window.work = Harness.preparePromotionGenesis({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        signal: abort.signal,
      }).then(
        (v) => v,
        (e) => String(e),
      );
    }, args(item));
    await f.page.waitForFunction(() => window.hit === true);
    const retained = (await snapshot(f.page, item)).marker.genesis;
    await f.page.evaluate(() => abort.abort());
    await other.evaluate((item) => {
      window.finished = false;
      window.work = Harness.preparePromotionGenesis({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
      }).then((v) => {
        finished = true;
        return v;
      });
    }, args(item));
    const locks = await other.evaluate(() => navigator.locks.query());
    assert.ok(locks.pending.length > 0);
    assert.equal(await other.evaluate(() => finished), false);
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => work);
    assert.deepEqual(await other.evaluate(() => work), retained);
  },
);
test(
  'previous version refuses the new carrier; malformed fields never gain an owner',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await f.ready('format');
    await seed(f.page, item, ops);
    await prepare(f.page, item);
    await genesis(f.page, item);
    const original = (await snapshot(f.page, item)).marker,
      before = await inventory(f.page),
      calls = await f.page.evaluate(() => window.calls);
    await f.page.evaluate(await genesisBundle('old-reader'));
    await assert.rejects(
      prepare(f.page, item),
      /Unsupported promotion|Invalid|Malformed preparation/,
    );
    await assert.rejects(
      abandon(f.page, item),
      /Unsupported promotion|Invalid|Malformed preparation/,
    );
    assert.equal(await f.page.evaluate(() => window.calls), calls);
    assert.equal(await inventory(f.page), before);
    await f.setup(f.page);
    for (const field of ['version', 'extra', 'recipients', 'heads', 'signature']) {
      await f.page.evaluate(
        ({ item, original, field }) => {
          const bad = structuredClone(original);
          if (field === 'version') bad.v = 3;
          if (field === 'extra') bad.genesis.future = true;
          if (field === 'recipients') bad.genesis.wraps.push(bad.genesis.wraps[0]);
          if (field === 'heads') bad.genesis.coverage.heads = ['unaccepted'];
          if (field === 'signature') bad.genesis.signature = '00'.repeat(64);
          return Harness.put([item.slotId, 'application-upgrade'], bad);
        },
        { item: args(item), original, field },
      );
      const malformed = await inventory(f.page);
      await assert.rejects(genesis(f.page, item));
      assert.equal(await inventory(f.page), malformed);
    }
    await f.page.evaluate(
      ({ item, original }) => Harness.put([item.slotId, 'application-upgrade'], original),
      { item: args(item), original },
    );
    assert.deepEqual(await genesis(f.page, item), original.genesis);
  },
);

test(
  '40 generated delivery/interruption histories preserve independent text and full source state',
  { timeout: 90000 },
  async (t) => {
    const f = await native(t);
    let index = 0;
    const histories = [];
    const arb = fc.record({
      ops: fc.array(
        fc.record({
          at: fc.nat(100),
          remove: fc.nat(6),
          insert: fc.string({ minLength: 1, maxLength: 16 }),
          disk: fc.boolean(),
        }),
        { minLength: 1, maxLength: 12 },
      ),
      reverse: fc.boolean(),
      abort: fc.boolean(),
      restart: fc.boolean(),
      forgery: fc.constantFrom('snapshot', 'wrap', 'coverage', 'recipient', 'actor'),
    });
    await fc.assert(
      fc.asyncProperty(arb, async (history) => {
        const item = await f.ready('generated-' + index++);
        let text = 'base';
        for (const op of history.ops) {
          const at = op.at % (text.length + 1);
          text =
            text.slice(0, at) + op.insert + text.slice(at + Math.min(op.remove, text.length - at));
        }
        const expected = await seed(f.page, item, history.ops, history.reverse);
        assert.equal(expected.state.json.master, text);
        const order = ['retained-card-id', 'human-card-id'];
        if (history.ops.filter((op) => op.remove % 2).length % 2) order.reverse();
        assert.deepEqual(
          expected.state.cards.map((c) => c.id),
          order,
        );
        await prepare(f.page, item);
        const before = await inventory(f.page);
        if (history.abort) {
          await boundary(f.page, 'genesis-prepared', 'before');
          await assert.rejects(genesis(f.page, item));
          await f.setup(f.page);
        }
        const candidate = await genesis(f.page, item);
        const decoded = await decode(f, item, candidate);
        assert.equal(decoded.json.master, text);
        assert.deepEqual(
          decoded.cards.map((c) => c.id),
          order,
        );
        assert.equal(decoded.cards.find((c) => c.id === 'retained-card-id').author, 'system');
        assert.equal(
          decoded.cards.find((c) => c.id === 'human-card-id').author,
          item.scope.principalId,
        );
        assert.deepEqual(decoded, expected.state);
        assert.equal(outsideMarker(await inventory(f.page)), outsideMarker(before));
        if (history.restart) await f.setup(f.page);
        assert.deepEqual(await genesis(f.page, item), candidate);
        await poison(f.page, item, history.forgery, expected.initial);
        await assert.rejects(genesis(f.page, item));
        await abandon(f.page, item);
        assert.equal(outsideMarker(await inventory(f.page)), outsideMarker(before));
        histories.push({ ...history, status: 'passed' });
      }),
      { seed: 9222026, numRuns: 40, endOnFailure: true },
    );
    artifact('generated', { seed: 9222026, numRuns: 40, histories });
  },
);
