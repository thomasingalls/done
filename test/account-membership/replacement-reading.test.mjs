import test from 'node:test';
import assert from 'node:assert/strict';
import { client } from './replacement-checkpoint-client.mjs';
import { sourceFixture } from './replacement-source-fixture.mjs';
import { deliveryFixture } from './delivery-fixtures.mjs';
import { signed, hash } from './fixtures.mjs';
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
} from '../../account-protocol/replacementCheckpoint.ts';
async function fixture() {
  const f = await sourceFixture();
  const source = await client.openReplacementSource(f.input);
  let checkpoint;
  try {
    for (const e of f.entries) {
      const p = f.packet(e);
      (await source.appendPage(e.publisher, p.request, p.page)).fill(0);
    }
    checkpoint = await source.checkpoint(f.survivor, f.sign);
  } finally {
    source.dispose();
  }
  const d = await deliveryFixture('existing', {
    f: f.x.f,
    anchor: f.rotated,
    admission: f.admission,
  });
  const delivery = parseMembershipDelivery({
    ...d.delivery,
    v: 3,
    checkpointHash: await replacementCheckpointHash(checkpoint),
  });
  delivery.signature = signed(d.keys.existing, await membershipDeliveryMessage(delivery));
  const admission = await replacementCheckpointAdmissionBody(checkpoint);
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
  const { history } = await client.verifyMembershipChain(proofs, f.input.authority.base);
  const authority = { base: f.input.authority.base, ...proofs },
    who = d.c.candidate,
    reading = {
      v: 3,
      head: history.current.head,
      epoch: history.current.tip,
      checkpoint,
      admission,
      binding: f.input.checkpoint.binding,
      streams: history.readers.map((m) => {
        const cut = checkpoint.heads.find((h) => h.credentialId === m.id);
        return {
          publisher: m.id,
          events: [],
          prefix: { position: cut.position, link: cut.link, observedThrough: cut.position },
        };
      }),
    };
  return {
    ...f,
    d,
    history,
    authority,
    who,
    reading,
    replay: (r = reading, key = f.key2) =>
      client.replayMembershipReading(r, authority, history, who, key, {
        assertCurrent() {},
        now: () => 1000,
      }),
  };
}

test('replacement reader starts at certified cuts with its current key, including removed writing but no removed stream', async () => {
  const f = await fixture();
  let replay;
  try {
    replay = await f.replay();
    assert.match(replay.doc.getText('master').toString(), /removed accepted/);
    assert.equal(
      replay.contexts.some((c) => c.publisher.id === f.x.target),
      false,
    );
    assert.equal(
      replay.contexts.find((c) => c.publisher.id === f.input.producer).prefix.position,
      1,
    );
    const context = replay.contexts.find((c) => c.publisher.id === f.who.id);
    const route = {
      workspace: f.history.current.workspace,
      principal: f.history.principal,
      credential: f.who.id,
      epoch: f.history.current.tip,
      generation: 2,
      history: context.history,
    };
    const rows = [{ v: 1, gen: 2, seq: 1, kind: 'update', bytes: replay.initial }];
    const state = await client.verifyInboundLedger(
      client.inspectInbound(rows, route, context),
      rows,
      context,
      { assertCurrent() {} },
    );
    assert.equal(client.publisherState(state, context, f.input.producer).prefix.position, 1);
    assert.equal(client.publisherState(state, context, f.who.id).prefix.position, 0);
    assert.equal(client.publisherContext(context, f.input.producer).prefix.position, 1);
  } finally {
    if (replay) client.eraseMembershipReading(replay);
    f.cleanup();
  }
});

