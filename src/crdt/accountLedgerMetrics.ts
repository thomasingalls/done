/** Numeric diagnostics only: no identities, record bytes, writing or keys. */
const counters = {
  full: 0,
  incremental: 0,
  sourceDecodes: 0,
  events: 0,
  audits: 0,
  auditCompletions: 0,
  auditInterruptions: 0,
  mismatches: 0,
};
export const ledgerProfiling = import.meta.env?.['VITE_ACCOUNT_LEDGER_PROFILE'] === '1';
const workNames = [
  'startupValidations',
  'joinedStartupValidations',
  'deliveryVerifications',
  'inboundVerifications',
  'inboundCensuses',
  'deliveryPrefixLinks',
  'coverageBaselines',
  'coverageDirectProofs',
  'loads',
  'warmLoads',
  'warmAuditRows',
  'warmAuditBytes',
  'loadedRows',
  'loadedBytes',
  'authorityChecks',
  'positions',
  'sourceParses',
  'sourceParseBytes',
  'recordCopies',
  'recordCopyBytes',
  'journalFlushes',
  'dirtyJournalFlushes',
  'projectionChecks',
  'directTextPreparations',
] as const;
const work = Object.fromEntries(workNames.map((name) => [name, 0])) as Record<
  (typeof workNames)[number],
  number
>;
type WorkTiming =
  | 'copyRecords'
  | 'readProjection'
  | 'installClone'
  | 'physicalRead'
  | 'warmShapeCheck'
  | 'loadElapsed'
  | 'storageQueueWait'
  | 'storageOperation'
  | 'sourceParse'
  | 'validateUpdates'
  | 'envelopeSelection'
  | 'admissionLocal'
  | 'admissionRemote'
  | 'admissionFlush'
  | 'waitLocal'
  | 'waitRemote'
  | 'waitFlush';
const costs: Partial<Record<WorkTiming, { calls: number; totalMs: number; maxMs: number }>> = {};
/** Bounded numeric-only development counters. Names are internal literals, never input. */
export const countLedgerWork = (name: keyof typeof work, count = 1) => {
  if (ledgerProfiling) work[name] = (work[name] ?? 0) + count;
};
export const ledgerWorkStart = () => (ledgerProfiling ? performance.now() : 0);
export const measureLedgerWork = (name: WorkTiming, since: number) => {
  if (!ledgerProfiling) return;
  const ms = performance.now() - since;
  const row = (costs[name] ??= { calls: 0, totalMs: 0, maxMs: 0 });
  row.calls++;
  row.totalMs += ms;
  row.maxMs = Math.max(row.maxMs, ms);
};
const names = ['full', 'incremental', 'coverageCheck', 'coverageRebuild', 'compaction'] as const;
const timings = Object.fromEntries(
  names.map((name) => [name, { calls: 0, totalMs: 0, maxMs: 0 }]),
) as Record<(typeof names)[number], { calls: number; totalMs: number; maxMs: number }>;
export const countLedger = (name: keyof typeof counters, count = 1) => {
  counters[name] += count;
};
export const measureLedger = (name: (typeof names)[number], since: number) => {
  const ms = performance.now() - since,
    row = timings[name];
  row.calls++;
  row.totalMs += ms;
  row.maxMs = Math.max(row.maxMs, ms);
};
const queuePeaks = { local: 0, remote: 0, flush: 0 };
export const observeAdmissionQueue = (queue: readonly { kind: keyof typeof queuePeaks }[]) => {
  if (!ledgerProfiling) return;
  const counts = { local: 0, remote: 0, flush: 0 };
  for (const job of queue) counts[job.kind]++;
  for (const kind of ['local', 'remote', 'flush'] as const)
    queuePeaks[kind] = Math.max(queuePeaks[kind], counts[kind]);
};
export const accountLedgerMetrics = () => ({
  queuePeaks: { ...queuePeaks },
  ...counters,
  timings: structuredClone(timings),
  work: { ...work },
  costs: structuredClone(costs),
});
if (import.meta.env?.['VITE_ACCOUNT_LEDGER_PROFILE'] === '1') {
  Object.defineProperty(globalThis, '__doneLedgerMetrics', {
    value: accountLedgerMetrics,
    configurable: true,
  });
}

/** Fixed milestones for a single opening; numeric diagnostics never retain account identifiers. */
const openMilestones: Partial<
  Record<
    'authorized' | 'classified' | 'owner' | 'editor',
    {
      at: number;
      metrics: ReturnType<typeof accountLedgerMetrics>;
    }
  >
> = {};
export const markAccountOpen = (name: keyof typeof openMilestones) => {
  if (ledgerProfiling)
    openMilestones[name] = { at: performance.now(), metrics: accountLedgerMetrics() };
};
if (ledgerProfiling)
  Object.defineProperty(globalThis, '__doneOpenMilestones', {
    value: () => structuredClone(openMilestones),
    configurable: true,
  });
