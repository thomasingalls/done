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
import { decodeInboundRequest } from '../../account-protocol/inboundTransport';
import { READ_COUNT_LIMIT } from '../../account-protocol/deliveryTransport';
import { ZERO_REFUSAL } from '../../account-protocol/positionDecision';
import { hex, utf8, type Bytes } from './custodyCrypto';
import type { PromotionRecord } from './promotionRecord';
import type { OpenedRecord } from './contentRecord';
import { captureError, type CaptureRoute } from './sourceCapture';
import { inspectDelivery, inspectDeliverySteps, expectedPosition } from './deliveryRecord';
import { acceptanceLink, decodePositionResponse } from '../../account-protocol/positionDecision';
import type { HistoryHead } from '../../account-protocol/historyCheckpoint';
import {
  captureScopedInboundReceiptSyntax,
  isInboundReceiptNamespace,
  inboundReceiptViews,
  inboundEntryMemoSlot,
  type InboundRecord,
  type InboundReceiptViews,
} from './inboundRecord';
import { membershipEventEpoch } from './accountMembership';
import {
  verifyStoredInboundReceipt,
  inspectOwnedInboundReceipt,
  inspectOwnedInboundRequest,
  type InboundReceiptTurn,
  type InboundContext,
  type InboundLifetime,
} from './accountInbound';
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
import { canVerifyRetainedRead, RetiredHistoryRequired } from './retainedHistory';
import type { SpoolReplayStart } from './spoolRecord';
import { captureInboundReceiptVersion } from './inboundReceiptVersion';
import { StorageCompatibilityError } from './storageCompatibility';

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
    ...captureInboundReceiptVersion(marker),
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
export interface InboundLedgerEntry {
  record: OpenedRecord;
  event: InboundRecord;
  /** Physical page extent only. Never multiply completeness witnesses by this count. */
  extent?: { firstEntry: number; entryCount: number };
}
export function inboundEntryExtent(entry: InboundLedgerEntry) {
  const first = entry.extent?.firstEntry ?? entry.event.entry ?? 0,
    count = entry.extent?.entryCount ?? 1;
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(count) ||
    first < 0 ||
    count < 1 ||
    first + count > READ_COUNT_LIMIT
  )
    captureError('Invalid inbound memo extent');
  return { first, count };
}
export function inboundMemoSlots(entry: InboundLedgerEntry): string[] {
  const { first, count } = inboundEntryExtent(entry);
  return Array.from({ length: count }, (_, offset) =>
    inboundEntryMemoSlot(entry.record.seq, first + offset),
  );
}
/** Closed syntax metadata only, never content/authority verification. Capture this record's
 * own bytes/scope each time. Returned original frames stay owned by the view; unused raw and
 * decoded-entry copies are erased. No supplied parser object or projection selects trust. */
