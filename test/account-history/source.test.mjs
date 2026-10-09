import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFixture } from '../account-membership/replacement-source-fixture.mjs';
import { signed, hash } from '../account-membership/fixtures.mjs';
import { client as c } from './client.mjs';
import { historySourceHash } from '../../account-protocol/historySources.ts';
import {
  historyCatalogMessage,
  historyCheckpointPageMessage,
  historyExchangeHash,
} from '../../account-protocol/historyExchange.ts';
const json = (value) => new Uint8Array(Buffer.from(JSON.stringify(value)));
const zero = '00'.repeat(32);
async function fixture(t, options = {}) {
  const f = await sourceFixture({ ...options, client: c });
  t.after(() => f.cleanup());
  const base = f.input.authority.base;
  const authority = c.historyMembership((await c.verifyMembershipChain(f.proofs, base)).history);
  const p = c.membershipState(authority);
  const heads = [
    ...p.heads,
    ...p.finalized.map((h) => ({ credentialId: h.credential, position: h.position, link: h.link })),
  ].sort((a, b) => a.credentialId.localeCompare(b.credentialId));
  const privateDoc = new c.Y.Doc({ gc: false });
  c.Y.applyUpdate(privateDoc, c.Y.encodeStateAsUpdate(f.root));
  privateDoc
    .getText('master')
    .insert(privateDoc.getText('master').length, 'handoff-only writing\n');
  t.after(() => privateDoc.destroy());
  const handoff = await c.createContentCheckpoint(
    privateDoc,
    f.input.keys.get(1),
    f.input.authority,
    f.input.checkpoint.binding,
    f.sign,
  );
  const ref = {
    epoch: 3,
    head: f.input.authority.certification.head,
    kind: 'original',
    hash: await historySourceHash('original', handoff),
  };
  let requests = 0,
    sourceReads = 0,
    previous = null;
  const input = {
    base,
    proofs: f.proofs,
    binding: f.input.checkpoint.binding,
    producer: f.input.producer,
    keys: f.input.keys,
    heads,
    sources: [ref],
    previous: null,
    lifetime: { assertCurrent() {}, now: () => 1000 },
    sign: f.sign,
    async read(request) {
      requests++;
      const r = JSON.parse(Buffer.from(request).toString());
      const entry = f.entries.find((e) => e.publisher === r[6] && e.position === r[10] + 1);
      assert(entry, 'unexpected prefix request');
      const body = [
        'done/private-read-page/v2',
        2,
        hash(request),
        entry.position,
        entry.position,
        [[Buffer.from(entry.envelope).toString('hex'), Buffer.from(entry.proof).toString('hex')]],
      ];
      return json([...body, signed(f.x.f.f.keys.acceptance, json(body))]);
    },
    async exchange(request) {
      sourceReads++;
      const cat = {
        v: 1,
        kind: 'history-checkpoint-catalog',
        workspaceId: p.workspaceId,
        lineageId: p.lineageId,
        sequence: previous ? 1 : 0,
        latest: previous ? await c.historyCheckpointHash(previous.checkpoint) : zero,
        previous: zero,
        pending: zero,
        signature: zero.repeat(2),
      };
      cat.signature = signed(f.x.f.f.keys.authority, await historyCatalogMessage(cat));
      const page = {
        v: 1,
        kind: 'history-checkpoint-page',
        requestHash: await historyExchangeHash(request),
        catalog: cat,
        checkpoint: null,
        admission: null,
        heads,
        sources: [ref],
        source: { ref, checkpoint: handoff },
        signature: zero.repeat(2),
      };
      page.signature = signed(f.x.f.f.keys.authority, await historyCheckpointPageMessage(page));
      return page;
    },
  };
  return {
    f,
    input,
    authority,
    privateDoc,
    ref,
    counts: () => ({ requests, sourceReads }),
    setPrevious(value) {
      previous = value;
      input.previous = value;
    },
  };
}
test('cold source preserves accepted removed-device edits, deletions and writing present only in a handoff', async (t) => {
  const x = await fixture(t),
    doc = await c.readHistorySource(x.input);
  try {
    const expected = new c.Y.Doc({ gc: false });
    try {
      for (const d of [x.privateDoc, x.f.survivor, x.f.removed])
        c.Y.applyUpdate(expected, c.Y.encodeStateAsUpdate(d));
      assert(c.sameDocState(expected, doc));
      assert.match(doc.getText('master').toString(), /handoff-only writing/);
      assert.match(doc.getText('master').toString(), /removed accepted/);
      assert.deepEqual(x.counts(), { requests: 2, sourceReads: 1 });
    } finally {
      expected.destroy();
    }
    const cp = await c.createHistoryCheckpoint(
      doc,
      doc,
      x.f.key2,
      x.authority,
      x.input.producer,
      x.input.heads,
      null,
      x.f.sign,
      x.input.sources,
    );
    const admission = await c.admitHistoryCheckpoint(
      cp,
      x.f.key2,
      x.authority,
      x.input.producer,
      doc,
      x.f.sign,
    );
    x.setPrevious({ checkpoint: cp, admission });
    const again = await c.readHistorySource(x.input);
    try {
      assert(c.sameDocState(doc, again));
      assert.deepEqual(
        x.counts(),
        { requests: 2, sourceReads: 1 },
        'admitted baseline skips already covered streams and handoffs',
      );
    } finally {
      again.destroy();
    }
  } finally {
    doc.destroy();
  }
});
test('missing prefixes, false cuts, unresolved dependencies and missing keys never produce a source', async (t) => {
  for (const mode of ['missing', 'wrong-cut', 'pending', 'missing-key']) {
    const x = await fixture(t, { wrongCut: mode === 'wrong-cut', pending: mode === 'pending' });
    if (mode === 'missing')
      x.input.read = async () => {
        throw Error('Unavailable accepted publisher');
      };
    if (mode === 'missing-key') x.input.keys = new Map([[2, x.f.key2]]);
    await assert.rejects(c.readHistorySource(x.input));
    assert(
      x.f.key2.every((v) => v === 42),
      'failed replay does not erase borrowed keys',
    );
  }
});
test('handoff substitution and owner cancellation refuse before returning plaintext', async (t) => {
  const x = await fixture(t),
    ref = structuredClone(x.input.sources[0]);
  x.input.sources = [{ ...ref, hash: 'ff'.repeat(32) }];
  await assert.rejects(c.readHistorySource(x.input), /source (inventory|selection)/);
  x.input.sources = [ref];
  let cancelled = false;
  x.input.lifetime.assertCurrent = () => {
    if (cancelled) throw Error('Locked');
  };
  const read = x.input.read;
  x.input.read = async (request) => {
    const page = await read(request);
    cancelled = true;
    return page;
  };
  await assert.rejects(c.readHistorySource(x.input), /Locked/);
});

