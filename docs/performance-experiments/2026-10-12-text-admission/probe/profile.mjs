import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';
const [directory, dist] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(join(directory, 'typing-0.cpuprofile'), 'utf8'));
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
  inclusive = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i],
    dt = profile.timeDeltas[i] / 1000;
  const label = labels.get(id);
  self.set(label, (self.get(label) ?? 0) + dt);
  const seen = new Set();
  for (let at = id; at !== undefined; at = parents.get(at)) {
    const l = labels.get(at);
    if (seen.has(l)) continue;
    seen.add(l);
    inclusive.set(l, (inclusive.get(l) ?? 0) + dt);
  }
}
const sorted = (m) =>
  [...m].sort((a, b) => b[1] - a[1]).map(([name, ms]) => ({ name, ms: Math.round(ms * 10) / 10 }));
writeFileSync(
  join(directory, 'profile.json'),
  JSON.stringify({ self: sorted(self), inclusive: sorted(inclusive) }, null, 2) + '\n',
);
