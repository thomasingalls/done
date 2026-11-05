import {
  captureHandoffHistory,
  handoffHistoryPrefix,
  mergeHandoffHistory,
  replayHandoffStream,
  type HandoffHistory,
} from './handoffHistory';
/** Replay a later device's retained baseline and each independent publisher prefix. */
import { closed } from '../../account-protocol/preparation';
import {
  captureInboundReceiptVersion,
  inboundReceiptVersionFields,
  type InboundReceiptVersion,
} from './inboundReceiptVersion';
import { same } from '../../account-protocol/admission';
import { unhex } from '../../account-protocol/recovery';
import {
  parseContentCheckpoint,
  contentCheckpointHash,
  type ContentCheckpoint,
  type HistoryCheckpointAuthority,
  requireOriginalCheckpointAuthority,
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
import {
  parseBindingProof,
  verifyBindingProof,
  type BindingProof,
} from '../../account-protocol/slot';
import {
  parseReplacementCheckpoint,
  parseReplacementCheckpointAdmission,
  replacementCheckpointHash,
  verifyReplacementCheckpointAdmission,
  type ReplacementCheckpoint,
  type ReplacementCheckpointAdmission,
} from '../../account-protocol/replacementCheckpoint';
import {
  verifyMembershipChain,
  type parseMembershipChain,
} from '../../account-protocol/membershipLocator';
import { historyMembership, historyGeneration } from '../../account-protocol/admissionHistory';
import { openReplacementCheckpoint } from './replacementCheckpoint';

export const MEMBERSHIP_READING_EVENTS = 4096;
interface ReadingFields extends InboundReceiptVersion {
  epoch: number;
  head: string;
  streams: { publisher: string; events: string[]; prefix: InboundContext['prefix'] }[];
}
export type MembershipReading = ReadingFields &
  (
    | {
        v: 2;
        checkpoint: ContentCheckpoint;
        admission: CheckpointAdmission | null;
        history?: HandoffHistory;
      }
    | {
        v: 3;
        checkpoint: ReplacementCheckpoint;
        admission: ReplacementCheckpointAdmission;
        binding: BindingProof;
      }
  );
export const membershipReadingBinding = (reading: MembershipReading) =>
  reading.v === 3 ? reading.binding : reading.checkpoint.binding;
export const membershipReadingHash = (reading: MembershipReading) =>
  reading.v === 3
    ? replacementCheckpointHash(reading.checkpoint)
    : contentCheckpointHash(reading.checkpoint);
export function membershipReadingPrefix(
  reading: MembershipReading,
  publisher: string,
): InboundContext['prefix'] {
  if (reading.v === 2) return handoffHistoryPrefix(reading.history, publisher);
  const cut =
    reading.v === 3 ? reading.checkpoint.heads.find((h) => h.credentialId === publisher) : null;
  return {
    position: cut?.position ?? 0,
    link: cut?.link ?? '00'.repeat(32),
    observedThrough: cut?.position ?? 0,
  };
}
export function captureMembershipReading(input: unknown): MembershipReading {
  const r = closed(input, [
    'v',
    'epoch',
    'head',
    'checkpoint',
    'admission',
    'streams',
    ...inboundReceiptVersionFields(input),
    ...((input as { v?: unknown } | null)?.v === 3 ? ['binding'] : []),
    ...((input as { v?: unknown; history?: unknown } | null)?.v === 2 &&
    (input as { history?: unknown }).history !== undefined
      ? ['history']
      : []),
  ]);
  if (
    (r['v'] !== 2 && r['v'] !== 3) ||
    !Number.isSafeInteger(r['epoch']) ||
    (r['epoch'] as number) < 4 ||
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
    ...(r['v'] === 3
      ? {
          v: 3 as const,
          checkpoint: parseReplacementCheckpoint(r['checkpoint']),
          admission: parseReplacementCheckpointAdmission(r['admission']),
          binding: parseBindingProof(r['binding']),
        }
      : {
          v: 2 as const,
          checkpoint: parseContentCheckpoint(r['checkpoint']),
          admission: structuredClone(r['admission']) as CheckpointAdmission | null,
          ...(r['history'] === undefined ? {} : { history: captureHandoffHistory(r['history']) }),
        }),
    epoch: r['epoch'] as number,
    head: r['head'] as string,
    streams,
    ...captureInboundReceiptVersion(r),
  };
}
export async function verifyReplacementReading(
  reading: Extract<MembershipReading, { v: 3 }>,
  a: HistoryCheckpointAuthority & {
    continuations?: ReturnType<typeof parseMembershipChain>['continuations'];
  },
  history: AdmissionHistory,
  who: { id: string; sPub: string },
) {
  if (!a.continuations) throw Error('Replacement reading needs its full certification history');
  const verified = await verifyMembershipChain(
      { successor: a.successor, certification: a.certification, continuations: a.continuations },
      a.base,
    ),
    certificate = verified.proofs.continuations.at(-1);
  if (
    verified.history.current.head !== history.current.head ||
    certificate?.kind !== 'membership-certification' ||
    certificate.head !== reading.head ||
    certificate.epoch.delivery.v !== 3 ||
    certificate.epoch.installation.v !== 3 ||
    certificate.epoch.delivery.candidate.context.candidate.id !== who.id ||
    certificate.epoch.delivery.checkpointHash !==
      (await replacementCheckpointHash(reading.checkpoint)) ||
    !same(certificate.epoch.installation.checkpoint, reading.admission) ||
    historyGeneration(history) !== reading.checkpoint.manifest.generation
  )
    throw Error('Replacement reading differs from certified installation');
  const before = await verifyMembershipChain(
      { ...verified.proofs, continuations: verified.proofs.continuations.slice(0, -1) },
      a.base,
    ),
    parent = historyMembership(before.history);
  await verifyReplacementCheckpointAdmission(reading.admission, reading.checkpoint, parent);
  await verifyBindingProof(reading.binding, a.base.request, a.base.receipt, a.base.pin);
  return parent;
}
export async function replayMembershipReading(
  input: unknown,
  authority: HistoryCheckpointAuthority & {
    continuations?: ReturnType<typeof parseMembershipChain>['continuations'];
  },
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
  let doc;
  if (reading.v === 3) {
    const parent = await verifyReplacementReading(reading, a, history, who);
    doc = await openReplacementCheckpoint(reading.checkpoint, key, parent);
  } else {
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
    doc = await openContentCheckpoint(
      reading.checkpoint,
      key,
      requireOriginalCheckpointAuthority(a),
    );
  }
  const records: { record: Bytes; updates: readonly Bytes[] }[] = [];
  const contexts: InboundContext[] = [];
  let initial: Bytes | undefined;
  try {
    lifetime.assertCurrent();
    if (reading.v === 2) await mergeHandoffHistory(doc, reading.history, history, key);
    initial = new Uint8Array(Y.encodeStateAsUpdate(doc));
    const id = await membershipReadingHash(reading);
    for (const stream of reading.streams) {
      const publisher = historyPublisher(history, stream.publisher);
      const context: InboundContext = {
        baseline: { kind: 'content-checkpoint', id },
        ...(reading.v === 3 ? { baselineHeads: reading.checkpoint.heads } : {}),
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
        generation: reading.checkpoint.manifest.generation,
        generationKey: key,
        prefix: membershipReadingPrefix(reading, stream.publisher),
      };
      if (reading.v === 2) {
        const replay = await replayHandoffStream(
          doc,
          context,
          stream.events,
          reading.history,
          lifetime,
        );
        records.push(...replay.records);
        Object.assign(context, replay.context);
      } else
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
