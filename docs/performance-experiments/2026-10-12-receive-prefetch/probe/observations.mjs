// Supplement the unchanged attribution analyzer; no content or credential fields are used.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const directory = process.argv[2];
const r = JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'));
const primary = r.requests.filter((q) => q.at >= r.started && q.at <= r.caughtAt);
const peers = primary.filter((q) => q.device === 'B' && q.path.endsWith('/read-v2') && !q.self);
const submit = (device) =>
  primary.filter((q) => q.device === device && q.path.endsWith('/submit') && q.status === 200);
const deltas = (rows, field) => rows.slice(1).map((q, i) => q[field] - rows[i][field]);
const stats = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null,
    max: sorted.at(-1) ?? null,
  };
};
const unique = new Set(peers.map((q) => q.after));
const outcomes = {};
for (const q of primary)
  if (q.failed) {
    const key = [q.status ?? 'no-response', q.failure ?? 'unknown'].join(' ');
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
const result = {
  note: 'HTTP 200 submit response intervals are proxies; response bodies are not retained. Complete export equality separately verifies eventual delivery. rAF latency is not admitted-text latency.',
  writerHttp200Submits: submit('A').length,
  writerSubmitStartIntervalMs: stats(deltas(submit('A'), 'at')),
  writerSubmitResponseIntervalMs: stats(deltas(submit('A'), 'end')),
  receiverFirstSubmitStartMs: submit('B').length ? submit('B')[0].at - r.started : null,
  peerReads: peers.length,
  peerAfterRange: [Math.min(...unique), Math.max(...unique)],
  duplicatePeerCursors: peers.length - unique.size,
  ownReads: primary.filter((q) => q.device === 'B' && q.path.endsWith('/read-v2') && q.self).length,
  rateLimited: primary.filter((q) => q.status === 429).length,
  non200: primary.filter((q) => q.status && q.status !== 200).length,
  failedEventOutcomes: outcomes,
  receiverTypingNextFrameMs: stats(
    (r.capture?.keys ?? [])
      .filter((q) => q.at >= r.typing.start && q.at <= r.typing.end)
      .map((q) => q.ms),
  ),
};
writeFileSync(join(directory, 'observations.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
