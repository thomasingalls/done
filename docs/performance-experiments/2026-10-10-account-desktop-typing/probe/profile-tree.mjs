// Offline: top-down tree and bottom-up callers for a saved .cpuprofile, source-mapped.
// Usage: node profile-tree.mjs <file.cpuprofile> <keys> [minPercent=1.5] [maxDepth=22]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';
import { DIST, ORIGIN } from './lib.mjs';

const [file, keysArg, minArg = '1.5', depthArg = '22'] = process.argv.slice(2);
const keys = Number(keysArg);
const profile = JSON.parse(readFileSync(file, 'utf8'));
const maps = new Map();
const label = (f) => {
  const fn = f.functionName || '(anonymous)';
  if (f.url.startsWith(ORIGIN + '/') && f.url.endsWith('.js')) {
    const path = join(DIST, new URL(f.url).pathname + '.map');
    if (existsSync(path)) {
      let map = maps.get(path);
      if (!map) maps.set(path, (map = new SourceMap(JSON.parse(readFileSync(path, 'utf8')))));
      const e = map.findEntry(f.lineNumber, f.columnNumber);
      if ('originalSource' in e) {
        const source = e.originalSource
          .replace(/^.*?(?=(src|account-protocol|wasm)\/)/, '')
          .replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'npm:');
        return `${e.name ?? fn} ${source}:${e.originalLine + 1}`;
      }
    }
  }
  return f.url ? `${fn} ${f.url.split('/').pop()}:${f.lineNumber + 1}` : fn;
};
const nodes = new Map(
  profile.nodes.map((n) => [n.id, { ...n, label: label(n.callFrame), self: 0, total: 0 }]),
);
const parent = new Map();
for (const n of nodes.values()) for (const c of n.children ?? []) parent.set(c, n.id);
let all = 0,
  idle = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const n = nodes.get(profile.samples[i]);
  const dt = profile.timeDeltas[i];
  all += dt;
  if (n.label === '(idle)') {
    idle += dt;
    continue;
  }
  n.self += dt;
}
const root = [...nodes.values()].find((n) => !parent.has(n.id));
const total = (n) => {
  n.total = n.self;
  for (const c of n.children ?? []) n.total += total(nodes.get(c));
  return n.total;
};
total(root);
const active = all - idle;
const ms = (us) => (us / 1000 / keys).toFixed(1).padStart(6);
console.log(`profile ${file}`);
console.log(
  `keys ${keys}; sampled ${(all / 1000).toFixed(0)} ms; idle ${(idle / 1000).toFixed(0)} ms; active ${(active / 1000).toFixed(0)} ms = ${(active / 1000 / keys).toFixed(1)} ms/key`,
);
console.log(`\nTOP-DOWN (ms per key inclusive, self in brackets; nodes >= ${minArg}% of active)`);
const min = (Number(minArg) / 100) * active;
const walk = (n, depth) => {
  if (n.total < min || depth > Number(depthArg)) return;
  if (n !== root)
    console.log(`${ms(n.total)} [${ms(n.self)}] ${'  '.repeat(Math.min(depth, 30))}${n.label}`);
  // Merge same-label children so recursion and duplicated nodes read as one line.
  const merged = new Map();
  for (const c of n.children ?? []) {
    const child = nodes.get(c);
    const m = merged.get(child.label);
    if (!m) merged.set(child.label, child);
    else {
      m.total += child.total;
      m.self += child.self;
      m.children = [...(m.children ?? []), ...(child.children ?? [])];
    }
  }
  for (const child of [...merged.values()].sort((a, b) => b.total - a.total))
    walk(child, depth + 1);
};
walk(root, 0);

// Bottom-up: for the heaviest self-time functions, which chains of application frames reach them.
const selfBy = new Map();
for (const n of nodes.values()) selfBy.set(n.label, (selfBy.get(n.label) ?? 0) + n.self);
const heavy = [...selfBy.entries()]
  .filter(([l]) => l !== '(idle)' && l !== '(root)')
  .sort((a, b) => b[1] - a[1])
  .slice(0, 14);
console.log('\nBOTTOM-UP (self ms per key, then the application call chains that reach it)');
for (const [name, self] of heavy) {
  console.log(`${ms(self)} ${name}`);
  const chains = new Map();
  for (const n of nodes.values()) {
    if (n.label !== name || !n.self) continue;
    const chain = [];
    for (let cur = parent.get(n.id); cur !== undefined && chain.length < 6; cur = parent.get(cur)) {
      const l = nodes.get(cur).label;
      if (/ (src|account-protocol)\//.test(l) && l !== chain.at(-1)) chain.push(l);
    }
    const key = chain.join('  <-  ');
    chains.set(key, (chains.get(key) ?? 0) + n.self);
  }
  for (const [chain, us] of [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4))
    console.log(`        ${ms(us)}  <- ${chain || '(no application frame)'}`);
}
