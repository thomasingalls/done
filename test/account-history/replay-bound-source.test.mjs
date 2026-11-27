// Phase 547: the cold history replay itself counts the positions it would read and refuses past
// HISTORY_REPLAY_EVENTS before reading any, with a named error carrying both numbers. Before this
// phase it read 4,096 positions and then failed with a plain error. Same signed-page apparatus as
// multi-page-source.test.mjs, with up to 4,100 accepted positions from one publisher.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFixture } from '../account-membership/replacement-source-fixture.mjs';
import { signed, hash } from '../account-membership/fixtures.mjs';
import { client as c } from './client.mjs';
const json = (v) => new Uint8Array(Buffer.from(JSON.stringify(v)));

/** `total` accepted positions; replay from `previous` (an admitted snapshot at `at`) or genesis. */
async function fixture(t, total, at = 0) {
  const f = await sourceFixture({ client: c });
  t.after(() => f.cleanup());
  const base = f.input.authority.base,
    authority = await c.verifyEarlyMembership(base),
    p = c.membershipState(authority);
  const requests = [],
    progress = [],
    input = {
      base,
      proofs: null,
      binding: f.input.checkpoint.binding,
      producer: f.input.producer,
      keys: new Map([[1, f.input.keys.get(1)]]),
      heads: p.heads,
      sources: [],
      previous: null,
      lifetime: { assertCurrent() {}, now: () => 1000 },
      sign: f.sign,
      read: async () => {
        throw Error('No suffix yet');
      },
      exchange: async () => {
        throw Error('No source');
      },
      progress: (value) => progress.push(structuredClone(value)),
    };
  const baseline = await c.readHistorySource(input),
    expected = new c.Y.Doc({ gc: false }),
    rows = [];
  t.after(() => {
    baseline.destroy();
    expected.destroy();
  });
  c.Y.applyUpdate(expected, c.Y.encodeStateAsUpdate(baseline));
  expected.clientID = 9001;
  let previous = null;
  for (let i = 1; i <= total; i++) {
    const before = c.Y.encodeStateVector(expected);
    expected.getText('master').insert(expected.getText('master').length, ` ${i};`);
    rows.push(
      f.entry(
        input.producer,
        f.x.f.keys.existing,
        c.Y.encodeStateAsUpdate(expected, before),
        (i % 250) + 3,
        { epoch: 1, position: i, previous: rows.at(-1)?.link ?? '00'.repeat(32) },
      ),
    );
    if (i === at) {
      const heads = [{ credentialId: input.producer, position: at, link: rows[at - 1].link }];
      const checkpoint = await c.createHistoryCheckpoint(
        expected,
        expected,
        input.keys.get(1),
        authority,
        input.producer,
        heads,
        null,
        f.sign,
      );
      const admission = await c.admitHistoryCheckpoint(
        checkpoint,
        input.keys.get(1),
        authority,
        input.producer,
        expected,
        f.sign,
      );
      previous = { checkpoint, admission };
    }
  }
  input.previous = previous;
  input.heads = [{ credentialId: input.producer, position: total, link: rows[total - 1].link }];
  progress.length = 0;
  input.read = async (request) => {
    const r = JSON.parse(Buffer.from(request));
    requests.push({ after: r[10], limit: r[11] });
    const selected = rows.slice(r[10], r[10] + r[11]);
    const entries = selected.map((e) => [
      Buffer.from(e.envelope).toString('hex'),
      Buffer.from(e.proof).toString('hex'),
    ]);
    const body = [
      'done/private-read-page/v2',
      2,
      hash(request),
      total,
      r[10] + selected.length,
      entries,
    ];
    return json([...body, signed(f.x.f.f.keys.acceptance, json(body))]);
  };
  return { input, requests, progress, expected };
}

const historyStages = (h) => h.progress.filter((x) => x.stage === 'history');

for (const at of [0, 3])
  test(`a replay of exactly 4,096 positions completes${at ? ' after an admitted snapshot' : ''}`, async (t) => {
    const h = await fixture(t, at + 4096, at),
      doc = await c.readHistorySource(h.input);
    try {
      assert(c.sameDocState(doc, h.expected));
      assert.equal(h.requests.length, 512);
      assert.equal(h.requests[0].after, at);
      assert.deepEqual(historyStages(h).at(-1), { stage: 'history', completed: 4096, total: 4096 });
    } finally {
      doc.destroy();
    }
  });

for (const at of [0, 3])
  test(`a replay of 4,097 positions is refused before any position is read${at ? ' after an admitted snapshot' : ''}`, async (t) => {
    const h = await fixture(t, at + 4097, at);
    await assert.rejects(c.readHistorySource(h.input), (e) => {
      assert.equal(e.message, 'History replay exceeds its event bound');
      assert.equal(e.needed, 4097);
      assert.equal(e.allowed, 4096);
      return true;
    });
    assert.deepEqual(h.requests, []);
    assert.deepEqual(historyStages(h), []);
    // The count the history owner uses before it starts a replay agrees with the replay's own.
    const start = c.historyReplayStart({
      previous: h.input.previous?.checkpoint ?? null,
      keys: h.input.keys,
    });
    assert.equal(c.historyReplayPositions(h.input.heads, start), 4097);
  });
