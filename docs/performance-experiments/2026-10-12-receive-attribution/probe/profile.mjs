import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';
const [profilePath, dist, output] = process.argv.slice(2);
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
const self = new Map(),
  inclusive = new Map(),
  hotCallers = new Map();
let totalUs = 0,
  idleUs = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i],
    us = profile.timeDeltas[i],
    label = labels.get(id);
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
writeFileSync(
  output,
  JSON.stringify(
    {
      totalMs: totalUs / 1000,
      idleMs: idleUs / 1000,
      activeMs: (totalUs - idleUs) / 1000,
      self: rows(self),
      inclusive: rows(inclusive),
      hotCallers: rows(hotCallers),
      note: 'Sampled main-thread CPU, not total native/crypto CPU. Inclusive functions overlap.',
    },
    null,
    2,
  ) + '\n',
);
