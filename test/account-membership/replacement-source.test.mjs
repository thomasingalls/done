import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFixture } from './replacement-source-fixture.mjs';
import { client } from './replacement-checkpoint-client.mjs';
import { deliveryFixture } from './delivery-fixtures.mjs';
import { key } from '../account-first-authority/oracle.mjs';
import { signed } from './fixtures.mjs';
import {
  verifyMembershipCertification,
  membershipState,
} from '../../account-protocol/membership.ts';
import {
  replacementCheckpointAdmissionBody,
  replacementCheckpointAdmissionMessage,
} from '../../account-protocol/replacementCheckpoint.ts';
const feed = async (source, f, entries = f.entries) => {
  const records = [];
  for (const entry of entries) {
    const { request, page } = f.packet(entry);
    records.push(await source.appendPage(entry.publisher, request, page));
  }
  return records;
};

test('source replays every accepted publisher including removed writing, then preserves local unaccepted writing', async () => {
  const f = await sourceFixture();
  let source;
  try {
    source = await client.openReplacementSource(f.input);
    assert.equal(source.pending().length, 2);
    const records = await feed(source, f);
    assert.deepEqual(source.pending(), []);
    const local = new client.Y.Doc({ gc: false }),
      expected = new client.Y.Doc({ gc: false });
    client.Y.applyUpdate(local, client.Y.encodeStateAsUpdate(f.survivor));
    local.getText('master').insert(local.getText('master').length, 'unaccepted journal edit\n');
    for (const doc of [local, f.removed])
      client.Y.applyUpdate(expected, client.Y.encodeStateAsUpdate(doc));
    try {
      const c = await source.checkpoint(local, f.sign),
        opened = await client.openReplacementCheckpoint(c, f.key2, f.parent);
      try {
        assert(client.sameDocState(expected, opened));
        assert.match(opened.getText('master').toString(), /removed accepted/);
        assert.match(opened.getText('master').toString(), /unaccepted journal edit/);
      } finally {
        opened.destroy();
      }
      source.dispose();
      source = await client.openReplacementSource({
        ...f.input,
        lifetime: { assertCurrent() {}, now: () => 1000000 },
      });
      for (const [i, record] of records.entries())
        await source.appendStored(f.entries[i].publisher, record);
      const resumed = await source.checkpoint(local, f.sign),
        replay = await client.openReplacementCheckpoint(resumed, f.key2, f.parent);
      try {
        assert(client.sameDocState(expected, replay));
      } finally {
        replay.destroy();
      }
    } finally {
      local.destroy();
      expected.destroy();
      for (const r of records) r.fill(0);
    }
  } finally {
    source?.dispose();
    f.cleanup();
  }
});

test('source cannot sign when a removed publisher is missing, the terminal link differs, or accepted updates are unresolved', async () => {
  for (const mode of ['missing', 'wrong-cut', 'pending']) {
    const f = await sourceFixture({ wrongCut: mode === 'wrong-cut', pending: mode === 'pending' });
    let source;
    let signs = 0;
    try {
      source = await client.openReplacementSource(f.input);
      if (mode === 'wrong-cut') await assert.rejects(feed(source, f), /unverified|cut/);
      else {
        await feed(source, f, mode === 'missing' ? f.entries.slice(0, 1) : f.entries);
        await assert.rejects(
          source.checkpoint(f.root, async () => {
            signs++;
            throw Error('Must not sign');
          }),
          /missing accepted|dependencies/,
        );
      }
      assert.equal(signs, 0);
      assert.throws(() => source.pending(), /closed/);
    } finally {
      source?.dispose();
      f.cleanup();
    }
  }
});

test('source excludes post-cut updates, rejects substituted readers/pages, and closes after a cancelled operation', async () => {
  const f = await sourceFixture();
  let source;
  try {
    source = await client.openReplacementSource(f.input);
    const e = f.entries[0],
      packet = f.packet(e, 2);
    await source.appendPage(e.publisher, packet.request, packet.page);
    // An advertised later suffix is not part of the admission snapshot.
    assert.equal(source.pending().length, 1);
    await assert.rejects(source.appendPage(e.publisher, packet.request, packet.page), /outside/);
    source.dispose();
    source = await client.openReplacementSource(f.input);
    const wrong = f.packet(f.entries[1]);
    await assert.rejects(source.appendPage(e.publisher, wrong.request, wrong.page), /scope/);
    source.dispose();
    let cancelled = false;
    source = await client.openReplacementSource({
      ...f.input,
      lifetime: {
        assertCurrent() {
          if (cancelled) throw Error('Cancelled');
        },
        now: () => 1000,
      },
    });
    const inflight = source.appendPage(e.publisher, packet.request, packet.page);
    cancelled = true;
    await assert.rejects(inflight, /Cancelled/);
    cancelled = false;
    assert.throws(() => source.pending(), /closed/);
  } finally {
    source?.dispose();
    f.cleanup();
  }
});

