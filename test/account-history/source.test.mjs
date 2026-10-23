import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFixture } from '../account-membership/replacement-source-fixture.mjs';
import { signed, hash } from '../account-membership/fixtures.mjs';
import { client as c } from './client.mjs';
import { historySourceHash } from '../../account-protocol/historySources.ts';
import { deliveryFixture } from '../account-membership/delivery-fixtures.mjs';
import {
  parseMembershipDelivery,
  parseMembershipInstallation,
  membershipDeliveryMessage,
  membershipDeliveryHash,
  membershipInstallationMessage,
} from '../../account-protocol/membershipDelivery.ts';
import {
  replacementCheckpointHash,
  replacementCheckpointAdmissionBody,
  replacementCheckpointAdmissionMessage,
  replacementCheckpointMessage,
} from '../../account-protocol/replacementCheckpoint.ts';
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

test('a certified replacement uses exact history and handoff coverage with only its current key', async (t) => {
  const x = await fixture(t),
    f = x.f,
    base = x.input.base;
  const early = c.historyMembership(
    (await c.verifyMembershipChain({ ...f.proofs, continuations: [] }, base)).history,
  );
  const old = await c.createHistoryCheckpoint(
    x.privateDoc,
    x.privateDoc,
    f.input.keys.get(1),
    early,
    x.input.producer,
    c.membershipState(early).heads,
    null,
    f.sign,
    x.input.sources,
  );
  const oldAdmission = await c.admitHistoryCheckpoint(
    old,
    f.input.keys.get(1),
    early,
    f.x.f.context.candidate.id,
    x.privateDoc,
    async (b) => signed(f.x.f.keys.new, b),
  );
  x.setPrevious({ checkpoint: old, admission: oldAdmission });
  const accepted = await c.readHistorySource(x.input);
  t.after(() => accepted.destroy());
  const cp = await c.createReplacementCheckpoint(
    accepted,
    f.root,
    f.key2,
    x.authority,
    x.input.producer,
    f.input.candidate,
    f.sign,
    { checkpoint: await c.historyCheckpointHash(old), sources: x.input.sources },
  );
  const d = await deliveryFixture('existing', {
    f: f.x.f,
    anchor: f.rotated,
    admission: f.admission,
  });
  const delivery = parseMembershipDelivery({
    ...d.delivery,
    v: 3,
    checkpointHash: await replacementCheckpointHash(cp),
  });
  delivery.signature = signed(d.keys.existing, await membershipDeliveryMessage(delivery));
  const admission = await replacementCheckpointAdmissionBody(cp);
  admission.signature = signed(d.keys.new, await replacementCheckpointAdmissionMessage(admission));
  const installation = parseMembershipInstallation({
    ...d.installation,
    v: 3,
    deliveryHash: await membershipDeliveryHash(delivery),
    checkpoint: admission,
  });
  installation.signature = signed(d.keys.new, await membershipInstallationMessage(installation));
  const certification = d.certify({ ...d.epoch, delivery, installation });
  const proofs = { ...f.proofs, continuations: [...f.proofs.continuations, certification] };
  const authority = c.historyMembership((await c.verifyMembershipChain(proofs, base)).history);
  const p = c.membershipState(authority);
  const heads = [
    ...p.heads,
    ...p.finalized.map((h) => ({ credentialId: h.credential, position: h.position, link: h.link })),
  ].sort((a, b) => a.credentialId.localeCompare(b.credentialId));
  const source = {
    ...x.input,
    proofs,
    producer: f.input.candidate,
    keys: new Map([[2, f.key2]]),
    heads,
    sources: [
      ...x.input.sources,
      {
        epoch: cp.manifest.epoch,
        head: cp.manifest.epochHead,
        kind: 'replacement',
        hash: await historySourceHash('replacement', cp),
      },
    ],
    replacement: { checkpoint: cp, admission },
    read: async () => {
      throw Error('Old covered streams must not be replayed');
    },
    exchange: async () => {
      throw Error('Old covered snapshots must not be opened');
    },
  };
  const reopened = await c.readHistorySource(source);
  try {
    assert(c.sameDocState(reopened, accepted));
    assert.match(reopened.getText('master').toString(), /handoff-only writing/);
    assert.match(reopened.getText('master').toString(), /removed accepted/);
    // It can prepare the next current-key history proposal; another approved device must admit it.
    const newest = await c.createHistoryCheckpoint(
      reopened,
      reopened,
      f.key2,
      authority,
      source.producer,
      heads,
      old,
      async (b) => signed(d.keys.new, b),
      source.sources,
    );
    assert.equal(newest.manifest.sequence, 2);
  } finally {
    reopened.destroy();
  }
  await assert.rejects(
    c.readHistorySource({ ...source, replacement: undefined }),
    /available generation/,
  );
  await assert.rejects(
    c.readHistorySource({ ...source, sources: x.input.sources }),
    /covered handoff/,
  );
  const changed = structuredClone(cp);
  changed.history.checkpoint = zero;
  changed.signature = signed(d.keys.existing, await replacementCheckpointMessage(changed));
  await assert.rejects(
    c.readHistorySource({ ...source, replacement: { checkpoint: changed, admission } }),
    /does not establish/,
  );
  await assert.rejects(
    c.readHistorySource({
      ...source,
      replacement: { checkpoint: cp, admission: { ...admission, signature: zero.repeat(2) } },
    }),
    /does not establish/,
  );
});

