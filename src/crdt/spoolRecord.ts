/** Private v7 append-only allocation ledger. Outer StoredRecord authenticates these bytes. */
import { utf8, hex, type Bytes } from './custodyCrypto';
import type { VerificationMemo } from './verificationMemo';
import {
  MAX_BATCH_BYTES,
  emptySpoolWitness,
  sameSpoolWitness,
  type SpoolWitness,
  type ContentCounter,
  type OpenedRecord,
} from './contentRecord';
import {
  captureCatalog,
  captureRouteAt,
  decodeSourceCapsule,
  eraseCapsule,
  captureError,
  type CaptureRoute,
} from './sourceCapture';
import {
  decodeNetworkEnvelope,
  openNetworkEnvelope,
  type EnvelopeRoute,
} from '../../account-protocol/envelope';
export const NET_SEAL_LIMIT = 2 ** 32;
export const MAX_POSITION_SOURCES = 32;
export const MAX_POSITION_BYTES = 64 * 1024;
export interface SourceRef {
  id: string;
  index: number;
  hash: string;
}
export type SpoolEntry =
  | { type: 'position'; position: number; source: SourceRef }
  | { type: 'position-batch'; position: number; sources: SourceRef[] }
  | { type: 'attempt'; position: number; attempt: number }
  | { type: 'envelope'; position: number; attempt: number; wire: Bytes };