export function captureInboundLedgerRecord(
  record: OpenedRecord,
  context: InboundContext,
  syntaxTurn?: InboundReceiptTurn,
): InboundLedgerEntry | undefined {
  if (syntaxTurn) {
    const view = inspectOwnedInboundReceipt(syntaxTurn, record, context);
    return view ? inspectedInboundLedgerRecord(record, view) : undefined;
  }
  const captured = captureScopedInboundReceiptSyntax(record.bytes, context);
  return captured ? capturedInboundLedgerRecord(record, captured) : undefined;
}
function inspectedInboundLedgerRecord(
  record: OpenedRecord,
  view: InboundReceiptViews,
): InboundLedgerEntry {
  if (record.kind !== 'heads') captureError('Inbound record misplaced');
  const first = view.entries().next().value;
  if (!first) captureError('Empty inbound receipt');
  return {
    record,
    event: first.event,
    ...(view.receipt.kind === 'page'
      ? {
          extent: {
            firstEntry: view.receipt.record.firstEntry,
            entryCount: view.receipt.record.entryCount,
          },
        }
      : {}),
  };
}
function capturedInboundLedgerRecord(
  record: OpenedRecord,
  captured: NonNullable<ReturnType<typeof captureScopedInboundReceiptSyntax>>,
): InboundLedgerEntry {
  let transferred = false;
  try {
    const entry = inspectedInboundLedgerRecord(record, inboundReceiptViews(captured));
    transferred = true;
    return entry;
  } finally {
    const keptBacking =
      transferred &&
      (captured.receipt.record.request.buffer === captured.bytes.buffer ||
        captured.receipt.record.page.buffer === captured.bytes.buffer);
    if (!keptBacking) captured.bytes.fill(0);
    eraseVerified(captured.originals.page.entries);
    if (!transferred) {
      captured.receipt.record.request.fill(0);
      captured.receipt.record.page.fill(0);
    }
  }
}
function* inspectInboundSteps(
  records: readonly OpenedRecord[],
  route: CaptureRoute,
  context: InboundContext,
  start?: SpoolReplayStart,
  syntaxTurn?: InboundReceiptTurn,
) {
  countLedgerWork('inboundCensuses');
  const prior: OpenedRecord[] = [],
    entries: InboundLedgerEntry[] = [],
    installations: { record: OpenedRecord; event: ReturnType<typeof decodeHistoryInstall> }[] = [];
  for (const record of records) {
    yield;
    let tag;
    if ((record.kind === 'heads' || record.kind === 'outbound') && record.bytes[0] === 91) {
      try {
        tag = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(record.bytes))[0];
      } catch {
        captureError('Unreadable inbound carrier');
      }
    }
    if (
      (record.kind === 'heads' || record.kind === 'outbound') &&
      (record.bytes[0] !== 91 || isInboundReceiptNamespace(tag))
    ) {
      let captured: ReturnType<typeof captureScopedInboundReceiptSyntax>;
      let view: InboundReceiptViews | undefined;
      try {
        if (syntaxTurn) view = inspectOwnedInboundReceipt(syntaxTurn, record, context);
        else captured = captureScopedInboundReceiptSyntax(record.bytes, context);
      } catch (cause) {
        // Keep the established unreadable-carrier surface. Known/unknown future versions still
        // propagate their compatibility refusal, and legacy JSON schema errors stay unchanged.
        if (cause instanceof StorageCompatibilityError || record.bytes[0] === 91) throw cause;
        captureError('Unreadable inbound carrier');
      }
      if (captured || view) {
        entries.push(
          view
            ? inspectedInboundLedgerRecord(record, view)
            : capturedInboundLedgerRecord(record, captured!),
        );
        continue;
      }
    }
    if (isHistoryInstallTag(tag)) {
      if (record.kind !== 'heads') captureError('History installation misplaced');
      installations.push({ record, event: decodeHistoryInstall(record.bytes) });
    } else prior.push(record);
  }
  const delivery = yield* inspectDeliverySteps(prior, route, context.authority, start);
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
      const at = membershipEventEpoch(row.bytes, syntaxTurn);
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
  checkpoint: () => Promise<void> | undefined,
  start?: SpoolReplayStart,
  syntaxTurn?: InboundReceiptTurn,
) {
  const steps = inspectInboundSteps(records, route, context, start, syntaxTurn);
  try {
    let next = steps.next();
    while (!next.done) {
      const pause = checkpoint();
      if (pause) await pause;
      next = steps.next();
    }
    return next.value;
  } finally {
    steps.return(undefined as never);
  }
}
export interface InboundState {
  /** Private authenticated local-baseline replay only; no raw cursor can establish this fence. */
  retiredThrough?: number;
  /** Exact cuts authenticated by the retained installed checkpoint. Not wire hints. */
  checkpointCuts?: Map<string, { position: number; link: string }>;
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
export function publisherState(
  state: InboundState,
  base: InboundContext,
  publisher: string,
): InboundState;
export function publisherState(
  state: InboundReadCursor,
  base: InboundContext,
  publisher: string,
): InboundReadCursor;
export function publisherState(state: InboundReadCursor, base: InboundContext, publisher: string) {
  if (publisher === base.publisher.id) return state;
  publisherContext(base, publisher);
  return state.peers?.get(publisher) ?? emptyInbound(baselinePrefix(base, publisher));
}
export function contextAt(
  base: InboundContext,
  state: InboundState,
  after: number,
): InboundContext {
  if (state.retiredThrough !== undefined && !canVerifyRetainedRead(state, after))
    throw new RetiredHistoryRequired();
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
      const origin = census.delivery.spool.origin;
      if (origin && cut.position < origin.position) {
        const pin = own.checkpointCuts?.get(cut.credentialId);
        if (!pin || pin.position !== cut.position) throw new RetiredHistoryRequired();
        if (pin.link !== cut.link) captureError('History cut differs from retained checkpoint');
      } else if (origin && cut.position === origin.position) {
        if (cut.link !== origin.link) captureError('History cut differs from retained self stream');
      } else {
        // Reconstruct the actual attempt at installation, never a later retired-generation retry.
        const prior = inspectDelivery(
          [
            ...census.delivery.spool.sourceRecords,
            ...census.delivery.ledger.filter((r) => r.seq < beforeSequence),
          ],
          route,
          base.authority,
          census.delivery.spool.origin,
        );
        const expected = await expectedPosition(prior.spool, cut.position, crypto.subtle);
        if (
          !expected ||
          (await acceptanceLink(expected, expected.previous, crypto.subtle)) !== cut.link
        )
          captureError('History cut differs from retained self stream');
      }
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
            : own.checkpointCuts?.get(cut.credentialId)?.position === cut.position
              ? own.checkpointCuts.get(cut.credentialId)!.link
              : undefined;
    if (
      state.retiredThrough !== undefined &&
      cut.position > 0 &&
      cut.position <= state.retiredThrough &&
      known === undefined
    )
      throw new RetiredHistoryRequired();
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
  own.checkpointCuts = new Map(
    heads.map((h) => [h.credentialId, { position: h.position, link: h.link }]),
  );
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
    /** Preparation only: exact-input durable coverage receipt; all reducers still run. */
    checkCoverage?(updates: readonly Bytes[]): Promise<void>;
  },
  continuation?: { state: InboundState; after: number },
  syntaxTurn?: InboundReceiptTurn,
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
          if (reuse?.checkCoverage) await reuse.checkCoverage([result.update]);
          else if (reuse) reuse.coverage.check(records, [result.update]);
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
      const request = syntaxTurn
        ? inspectOwnedInboundRequest(syntaxTurn, record, base)
        : decodeInboundRequest(event.request);
      if (!request) return captureError('Missing inbound request');
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
      const context = contextAt(
          historical,
          state,
          entry.extent ? event.position - 1 : request.after,
        ),
        receipt = await verifyStoredInboundReceipt(
          context,
          record.bytes,
          lifetime,
          reuse ? { memo: reuse.memo, sequence: record.seq } : undefined,
          syntaxTurn ? { turn: syntaxTurn, record } : undefined,
        );
      let delivered = false;
      try {
        for (const selected of receipt.entries) {
          lifetime.assertCurrent();
          const result = selected.result;
          if (result.kind === 'conflict') state.conflict = true;
          else if (result.kind === 'received') {
            if (reuse?.checkCoverage) await reuse.checkCoverage(result.updates);
            else if (reuse) reuse.coverage.check(records, result.updates);
            else localCoverage!.check(result.updates);
            lifetime.assertCurrent();
            state.prefix = {
              position: result.position,
              link: result.link,
              observedThrough: result.through,
            };
            state.retained.set(result.position, {
              previous: selected.event.previous,
              envelope: selected.original.envelope,
              proof: selected.original.proof,
            });
          } else captureError('Unexpected stored inbound observation');
        }
        delivered = true;
      } finally {
        for (const selected of receipt.entries) {
          if (selected.result.kind === 'received')
            for (const update of selected.result.updates) update.fill(0);
          if (!delivered || selected.result.kind !== 'received') eraseVerified(selected.original);
        }
      }
    }
    lifetime.assertCurrent();
    return own;
  } finally {
    localCoverage?.clear();
  }
}

