import { countLedgerWork, ledgerWorkStart, measureLedgerWork } from './accountLedgerMetrics';
import {
  historyEnvelopeRoute,
  type AdmissionHistory,
} from '../../account-protocol/admissionHistory';
/** Private Account capture payload. Its enclosing journal/StoredRecord authenticates these bytes. */
import { hex, random, utf8, type Bytes } from './custodyCrypto';
import { ContentError, MAX_BATCH_BYTES, type OpenedRecord } from './contentRecord';
import type { JournalRecovery } from './custody';
import { validateContentUpdates } from './contentCompaction';
import { sameBytes } from './verifiedRecords';
import type { PromotionRecord } from './promotionRecord';

export interface SourceUpdate {
  actor: string;
  kind: 'human' | 'system';
  bytes: Bytes;
}
export interface CaptureRoute {
  workspace: string;
  credential: string;
  principal: string;
  epoch: number;
  generation: number;
  /** Process-local verified continuity; never serialized in a capsule. */
  history?: AdmissionHistory;
}
export interface SourceCapsule extends CaptureRoute {
  v: 1;
  id: string;
  sources: SourceUpdate[];
}
export const MAX_CAPTURE_SOURCES = 64;
export const MAX_CAPTURE_BYTES = MAX_BATCH_BYTES / 2;
export const captureError = (message: string): never => {
  throw new ContentError('repair-required', message);
};
export const captureRoute = (marker: PromotionRecord): CaptureRoute => ({
  workspace: marker.source.workspaceId,
  principal: marker.source.principalId,
  credential: marker.credentialIds[1],
  epoch: marker.admission!.receipt!.offer.epoch.epoch,
  generation: marker.source.generation,
});
/** Resolve only the exact admission-compatible historical route; an unverified epoch hint is refused. */
export function captureRouteAt(route: CaptureRoute, epoch: number): CaptureRoute {
  let generation = route.generation;
  if (!route.history) {
    if (epoch !== route.epoch) captureError('Capture epoch changed without verified history');
  } else {
    generation = historyEnvelopeRoute(
      route.history,
      {
        v: 2,
        workspace_id: route.workspace,
        credential_id: route.credential,
        epoch: route.epoch,
        gen: route.generation,
      },
      epoch,
    ).gen;
    if (route.principal !== route.history.principal) captureError('Capture principal changed');
  }
  return epoch === route.epoch ? route : { ...route, epoch, generation };
}
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
export function encodeSourceCapsule(c: SourceCapsule): Bytes {
  if (
    c.v !== 1 ||
    !validId(c.id) ||
    !validId(c.workspace) ||
    !validId(c.credential) ||
    !validId(c.principal) ||
    !Number.isSafeInteger(c.epoch) ||
    c.epoch < 1 ||
    !Number.isSafeInteger(c.generation) ||
    c.generation < 1 ||
    c.generation > 0xffffffff ||
    !Array.isArray(c.sources) ||
    !c.sources.length ||
    c.sources.length > MAX_CAPTURE_SOURCES
  )
    return captureError('Invalid source capsule');
  let total = 0;
  for (const s of c.sources) {
    if (
      !(
        (s.kind === 'human' && s.actor === c.principal) ||
        (s.kind === 'system' && s.actor === 'system')
      ) ||
      !(s.bytes instanceof Uint8Array) ||
      !s.bytes.length
    )
      return captureError('Unbound source actor or update');
    total += s.bytes.length;
    if (total > MAX_CAPTURE_BYTES / 2) return captureError('Source capsule is too large');
  }
  validateContentUpdates(c.sources.map((s) => s.bytes));
  const result = utf8(
    JSON.stringify([
      'done/source-capture/v1',
      c.v,
      c.id,
      c.workspace,
      c.credential,
      c.principal,
      c.epoch,
      c.generation,
      c.sources.map((s) => [s.actor, s.kind, hex(s.bytes)]),
    ]),
  );
  if (result.length > MAX_CAPTURE_BYTES) {
    result.fill(0);
    return captureError('Source capsule is too large');
  }
  return result;
}
export function decodeSourceCapsule(bytes: Bytes, route: CaptureRoute): SourceCapsule {
  const began = ledgerWorkStart();
  countLedgerWork('sourceParses');
  const sources: SourceUpdate[] = [];
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_CAPTURE_BYTES) throw Error('length');
    countLedgerWork('sourceParseBytes', bytes.length);
    const v: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      !Array.isArray(v) ||
      v.length !== 9 ||
      v[0] !== 'done/source-capture/v1' ||
      !Array.isArray(v[8]) ||
      v[8].length > MAX_CAPTURE_SOURCES
    )
      throw Error('shape');
    for (const source of v[8]) {
      if (
        !Array.isArray(source) ||
        source.length !== 3 ||
        typeof source[2] !== 'string' ||
        !/^(?:[0-9a-f]{2})+$/.test(source[2])
      )
        throw Error('source');
      const update = new Uint8Array(source[2].length / 2);
      for (let i = 0; i < update.length; i++)
        update[i] = parseInt(source[2].slice(i * 2, i * 2 + 2), 16);
      sources.push({ actor: source[0], kind: source[1], bytes: update });
    }
    const result: SourceCapsule = {
      v: v[1],
      id: v[2],
      workspace: v[3],
      credential: v[4],
      principal: v[5],
      epoch: v[6],
      generation: v[7],
      sources,
    };
    const historical = captureRouteAt(route, result.epoch);
    for (const key of ['workspace', 'credential', 'principal', 'epoch', 'generation'] as const)
      if (result[key] !== historical[key]) throw Error('route');
    const encoded = encodeSourceCapsule(result);
    try {
      if (hex(encoded) !== hex(bytes)) throw Error('noncanonical');
    } finally {
      encoded.fill(0);
    }
    return result;
  } catch (cause) {
    for (const s of sources) s.bytes.fill(0);
    throw new ContentError('repair-required', 'Source capsule is unreadable or unbound', { cause });
  } finally {
    measureLedgerWork('sourceParse', began);
  }
}
export const makeSourceCapsule = (route: CaptureRoute, sources: readonly SourceUpdate[]): Bytes =>
  encodeSourceCapsule({ ...route, v: 1, id: hex(random(16)), sources: [...sources] });
