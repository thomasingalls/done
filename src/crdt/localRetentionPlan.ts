import { inspectInboundReceipt, isInboundReceiptNamespace } from './inboundRecord';
/** Private dry run. No database handle, allocator, sealing callback, write, or deletion operation. */
import { type DiskRow } from './contentCompaction';
import {
  corrupt,
  parseCounter,
  parseStoredRecord,
  counterPayload,
  recordStore,
  type ContentCounter,
  type OpenedRecord,
  type StoredRecord,
} from './contentRecord';
import {
  parseBaselineCounter,
  baselineCounterPayload,
  type BaselineCounter,
} from './localBaselineAnchor';
import { openEncryptedBaselineSnapshot } from './localBaselineStorage';
import { decodeLocalBaseline, LocalBaselineCapacityError } from './localBaselineRecord';
import {
  prepareLocalBaselineWithReference,
  rebaseLocalBaseline,
  replayFullLocalHistory,
  replayLocalBaseline,
  LocalBaselineError,
  type LocalBaselineContext,
  type BaselineAuthentication,
  type PreparationVerification,
} from './localBaselineReplay';
import { compareBaselineReplay } from './localBaselineShadow';
import { createCpuBudget } from './cpuBudget';
import { reportRetentionProgress, type RetentionProgressSink } from './contentMaintenance';
import { createInboundCoverage } from './inboundLedger';
import { HistoryInstallSizeError, isHistoryInstallTag } from './historyInstall';
import { eraseVerified, sameBytes } from './verifiedRecords';
import { hex, type Bytes } from './custodyCrypto';
import type { SessionTask } from './writeSession';

export interface RetentionInventory {
  rows: DiskRow[];
  metadata: { key: IDBValidKey; value: unknown }[];
}
export type RetentionDisposition =
  | 'content-covered'
  | 'source-carried'
  | 'source-consumed'
  | 'spool-settled'
  | 'delivery-settled'
  | 'receive-frontier'
  | 'history-frontier';
