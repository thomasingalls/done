/** Replay a later device's retained baseline and each independent publisher prefix. */
import { closed } from '../../account-protocol/preparation';
import { same } from '../../account-protocol/admission';
import { unhex } from '../../account-protocol/recovery';
import {
  parseContentCheckpoint,
  contentCheckpointHash,
  type ContentCheckpoint,
  type CheckpointAuthority,
  type CheckpointAdmission,
} from '../../account-protocol/contentCheckpoint';
import {
  verifyMembershipCheckpoint,
  verifyMembershipCheckpointAdmission,
} from '../../account-protocol/membershipCheckpoint';
import {
  historyPublisher,
  historyReader,
  type AdmissionHistory,
} from '../../account-protocol/admissionHistory';
import { openContentCheckpoint } from './contentCheckpoint';
import { verifyStoredInbound, type InboundContext, type InboundLifetime } from './accountInbound';
import { INBOUND_RECORD_LIMIT } from './inboundRecord';
import { Y, hasPendingUpdates } from './yjs';
import type { Bytes } from './custodyCrypto';

export const MEMBERSHIP_READING_EVENTS = 4096;
export interface MembershipReading {
  v: 2;
  epoch: number;
  head: string;
  checkpoint: ContentCheckpoint;
  admission: CheckpointAdmission | null;
  streams: { publisher: string; events: string[]; prefix: InboundContext['prefix'] }[];
}
export function captureMembershipReading(input: unknown): MembershipReading {
  const r = closed(input, ['v', 'epoch', 'head', 'checkpoint', 'admission', 'streams']);
  if (
    r['v'] !== 2 ||
    !Number.isSafeInteger(r['epoch']) ||
    (r['epoch'] as number) < 5 ||
    !Array.isArray(r['streams']) ||
    !r['streams'].length ||
    r['streams'].length > 64
  )
    throw Error('Invalid later reader state');
  unhex(r['head'], 32);
  if (
    r['admission'] !== null &&
    (!r['admission'] || typeof r['admission'] !== 'object' || Array.isArray(r['admission']))
  )
    throw Error('Invalid later reader admission');
  let count = 0;
  const streams = r['streams'].map((value) => {
    const s = closed(value, ['publisher', 'events', 'prefix']);
    unhex(s['publisher'], 16);
    if (!Array.isArray(s['events']) || (count += s['events'].length) > MEMBERSHIP_READING_EVENTS)
      throw Error('Later reader history limit');
    const events = s['events'].map((wire) => {
      if (
        typeof wire !== 'string' ||
        !wire.length ||
        wire.length > INBOUND_RECORD_LIMIT * 2 ||
        wire.length % 2 ||
        !/^[0-9a-f]+$/.test(wire)
      )
        throw Error('Invalid later reader event');
      return wire;
    });
    const p = closed(s['prefix'], ['position', 'link', 'observedThrough']);
    unhex(p['link'], 32);
    if (
      !Number.isSafeInteger(p['position']) ||
      (p['position'] as number) < 0 ||
      !Number.isSafeInteger(p['observedThrough']) ||
      (p['observedThrough'] as number) < (p['position'] as number) ||
      (p['position'] === 0 && p['link'] !== '00'.repeat(32))
    )
      throw Error('Invalid later reader prefix');
    return {
      publisher: s['publisher'] as string,
      events,
      prefix: {
        position: p['position'] as number,
        link: p['link'] as string,
        observedThrough: p['observedThrough'] as number,
      },
    };
  });
  return {
    v: 2,
    epoch: r['epoch'] as number,
    head: r['head'] as string,
    checkpoint: parseContentCheckpoint(r['checkpoint']),
    admission: structuredClone(r['admission']) as CheckpointAdmission | null,
    streams,
  };
}
export async function replayMembershipReading(
  input: unknown,
  authority: CheckpointAuthority,
  history: AdmissionHistory,
  reader: { id: string; sPub: string },
  key: Bytes,
  lifetime: InboundLifetime,
) {
  const reading = captureMembershipReading(input),
    a = structuredClone(authority),
    who = { ...reader };
  if (
    reading.epoch !== history.current.tip ||
    reading.head !== history.current.head ||
    !historyReader(history, who.id, who.sPub) ||
    !same(
      reading.streams.map((s) => s.publisher),
      history.readers.map((m) => m.id),
    )
  )
    throw Error('Later reader authority or publisher set changed');
  await verifyMembershipCheckpoint(reading.checkpoint, a, history);
  if (reading.admission) {
    const admission = await verifyMembershipCheckpointAdmission(
      reading.admission,
      reading.checkpoint,
      history,
    );
    if (admission.admittingCredential !== who.id)
      throw Error('Another device admitted this baseline');
  }
  const doc = await openContentCheckpoint(reading.checkpoint, key, a);
  const records: { record: Bytes; updates: readonly Bytes[] }[] = [];
  const contexts: InboundContext[] = [];
  let initial: Bytes | undefined;
  try {
    lifetime.assertCurrent();
    initial = new Uint8Array(Y.encodeStateAsUpdate(doc));
    const id = await contentCheckpointHash(reading.checkpoint);
    for (const stream of reading.streams) {
      const publisher = historyPublisher(history, stream.publisher);
      const context: InboundContext = {
        baseline: { kind: 'content-checkpoint', id },
        service: { id: a.base.pin.serviceId, origin: a.base.pin.origin },
        authority: publisher.current,
        history: publisher,
        creatingCredential: publisher.credential,
        reader: { id: who.id, publicKey: who.sPub, active: true },
        publisher: {
          id: publisher.credential,
          publicKey: publisher.signingKey,
          principal: publisher.principal,
          system: true,
          active: true,
        },
        generation: 1,
        generationKey: key,
        prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
      };
      for (const wire of stream.events) {
        lifetime.assertCurrent();
        const bytes = unhex(wire, wire.length / 2);
        try {
          const result = await verifyStoredInbound(context, bytes, lifetime);
          if (result.kind !== 'received') throw Error('Invalid retained publisher event');
          records.push({ record: result.record, updates: result.updates });
          for (const u of result.updates) Y.applyUpdate(doc, u);
          context.prefix = {
            position: result.position,
            link: result.link,
            observedThrough: result.through,
          };
        } finally {
          bytes.fill(0);
        }
      }
      if (!same(context.prefix, stream.prefix)) throw Error('Retained publisher prefix changed');
      contexts.push(context);
    }
    lifetime.assertCurrent();
    return { doc, initial, records, contexts, reading, pending: hasPendingUpdates(doc) };
  } catch (cause) {
    doc.destroy();
    initial?.fill(0);
    for (const r of records) {
      r.record.fill(0);
      for (const u of r.updates) u.fill(0);
    }
    throw cause;
  }
}
export function eraseMembershipReading(value: Awaited<ReturnType<typeof replayMembershipReading>>) {
  value.doc.destroy();
  value.initial.fill(0);
  for (const r of value.records) {
    r.record.fill(0);
    for (const u of r.updates) u.fill(0);
  }
}
