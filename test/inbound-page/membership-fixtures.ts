/** Genuine certification/checkpoint and independent signed suffix frames. */
import { Y, genesisCoverage, genesisCoverageParts } from '../../src/crdt/yjs';
import { createContentCheckpoint } from '../../src/crdt/contentCheckpoint';
import { openReplacementSource } from '../../src/crdt/replacementSource';
import {
  replayMembershipReading,
  captureMembershipReading,
} from '../../src/crdt/membershipReading';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator';
import { historyMembership } from '../../account-protocol/admissionHistory';
import {
  parseMembershipDelivery,
  parseMembershipInstallation,
  membershipDeliveryMessage,
  membershipDeliveryHash,
  membershipInstallationMessage,
} from '../../account-protocol/membershipDelivery';
import {
  replacementCheckpointHash,
  replacementCheckpointAdmissionBody,
  replacementCheckpointAdmissionMessage,
} from '../../account-protocol/replacementCheckpoint';
import { referenceBytes } from './fixtures';
// @ts-expect-error Shared genuine Node oracle; app history brands use the supplied root client.
import { sourceFixture } from '../account-membership/replacement-source-fixture.mjs';
// @ts-expect-error Independent ceremony oracle.
import { deliveryFixture } from '../account-membership/delivery-fixtures.mjs';
// @ts-expect-error Independent Node signatures and hashes.
import { signed, hash } from '../account-membership/fixtures.mjs';
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const json = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v)));
export async function membershipPageFixture() {
  const f = await sourceFixture({
    client: {
      Y,
      genesisCoverage,
      genesisCoverageParts,
      createContentCheckpoint,
      verifyMembershipChain,
      historyMembership,
    },
  });
  let initial: Uint8Array | undefined;
  try {
    const source = await openReplacementSource(f.input);
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
    admission.signature = signed(
      d.keys.new,
      await replacementCheckpointAdmissionMessage(admission),
    );
    const installation = parseMembershipInstallation({
      ...d.installation,
      v: 3,
      deliveryHash: await membershipDeliveryHash(delivery),
      checkpoint: admission,
    });
    installation.signature = signed(d.keys.new, await membershipInstallationMessage(installation));
    const certification = d.certify({ ...d.epoch, delivery, installation });
    const proofs = { ...f.proofs, continuations: [...f.proofs.continuations, certification] };
    const { history } = await verifyMembershipChain(proofs, f.input.authority.base);
    const authority = { base: f.input.authority.base, ...proofs },
      who = d.c.candidate;
    const reading = captureMembershipReading({
      v: 3,
      inboundReceiptVersion: 1,
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
          prefix: {
            position: cut?.position ?? 0,
            link: cut?.link ?? '00'.repeat(32),
            observedThrough: cut?.position ?? 0,
          },
        };
      }),
    });
    const lifetime = { assertCurrent() {}, now: () => 1000 };
    const baseline = await replayMembershipReading(
      reading,
      authority,
      history,
      who,
      f.key2,
      lifetime,
    );
    try {
      initial = new Uint8Array(Y.encodeStateAsUpdate(baseline.doc));
    } finally {
      baseline.doc.destroy();
      baseline.initial.fill(0);
    }
    const packet = (entries: typeof f.entries) => {
      const first = entries[0]!,
        last = entries.at(-1)!;
      const r = [
        'done/private-read/v2',
        2,
        f.input.authority.base.pin.serviceId,
        f.input.authority.base.pin.origin,
        history.current.workspace,
        who.id,
        first.publisher,
        history.current.lineage,
        history.current.head,
        history.current.tip,
        first.position - 1,
        entries.length,
        '45'.repeat(32),
        30000,
      ];
      const request = json([...r, signed(d.keys.new, json(r))]);
      const p = [
        'done/private-read-page/v2',
        2,
        hash(request),
        last.position,
        last.position,
        entries.map((e: typeof first) => [hex(e.envelope), hex(e.proof)]),
      ];
      return { request, page: json([...p, signed(f.x.f.f.keys.acceptance, json(p))]) };
    };
    const make = (publisher: string, signing: typeof d.keys.existing) => {
      const doc = new Y.Doc({ gc: false });
      doc.clientID = publisher === f.input.producer ? 4901 : 4902;
      Y.applyUpdate(doc, initial!);
      const cut = checkpoint.heads.find((h) => h.credentialId === publisher);
      const entries = [],
        updates: Uint8Array[] = [];
      let previous = cut?.link ?? '00'.repeat(32);
      try {
        if (cut?.position === 1)
          entries.push(
            f.entries.find((e: (typeof f.entries)[number]) => e.publisher === publisher),
          );
        for (let position = (cut?.position ?? 0) + 1; position <= 9; position++) {
          const vector = Y.encodeStateVector(doc);
          doc
            .getText('master')
            .insert(doc.getText('master').length, `${publisher.slice(0, 2)}:${position}\n`);
          const update = new Uint8Array(Y.encodeStateAsUpdate(doc, vector));
          updates.push(update);
          const e = f.entry(
            publisher,
            signing,
            update,
            position + (publisher === f.input.producer ? 20 : 40),
            {
              epoch: history.current.tip,
              generation: 2,
              position,
              previous,
            },
          );
          entries.push(e);
          previous = e.link;
        }
        const wide = packet(entries.slice(0, 8));
        const first = cut?.position === 1 ? 1 : 0,
          selected = entries[first]!,
          last = entries[7]!;
        const raw = referenceBytes({
          baseline: awaitHash,
          lineage: history.current.lineage,
          head: history.current.head,
          reader: who.id,
          publisher,
          firstPosition: selected.position,
          previous: cut?.link ?? '00'.repeat(32),
          lastLink: last.link,
          firstEntry: first,
          entryCount: 8 - first,
          ...wide,
        });
        const single = entries[8]!,
          one = packet([single]);
        const legacy = json([
          'done/account-inbound/v1',
          1,
          awaitHash,
          history.current.lineage,
          history.current.head,
          who.id,
          publisher,
          'received',
          single.position,
          entries[7]!.link,
          single.link,
          hex(one.request),
          hex(one.page),
        ]);
        const stream = reading.streams.find((s) => s.publisher === publisher)!;
        stream.events = [hex(raw), hex(legacy)];
        stream.prefix = {
          position: single.position,
          link: single.link,
          observedThrough: single.position,
        };
        return { raw, legacy, entries, updates, text: doc.getText('master').toString() };
      } finally {
        doc.destroy();
      }
    };
    const awaitHash = await replacementCheckpointHash(checkpoint);
    const producer = make(f.input.producer, d.keys.existing),
      candidate = make(who.id, d.keys.new);
    return {
      f,
      d,
      reading,
      history,
      authority,
      who,
      producer,
      candidate,
      initial,
      replay: (r = reading, life = lifetime) =>
        replayMembershipReading(r, authority, history, who, f.key2, life),
      cleanup() {
        initial?.fill(0);
        for (const p of [producer, candidate]) for (const u of p.updates) u.fill(0);
        f.cleanup();
      },
    };
  } catch (cause) {
    initial?.fill(0);
    f.cleanup();
    throw cause;
  }
}