interface DeleteRow {
  store: string;
  key: number;
  value: StoredRecord;
  disposition: RetentionDisposition;
}
export interface RetentionPlanReport {
  kind: 'planned';
  rows: number;
  sealedBytes: number;
  metadataChunks: number;
  baselineBytes: number;
  previousRevision: number;
  revision: number;
  survivors: 0;
  dispositions: Partial<Record<RetentionDisposition, number>>;
}
/** An ephemeral capability; only the module's private map contains the inventory/candidate. */
export interface RetentionBinding {
  lifetime: object;
  allowReduced?: boolean;
  intent: string;
}
export interface LocalRetentionPlan {
  readonly kind: 'local-retention-dry-run';
}
type Candidate = Awaited<ReturnType<typeof prepareLocalBaselineWithReference>>['candidate'];
interface HeldPlan {
  inventory: RetentionInventory;
  binding: RetentionBinding;
  assertCurrent: () => void;
  counter: ContentCounter;
  candidate: Candidate;
  deleteRows: DeleteRow[];
  report: RetentionPlanReport;
}
const plans = new WeakMap<LocalRetentionPlan, HeldPlan>();
const key = (k: IDBValidKey) => JSON.stringify(k);
const clone = (input: RetentionInventory): RetentionInventory => {
  const copied = structuredClone(input);
  copied.rows.sort((a, b) => a.store.localeCompare(b.store) || Number(a.key) - Number(b.key));
  copied.metadata.sort((a, b) => key(a.key).localeCompare(key(b.key)));
  return copied;
};
/** Closed codecs validate the values before planning. Comparison also rejects unknown added fields. */
function exact(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Uint8Array || b instanceof Uint8Array)
    return a instanceof Uint8Array && b instanceof Uint8Array && sameBytes(a, b);
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => exact(v, b[i]))
    );
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Object.getPrototypeOf(a) !== Object.prototype ||
    Object.getPrototypeOf(b) !== Object.prototype
  )
    return false;
  const ak = Object.keys(a).sort(),
    bk = Object.keys(b).sort();
  return (
    exact(ak, bk) &&
    ak.every((k) => exact((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}
export function sameRetentionInventory(expected: RetentionInventory, current: RetentionInventory) {
  // Synchronous comparison borrows bytes; only the ordering arrays are copied. No await,
  // mutation or erasure is allowed here. The retained plan still owns a deep captured copy.
  const ordered = (value: RetentionInventory) => ({
    ...value,
    rows: value.rows
      .slice()
      .sort((a, b) => a.store.localeCompare(b.store) || Number(a.key) - Number(b.key)),
    metadata: value.metadata.slice().sort((a, b) => key(a.key).localeCompare(key(b.key))),
  });
  return exact(ordered(expected), ordered(current));
}
export function assertRetentionInventory(
  expected: RetentionInventory,
  current: RetentionInventory,
) {
  if (!sameRetentionInventory(expected, current))
    corrupt('Retention inventory changed; replan required.');
}
const held = (plan: LocalRetentionPlan): HeldPlan =>
  plans.get(plan) ?? corrupt('Retention plan expired or unknown.');
export function retentionPlanReport(plan: LocalRetentionPlan): RetentionPlanReport {
  return structuredClone(held(plan).report);
}
/** Detached full evidence for focused inspection; runtime consumers use the narrow accessors below. */
export function inspectRetentionPlan(plan: LocalRetentionPlan) {
  const p = held(plan);
  return structuredClone({
    inventory: p.inventory,
    deleteRows: p.deleteRows,
    survivors: [],
    candidate: p.candidate,
    counter: p.counter,
  });
}
function checkedPlan(plan: LocalRetentionPlan, binding: RetentionBinding) {
  const p = held(plan);
  p.assertCurrent();
  if (
    binding.lifetime !== p.binding.lifetime ||
    binding.intent !== p.binding.intent ||
    binding.allowReduced !== p.binding.allowReduced
  )
    corrupt('Retention owner or authority identity changed.');
  return p;
}
/** Only detached candidate bytes cross the final replay boundary. */
export function copyRetentionCandidate(plan: LocalRetentionPlan, binding: RetentionBinding) {
  return structuredClone(checkedPlan(plan, binding).candidate);
}
/** The adapter needs a candidate, counters and keys, not a second copy of every old sealed row. */
export function copyRetentionMaterial(plan: LocalRetentionPlan, binding: RetentionBinding) {
  const p = checkedPlan(plan, binding);
  return structuredClone({
    candidate: p.candidate,
    counter: p.counter,
    rawCounter: p.inventory.metadata.find((m) => m.key === 'counter')!.value,
    deleteRows: p.deleteRows.map(({ store, key }) => ({ store, key })),
  });
}
export function matchesRetentionPlan(
  plan: LocalRetentionPlan,
  current: RetentionInventory,
  binding: RetentionBinding,
) {
  return sameRetentionInventory(checkedPlan(plan, binding).inventory, current);
}
export function verifyRetentionPlan(
  plan: LocalRetentionPlan,
  current: RetentionInventory,
  binding: RetentionBinding,
) {
  if (!matchesRetentionPlan(plan, current, binding))
    corrupt('Retention inventory changed; replan required.');
}
/** Capture only the adapter's reserved counter. Every later comparison rechecks the live plan
 * and borrows its old rows/chunks synchronously; no private evidence escapes or survives in a
 * caller-owned cleanup graph. This verifier confers no write authority or deletion permission. */
export function reservedRetentionVerifier(
  plan: LocalRetentionPlan,
  counter: ContentCounter | BaselineCounter,
  binding: RetentionBinding,
) {
  binding = { ...binding };
  checkedPlan(plan, binding);
  const reserved = structuredClone(counter);
  let disposed = false;
  return Object.freeze({
    verify(current: RetentionInventory) {
      if (disposed) corrupt('Retention reservation verifier expired.');
      const p = checkedPlan(plan, binding);
      assertRetentionInventory(
        {
          ...p.inventory,
          metadata: p.inventory.metadata.map((m) =>
            m.key === 'counter' ? { key: m.key, value: reserved } : m,
          ),
        },
        current,
      );
    },
    dispose() {
      disposed = true;
      eraseVerified(reserved);
    },
  });
}
export function disposeRetentionPlan(plan: LocalRetentionPlan) {
  const p = plans.get(plan);
  if (p) {
    // The guard may close over owner capabilities; erase only the plan-owned data buffers.
    eraseVerified(p.inventory);
    eraseVerified(p.counter);
    eraseVerified(p.candidate);
    eraseVerified(p.deleteRows);
    plans.delete(plan);
  }
}
interface ReadCrypto {
  open(record: StoredRecord): Promise<Bytes>;
  verify(payload: Bytes, mac: Bytes): Promise<boolean>;
  auth: BaselineAuthentication;
}
export async function planLocalRetention(
  task: SessionTask,
  input: RetentionInventory,
  context: LocalBaselineContext,
  crypt: ReadCrypto,
  binding: RetentionBinding,
  // The composed owner can bind completed evidence to a lifetime/activity guard instead of an
  // expiring preparation task. Context/task checks still govern every preparation effect.
  retainCurrent: () => void = () => context.assertCurrent(),
  progress?: RetentionProgressSink,
  // Resolves without a journal when none can be bound; the pass then runs uncached.
  preparation?: (counter: ContentCounter) => Promise<PreparationVerification | undefined>,
): Promise<
  | LocalRetentionPlan
  | {
      kind: 'skipped';
      reason: 'capacity' | 'ineligible' | 'history-required';
      detail?: import('./localRetentionDetail').LocalRetentionDetail;
    }
> {
  const inventory = clone(input),
    scope = { ...context.identity };
  binding = { ...binding };
  context.assertCurrent();
  const checkpoint = createCpuBudget(() => {
    task.step(() => {});
    context.assertCurrent();
  });
  const coverage = createInboundCoverage();
  const records: OpenedRecord[] = [];
  let previous: Awaited<ReturnType<typeof openEncryptedBaselineSnapshot>> | undefined;
  let decoded: ReturnType<typeof decodeLocalBaseline> | undefined;
  let candidate: Candidate | undefined;
  let reference: Awaited<ReturnType<typeof replayFullLocalHistory>> | undefined;
  let projected: Awaited<ReturnType<typeof replayLocalBaseline>> | undefined;
  let counter: ContentCounter | undefined;
  let delivered = false;
  try {
    const raw = inventory.metadata.find((m) => m.key === 'counter')?.value;
    const version = (raw as { v?: number } | undefined)?.v;
    const stored =
      version === 3 || version === 4 || version === 5
        ? parseBaselineCounter(raw, scope, binding.intent, binding.allowReduced)
        : parseCounter(raw, scope, binding.intent);
    if (stored.v === 1 || stored.active_gen !== context.route.generation)
      corrupt('Retention requires current Account allocation.');
    const pointer = 'baseline' in stored ? stored.baseline : undefined;
    const metaKeys: IDBValidKey[] = [
      'counter',
      ...Array.from({ length: pointer?.chunks ?? 0 }, (_, i) => ['local-baseline', i]),
    ];
    if (
      inventory.metadata.length !== metaKeys.length ||
      metaKeys.some((k) => inventory.metadata.filter((m) => exact(m.key, k)).length !== 1)
    )
      corrupt('Retention metadata inventory differs.');
    if (
      !(await crypt.verify(
        pointer
          ? baselineCounterPayload(scope, stored as BaselineCounter)
          : counterPayload(scope, stored as ContentCounter),
        stored.mac,
      ))
    )
      corrupt('Retention counter authentication failed.');
    if (pointer) {
      const chunks = Array.from({ length: pointer.chunks }, (_, i) =>
        parseStoredRecord(
          inventory.metadata.find((m) => exact(m.key, ['local-baseline', i]))!.value,
        ),
      );
      previous = await openEncryptedBaselineSnapshot(
        task,
        {
          identity: scope,
          allowReduced: binding.allowReduced === true,
          generation: stored.active_gen,
          intent: stored.intent,
          crypt: { open: (_t, r) => crypt.open(r), verify: (_t, b, mac) => crypt.verify(b, mac) },
          assertCurrent: async () => context.assertCurrent(),
          checkCommit: context.assertCurrent,
        },
        { counter: stored as BaselineCounter, chunks },
      );
    }
    if ('baseline' in stored) {
      const { baseline: _pointer, ...allocation } = stored;
      counter = parseCounter({ ...allocation, v: 2 }, scope, stored.intent);
    } else counter = stored;
    const reuse = preparation && (await preparation(counter));
    const seen = new Set<number>();
    reportRetentionProgress(progress, {
      stage: 'opening',
      completed: 0,
      total: inventory.rows.length,
    });
    for (const row of inventory.rows) {
      const pause = checkpoint();
      if (pause) await pause;
      const r = parseStoredRecord(row.value);
      if (
        row.key !== r.seq ||
        row.store !== recordStore(r.kind) ||
        seen.has(r.seq) ||
        r.seq >= counter.next_seq ||
        r.gen > counter.active_gen ||
        !counter.reserved[String(r.gen)] ||
        (pointer &&
          r.seq >= pointer.firstSequence &&
          r.seq < pointer.firstSequence + pointer.chunks)
      )
        corrupt('Retention row placement differs.');
      seen.add(r.seq);
      const bytes = reuse
        ? await reuse.memo.check(
            'opened:' + r.seq,
            JSON.stringify([r.v, r.kind, r.gen, r.seq]),
            [r.nonce, r.ct],
            () => crypt.open(r),
            context.assertCurrent,
          )
        : await crypt.open(r);
      records.push({ seq: r.seq, kind: r.kind, gen: r.gen, bytes });
      if (records.length % 32 === 0 || records.length === inventory.rows.length)
        reportRetentionProgress(progress, {
          stage: 'opening',
          completed: records.length,
          total: inventory.rows.length,
        });
    }
    records.sort((a, b) => a.seq - b.seq);
    const replay = { records, counter };
    // Integrity failures in existing evidence must never be reported as capacity/ineligibility.
    reportRetentionProgress(progress, { stage: 'verifying' });
    if (stored.v !== 5 && previous)
      reference = await replayFullLocalHistory(replay, context, reuse);
    if (previous) {
      const old = decodeLocalBaseline(previous.baseline.payload);
      try {
        projected = await replayLocalBaseline(
          previous.baseline,
          previous.anchor,
          { records: records.filter((r) => r.seq >= old.cut.nextSequence), counter },
          context,
          crypt.auth,
        );
        if (stored.v === 5) {
          if (records.some((r) => r.seq < old.cut.nextSequence))
            corrupt('Retired physical prefix reappeared.');
          reference = projected;
          projected = undefined;
        } else
          await compareBaselineReplay(
            reference!,
            projected,
            old.own.position,
            context.route,
            context.assertCurrent,
          );
      } finally {
        eraseVerified(old);
        eraseVerified(projected);
        projected = undefined;
      }
    }
    const era = {
      current: hex(crypto.getRandomValues(new Uint8Array(32))),
      previous: pointer?.journalEra?.current ?? null,
      revision: (previous?.anchor.revision ?? 0) + 1,
    };
    let buildingCandidate = Boolean(previous);
    try {
      if (previous) {
        reportRetentionProgress(progress, { stage: 'building' });
        const old = decodeLocalBaseline(previous.baseline.payload);
        try {
          candidate = await rebaseLocalBaseline(
            previous.baseline,
            previous.anchor,
            { records: records.filter((r) => r.seq >= old.cut.nextSequence), counter },
            context,
            crypt.auth,
            era,
          );
        } finally {
          eraseVerified(old);
        }
      } else {
        const prepared = await prepareLocalBaselineWithReference(
          replay,
          context,
          crypt.auth,
          null,
          era,
          () => {
            buildingCandidate = true;
            reportRetentionProgress(progress, { stage: 'building' });
          },
          reuse,
        );
        candidate = prepared.candidate;
        reference = prepared.reference;
      }
    } catch (error) {
      // Full-reference verification used to run outside candidate refusal handling. Keep failures
      // from that boundary as failures even though the builder now returns both results together.
      if (!buildingCandidate) throw error;
      if (error instanceof LocalBaselineCapacityError)
        return {
          kind: 'skipped',
          reason: 'capacity',
          ...(error.detail ? { detail: error.detail } : {}),
        };
      if (
        error instanceof LocalBaselineError &&
        (error.reason === 'ineligible' || error.reason === 'history-required')
      )
        return { kind: 'skipped', reason: error.reason };
      throw error;
    }
    decoded = decodeLocalBaseline(candidate.baseline.payload);
    const predecessorCut = previous ? decodeLocalBaseline(previous.baseline.payload) : undefined;
    const expectedLast = Math.max(records.at(-1)?.seq ?? 0, predecessorCut?.cut.sequence ?? 0);
    eraseVerified(predecessorCut);
    if (decoded.cut.nextSequence !== counter.next_seq || decoded.cut.sequence !== expectedLast)
      corrupt('Retention plan is not the current cut.');
    const state: OpenedRecord = {
      seq: 0,
      kind: 'state',
      gen: decoded.generation,
      bytes: decoded.snapshot,
    };
    // The candidate snapshot is private and immutable throughout this exact plan.
    const content = [state],
      checking = coverage.bind(content);
    const bySequence = new Map(records.map((r) => [r.seq, r]));
    const deleteRows: DeleteRow[] = [];
    const dispositions: RetentionPlanReport['dispositions'] = {};
    reportRetentionProgress(progress, {
      stage: 'coverage',
      completed: 0,
      total: inventory.rows.length,
    });
    for (const row of inventory.rows) {
      const pause = checkpoint();
      if (pause) await pause;
      const value = parseStoredRecord(row.value),
        opened = bySequence.get(value.seq)!;
      let disposition: RetentionDisposition;
      if (value.kind === 'update' || value.kind === 'state') {
        checking.check(content, [opened.bytes]);
        disposition = 'content-covered';
      } else {
        const tag: unknown =
          opened.bytes[0] === 91
            ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes))[0]
            : undefined;
        const inbound =
          opened.bytes[0] !== 91 || isInboundReceiptNamespace(tag)
            ? inspectInboundReceipt(opened.bytes)
            : undefined;
        if (tag === 'done/source-capture/v1') {
          // All originals/allocations were independently verified above. Preserve whole partial
          // capsules, including their inherited consumed bitmap, rather than recreating identities.
          disposition = decoded.sources.some((s) => sameBytes(s.record.bytes, opened.bytes))
            ? 'source-carried'
            : 'source-consumed';
        } else if (tag === 'done/account-spool/v1') disposition = 'spool-settled';
        else if (tag === 'done/account-delivery/v1') disposition = 'delivery-settled';
        else if (inbound) disposition = 'receive-frontier';
        else if (isHistoryInstallTag(tag)) disposition = 'history-frontier';
        else return corrupt('Unclassified retention row.');
      }
      deleteRows.push({ store: row.store, key: value.seq, value, disposition });
      if (deleteRows.length % 32 === 0 || deleteRows.length === inventory.rows.length)
        reportRetentionProgress(progress, {
          stage: 'coverage',
          completed: deleteRows.length,
          total: inventory.rows.length,
        });
      dispositions[disposition] = (dispositions[disposition] ?? 0) + 1;
    }
    // Execute the exact list only on detached arrays; never use a numeric range or a live store.
    const selected = new Set(deleteRows.map((r) => r.store + ':' + r.key));
    const survivors = inventory.rows.filter((r) => !selected.has(r.store + ':' + String(r.key)));
    if (selected.size !== inventory.rows.length || survivors.length)
      corrupt('Retention inventory is not exhaustively covered.');
    reportRetentionProgress(progress, { stage: 'coverage' });
    projected = await replayLocalBaseline(
      candidate.baseline,
      candidate.anchor,
      { records: survivors.map((row) => bySequence.get(Number(row.key))!), counter },
      context,
      crypt.auth,
    );
    await compareBaselineReplay(
      reference!,
      projected,
      decoded.own.position,
      context.route,
      context.assertCurrent,
    );
    context.assertCurrent();
    task.step(() => {});
    const plan: LocalRetentionPlan = Object.freeze({ kind: 'local-retention-dry-run' });
    retainCurrent();
    plans.set(plan, {
      inventory,
      binding,
      assertCurrent: retainCurrent,
      counter,
      candidate,
      deleteRows,
      report: {
        kind: 'planned',
        rows: deleteRows.length,
        sealedBytes: deleteRows.reduce((n, r) => n + r.value.nonce.length + r.value.ct.length, 0),
        metadataChunks: pointer?.chunks ?? 0,
        baselineBytes: candidate.baseline.payload.length,
        previousRevision: previous?.anchor.revision ?? 0,
        revision: candidate.anchor.revision,
        survivors: 0,
        dispositions,
      },
    });
    delivered = true;
    return plan;
  } catch (error) {
    // Raised only after the installed record authenticated (`verifyHistoryInstall`): a size
    // condition, not an integrity failure. Retrying the same history cannot change it.
    if (error instanceof HistoryInstallSizeError)
      return {
        kind: 'skipped',
        reason: 'capacity',
        detail: { cause: 'installed-snapshot', needed: error.needed, allowed: error.allowed },
      };
    throw error;
  } finally {
    coverage.clear();
    eraseVerified(records);
    eraseVerified(decoded);
    eraseVerified(reference);
    eraseVerified(projected);
    eraseVerified(previous);
    if (!delivered) {
      eraseVerified(inventory);
      eraseVerified(counter);
      eraseVerified(candidate);
    }
  }
}