test('source needs the historical opener and cannot borrow a detached or pending producer', async () => {
  const f = await sourceFixture();
  try {
    await assert.rejects(
      client.openReplacementSource({ ...f.input, keys: new Map([[2, f.key2]]) }),
      /Missing/,
    );
    for (const producer of [f.x.target, f.input.candidate])
      await assert.rejects(client.openReplacementSource({ ...f.input, producer }), /authority/);
    const original = f.input.keys.get(1);
    assert(
      original.every((b) => b === 41),
      'failed opening does not clear borrowed keys',
    );
  } finally {
    f.cleanup();
  }
});

test('an excluded pending device has an empty cutoff, without inventing a certified publisher', async () => {
  const f = await sourceFixture({ pendingTarget: true });
  let source;
  try {
    source = await client.openReplacementSource(f.input);
    await feed(source, f);
    const c = await source.checkpoint(f.root, f.sign);
    assert(c.heads.some((h) => h.credentialId === f.x.target && h.position === 0));
  } finally {
    source?.dispose();
    f.cleanup();
  }
});

test('a replacement can produce the next snapshot from its own admitted baseline plus a current-key suffix, without historical keys', async () => {
  const f = await sourceFixture();
  let source, next;
  try {
    source = await client.openReplacementSource(f.input);
    await feed(source, f);
    const checkpoint = await source.checkpoint(f.root, f.sign);
    const admission = await replacementCheckpointAdmissionBody(checkpoint),
      newKey = key('27'.repeat(32));
    admission.signature = signed(newKey, await replacementCheckpointAdmissionMessage(admission));
    const delivery = await deliveryFixture('existing', {
      f: f.x.f,
      anchor: f.rotated,
      admission: f.admission,
    });
    const certified = await verifyMembershipCertification(delivery.certification, delivery.parent);
    const writing = await client.openReplacementCheckpoint(checkpoint, f.key2, f.parent);
    let later;
    try {
      const sv = client.Y.encodeStateVector(writing);
      writing
        .getText('master')
        .insert(writing.getText('master').length, 'later generation-two accepted writing\n');
      later = f.entry(
        f.input.producer,
        f.x.f.keys.existing,
        client.Y.encodeStateAsUpdate(writing, sv),
        9,
        { epoch: 6, generation: 2, position: 2, previous: f.entries[0].link },
      );
    } finally {
      writing.destroy();
    }
    const proposed = f.x.f.admit(membershipState(certified), 'aa'.repeat(16));
    proposed.epoch.heads = proposed.epoch.heads.map((h) =>
      h.credentialId === later.publisher ? { ...h, position: 2, link: later.link } : h,
    );
    const newAdmission = f.x.f.seal(proposed.epoch);
    const { history } = await client.verifyMembershipChain(
      {
        ...f.proofs,
        continuations: [...f.proofs.continuations, delivery.certification, newAdmission],
      },
      f.input.authority.base,
    );
    const input = {
      ...f.input,
      checkpoint,
      installed: { parent: f.parent, admission },
      history,
      producer: f.input.candidate,
      candidate: 'aa'.repeat(16),
      keys: new Map([[2, f.key2]]),
    };
    next = await client.openReplacementSource(input);
    assert.deepEqual(next.pending(), [
      { credentialId: later.publisher, position: 2, link: later.link, after: 1 },
    ]);
    const packet = f.packet(later, 2, history, input.producer, newKey);
    await next.appendPage(later.publisher, packet.request, packet.page);
    const newest = await next.checkpoint(f.root, async (b) => signed(newKey, b));
    const result = await client.openReplacementCheckpoint(
      newest,
      f.key2,
      client.historyMembership(history),
    );
    try {
      assert.match(result.getText('master').toString(), /removed accepted/);
      assert.match(result.getText('master').toString(), /later generation-two accepted/);
    } finally {
      result.destroy();
    }
    await assert.rejects(
      client.openReplacementSource({ ...input, installed: undefined }),
      /own admitted/,
    );
    await assert.rejects(
      client.openReplacementSource({
        ...input,
        installed: {
          parent: f.parent,
          admission: { ...admission, checkpointHash: 'ff'.repeat(32) },
        },
      }),
      /admission changed/,
    );
  } finally {
    source?.dispose();
    next?.dispose();
    f.cleanup();
  }
});