export interface SpoolPosition {
  position: number;
  source: SourceRef;
  /** Additional originals are fixed by the durable allocation, never added on a retry. */
  additional?: SourceRef[];
  attempts: number[];
  wire?: Bytes;
}
export interface SpoolState {
  sources: Map<string, Bytes>;
  positions: SpoolPosition[];
  attempts: number;
  sourceRecords: OpenedRecord[];
  events: Bytes[];
}
export const positionSources = (p: Pick<SpoolPosition, 'source' | 'additional'>): SourceRef[] => [
  p.source,
  ...(p.additional ?? []),
];
const id = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const hexValue = (v: unknown, max: number): Bytes => {
  if (typeof v !== 'string' || !v.length || v.length > max * 2 || !/^(?:[0-9a-f]{2})+$/.test(v))
    return captureError('Invalid spool hex');
  const bytes = new Uint8Array(v.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(v.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};
export const networkRoute = (r: CaptureRoute, epoch = r.epoch): EnvelopeRoute => {
  const context = captureRouteAt(r, epoch);
  return {
    v: 2,
    workspace_id: context.workspace,
    credential_id: context.credential,
    epoch: context.epoch,
    gen: context.generation,
  };
};
export function encodeSpoolEntry(entry: SpoolEntry, route: CaptureRoute): Bytes {
  if (
    !id(route.workspace) ||
    !id(route.credential) ||
    !id(route.principal) ||
    !positive(route.epoch) ||
    route.generation !== 1 ||
    !positive(entry.position)
  )
    captureError('Invalid spool route/position');
  let detail: unknown;
  if (entry.type === 'position' || entry.type === 'position-batch') {
    const refs = entry.type === 'position' ? [entry.source] : entry.sources;
    if (
      !Array.isArray(refs) ||
      !refs.length ||
      refs.length > MAX_POSITION_SOURCES ||
      (entry.type === 'position-batch' && refs.length < 2)
    )
      captureError('Invalid source batch');
    for (const s of refs) {
      if (
        !s ||
        !id(s.id) ||
        !Number.isSafeInteger(s.index) ||
        s.index < 0 ||
        s.index >= 64 ||
        typeof s.hash !== 'string' ||
        !/^[0-9a-f]{64}$/.test(s.hash)
      )
        captureError('Invalid source reference');
    }
    const values = refs.map((s) => [s.id, s.index, s.hash]);
    detail = entry.type === 'position' ? values[0] : values;
  } else {
    if (!positive(entry.attempt) || entry.attempt >= NET_SEAL_LIMIT)
      captureError('Invalid invocation count');
    if (entry.type === 'attempt') detail = entry.attempt;
    else if (entry.type === 'envelope') {
      const e = decodeNetworkEnvelope(entry.wire),
        r = networkRoute(route);
      if (
        e.v !== 2 ||
        e.workspace_id !== r.workspace_id ||
        e.credential_id !== r.credential_id ||
        e.epoch !== r.epoch ||
        e.gen !== r.gen ||
        e.seq !== entry.position
      )
        captureError('Spool envelope route changed');
      detail = [entry.attempt, hex(entry.wire)];
    } else return captureError('Unknown spool type');
  }
  const bytes = utf8(
    JSON.stringify([
      'done/account-spool/v1',
      1,
      route.workspace,
      route.credential,
      route.principal,
      route.epoch,
      route.generation,
      entry.type,
      entry.position,
      detail,
    ]),
  );
  if (bytes.length > MAX_BATCH_BYTES) {
    bytes.fill(0);
    captureError('Spool entry too large');
  }
  return bytes;
}
export function decodeSpoolEntry(bytes: Bytes, route: CaptureRoute): SpoolEntry {
  try {
    if (bytes.length > MAX_BATCH_BYTES) throw Error('size');
    const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      !Array.isArray(v) ||
      v.length !== 10 ||
      v[0] !== 'done/account-spool/v1' ||
      v[1] !== 1 ||
      v[2] !== route.workspace ||
      v[3] !== route.credential ||
      v[4] !== route.principal ||
      v[6] !== route.generation
    )
      throw Error('route');
    const historical = captureRouteAt(route, v[5]);
    let result: SpoolEntry;
    if (v[7] === 'position' && Array.isArray(v[9]) && v[9].length === 3)
      result = {
        type: 'position',
        position: v[8],
        source: { id: v[9][0], index: v[9][1], hash: v[9][2] },
      };
    else if (
      v[7] === 'position-batch' &&
      Array.isArray(v[9]) &&
      v[9].length >= 2 &&
      v[9].length <= MAX_POSITION_SOURCES &&
      v[9].every((s: unknown) => Array.isArray(s) && s.length === 3)
    )
      result = {
        type: 'position-batch',
        position: v[8],
        sources: v[9].map((s: [string, number, string]) => ({ id: s[0], index: s[1], hash: s[2] })),
      };
    else if (v[7] === 'attempt') result = { type: 'attempt', position: v[8], attempt: v[9] };
    else if (v[7] === 'envelope' && Array.isArray(v[9]) && v[9].length === 2)
      result = {
        type: 'envelope',
        position: v[8],
        attempt: v[9][0],
        wire: hexValue(v[9][1], MAX_BATCH_BYTES / 2),
      };
    else throw Error('shape');
    const canonical = encodeSpoolEntry(result, historical);
    try {
      if (hex(canonical) !== hex(bytes)) throw Error('canonical');
    } finally {
      canonical.fill(0);
    }
    return result;
  } catch (cause) {
    return captureError('Unreadable spool entry: ' + String(cause));
  }
}
export function inspectSpool(records: readonly OpenedRecord[], route: CaptureRoute): SpoolState {
  const sourceRecords: OpenedRecord[] = [],
    events: { record: OpenedRecord; entry: SpoolEntry; epoch: number }[] = [];
  for (const record of records) {
    if (record.kind !== 'heads' && record.kind !== 'outbound') {
      sourceRecords.push(record);
      continue;
    }
    let tag: unknown;
    try {
      tag = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(record.bytes))[0];
    } catch {
      captureError('Unreadable Account carrier');
    }
    if (record.kind === 'outbound' && tag === 'done/source-capture/v1') sourceRecords.push(record);
    else {
      const entry = decodeSpoolEntry(record.bytes, route);
      if ((entry.type === 'envelope') !== (record.kind === 'outbound'))
        captureError('Spool record misplaced');
      events.push({
        record,
        entry,
        epoch: route.history ? JSON.parse(new TextDecoder().decode(record.bytes))[5] : route.epoch,
      });
    }
  }
  sourceRecords.sort((a, b) => a.seq - b.seq);
  const sources = captureCatalog(sourceRecords, route),
    positions: SpoolPosition[] = [],
    used = new Set<string>(),
    sourceSequences = new Map<string, number>();
  for (const r of sourceRecords)
    if (r.kind === 'outbound') {
      const c = decodeSourceCapsule(r.bytes, route);
      sourceSequences.set(c.id, Math.min(sourceSequences.get(c.id) ?? Infinity, r.seq));
      eraseCapsule(c);
    }
  let attempts = 0,
    previousEpoch = 1;
  for (const { record, entry: e, epoch } of events.sort((a, b) => a.record.seq - b.record.seq)) {
    if (epoch < previousEpoch) captureError('Spool authority regressed');
    previousEpoch = epoch;
    const last = positions.at(-1);
    if (e.type === 'position' || e.type === 'position-batch') {
      if (e.position !== positions.length + 1 || (last && !last.wire))
        captureError('Position sequence or unresolved predecessor');
      const refs = e.type === 'position' ? [e.source] : e.sources;
      let previousSequence = -1,
        previousIndex = -1,
        total = 0,
        actor = '',
        kind = '',
        sourceEpoch = 0;
      for (const ref of refs) {
        const bytes = sources.get(ref.id),
          key = ref.id + ':' + ref.index,
          sequence = sourceSequences.get(ref.id)!;
        if (!bytes || used.has(key) || sequence >= record.seq)
          captureError('Missing, repeated or late source');
        if (
          sequence < previousSequence ||
          (sequence === previousSequence && ref.index <= previousIndex)
        )
          captureError('Source batch order changed');
        const c = decodeSourceCapsule(bytes!, route);
        try {
          if (sourceEpoch && c.epoch !== sourceEpoch)
            captureError('Source batch crosses authority');
          sourceEpoch = c.epoch;
          const source = c.sources[ref.index];
          if (!source) captureError('Missing source index');
          if (actor && (actor !== source!.actor || kind !== source!.kind))
            captureError('Source batch actor changed');
          actor = source!.actor;
          kind = source!.kind;
          total += source!.bytes.length;
          if (refs.length > 1 && total > MAX_POSITION_BYTES) captureError('Source batch too large');
        } finally {
          eraseCapsule(c);
        }
        previousSequence = sequence;
        previousIndex = ref.index;
        used.add(key);
      }
      positions.push({
        position: e.position,
        source: refs[0]!,
        ...(refs.length > 1 ? { additional: refs.slice(1) } : {}),
        attempts: [],
      });
    } else {
      if (!last || last.position !== e.position || last.wire)
        captureError('Spool transition without open position');
      if (e.type === 'attempt') {
        if (e.attempt !== attempts + 1 || e.attempt >= NET_SEAL_LIMIT)
          captureError('Invocation sequence changed');
        attempts = e.attempt;
        last!.attempts.push(e.attempt);
      } else {
        if (!last!.attempts.length || e.attempt !== last!.attempts.at(-1))
          captureError('Envelope lacks latest invocation grant');
        last!.wire = e.wire;
      }
    }
  }
  return { sources, positions, attempts, sourceRecords, events: events.map((e) => e.record.bytes) };
}
export async function verifySpool(
  state: SpoolState,
  route: CaptureRoute,
  kg: Bytes,
  signer: CryptoKey,
  subtle: SubtleCrypto,
  reuse?: { memo: VerificationMemo; current(): void },
): Promise<void> {
  for (const p of state.positions) {
    const check = async () => {
      const refs = positionSources(p),
        originals: import('./sourceCapture').SourceUpdate[] = [];
      let body;
      try {
        for (const ref of refs) {
          const bytes = state.sources.get(ref.id)!;
          const digest = hex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
          if (digest !== ref.hash) captureError('Referenced source changed');
          const c = decodeSourceCapsule(bytes, route);
          try {
            const source = c.sources[ref.index]!;
            originals.push({ ...source, bytes: source.bytes.slice() });
          } finally {
            eraseCapsule(c);
          }
        }
        if (!p.wire) return;
        body = await openNetworkEnvelope(
          p.wire,
          networkRoute(route, decodeNetworkEnvelope(p.wire).epoch),
          signer,
          kg,
          subtle,
        );
        if (
          body.updates.length !== originals.length ||
          originals.some(
            (source, i) =>
              body!.actor_id !== source.actor ||
              body!.actor_kind !== source.kind ||
              hex(body!.updates[i]!) !== hex(source.bytes),
          )
        )
          captureError('Persisted envelope source differs');
      } finally {
        for (const source of originals) source.bytes.fill(0);
        for (const b of body?.updates ?? []) b.fill(0);
      }
    };
    if (reuse)
      await reuse.memo.check(
        'spool:' + p.position,
        JSON.stringify([route, positionSources(p)]),
        [
          ...positionSources(p).map((ref) => state.sources.get(ref.id)!),
          ...(p.wire ? [p.wire] : []),
        ],
        check,
        reuse.current,
      );
    else await check();
  }
}

