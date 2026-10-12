import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';
const [directory, dist] = process.argv.slice(2);
const profilePath = join(directory, 'typing-0.cpuprofile'),
  output = join(directory, 'task-profile.json');
const result = JSON.parse(readFileSync(join(directory, 'typing-0-before-replay.json'), 'utf8'));
const started = result.samples[0].at;
const ended = result.samples.at(-1).at + result.samples.at(-1).frame;
const tasks = result.tasks.filter((t) => t.at >= started && t.at <= ended && t.ms >= 50);
const clock = result.profileClock;
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
const maps = new Map(),
  parents = new Map(),
  labels = new Map();
for (const node of profile.nodes) {
  for (const id of node.children ?? []) parents.set(id, node.id);
  const f = node.callFrame;
  let label = f.functionName || '(anonymous)';
  if (f.url?.startsWith('http://localhost:53771/') && f.url.endsWith('.js')) {
    const path = join(dist, new URL(f.url).pathname + '.map');
    if (existsSync(path)) {
      if (!maps.has(path)) maps.set(path, new SourceMap(JSON.parse(readFileSync(path, 'utf8'))));
      const at = maps.get(path).findEntry(f.lineNumber, f.columnNumber);
      if (at.originalSource)
        label +=
          ' ' +
          at.originalSource.replace(/^.*?(?=(src|node_modules|account-protocol)\/)/, '') +
          ':' +
          (at.originalLine + 1);
    }
  }
  labels.set(node.id, label);
}
const summaries = [];
for (const task of tasks) {
  const start = clock.monotonicUs + (task.at - clock.wallMs) * 1000;
  const end = start + task.ms * 1000;
  const self = new Map(),
    inclusive = new Map(),
    hotCallers = new Map();
  let totalUs = 0,
    idleUs = 0;
  let sampleTime = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i],
      delta = profile.timeDeltas[i],
      us = Math.max(0, Math.min(sampleTime + delta, end) - Math.max(sampleTime, start)),
      label = labels.get(id);
    sampleTime += delta;
    if (!us) continue;
    totalUs += us;
    if (label === '(idle)') {
      idleUs += us;
      continue;
    }
    self.set(label, (self.get(label) ?? 0) + us);
    if (
      label?.endsWith(' src/crdt/custodyCrypto.ts:23') ||
      label?.endsWith(' src/crdt/verifiedRecords.ts:4')
    ) {
      const caller = labels.get(parents.get(id));
      const key = label + ' <- ' + caller;
      hotCallers.set(key, (hotCallers.get(key) ?? 0) + us);
    }
    const seen = new Set();
    for (let at = id; at !== undefined; at = parents.get(at)) {
      const label = labels.get(at);
      if (seen.has(label)) continue;
      seen.add(label);
      inclusive.set(label, (inclusive.get(label) ?? 0) + us);
    }
  }
  const rows = (table) =>
    [...table]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([name, us]) => ({ name, ms: Math.round(us / 100) / 10 }));
  summaries.push({
    task: { atSeconds: (task.at - started) / 1000, ms: task.ms },
    totalMs: totalUs / 1000,
    idleMs: idleUs / 1000,
    activeMs: (totalUs - idleUs) / 1000,
    self: rows(self),
    inclusive: rows(inclusive),
    hotCallers: rows(hotCallers),
    overlapping: result.work
      .filter((s) => s.at < task.at + task.ms && s.at + s.ms > task.at)
      .map((s) => ({ name: s.name, atSeconds: (s.at - started) / 1000, ms: s.ms }))
      .sort((a, b) => b.ms - a.ms),
  });
}
writeFileSync(
  output,
  JSON.stringify(
    {
      clockErrorMs: clock.errorMs,
      tasks: summaries,
      note: 'CPU samples restricted to long-task windows using CDP monotonic/wall clock bridge. Sampled native work can be incomplete. Overlapping async spans are not exclusive attribution.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    summaries.map((s) => ({
      task: s.task,
      self: s.self.slice(0, 12),
      inclusive: s.inclusive.slice(0, 12),
      overlapping: s.overlapping.slice(0, 12),
    })),
    null,
    2,
  ),
);
