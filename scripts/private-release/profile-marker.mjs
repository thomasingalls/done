import { build } from 'vite';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';
import { fixture, record } from '../../test/account-promotion-contract/oracle.mjs';
import { execFileSync } from 'node:child_process';
const baseline = process.argv[3];
const result = await build({
  configFile: false,
  logLevel: 'error',
  plugins: [
    {
      name: 'profile',
      enforce: 'pre',
      transform(code, id) {
        if (baseline && id.endsWith('/src/crdt/promotionRecord.ts'))
          return execFileSync('git', ['show', baseline + ':src/crdt/promotionRecord.ts'], {
            encoding: 'utf8',
          });
      },
    },
  ],
  build: {
    write: false,
    minify: false,
    lib: {
      entry: process.cwd() + '/src/crdt/promotionRecord.ts',
      name: 'Product',
      formats: ['iife'],
    },
  },
});
const code = (Array.isArray(result) ? result[0] : result).output.find(
    (o) => o.type === 'chunk',
  ).code,
  h = Function(code + ';return Product;')();
const f = fixture(),
  rows = [];
for (const size of [4096, 65536, 1048576]) {
  const r = record(f, 9, 'account-receiving');
  r.genesis.checkpoint.ct = 'ab'.repeat(size);
  r.admission.request.candidate = structuredClone(r.genesis);
  const samples = [];
  for (let i = 0; i < 4; i++) {
    const before = performance.now();
    const ok = h.equalPromotion(r, structuredClone(r));
    const ms = performance.now() - before;
    if (!ok) throw Error('comparison');
    if (i) samples.push(ms);
  }
  const wire = JSON.stringify(r),
    packed = h.storePromotion?.(r) ?? r;
  rows.push({
    checkpointBytes: size,
    canonicalJsonBytes: Buffer.byteLength(wire),
    retainedJsonBytes: Buffer.byteLength(JSON.stringify(packed)),
    v8EncodedBytes: serialize(packed).length,
    equalityMs: samples,
  });
}
const out = {
  baseline: baseline ?? null,
  node: process.version,
  bundleSha256: createHash('sha256').update(code).digest('hex'),
  design:
    'one host; structurally valid synthetic candidate fields, not whole admission or service capacity; one warmup +3 equality samples including detached clone; V8 bytes are an encoding proxy, not browser file size',
  rows,
};
writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