test('a single-device account replays only the suffix after its admitted epoch-one checkpoint', async (t) => {
  const f = await sourceFixture({ client: c });
  t.after(() => f.cleanup());
  const base = f.input.authority.base,
    authority = await c.verifyEarlyMembership(base),
    p = c.membershipState(authority);
  const input = {
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
      throw Error('No accepted suffix yet');
    },
    exchange: async () => {
      throw Error('No handoff sources');
    },
  };
  const first = await c.readHistorySource(input);
  try {
    const cp = await c.createHistoryCheckpoint(
      first,
      first,
      input.keys.get(1),
      authority,
      input.producer,
      input.heads,
      null,
      f.sign,
    );
    input.previous = {
      checkpoint: cp,
      admission: await c.admitHistoryCheckpoint(
        cp,
        input.keys.get(1),
        authority,
        input.producer,
        first,
        f.sign,
      ),
    };
    const entry = f.entry(
      input.producer,
      f.x.f.keys.existing,
      c.Y.encodeStateAsUpdate(f.survivor, c.Y.encodeStateVector(first)),
      13,
      { epoch: 1 },
    );
    input.heads = [{ credentialId: input.producer, position: 1, link: entry.link }];
    let reads = 0;
    input.read = async (request) => {
      reads++;
      const r = JSON.parse(Buffer.from(request).toString());
      assert.equal(r[10], 0);
      const body = [
        'done/private-read-page/v2',
        2,
        hash(request),
        1,
        1,
        [[Buffer.from(entry.envelope).toString('hex'), Buffer.from(entry.proof).toString('hex')]],
      ];
      return json([...body, signed(f.x.f.f.keys.acceptance, json(body))]);
    };
    const second = await c.readHistorySource(input);
    try {
      assert(c.sameDocState(second, f.survivor));
      assert.equal(reads, 1);
    } finally {
      second.destroy();
    }
  } finally {
    first.destroy();
  }
});
