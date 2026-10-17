import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFixture } from '../account-membership/replacement-source-fixture.mjs';
import { signed, hash } from '../account-membership/fixtures.mjs';
import { client as c } from './client.mjs';
const json = (v) => new Uint8Array(Buffer.from(JSON.stringify(v)));
async function fixture(t, { short = 8, corrupt = false, extra = false, batch = false } = {}) {
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
  for (let i = 1; i <= 19; i++) {
    const before = c.Y.encodeStateVector(expected);
    expected.getText('master').insert(expected.getText('master').length, ` accepted ${i};`);
    rows.push(
      f.entry(
        input.producer,
        f.x.f.keys.existing,
        c.Y.encodeStateAsUpdate(expected, before),
        20 + i,
        { epoch: 1, position: i, previous: rows.at(-1)?.link ?? '00'.repeat(32) },
      ),
    );
  }
  input.heads = [{ credentialId: input.producer, position: 19, link: rows[18].link }];
  progress.length = 0;
  input.read = async (request) => {
    const r = JSON.parse(Buffer.from(request));
    requests.push({ after: r[10], limit: r[11] });
    const selected = rows.slice(r[10], r[10] + Math.min(short, r[11]) + (extra ? 1 : 0));
    const entries = selected.map((e) => [
      Buffer.from(e.envelope).toString('hex'),
      Buffer.from(e.proof).toString('hex'),
    ]);
    if (corrupt) {
      const proof = JSON.parse(Buffer.from(entries[3][1], 'hex'));
      proof[6] = 'ab'.repeat(32);
      entries[3][1] = Buffer.from(json(proof)).toString('hex');
    }
    const body = [
      'done/private-read-page/v2',
      2,
      hash(request),
      19,
      r[10] + selected.length,
      entries,
    ];
    return json([...body, signed(f.x.f.f.keys.acceptance, json(body))]);
  };
  if (batch)
    input.readBatch = async (requests) => {
      assert.equal(
        requests.length,
        1,
        'one adaptive page avoids guessing a short-page next cursor',
      );
      return [await input.read(requests[0])];
    };
  return { input, rows, requests, progress, expected };
}
for (const batch of [false, true])
  test(`nineteen accepted edits use three bounded pages with exact content and verified counts; carrier=${batch}`, async (t) => {
    const h = await fixture(t, { batch }),
      doc = await c.readHistorySource(h.input);
    try {
      assert(c.sameDocState(doc, h.expected));
      assert.deepEqual(h.requests, [
        { after: 0, limit: 8 },
        { after: 8, limit: 8 },
        { after: 16, limit: 3 },
      ]);
      assert.deepEqual(
        h.progress.filter((x) => x.stage === 'history').map((x) => x.completed),
        [0, 8, 16, 19],
      );
    } finally {
      doc.destroy();
    }
  });
test('signed short pages continue from every actual verified prefix without skipping a position', async (t) => {
  const h = await fixture(t, { short: 3, batch: true }),
    doc = await c.readHistorySource(h.input);
  try {
    assert(c.sameDocState(doc, h.expected));
    assert.deepEqual(
      h.requests.map((x) => x.after),
      [0, 3, 6, 9, 12, 15, 18],
    );
    assert.deepEqual(
      h.progress.filter((x) => x.stage === 'history').map((x) => x.completed),
      [0, 3, 6, 9, 12, 15, 18, 19],
    );
  } finally {
    doc.destroy();
  }
});
test('a false middle acceptance inside a validly signed page cannot publish any count or source', async (t) => {
  const h = await fixture(t, { corrupt: true });
  await assert.rejects(c.readHistorySource(h.input));
  assert.equal(h.requests.length, 1);
  assert.deepEqual(
    h.progress.filter((x) => x.stage === 'history').map((x) => x.completed),
    [0],
  );
});
test('an exact-cut mismatch withholds the final page and never publishes completion', async (t) => {
  const h = await fixture(t);
  h.input.heads[0].link = 'ab'.repeat(32);
  await assert.rejects(c.readHistorySource(h.input));
  assert.deepEqual(
    h.progress.filter((x) => x.stage === 'history').map((x) => x.completed),
    [0, 8, 16],
  );
});
test('an overfull page cannot cross its captured outstanding request extent', async (t) => {
  const h = await fixture(t, { extra: true });
  await assert.rejects(c.readHistorySource(h.input));
  assert.deepEqual(
    h.progress.filter((x) => x.stage === 'history').map((x) => x.completed),
    [0],
  );
});
test('retirement after a verified page stops further reads and withholds the reconstructed document', async (t) => {
  const h = await fixture(t);
  let retired = false;
  h.input.lifetime.assertCurrent = () => {
    if (retired) throw Error('Retired page owner');
  };
  h.input.progress = (value) => {
    h.progress.push(structuredClone(value));
    if (value.stage === 'history' && value.completed === 8) retired = true;
  };
  await assert.rejects(c.readHistorySource(h.input), /Retired page owner/);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(
    h.progress.filter((x) => x.stage === 'history').map((x) => x.completed),
    [0, 8],
  );
});
