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
  prepareLocalBaseline,
  rebaseLocalBaseline,
  replayFullLocalHistory,
  replayLocalBaseline,
  LocalBaselineError,
  type LocalBaselineContext,
  type BaselineAuthentication,
} from './localBaselineReplay';
import { compareBaselineReplay } from './localBaselineShadow';
import { verifyInboundCoverage } from './inboundLedger';
import { isHistoryInstallTag } from './historyInstall';
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
  intent: string;
}
export interface LocalRetentionPlan {
  readonly kind: 'local-retention-dry-run';
}
type Candidate = Awaited<ReturnType<typeof prepareLocalBaseline>>;
interface HeldPlan {
  inventory: RetentionInventory;
  binding: RetentionBinding;
  context: LocalBaselineContext;
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
export function assertRetentionInventory(
  expected: RetentionInventory,
  current: RetentionInventory,
) {
  const actual = clone(current);
  try {
    if (!exact(expected, actual)) corrupt('Retention inventory changed; replan required.');
  } finally {
    eraseVerified(actual);
  }
}
const held = (plan: LocalRetentionPlan): HeldPlan =>
  plans.get(plan) ?? corrupt('Retention plan expired or unknown.');
export function retentionPlanReport(plan: LocalRetentionPlan): RetentionPlanReport {
  return structuredClone(held(plan).report);
}
/** Detached evidence for focused tests and a future transaction adapter; never write authority. */
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
export function verifyRetentionPlan(
  plan: LocalRetentionPlan,
  current: RetentionInventory,
  binding: RetentionBinding,
) {
  const p = held(plan);
  p.context.assertCurrent();
  if (binding.lifetime !== p.binding.lifetime || binding.intent !== p.binding.intent)
    corrupt('Retention owner or authority identity changed.');
  assertRetentionInventory(p.inventory, current);
}
export function disposeRetentionPlan(plan: LocalRetentionPlan) {
  const p = plans.get(plan);
  if (p) {
    // Context contains owner-held key capabilities; it is never part of the erased owned buffers.
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
): Promise<
  LocalRetentionPlan | { kind: 'skipped'; reason: 'capacity' | 'ineligible' | 'history-required' }
> {
  const inventory = clone(input),
    scope = { ...context.identity };
  binding = { ...binding };
  context.assertCurrent();
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
      version === 3 || version === 4
        ? parseBaselineCounter(raw, scope, binding.intent)
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
    const seen = new Set<number>();
    for (const row of inventory.rows) {
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
      records.push({ seq: r.seq, kind: r.kind, gen: r.gen, bytes: await crypt.open(r) });
    }
    records.sort((a, b) => a.seq - b.seq);
    const replay = { records, counter };
    // Integrity failures in existing evidence must never be reported as capacity/ineligibility.
    reference = await replayFullLocalHistory(replay, context);
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
        await compareBaselineReplay(reference, projected, old.own.position, context.route);
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
    try {
      if (previous) {
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
      } else candidate = await prepareLocalBaseline(replay, context, crypt.auth, null, era);
    } catch (error) {
      if (error instanceof LocalBaselineCapacityError)
        return { kind: 'skipped', reason: 'capacity' };
      if (
        error instanceof LocalBaselineError &&
        (error.reason === 'ineligible' || error.reason === 'history-required')
      )
        return { kind: 'skipped', reason: error.reason };
      throw error;
    }
    decoded = decodeLocalBaseline(candidate.baseline.payload);
    if (
      decoded.cut.nextSequence !== counter.next_seq ||
      decoded.cut.sequence !== (records.at(-1)?.seq ?? 0)
    )
      corrupt('Retention plan is not the current cut.');
    const state: OpenedRecord = {
      seq: 0,
      kind: 'state',
      gen: decoded.generation,
      bytes: decoded.snapshot,
    };
    const deleteRows: DeleteRow[] = [];
    const dispositions: RetentionPlanReport['dispositions'] = {};
    for (const row of inventory.rows) {
      const value = parseStoredRecord(row.value),
        opened = records.find((r) => r.seq === value.seq)!;
      let disposition: RetentionDisposition;
      if (value.kind === 'update' || value.kind === 'state') {
        verifyInboundCoverage([state], [opened.bytes]);
        disposition = 'content-covered';
      } else {
        const tag: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes),
        )[0];
        if (tag === 'done/source-capture/v1') {
          // All originals/allocations were independently verified above. Preserve whole partial
          // capsules, including their inherited consumed bitmap, rather than recreating identities.
          disposition = decoded.sources.some((s) => sameBytes(s.record.bytes, opened.bytes))
            ? 'source-carried'
            : 'source-consumed';
        } else if (tag === 'done/account-spool/v1') disposition = 'spool-settled';
        else if (tag === 'done/account-delivery/v1') disposition = 'delivery-settled';
        else if (tag === 'done/account-inbound/v1') disposition = 'receive-frontier';
        else if (isHistoryInstallTag(tag)) disposition = 'history-frontier';
        else return corrupt('Unclassified retention row.');
      }
      deleteRows.push({ store: row.store, key: value.seq, value, disposition });
      dispositions[disposition] = (dispositions[disposition] ?? 0) + 1;
    }
    // Execute the exact list only on detached arrays; never use a numeric range or a live store.
    const selected = new Set(deleteRows.map((r) => r.store + ':' + r.key));
    const survivors = inventory.rows.filter((r) => !selected.has(r.store + ':' + String(r.key)));
    if (selected.size !== inventory.rows.length || survivors.length)
      corrupt('Retention inventory is not exhaustively covered.');
    projected = await replayLocalBaseline(
      candidate.baseline,
      candidate.anchor,
      { records: survivors.map((row) => records.find((r) => r.seq === row.key)!), counter },
      context,
      crypt.auth,
    );
    await compareBaselineReplay(reference, projected, decoded.own.position, context.route);
    context.assertCurrent();
    task.step(() => {});
    const plan: LocalRetentionPlan = Object.freeze({ kind: 'local-retention-dry-run' });
    plans.set(plan, {
      inventory,
      binding,
      context,
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
  } finally {
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
