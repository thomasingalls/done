import { build } from 'vite';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { release, cpus } from 'node:os';
const root = process.cwd();
const baseline = process.argv[3] ?? process.env.PROFILE_BASELINE;
const source = `export * from '${root}/src/crdt/yjs.ts'; export {createAdmittedWorkspace} from '${root}/src/crdt/admittedWorkspace.ts'; export {createAdmissionOwner} from '${root}/src/crdt/admissionQueue.ts'; export {serializeCollections} from '${root}/src/crdt/serialize.ts';`;
const result = await build({
  configFile: false,
  logLevel: 'error',
  plugins: [
    {
      name: 'profile',
      enforce: 'pre',
      transform(code, id) {
        if (
          baseline &&
          ['/src/crdt/yjs.ts', '/src/crdt/admittedWorkspace.ts'].some((p) => id.endsWith(p))
        )
          return execFileSync('git', ['show', baseline + ':' + id.slice(root.length + 1)], {
            encoding: 'utf8',
          });
      },
      resolveId(id) {
        if (id === 'profile' || id.endsWith('/profile')) return '\0profile';
      },
      load(id) {
        if (id === '\0profile') return source;
      },
    },
  ],
  build: {
    write: false,
    minify: false,
    lib: { entry: 'profile', name: 'Product', formats: ['iife'] },
  },
});
const code = (Array.isArray(result) ? result[0] : result).output.find(
  (o) => o.type === 'chunk',
).code;
const h = Function(code + ';return Product;')();
const rows = [];
const time = (f) => {
  const at = performance.now();
  const value = f();
  return [performance.now() - at, value];
};
const open = async (seed) => {
  const abort = new AbortController(),
    disk = [new Uint8Array(h.Y.encodeStateAsUpdate(seed))],
    wal = [];
  const carrier = {
    state: 'active',
    signal: abort.signal,
    loadRecovery: async () => ({
      records: disk.map((bytes) => ({ kind: 'update', bytes: bytes.slice() })),
      journal: [],
    }),
    appendLocal(bytes) {
      wal.push(bytes.slice());
      return { status: 'journalled' };
    },
    async appendBatch(rs) {
      disk.push(...rs.map((r) => r.bytes.slice()));
    },
    async flushJournal() {
      const removed = wal.length;
      disk.push(...wal.splice(0));
      return { retained: 0, removed };
    },
    async close() {
      abort.abort();
    },
  };
  return h.createAdmittedWorkspace((o) => h.createAdmissionOwner(carrier, o), {
    identity: {
      id: 'human',
      actor: { kind: 'human', name: 'Test', color: '#3f8fd6' },
      device: { id: 'device', name: 'Test' },
    },
    validateReceive() {},
    today: () => '2026-09-12',
  });
};
for (const items of [1000, 10000, 100000]) {
  const d = new h.Y.Doc({ gc: false }),
    t = d.getText('master');
  for (let i = 0; i < items; i++) t.insert(0, 'x'.repeat(100000 / items));
  const actual = [...d.store.clients.values()].reduce((n, r) => n + r.length, 0);
  const samples = [];
  for (let i = 0; i < 6; i++) {
    const [forkMs, copy] = time(() => h.forkDoc(d, false));
    const [compareMs, same] = time(() => h.sameDocState(d, copy));
    if (!same) throw Error('projection');
    copy.destroy();
    if (i) samples.push({ forkMs, compareMs });
  }
  const w = await open(d),
    admission = [];
  try {
    for (let i = 0; i < 6; i++) {
      const at = performance.now();
      await w.text({ kind: 'master' }).input({ name: 'insert', text: 'z' }).accepted;
      const ms = performance.now() - at;
      if (w.read().master.length !== 100001 + i) throw Error('length');
      if (i) admission.push(ms);
    }
  } finally {
    await w.close();
    d.destroy();
  }
  rows.push({ chars: 100000, items: actual, samples, admissionMs: admission });
}
const d = new h.Y.Doc({ gc: false });
for (let i = 0; i < 300; i++) {
  const day = new h.Y.Map();
  d.getMap('days').set(
    '2025-' +
      String(Math.floor(i / 25) + 1).padStart(2, '0') +
      '-' +
      String((i % 25) + 1).padStart(2, '0'),
    day,
  );
  const a = new h.Y.Text();
  day.set('archive', a);
  a.insert(
    0,
    h.serializeCollections({
      next: Array.from({ length: 5 }, () => 'line '.repeat(70)),
      scheduled: [],
      done: [],
    }),
  );
}
const w = await open(d),
  reads = [];
for (let i = 0; i < 6; i++) {
  const [ms, s] = time(() => w.read());
  if (s.days.filter((r) => r.archived).length !== 300) throw Error('archive');
  reads.push(ms);
}
await w.close();
d.destroy();
const out = {
  baseline: baseline ?? null,
  node: process.version,
  os: release(),
  cpu: cpus()[0].model,
  bundleSha256: createHash('sha256').update(code).digest('hex'),
  design:
    'one host, fixed 100k visible chars; 1 warmup +5 measured samples; inclusive synchronous command acceptance, in-memory durable carrier, no network',
  rows,
  archives: { days: 300, cards: 1500, readsMs: reads },
};
writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
