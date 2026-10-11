// Offline: source-mapped top-down tree, bottom-up self time and category split for a saved .cpuprofile.
// Usage: node profile-tree.mjs <file.cpuprofile> <divisor> <dist-dir> [origin-prefix-regex] [minPercent=1.5] [maxDepth=24]
// For a service profile pass dist-dir as '-' (file:// URLs are shown by path).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';

const [file, divArg, DIST, originArg = '^http://localhost:\\d+', minArg = '1.5', depthArg = '24'] =
  process.argv.slice(2);
const div = Number(divArg);
const origin = new RegExp(originArg);
const profile = JSON.parse(readFileSync(file, 'utf8'));
const maps = new Map();
const label = (f) => {
  const fn = f.functionName || '(anonymous)';
  if (DIST !== '-' && origin.test(f.url) && f.url.endsWith('.js')) {
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
  if (f.url.startsWith('file://')) {
    const p = f.url
      .replace(/^.*?(?=(account-service|account-protocol|src|scripts)\/)/, '')
      .replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'npm:');
    return `${fn} ${p}:${f.lineNumber + 1}`;
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
const ms = (us) => (us / 1000 / div).toFixed(1).padStart(7);
console.log(`profile ${file.split('/').slice(-2).join('/')}`);
console.log(
  `divisor ${div}; sampled ${(all / 1000).toFixed(0)} ms; idle ${(idle / 1000).toFixed(0)} ms; active ${(active / 1000).toFixed(0)} ms = ${(active / 1000 / div).toFixed(1)} ms per unit (${((100 * active) / all).toFixed(0)}% busy)`,
);

// Category split: the first matching ancestor (from the leaf up) decides.
const rules = [
  ['gc', /^\(garbage collector\)/],
  [
    'ui-publication (workspace read, React, CodeMirror, layout)',
    /src\/ui\/|npm:react|npm:scheduler|npm:@codemirror|npm:@lezer|src\/editor\/|admittedWorkspace\.ts:(6[89]\d|7\d\d)\b|read src\/crdt\/admittedWorkspace/,
  ],
  [
    'promotion and document comparison (admission, Yjs apply/fork/compare)',
    /src\/crdt\/admissionQueue|src\/crdt\/admissionDocument|src\/crdt\/admittedWorkspace|src\/crdt\/yjs\.ts|npm:yjs|npm:lib0|src\/crdt\/workspace/,
  ],
  [
    'inbound verification and ledger (verify page, inbound/delivery/spool ledger, coverage)',
    /src\/crdt\/accountInbound|src\/crdt\/inboundLedger|src\/crdt\/inboundRecord|src\/crdt\/deliveryRecord|src\/crdt\/spoolRecord|src\/crdt\/incrementalAccountLedger|src\/crdt\/verifiedRecords|src\/crdt\/sourceCapture|src\/crdt\/accountSyncState|account-protocol\//,
  ],
  [
    'storage (content store, IndexedDB callbacks, journal, custody)',
    /src\/crdt\/contentStore|src\/crdt\/contentDatabase|src\/crdt\/contentRecord|src\/crdt\/writeSession|src\/crdt\/journal|src\/crdt\/custody|src\/crdt\/accountCapture/,
  ],
  [
    'authority and membership checks',
    /src\/crdt\/joinedAccount|src\/crdt\/promotion|src\/crdt\/membership|src\/crdt\/accountMembership|src\/account\//,
  ],
  [
    'receive/sync driver and transport',
    /src\/crdt\/accountReceive|src\/crdt\/accountSyncDriver|src\/crdt\/accountDelivery|src\/crdt\/accountCatchup|src\/crdt\/history/,
  ],
];
const cat = new Map();
for (const n of nodes.values()) {
  if (!n.self) continue;
  let c = 'other (program, native, unattributed)';
  outer: for (let m = n; m; m = nodes.get(parent.get(m.id))) {
    for (const [name, re] of rules)
      if (re.test(m.label)) {
        c = name;
        break outer;
      }
  }
  cat.set(c, (cat.get(c) ?? 0) + n.self);
}
console.log(`\nCATEGORIES (ms per unit, innermost matching frame decides)`);
for (const [c, v] of [...cat.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`${ms(v)}  ${((100 * v) / active).toFixed(0).padStart(3)}%  ${c}`);

console.log(`\nTOP-DOWN (ms per unit inclusive, self in brackets; nodes >= ${minArg}% of active)`);
const min = (Number(minArg) / 100) * active;
const walk = (n, depth) => {
  if (n.total < min || depth > Number(depthArg)) return;
  if (n !== root)
    console.log(`${ms(n.total)} [${ms(n.self)}] ${'  '.repeat(Math.min(depth, 30))}${n.label}`);
  const merged = new Map();
  for (const c of n.children ?? []) {
    const child = nodes.get(c);
    const m = merged.get(child.label);
    if (!m) merged.set(child.label, { ...child });
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
console.log(`\nBOTTOM-UP (self ms per unit, top 25)`);
const selfBy = new Map();
for (const n of nodes.values())
  if (n.self) selfBy.set(n.label, (selfBy.get(n.label) ?? 0) + n.self);
for (const [l, v] of [...selfBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25))
  console.log(`${ms(v)}  ${l}`);
