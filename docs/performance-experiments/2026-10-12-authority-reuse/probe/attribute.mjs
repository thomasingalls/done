// CPU samples are diagnostic; async admission spans are elapsed time, not CPU totals.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';
const [directory, dist] = process.argv.slice(2);
const read = (name) => JSON.parse(readFileSync(join(directory, name), 'utf8'));
const profile = read('typing.cpuprofile'),
  result = read('result.json');
const maps = new Map(),
  parents = new Map(),
  labels = new Map();
for (const node of profile.nodes) {
  for (const child of node.children ?? []) parents.set(child, node.id);
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
const stacks = new Map();
for (const node of profile.nodes) {
  const stack = [];
  for (let id = node.id; id !== undefined; id = parents.get(id)) stack.push(labels.get(id));
  stacks.set(node.id, stack);
}
const totals = new Map(),
  sameByteCallers = new Map();
const add = (map, key, ms) => map.set(key, (map.get(key) ?? 0) + ms);
const sorted = (map) =>
  [...map]
    .sort((a, b) => b[1] - a[1])
    .map(([name, ms]) => ({ name, ms: Math.round(ms * 10) / 10 }));
const offset = result.profileClock.wallMs - result.profileClock.monotonicUs / 1000;
const tasks = result.tasks.map((t) => ({ ...t, sampled: new Map() }));
let cursor = profile.startTime;
for (let i = 0; i < profile.samples.length; i++) {
  const dt = profile.timeDeltas[i],
    stack = stacks.get(profile.samples[i]);
  const end = (cursor += dt) / 1000 + offset,
    start = end - dt / 1000;
  const leaf = stack[0];
  let category = leaf;
  if (leaf.includes('src/crdt/verifiedRecords.ts:6')) {
    category = stack.some((s) => s.includes('src/crdt/accountAuthority.ts'))
      ? 'sameBytes / authority inventory equality'
      : stack.some((s) => s.includes('src/crdt/custodyRecord.ts'))
        ? 'sameBytes / custody equality'
        : 'sameBytes / ledger and other equality';
    add(sameByteCallers, stack.slice(1, 5).join(' <- '), dt / 1000);
  } else if (stack.some((s) => s.includes('src/crdt/custodyRecord.ts:386')))
    category = 'custody record payload encoding';
  add(totals, category, dt / 1000);
  for (const t of tasks) {
    const overlap = Math.min(end, t.at + t.ms) - Math.max(start, t.at);
    if (overlap > 0) add(t.sampled, category, overlap);
  }
}
writeFileSync(
  join(directory, 'attribution.json'),
  JSON.stringify(
    {
      clockErrorMs: result.profileClock.errorMs,
      categories: sorted(totals),
      sameByteCallers: sorted(sameByteCallers),
      longestTasks: tasks
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 12)
        .map((t) => ({ ...t, sampled: sorted(t.sampled).slice(0, 8) })),
    },
    null,
    2,
  ) + '\n',
);