export const eraseCapsule = (c: SourceCapsule) => {
  for (const s of c.sources) s.bytes.fill(0);
};

export interface CapturedSourceIdentity {
  readonly id: string;
  readonly bytes: Bytes;
}
/** Read only already-verified originals; also detect identity conflicts within this incoming batch. */
export function capturedSourcePresence(
  catalog: ReadonlyMap<string, Bytes>,
  incoming: readonly CapturedSourceIdentity[],
): boolean[] {
  const seen = new Map<string, Bytes>();
  return incoming.map(({ id, bytes }) => {
    const prior = seen.get(id) ?? catalog.get(id);
    if (prior && !sameBytes(prior, bytes))
      captureError('Conflicting source identity before commit');
    seen.set(id, bytes);
    return prior !== undefined;
  });
}

/** Exact identity deduplication, never Yjs vector or snapshot coverage. Caller owns record buffers. */
export function captureCatalog(
  records: readonly OpenedRecord[],
  route: CaptureRoute,
): Map<string, Bytes> {
  const catalog = new Map<string, Bytes>();
  for (const r of records) {
    if (r.kind === 'heads') captureError('Unexpected acceptance head before relay integration');
    if (r.kind !== 'outbound') continue;
    const c = decodeSourceCapsule(r.bytes, route);
    try {
      const existing = catalog.get(c.id);
      if (existing && hex(existing) !== hex(r.bytes))
        captureError('Conflicting source capsule identity');
      catalog.set(c.id, r.bytes);
    } finally {
      eraseCapsule(c);
    }
  }
  return catalog;
}
/** Materialize original journal source updates; never merge pending Yjs frames for handoff. */
export function capturedRecovery(raw: JournalRecovery, route: CaptureRoute): JournalRecovery {
  const catalog = captureCatalog(raw.records, route),
    journal: JournalRecovery['journal'] = [];
  try {
    for (const row of raw.journal) {
      const c = decodeSourceCapsule(row.bytes, route);
      try {
        const existing = catalog.get(c.id);
        if (existing && hex(existing) !== hex(row.bytes))
          captureError('Conflicting journal source identity');
        if (!existing) {
          catalog.set(c.id, row.bytes);
          for (const [i, s] of c.sources.entries())
            journal.push({
              key: row.key + ':' + i,
              generation: row.generation,
              bytes: s.bytes.slice(),
            });
        }
      } finally {
        eraseCapsule(c);
      }
    }
    return { records: raw.records, journal };
  } catch (e) {
    for (const r of journal) r.bytes.fill(0);
    throw e;
  }
}