test('history progress counts only completed source and accepted-prefix verification', async (t) => {
  const x = await fixture(t),
    progress = [];
  x.input.progress = (value) => progress.push(structuredClone(value));
  const read = x.input.read;
  let returned = 0;
  x.input.read = async (request) => {
    assert.equal(progress.at(-1).completed, returned);
    const page = await read(request);
    returned++;
    return page;
  };
  const doc = await c.readHistorySource(x.input);
  try {
    assert.deepEqual(progress, [
      { stage: 'baseline' },
      { stage: 'sources', completed: 0, total: 1 },
      { stage: 'sources', completed: 1, total: 1 },
      { stage: 'history', completed: 0, total: 2 },
      { stage: 'history', completed: 1, total: 2 },
      { stage: 'history', completed: 2, total: 2 },
    ]);
    assert.match(doc.getText('master').toString(), /handoff-only writing/);
    assert.match(doc.getText('master').toString(), /removed accepted/);
  } finally {
    doc.destroy();
  }
});

test('a rejected history page cannot advance the displayed verified count', async (t) => {
  const x = await fixture(t),
    progress = [],
    read = x.input.read;
  x.input.progress = (value) => progress.push(structuredClone(value));
  x.input.read = async (request) => {
    const page = JSON.parse(Buffer.from(await read(request)).toString());
    page[6] = (page[6][0] === '0' ? '1' : '0') + page[6].slice(1);
    return json(page);
  };
  await assert.rejects(c.readHistorySource(x.input));
  assert.deepEqual(
    progress.filter((p) => p.stage === 'history'),
    [{ stage: 'history', completed: 0, total: 2 }],
  );
});

test('a failing progress observer cannot interrupt genuine history verification', async (t) => {
  const x = await fixture(t);
  let calls = 0;
  x.input.progress = () => {
    calls++;
    throw Error('Presentation failed');
  };
  const doc = await c.readHistorySource(x.input);
  try {
    assert.equal(calls, 6);
    assert.match(doc.getText('master').toString(), /removed accepted/);
    assert.deepEqual(x.counts(), { requests: 2, sourceReads: 1 });
  } finally {
    doc.destroy();
  }
});

test('retirement during a history read cannot publish progress or return writing', async (t) => {
  const x = await fixture(t),
    progress = [],
    read = x.input.read;
  let retired = false;
  x.input.progress = (value) => {
    assert.equal(retired, false, 'no progress may escape a retired lifetime');
    progress.push(structuredClone(value));
  };
  x.input.lifetime.assertCurrent = () => {
    if (retired) throw Error('Retired source');
  };
  x.input.read = async (request) => {
    const page = await read(request);
    retired = true;
    return page;
  };
  await assert.rejects(c.readHistorySource(x.input), /Retired source/);
  assert.deepEqual(
    progress.filter((p) => p.stage === 'history'),
    [{ stage: 'history', completed: 0, total: 2 }],
  );
  assert.equal(
    x.input.keys.get(1).every((n) => n === 41),
    true,
  );
  assert.equal(
    x.input.keys.get(2).every((n) => n === 42),
    true,
  );
});
