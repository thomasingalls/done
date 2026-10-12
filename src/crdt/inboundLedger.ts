import { countLedgerWork } from './accountLedgerMetrics';
import { measureLedger } from './accountLedgerMetrics';
import {
  isHistoryInstallTag,
  decodeHistoryInstall,
  verifyHistoryInstall,
  type InstalledHistory,
} from './historyInstall';
import { verifyEarlyMembership } from '../../account-protocol/membership';
import { heldCaptureRoute } from './accountSuccessor';
import {
  historyAuthority,
  historyPublisher,
  historyGeneration,
} from '../../account-protocol/admissionHistory';
/** Internal v9 census. Authority is supplied only after admission verification under the factor permit. */
import { parseReceipt } from '../../account-protocol/admission';
import { decodeInboundPage, decodeInboundRequest } from '../../account-protocol/inboundTransport';
import { ZERO_REFUSAL } from '../../account-protocol/positionDecision';
import { hex, utf8, type Bytes } from './custodyCrypto';
import type { PromotionRecord } from './promotionRecord';
import type { OpenedRecord } from './contentRecord';
import { captureError, type CaptureRoute } from './sourceCapture';
import { inspectDelivery, expectedPosition } from './deliveryRecord';
import { acceptanceLink, decodePositionResponse } from '../../account-protocol/positionDecision';
import type { HistoryHead } from '../../account-protocol/historyCheckpoint';
import { decodeInboundRecord } from './inboundRecord';
import { verifyStoredInbound, type InboundContext, type InboundLifetime } from './accountInbound';
import {
  Y,
  forkDoc,
  sameDocState,
  hasPendingUpdates,
  prepareDocCoverage,
  provesIntegratedCoverage,
} from './yjs';
import { copyRecords, sameRecords, sameBytes, eraseVerified } from './verifiedRecords';
import type { VerificationMemo } from './verificationMemo';

export async function heldInboundContext(
  marker: PromotionRecord,
  key: Bytes,
  subtle: SubtleCrypto,
  heldRoute?: CaptureRoute,
): Promise<InboundContext> {
  const receipt = parseReceipt(marker.admission!.receipt),
    offer = receipt.offer,
    route = heldRoute ?? (await heldCaptureRoute(marker)),
    member = marker.admission!.request.certification.members[0];
  if (
    offer.epoch.epoch !== 1 ||
    route.generation !== (route.history ? historyGeneration(route.history) : 1) ||
    marker.genesis!.signer !== route.credential ||
    member.sPub !== hex(marker.credentials![1].publicKey)
  )
    captureError('Unsupported inbound membership');
  return {
    baseline: {
      kind: 'promotion-genesis',
      id: hex(new Uint8Array(await subtle.digest('SHA-256', utf8(JSON.stringify(receipt))))),
    },
    service: { id: marker.pin.serviceId, origin: marker.pin.origin },
    ...(route.history
      ? { history: route.history }
      : {
          checkpointAnchor: await verifyEarlyMembership({
            pin: marker.pin,
            request: marker.admission!.request,
            receipt,
          }),
        }),
    authority: route.history?.current ?? {
      workspace: route.workspace,
      lineage: offer.epoch.lineageId,
      tip: 1,
      head: offer.head,
      acceptanceKey: offer.epoch.acceptancePublicKey,
    },
    creatingCredential: route.credential,
    reader: { id: route.credential, publicKey: member.sPub, active: true },
    publisher: {
      id: route.credential,
      publicKey: member.sPub,
      principal: route.principal,
      system: marker.genesis!.actors.some(
        (a) => a.credential === route.credential && a.id === 'system' && a.kind === 'system',
      ),
      active: true,
    },
    generation: route.generation,
    generationKey: key,
    prefix: { position: 0, link: ZERO_REFUSAL, observedThrough: 0 },
  };
}
function* inspectInboundSteps(
  records: readonly OpenedRecord[],
  route: CaptureRoute,
  context: InboundContext,
) {
  countLedgerWork('inboundCensuses');
  const prior: OpenedRecord[] = [],
    entries: { record: OpenedRecord; event: ReturnType<typeof decodeInboundRecord> }[] = [],
    installations: { record: OpenedRecord; event: ReturnType<typeof decodeHistoryInstall> }[] = [];
  for (const record of records) {
    yield;
    let tag;
    if (record.kind === 'heads' || record.kind === 'outbound') {
      try {
        tag = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(record.bytes))[0];
      } catch {
        captureError('Unreadable inbound carrier');
      }
    }
    if (isHistoryInstallTag(tag)) {
      if (record.kind !== 'heads') captureError('History installation misplaced');
      installations.push({ record, event: decodeHistoryInstall(record.bytes) });
    } else if (tag === 'done/account-inbound/v1') {
      if (record.kind !== 'heads') captureError('Inbound record misplaced');
      entries.push({ record, event: decodeInboundRecord(record.bytes) });
    } else prior.push(record);
  }
  const delivery = inspectDelivery(prior, route, context.authority);
  // Delivery's own transition order remains separate; the one completeness witness covers the union.
  const ledger = [
    ...delivery.ledger,
    ...entries.map((e) => e.record),
    ...installations.map((e) => e.record),
  ].sort((a, b) => a.seq - b.seq);
  if (context.history) {
    let epoch = 1;
    for (const row of ledger) {
      yield;
      const v = JSON.parse(new TextDecoder().decode(row.bytes));
      const at =
        v[0] === 'done/account-inbound/v1'
          ? decodeInboundRequest(decodeInboundRecord(row.bytes).request).epoch
          : v[5];
      if (at < epoch) captureError('Account ledger authority regressed');
      epoch = at;
    }
  }
  delivery.spool.events = ledger.map((r) => r.bytes);
  return { delivery, entries: entries.sort((a, b) => a.record.seq - b.record.seq), installations };
}
/** Both readers execute the same census; maintenance may pause only between complete rows. */
export function inspectInbound(...args: Parameters<typeof inspectInboundSteps>) {
  const steps = inspectInboundSteps(...args);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}
