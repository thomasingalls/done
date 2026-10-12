import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const directory = process.argv[2];
const r = JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'));
const round = (v) => Math.round(v * 100) / 100;
const stats = (values) => {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    n: s.length,
    total: round(s.reduce((a, b) => a + b, 0)),
    mean: round(s.reduce((a, b) => a + b, 0) / s.length),
    p50: s[Math.floor(s.length * 0.5)] ?? null,
    p95: s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] ?? null,
    max: s.at(-1) ?? null,
  };
};
const union = (intervals) => {
  let total = 0,
    through = -Infinity;
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, end - Math.max(start, through));
    through = Math.max(through, end);
  }
  return total;
};
const difference = (before, after) => {
  if (after === undefined) return undefined;
  if (typeof after === 'number') return round(after - (before ?? 0));
  if (typeof after !== 'object') return after;
  // Maxima/queue peaks cannot be differenced; startup may hold the lifetime maximum.
  return Object.fromEntries(
    Object.entries(after)
      .filter(([k]) => !['maxMs', 'queuePeaks'].includes(k))
      .map(([k, v]) => [k, difference(before?.[k], v)]),
  );
};
const end = r.caughtAt ?? r.primaryDeadlineMissedAt ?? r.after?.at ?? Infinity;
const primary = r.requests.filter((q) => q.at >= r.started && q.at <= end);
const receiver = primary.filter((q) => q.device === 'B');
const peer = receiver.filter((q) => q.path.endsWith('/read-v2') && !q.self);
const intervals = peer.slice(1).map((q, i) => ({
  after: q.after,
  ms: q.at - peer[i].at,
}));
const proxy = r.proxy.filter((q) => q.at >= r.started && q.at <= end && q.end);
const paths = {};
for (const q of primary) {
  const key =
    q.device + ' ' + q.path + (q.path.endsWith('/read-v2') ? (q.self ? ' self' : ' peer') : '');
  (paths[key] ??= []).push(q);
}
const summary = {
  phase: r.phase,
  diagnostic: r.diagnostic,
  delayMs: r.delayMs,
  catchupMs: r.caughtAt ? r.caughtAt - r.started : null,
  primaryDeadlineMissed: !!r.primaryDeadlineMissedAt,
  counts: Object.fromEntries(
    Object.entries(paths).map(([path, rows]) => [
      path,
      {
        n: rows.length,
        non200: rows.filter((q) => q.status && q.status !== 200).length,
        failed: rows.filter((q) => q.failed).length,
        requestToHeadersMs: stats(rows.map((q) => q.end - q.at)),
      },
    ]),
  ),
  receiverNetworkUnionMs: union(
    receiver.filter((q) => q.end).map((q) => [q.at, Math.min(q.end, end)]),
  ),
  peerIntervalMs: stats(intervals.map((q) => q.ms)),
  peerIntervalsBy100: Array.from({ length: 7 }, (_, i) => ({
    from: i * 100,
    to: (i + 1) * 100,
    ...stats(
      intervals.filter((q) => q.after >= i * 100 && q.after < (i + 1) * 100).map((q) => q.ms),
    ),
  })),
  backendRoundtripMs: Object.fromEntries(
    [...new Set(proxy.map((q) => q.path))].map((path) => [
      path,
      stats(proxy.filter((q) => q.path === path).map((q) => q.end - q.forwardAt)),
    ]),
  ),
  metrics: difference(r.before?.ledger, r.after?.ledger),
  diagnosticCosts: difference(r.before?.probe, r.after?.probe),
  liveDelayMs: stats((r.live ?? []).map((q) => q.ms)),
  coldMs: r.coldMs,
  heap: r.heap,
  exportBytes: r.exportBytes,
  longTasks: stats(
    (r.catchupCapture?.tasks ?? [])
      .filter((q) => q.at >= r.started && q.at <= end)
      .map((q) => q.ms),
  ),
};
writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
