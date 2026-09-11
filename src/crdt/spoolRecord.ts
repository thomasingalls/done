/** Private v7 append-only allocation ledger. Outer StoredRecord authenticates these bytes. */
import { utf8, hex, type Bytes } from './custodyCrypto';
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
export interface SourceRef {
  id: string;
  index: number;
  hash: string;
}
export type SpoolEntry =
  | { type: 'position'; position: number; source: SourceRef }
  | { type: 'attempt'; position: number; attempt: number }
  | { type: 'envelope'; position: number; attempt: number; wire: Bytes };
export interface SpoolPosition {
  position: number;
  source: SourceRef;
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
const id = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const hexValue = (v: unknown, max: number): Bytes => {
  if (typeof v !== 'string' || !v.length || v.length > max * 2 || !/^(?:[0-9a-f]{2})+$/.test(v))
    return captureError('Invalid spool hex');
  const bytes = new Uint8Array(v.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(v.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};
export const networkRoute = (r: CaptureRoute): EnvelopeRoute => ({
  v: 2,
  workspace_id: r.workspace,
  credential_id: r.credential,
  epoch: r.epoch,
  gen: r.generation,
});
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
  if (entry.type === 'position') {
    const s = entry.source;
    if (
      !id(s.id) ||
      !Number.isSafeInteger(s.index) ||
      s.index < 0 ||
      s.index >= 64 ||
      typeof s.hash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(s.hash)
    )
      captureError('Invalid source reference');
    detail = [s.id, s.index, s.hash];
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
      v[5] !== route.epoch ||
      v[6] !== route.generation
    )
      throw Error('route');
    let result: SpoolEntry;
    if (v[7] === 'position' && Array.isArray(v[9]) && v[9].length === 3)
      result = {
        type: 'position',
        position: v[8],
        source: { id: v[9][0], index: v[9][1], hash: v[9][2] },
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
    const canonical = encodeSpoolEntry(result, route);
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
    events: { record: OpenedRecord; entry: SpoolEntry }[] = [];
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
      events.push({ record, entry });
    }
  }
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
  let attempts = 0;
  for (const { record, entry: e } of events.sort((a, b) => a.record.seq - b.record.seq)) {
    const last = positions.at(-1);
    if (e.type === 'position') {
      if (e.position !== positions.length + 1 || (last && !last.wire))
        captureError('Position sequence or unresolved predecessor');
      const bytes = sources.get(e.source.id),
        key = e.source.id + ':' + e.source.index;
      if (!bytes || used.has(key) || sourceSequences.get(e.source.id)! >= record.seq)
        captureError('Missing, repeated or late source');
      const c = decodeSourceCapsule(bytes!, route);
      try {
        if (!c.sources[e.source.index]) captureError('Missing source index');
      } finally {
        eraseCapsule(c);
      }
      used.add(key);
      positions.push({ position: e.position, source: e.source, attempts: [] });
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
): Promise<void> {
  for (const p of state.positions) {
    const bytes = state.sources.get(p.source.id)!;
    const digest = hex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
    if (digest !== p.source.hash) captureError('Referenced source changed');
    if (!p.wire) continue;
    const c = decodeSourceCapsule(bytes, route);
    let body;
    try {
      body = await openNetworkEnvelope(p.wire, networkRoute(route), signer, kg, subtle);
      const source = c.sources[p.source.index]!;
      if (
        body.actor_id !== source.actor ||
        body.actor_kind !== source.kind ||
        body.updates.length !== 1 ||
        hex(body.updates[0]!) !== hex(source.bytes)
      )
        captureError('Persisted envelope source differs');
    } finally {
      eraseCapsule(c);
      for (const b of body?.updates ?? []) b.fill(0);
    }
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
): Promise<void> {
  if (counter.v === 1) {
    if (state.events.length) captureError('Spool records without activated metadata');
    return; // Interrupted v7 activation, before any ledger grants.
  }
  if (counter.spool.events !== state.events.length) captureError('Spool ledger is incomplete');
  let witness = emptySpoolWitness();
  for (const bytes of state.events) witness = await extendSpoolWitness(witness, bytes, subtle);
  if (!sameSpoolWitness(witness, counter.spool)) captureError('Spool ledger commitment changed');
}