test('replacement reader verifies a current-key suffix after the admitted cut and cold-replays its saved prefix', async () => {
  const f = await fixture();
  let replay, cold;
  try {
    replay = await f.replay();
    const sv = client.Y.encodeStateVector(replay.doc);
    replay.doc
      .getText('master')
      .insert(replay.doc.getText('master').length, 'after replacement snapshot\n');
    const entry = f.entry(
      f.input.producer,
      f.d.keys.existing,
      client.Y.encodeStateAsUpdate(replay.doc, sv),
      11,
      { epoch: f.history.current.tip, generation: 2, position: 2, previous: f.entries[0].link },
    );
    const packet = f.packet(entry, 2, f.history, f.who.id, f.d.keys.new),
      context = replay.contexts.find((c) => c.publisher.id === entry.publisher),
      result = await client.verifyInboundPage(context, packet.request, packet.page, {
        assertCurrent() {},
        now: () => 1000,
      });
    assert.equal(result.kind, 'received');
    const stream = f.reading.streams.find((s) => s.publisher === entry.publisher);
    stream.events.push(Buffer.from(result.record).toString('hex'));
    stream.prefix = {
      position: result.position,
      link: result.link,
      observedThrough: result.through,
    };
    result.record.fill(0);
    for (const u of result.updates) u.fill(0);
    cold = await f.replay();
    assert.match(cold.doc.getText('master').toString(), /after replacement snapshot/);
    assert.equal(cold.contexts.find((c) => c.publisher.id === entry.publisher).prefix.position, 2);
    const own = cold.contexts.find((c) => c.publisher.id === f.who.id),
      route = {
        workspace: f.history.current.workspace,
        principal: f.history.principal,
        credential: f.who.id,
        epoch: f.history.current.tip,
        generation: 2,
        history: own.history,
      };
    const rows = [{ seq: 1, gen: 2, kind: 'update', bytes: cold.initial }];
    for (const event of cold.records) {
      for (const bytes of event.updates)
        rows.push({ seq: rows.length + 1, gen: 2, kind: 'update', bytes });
      rows.push({ seq: rows.length + 1, gen: 2, kind: 'heads', bytes: event.record });
    }
    const state = await client.verifyInboundLedger(
      client.inspectInbound(rows, route, own),
      rows,
      own,
      { assertCurrent() {}, now: () => 1000 },
    );
    assert.equal(client.publisherState(state, own, entry.publisher).prefix.position, 2);
  } finally {
    if (replay) client.eraseMembershipReading(replay);
    if (cold) client.eraseMembershipReading(cold);
    f.cleanup();
  }
});

test('replacement reader refuses changed binding, snapshot, candidate acknowledgement and uncovered receive prefix', async () => {
  const f = await fixture();
  try {
    for (const mutate of [
      (r) => (r.binding.stored.binding.accountId = 'unrelated-account'),
      (r) => (r.admission.signature = 'ff'.repeat(64)),
      (r) => (r.checkpoint.nonce = 'ff'.repeat(12)),
      (r) => (r.streams.find((s) => s.publisher === f.input.producer).prefix.position = 0),
      (r) =>
        r.streams.push({
          publisher: f.x.target,
          events: [],
          prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
        }),
    ]) {
      const changed = structuredClone(f.reading);
      mutate(changed);
      await assert.rejects(f.replay(changed));
    }
    await assert.rejects(f.replay(f.reading, new Uint8Array(32).fill(9)));
  } finally {
    f.cleanup();
  }
});

test('replacement loading persists and cold-replays equivalent parsed field ordering', async () => {
  const f = await fixture();
  try {
    const certification = f.authority.continuations.at(-1);
    const progress = {
      role: 'new',
      content: {
        delivery: certification.epoch.delivery,
        installation: certification.epoch.installation,
        certification,
        key: { sequence: 1, ct: '00'.repeat(48) },
      },
      replacement: f.reading.checkpoint,
      replacementBinding: f.reading.binding,
    };
    let retained = structuredClone(progress);
    const owner = {
      participant: f.who,
      load: async () => structuredClone(retained),
      sign: async (b) => signed(f.d.keys.new, b),
      withInstalledKey: async (_k, _h, fn) => fn(f.key2),
    };
    const input = {
      signal: new AbortController().signal,
      save: async () => {
        retained = structuredClone(progress);
      },
      request: async () => {
        throw Error('Replacement must not fetch the original checkpoint');
      },
      read: async (bytes) => {
        const request = JSON.parse(Buffer.from(bytes).toString());
        const body = ['done/private-read-page/v2', 2, hash(bytes), request[10], request[10], []];
        return new Uint8Array(
          Buffer.from(
            JSON.stringify([
              ...body,
              signed(f.x.f.f.keys.acceptance, new Uint8Array(Buffer.from(JSON.stringify(body)))),
            ]),
          ),
        );
      },
    };
    const { base, ...proofs } = f.authority;
    const authority = { base, proofs };
    assert.equal(
      (await client.loadMembershipWriting(progress, owner, authority, input)).kind,
      'reading',
    );
    assert.equal(
      (await client.loadMembershipWriting(progress, owner, authority, input)).kind,
      'reading',
    );
  } finally {
    f.cleanup();
  }
});