/** Completeness witness committed in the same transaction as each ledger record. */
export async function extendSpoolWitness(
  before: SpoolWitness,
  bytes: Bytes,
  subtle: SubtleCrypto,
): Promise<SpoolWitness> {
  if (!Number.isSafeInteger(before.events + 1)) captureError('Spool witness exhausted');
  const domain = utf8('done/account-spool-chain/v1\0'),
    previous = hexValue(before.hash, 32);
  const payload = new Uint8Array(domain.length + 32 + 4 + bytes.length);
  payload.set(domain);
  payload.set(previous, domain.length);
  new DataView(payload.buffer).setUint32(domain.length + 32, bytes.length);
  payload.set(bytes, domain.length + 36);
  try {
    return {
      events: before.events + 1,
      hash: hex(new Uint8Array(await subtle.digest('SHA-256', payload))),
    };
  } finally {
    payload.fill(0);
  }
}
export async function verifySpoolWitness(
  state: SpoolState,
  counter: ContentCounter,
  subtle: SubtleCrypto,
  reuse?: { memo: VerificationMemo; current(): void },
): Promise<void> {
  if (counter.v === 1) {
    if (state.events.length) captureError('Spool records without activated metadata');
    return; // Interrupted v7 activation, before any ledger grants.
  }
  if (counter.spool.events !== state.events.length) captureError('Spool ledger is incomplete');
  let witness = emptySpoolWitness();
  for (const [index, bytes] of state.events.entries()) {
    const before = witness,
      check = () => extendSpoolWitness(before, bytes, subtle);
    witness = reuse
      ? await reuse.memo.check(
          'witness:' + index,
          JSON.stringify(before),
          [bytes],
          check,
          reuse.current,
        )
      : await check();
  }
  if (!sameSpoolWitness(witness, counter.spool)) captureError('Spool ledger commitment changed');
}
