/** Numeric diagnostics only: no identities, record bytes, writing or keys. */
const counters = { full: 0, incremental: 0, sourceDecodes: 0, events: 0, audits: 0, mismatches: 0 };
export const countLedger = (name: keyof typeof counters, count = 1) => { counters[name] += count; };
export const accountLedgerMetrics = () => ({ ...counters });