/** Read preparation only: these hints cannot verify/apply a page or establish retained history. */
export type InboundReadCursor = Pick<InboundState, 'prefix' | 'startingPoint' | 'conflict'> & {
  peers?: Map<string, InboundReadCursor>;
};
/** Project inside the verified-owner callback, before its detached structured clone. */
export function inboundReadCursors(state: Readonly<InboundState>): InboundReadCursor {
  const cursor = (value: InboundReadCursor): InboundReadCursor => ({
    prefix: { ...value.prefix },
    conflict: value.conflict,
    ...(value.startingPoint ? { startingPoint: { ...value.startingPoint } } : {}),
  });
  return {
    ...cursor(state),
    ...(state.peers
      ? { peers: new Map([...state.peers].map(([id, peer]) => [id, cursor(peer)])) }
      : {}),
  };
}

/** Scheduling units from a verified logical census, never authentication or cursor permission.
 * A binary physical row contributes every admitted received position; conflicts contribute none. */
export function inboundPositionsAfter(
  census: Pick<ReturnType<typeof inspectInbound>, 'entries'>,
  sequence: number,
) {
  if (!Number.isSafeInteger(sequence) || sequence < 0)
    return captureError('Invalid audit sequence');
  let total = 0;
  for (const entry of census.entries) {
    if (!Number.isSafeInteger(entry.record.seq) || entry.record.seq < 1)
      return captureError('Invalid audit record');
    if (entry.record.seq <= sequence || entry.event.kind !== 'received') continue;
    const count = inboundEntryExtent(entry).count;
    if (
      !Number.isSafeInteger(entry.record.seq) ||
      entry.record.seq < 1 ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > READ_COUNT_LIMIT ||
      !Number.isSafeInteger(total + count)
    )
      return captureError('Invalid audit logical work');
    total += count;
  }
  return total;
}