export async function inspectInboundCooperatively(
  records: readonly OpenedRecord[],
  route: CaptureRoute,
  context: InboundContext,
  checkpoint: () => Promise<void>,
) {
  const steps = inspectInboundSteps(records, route, context);
  try {
    let next = steps.next();
    while (!next.done) {
      await checkpoint();
      next = steps.next();
    }
    return next.value;
  } finally {
    steps.return(undefined as never);
  }
}
export interface InboundState {
  prefix: InboundContext['prefix'];
  startingPoint?: { position: number; link: string };
  installedHistory?: InstalledHistory;
  conflict: boolean;
  retained: Map<number, NonNullable<InboundContext['retained']>>;
  peers?: Map<string, InboundState>;
}
export const emptyInbound = (
  prefix: InboundContext['prefix'] = { position: 0, link: ZERO_REFUSAL, observedThrough: 0 },
): InboundState => ({
  prefix: { ...prefix },
  conflict: false,
  retained: new Map(),
});
const baselinePrefix = (base: InboundContext, publisher: string): InboundContext['prefix'] => {
  const cut = base.baselineHeads?.find((h) => h.credentialId === publisher);
  return {
    position: cut?.position ?? 0,
    link: cut?.link ?? ZERO_REFUSAL,
    observedThrough: cut?.position ?? 0,
  };
};
/** Resolve a peer only from the verified certified roster. Key hints from the wire grant nothing. */
export function publisherContext(base: InboundContext, publisher: string): InboundContext {
  if (publisher === base.publisher.id) return base;
  if (!base.history) throw Error('Uncertified inbound publisher');
  const history = historyPublisher(base.history, publisher);
  return {
    ...base,
    history,
    authority: history.current,
    creatingCredential: publisher,
    prefix: baselinePrefix(base, publisher),
    publisher: {
      id: publisher,
      publicKey: history.signingKey,
      principal: history.principal,
      system: true,
      active: true,
    },
  };
}
export function publisherState(state: InboundState, base: InboundContext, publisher: string) {
  if (publisher === base.publisher.id) return state;
  publisherContext(base, publisher);
  return state.peers?.get(publisher) ?? emptyInbound(baselinePrefix(base, publisher));
}
export function contextAt(
  base: InboundContext,
  state: InboundState,
  after: number,
): InboundContext {
  const retained = state.retained.get(after + 1);
  return { ...base, prefix: { ...state.prefix }, ...(retained ? { retained } : {}) };
}
/** Retain existing receipt evidence; a checkpoint changes only where future reads begin. */
export async function applyHistoryReceiveCuts(
  own: InboundState,
  base: InboundContext,
  census: ReturnType<typeof inspectInbound>,
  heads: readonly HistoryHead[],
  beforeSequence = Infinity,
) {
  const route: CaptureRoute = {
    workspace: base.authority.workspace,
    credential: base.publisher.id,
    principal: base.publisher.principal,
    epoch: base.authority.tip,
    generation: base.generation,
    ...(base.history ? { history: base.history } : {}),
  };
  for (const cut of heads) {
    const state = publisherState(own, base, cut.credentialId);
    if (state.conflict) captureError('History cut crosses a stream conflict');
    if (cut.credentialId === base.publisher.id && cut.position > 0) {
      // Reconstruct the actual attempt at installation, never a later retired-generation retry.
      const prior = inspectDelivery(
        [
          ...census.delivery.spool.sourceRecords,
          ...census.delivery.ledger.filter((r) => r.seq < beforeSequence),
        ],
        route,
        base.authority,
      );
      const expected = await expectedPosition(prior.spool, cut.position, crypto.subtle);
      if (
        !expected ||
        (await acceptanceLink(expected, expected.previous, crypto.subtle)) !== cut.link
      )
        captureError('History cut differs from retained self stream');
    }
    const known =
      cut.position === state.prefix.position
        ? state.prefix.link
        : cut.position === state.startingPoint?.position
          ? state.startingPoint.link
          : state.retained.has(cut.position)
            ? (() => {
                const proof = decodePositionResponse(state.retained.get(cut.position)!.proof);
                return proof.kind === 'accepted' ? proof.head.link : undefined;
              })()
            : undefined;
    if (known !== undefined && known !== cut.link)
      captureError('History cut conflicts with received history');
    if (cut.position > (state.startingPoint?.position ?? 0))
      state.startingPoint = { position: cut.position, link: cut.link };
    if (cut.position > state.prefix.position)
      state.prefix = {
        position: cut.position,
        link: cut.link,
        observedThrough: Math.max(cut.position, state.prefix.observedThrough),
      };
    if (cut.credentialId !== base.publisher.id) own.peers!.set(cut.credentialId, state);
  }
}
/** Exact collision-checked byte index; positive cache has a fixed byte/entry budget. */
function updateIndex(bounded: boolean) {
  const buckets = new Map<number, Uint8Array[]>();
  let size = 0,
    count = 0;
  const hash = (b: Uint8Array) => {
    let h = 2166136261;
    for (const x of b) h = Math.imul(h ^ x, 16777619);
    return h >>> 0;
  };
  const clear = () => {
    if (bounded) for (const values of buckets.values()) for (const b of values) b.fill(0);
    buckets.clear();
    size = count = 0;
  };
  return {
    clear,
    has(bytes: Uint8Array) {
      return buckets.get(hash(bytes))?.some((b) => sameBytes(b, bytes)) ?? false;
    },
    add(bytes: Uint8Array) {
      if (bounded && bytes.length > 4 * 1024 * 1024) return;
      if (bounded && (size + bytes.length > 4 * 1024 * 1024 || count >= 4096)) clear();
      const h = hash(bytes),
        values = buckets.get(h) ?? [];
      if (values.some((b) => sameBytes(b, bytes))) return;
      values.push(bounded ? bytes.slice() : bytes);
      buckets.set(h, values);
      size += bytes.length;
      count++;
    },
    values: () => [...buckets.values()].flat(),
    bytes: () => size,
  };
}
/** A fork must be unchanged by each evidenced original; no vector-only shortcut. */
function contentCoverage(content: readonly OpenedRecord[], reuseBaseline = false, direct = false) {
  const doc = new Y.Doc({ gc: false }),
    originals = updateIndex(false),
    positives = updateIndex(true);
  const append = (rows: readonly OpenedRecord[]) => {
    const pending = hasPendingUpdates(doc);
    for (const r of rows) {
      Y.decodeUpdate(r.bytes);
      Y.applyUpdate(doc, r.bytes);
      originals.add(r.bytes);
    }
    // Exact pending framing can change as dependencies integrate. Do not assume monotonicity there.
    if (pending || hasPendingUpdates(doc)) positives.clear();
  };
  const began = performance.now();
  try {
    append([...content].sort((a, b) => a.seq - b.seq));
  } catch (e) {
    doc.destroy();
    originals.clear();
    positives.clear();
    throw e;
  } finally {
    measureLedger('coverageRebuild', began);
  }
  return {
    doc,
    append,
    clear() {
      doc.destroy();
      originals.clear();
      positives.clear();
    },
    preserve(previous: { doc: ReturnType<typeof forkDoc>; positives(): Uint8Array[] }): boolean {
      if (!sameDocState(previous.doc, doc)) return false;
      for (const b of previous.positives()) positives.add(b);
      return true;
    },
    positives: positives.values,
    positiveBytes: positives.bytes,
    check(updates: readonly Bytes[]) {
      let prepared: ReturnType<typeof prepareDocCoverage> | undefined;
      try {
        for (const update of updates) {
          if (originals.has(update) || positives.has(update)) continue;
          const began = performance.now();
          let copy: ReturnType<typeof forkDoc> | undefined;
          try {
            let covered: boolean;
            if (direct && provesIntegratedCoverage(doc, update)) {
              covered = true;
              countLedgerWork('coverageDirectProofs');
            } else if (reuseBaseline) {
              if (!prepared) {
                prepared = prepareDocCoverage(doc);
                countLedgerWork('coverageBaselines');
              }
              covered = prepared.check(update);
            } else {
              copy = forkDoc(doc, false);
              Y.applyUpdate(copy, update);
              covered = sameDocState(doc, copy);
            }
            if (!covered) captureError('Inbound content coverage is missing');
            positives.add(update);
          } finally {
            copy?.destroy();
            measureLedger('coverageCheck', began);
          }
        }
      } finally {
        prepared?.dispose();
      }
    },
  };
}
export function verifyInboundCoverage(
  records: readonly OpenedRecord[],
  updates: readonly Bytes[],
): void {
  const coverage = contentCoverage(
    records.filter((r) => r.kind === 'update' || r.kind === 'state'),
  );
  try {
    coverage.check(updates);
  } finally {
    coverage.clear();
  }
}
/** Owner-local content view. Only successful coverage is memoised; failure always invalidates. */
export function createInboundCoverage(options: { incremental?: boolean; direct?: boolean } = {}) {
  let rows: OpenedRecord[] | undefined, coverage: ReturnType<typeof contentCoverage> | undefined;
  const clear = () => {
    eraseVerified(rows);
    rows = undefined;
    coverage?.clear();
    coverage = undefined;
  };
  const prepare = (
    records: readonly OpenedRecord[],
  ): 'same' | 'append' | 'equivalent' | 'rebuild' => {
    const content = records.filter((r) => r.kind === 'update' || r.kind === 'state');
    if (rows && sameRecords(rows, content)) return 'same';
    try {
      if (
        options.incremental &&
        rows &&
        content.length >= rows.length &&
        sameRecords(rows, content.slice(0, rows.length))
      ) {
        const added = copyRecords(content.slice(rows.length));
        rows.push(...added);
        coverage!.append(added);
        return 'append';
      }
      const copied = copyRecords(content);
      let next: ReturnType<typeof contentCoverage> | undefined;
      try {
        next = contentCoverage(copied, options.incremental, options.direct);
        const equivalent = !!(options.incremental && coverage && next.preserve(coverage));
        clear();
        rows = copied;
        coverage = next;
        return equivalent ? 'equivalent' : 'rebuild';
      } catch (e) {
        next?.clear();
        eraseVerified(copied);
        throw e;
      }
    } catch (e) {
      clear();
      throw e;
    }
  };
  const check = (records: readonly OpenedRecord[], updates: readonly Bytes[]) => {
    try {
      prepare(records);
      coverage!.check(updates);
    } catch (e) {
      clear();
      throw e;
    }
  };
  return {
    clear,
    check,
    prepare,
    positiveBytes: () => coverage?.positiveBytes() ?? 0,
    /** Caller owns this immutable candidate under the serialized carrier task. */
    bind(records: readonly OpenedRecord[]) {
      prepare(records);
      const at = coverage;
      return {
        check(input: readonly OpenedRecord[], updates: readonly Bytes[]) {
          if (input !== records || coverage !== at) captureError('Coverage view was invalidated');
          try {
            at!.check(updates);
          } catch (e) {
            clear();
            throw e;
          }
        },
      };
    },
  };
}
export async function verifyInboundLedger(
  census: ReturnType<typeof inspectInbound>,
  records: readonly OpenedRecord[],
  base: InboundContext,
  lifetime: InboundLifetime,
  reuse?: {
    memo: VerificationMemo;
    coverage: Pick<ReturnType<typeof createInboundCoverage>, 'check'>;
    /** Reference maintenance can yield between complete receipt checks, outside native transactions. */
    checkpoint?(): Promise<void>;
  },
  continuation?: { state: InboundState; after: number },
): Promise<InboundState> {
  countLedgerWork('inboundVerifications');
  const clone = (s: InboundState): InboundState => ({
    ...s,
    prefix: { ...s.prefix },
    retained: new Map(s.retained),
  });
  const own = continuation
    ? clone(continuation.state)
    : emptyInbound(baselinePrefix(base, base.publisher.id));
  own.peers = new Map([...(continuation?.state.peers ?? [])].map(([id, s]) => [id, clone(s)]));
  const events = [
    ...census.entries.map((e) => ({ ...e, kind: 'page' as const })),
    ...census.installations.map((e) => ({ ...e, kind: 'history' as const })),
  ]
    .filter((e) => !continuation || e.record.seq > continuation.after)
    .sort((a, b) => a.record.seq - b.record.seq);
  const localCoverage = reuse
    ? undefined
    : contentCoverage(
        records.filter((r) => r.kind === 'update' || r.kind === 'state'),
        false,
        import.meta.env?.['VITE_ACCOUNT_DIRECT_COVERAGE'] !== '0',
      );
  try {
    for (const entry of events) {
      if (reuse?.checkpoint) await reuse.checkpoint();
      lifetime.assertCurrent();
      if (entry.kind === 'history') {
        if (own.conflict || [...own.peers.values()].some((s) => s.conflict))
          captureError('History installation after stream conflict');
        const check = () =>
          verifyHistoryInstall(base, entry.record.bytes, own.installedHistory, lifetime);
        const result = reuse
          ? await reuse.memo.check(
              'history:' + entry.record.seq,
              JSON.stringify({
                baseline: base.baseline,
                authority: base.authority,
                reader: base.reader,
                previous: own.installedHistory,
              }),
              [entry.record.bytes],
              check,
              lifetime.assertCurrent,
            )
          : await check();
        try {
          if (reuse) reuse.coverage.check(records, [result.update]);
          else localCoverage!.check([result.update]);
          if (result.heads)
            await applyHistoryReceiveCuts(own, base, census, result.heads, entry.record.seq);
          own.installedHistory = result.installed;
        } finally {
          result.update.fill(0);
        }
        continue;
      }
      const { record, event } = entry;
      const request = decodeInboundRequest(event.request);
      const publisher = publisherContext(base, request.publisher);
      const state = publisherState(own, base, request.publisher);
      if (request.publisher !== base.publisher.id) own.peers.set(request.publisher, state);
      if (state.conflict) captureError('Inbound event after stream conflict');
      const historical = publisher.history
        ? {
            ...publisher,
            authority: historyAuthority(publisher.history, {
              ...publisher.authority,
              tip: request.epoch,
              head: event.head,
            }),
          }
        : publisher;
      const context = contextAt(historical, state, request.after),
        check = () => verifyStoredInbound(context, record.bytes, lifetime),
        result = reuse
          ? await reuse.memo.check(
              'inbound:' + record.seq,
              JSON.stringify({ ...context, generationKey: undefined, retained: undefined }),
              [
                record.bytes,
                ...(context.retained
                  ? [
                      utf8(context.retained.previous),
                      context.retained.envelope,
                      context.retained.proof,
                    ]
                  : []),
              ],
              check,
              lifetime.assertCurrent,
            )
          : await check();
      if (result.kind === 'conflict') state.conflict = true;
      else if (result.kind === 'received') {
        try {
          if (reuse) reuse.coverage.check(records, result.updates);
          else localCoverage!.check(result.updates);
        } finally {
          for (const b of result.updates) b.fill(0);
        }
        state.prefix = {
          position: result.position,
          link: result.link,
          observedThrough: result.through,
        };
        const entry = decodeInboundPage(event.page).entries[0]!;
        state.retained.set(result.position, {
          previous: event.previous,
          envelope: entry.envelope,
          proof: entry.proof,
        });
      } else captureError('Unexpected stored inbound observation');
    }
    lifetime.assertCurrent();
    return own;
  } finally {
    localCoverage?.clear();
  }
}
