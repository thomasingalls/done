/** Numeric diagnostics only: no identities, record bytes, writing or keys. */
const counters = { full: 0, incremental: 0, sourceDecodes: 0, events: 0, audits: 0, mismatches: 0 };
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
export const accountLedgerMetrics = () => ({ ...counters, timings: structuredClone(timings) });
if (import.meta.env?.['VITE_ACCOUNT_LEDGER_PROFILE'] === '1') {
  Object.defineProperty(globalThis, '__doneLedgerMetrics', {
    value: accountLedgerMetrics,
    configurable: true,
  });
}
