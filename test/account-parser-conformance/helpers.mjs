import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { resolve, join, posix } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as Y from 'yjs';
import fc from 'fast-check';
import { fixture, record, stages } from '../account-promotion-contract/oracle.mjs';
import { fixture as ledger, descriptors } from '../account-ledger-contract/oracle.mjs';
export { fc, Y, stages };
export const hex = (b) => Buffer.from(b).toString('hex');
export const bytes = (h) => new Uint8Array(Buffer.from(h, 'hex'));
export const json = (v) => new TextEncoder().encode(JSON.stringify(v));
export const f = fixture(),
  l = ledger();
export const promotions = stages.map(([v, stage]) => record(f, v, stage));
export const carriers = descriptors(l).filter((d) =>
  ['source', 'spool', 'delivery'].includes(d.family),
);
export const controls = {
  promotion: ['src/crdt/promotionRecord.ts', "typeof r['stage'] !== 'string' ||", ''],
  admission: [
    'account-protocol/admission.ts',
    "if (r['v'] !== 1) throw Error('Unsupported admission');",
    '',
  ],
  source: [
    'src/crdt/sourceCapture.ts',
    "if (result[key] !== historical[key]) throw Error('route');",
    'void key;',
  ],
  spool: ['src/crdt/spoolRecord.ts', "typeof s.hash !== 'string' ||", ''],
  delivery: [
    'src/crdt/deliveryRecord.ts',
    '!Number.isSafeInteger(e.position) || e.position < 1 || ',
    '',
  ],
  submission: [
    'account-protocol/submission.ts',
    'if (at !== input.length || hex(encodeSubmission(s)) !== hex(input))',
    'if (false)',
  ],
  credentials: [
    'src/crdt/promotionRecord.ts',
    "Array.from(r['credentials']).map",
    "r['credentials'].map",
  ],
  actors: ['account-protocol/genesis.ts', "Array.from(c['actors']).map", "c['actors'].map"],
  wraps: ['account-protocol/genesis.ts', "Array.from(c['wraps']).map", "c['wraps'].map"],
  ...Object.fromEntries(
    ['promotionId', 'requestDigest', 'epochHead'].map((field) => [
      field,
      ['src/crdt/startupClassification.ts', `typeof v.account.${field} !== 'string' ||`, ''],
    ]),
  ),
};
export const baselineRef = 'f0b6acd2e624d89034c88706d4053a830ab50cc6';
export const repairedFiles = [
  'src/crdt/promotionRecord.ts',
  'src/crdt/spoolRecord.ts',
  'src/crdt/startupClassification.ts',
  'account-protocol/genesis.ts',
];
const runtimeDir = 'test/account-parser-conformance';
const runtime = resolve(runtimeDir, 'runtime.ts');
// The baseline is the whole parser graph at baselineRef, not four old files among current
// modules: every repository module the bundle reaches is read from that commit. Ids only; the
// frozen root is never written to disk. Git replacement objects are ignored: the baseline is the
// objects the commit id names.
const frozenRoot = resolve('.parser-baseline-' + baselineRef);
const git = (args, encoding) =>
  execFileSync('git', ['--no-replace-objects', ...args], { encoding, maxBuffer: 64 * 1024 * 1024 });
export const gitBlobId = (bytes) =>
  createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
const literal = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const patches = (lock) => /^patchedDependencies:\n(?: {2}.*\n)*/m.exec(lock)?.[0];
// Resolves relative imports inside the frozen tree and refuses any file whose loaded text is not
// byte-identical to its blob at baselineRef, any module from outside that tree, and any npm
// package (yjs included) not locked at baselineRef. `mutate` exists only for the identity
// control: it changes the bytes after they are read and before the check.
function frozenBaseline(loaded, mutate) {
  const tree = new Map();
  for (const entry of git(['ls-tree', '-r', '-z', '--full-tree', baselineRef], 'utf8').split(
    '\0',
  )) {
    const match = /^\d{6} blob ([0-9a-f]{40})\t(.+)$/s.exec(entry);
    if (match) tree.set(match[2], match[1]);
  }
  const candidates = (p) => [p, p + '.ts', p + '.tsx', p + '.js', p + '.mjs', p + '/index.ts'];
  return {
    name: 'frozen-parser-baseline',
    enforce: 'pre',
    resolveId(source, importer) {
      const frozen = importer?.startsWith(frozenRoot + '/');
      if (!frozen && importer !== runtime) return null;
      if (!source.startsWith('.')) {
        assert.ok(!source.startsWith('/'), 'absolute import in frozen baseline: ' + source);
        return this.resolve(source, runtime, { skipSelf: true });
      }
      const from = frozen ? posix.dirname(importer.slice(frozenRoot.length + 1)) : runtimeDir;
      const target = posix.normalize(posix.join(from, source));
      const path = candidates(target).find((p) => tree.has(p));
      assert.ok(path, `${baselineRef} has no module for ${source} imported by ${importer}`);
      return frozenRoot + '/' + path;
    },
    load(id) {
      if (!id.startsWith(frozenRoot + '/')) return null;
      const path = id.slice(frozenRoot.length + 1);
      let bytes = git(['cat-file', 'blob', tree.get(path)]);
      if (mutate) bytes = mutate(path, bytes);
      const code = bytes.toString('utf8');
      const actual = gitBlobId(Buffer.from(code, 'utf8'));
      if (actual !== tree.get(path))
        throw Error(`Frozen baseline file ${path} differs from ${baselineRef}: blob ${actual}`);
      loaded.set(path, actual);
      return code;
    },
    buildEnd(error) {
      if (error) return;
      const packages = new Set([resolve('node_modules/yjs')]);
      for (const id of this.getModuleIds()) {
        const at = id.lastIndexOf('/node_modules/');
        if (at >= 0) {
          const root = id.slice(0, at + '/node_modules/'.length);
          const [scope, name] = id.slice(root.length).split('/');
          packages.add(root + (scope.startsWith('@') ? scope + '/' + name : scope));
        } else if (id !== runtime && id !== 'yjs')
          assert.ok(
            id.startsWith(frozenRoot + '/') && loaded.has(id.slice(frozenRoot.length + 1)),
            'baseline bundle reached a module outside ' + baselineRef + ': ' + id,
          );
      }
      const lock = git(['show', baselineRef + ':pnpm-lock.yaml'], 'utf8');
      assert.equal(patches(readFileSync('pnpm-lock.yaml', 'utf8')), patches(lock), 'yjs patch');
      for (const dir of packages) {
        const { name, version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        assert.match(
          lock,
          new RegExp(`^ {2}'?${literal(name)}@${literal(version)}'?:`, 'm'),
          `${name}@${version} is not locked at ${baselineRef}`,
        );
      }
    },
  };
}
export async function bundle(control, browser = false, baseline = false, mutate) {
  let hits = 0;
  const loaded = new Map();
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: baseline
      ? [frozenBaseline(loaded, mutate)]
      : control
        ? [
            {
              name: 'parser-omission',
              enforce: 'pre',
              transform(code, id) {
                const [file, from, to] = controls[control];
                if (!id.endsWith('/' + file)) return;
                assert.equal(code.split(from).length, 2, 'control anchor ' + control);
                hits++;
                return code.replace(from, to);
              },
            },
          ]
        : [],
    build: {
      write: false,
      minify: false,
      rollupOptions: browser
        ? {}
        : { external: ['yjs'], output: { globals: { yjs: 'ParserYjs' } } },
      lib: {
        entry: resolve('test/account-parser-conformance/runtime.ts'),
        name: 'Parsers',
        formats: ['iife'],
      },
    },
  });
  if (control) assert.equal(hits, 1);
  if (baseline) for (const path of repairedFiles) assert.ok(loaded.has(path), 'frozen ' + path);
  const code = (Array.isArray(result) ? result[0] : result).output.find(
    (f) => f.type === 'chunk',
  ).code;
  return code;
}
export const load = async (control) =>
  Function('ParserYjs', (await bundle(control)) + ';return Parsers;')(Y);
export const loadBaseline = async (mutate) =>
  Function('ParserYjs', (await bundle(undefined, false, true, mutate)) + ';return Parsers;')(Y);
export const decode = (h, d, b) =>
  d.family === 'source'
    ? h.decodeSourceCapsule(b, l.route)
    : d.family === 'spool'
      ? h.decodeSpoolEntry(b, l.route)
      : h.decodeDeliveryEntry(b, l.route, l.authority);
export const encode = (h, d, v) =>
  d.family === 'source'
    ? h.encodeSourceCapsule(v)
    : d.family === 'spool'
      ? h.encodeSpoolEntry(v, l.route)
      : h.encodeDeliveryEntry(v, l.route, l.authority);
export const at = (v, p) => p.reduce((v, k) => v[k], v);
export function replace(v, p, x) {
  if (!p.length) return x;
  const copy = structuredClone(v);
  at(copy, p.slice(0, -1))[p.at(-1)] = x;
  return copy;
}
export function nodes(v, p = []) {
  return [
    p,
    ...(v && typeof v === 'object' && !(v instanceof Uint8Array)
      ? Object.entries(v).flatMap(([k, x]) => nodes(x, [...p, k]))
      : []),
  ];
}
export function invalidTypes(v) {
  if (v instanceof Uint8Array) return [null, [], {}, hex(v)];
  if (v === null) return [false, [], {}, 'null'];
  if (typeof v === 'string') return [null, false, {}, [v]];
  if (typeof v === 'number') return [null, false, {}, String(v), [v]];
  return [null, false, 'object'];
}
export function report(name, value) {
  if (!process.env.ACCOUNT_REPORT_DIR) return;
  mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
  writeFileSync(
    join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
    JSON.stringify(value, null, 2) + '\n',
  );
}
export function property(name, arbitrary, predicate, seed, numRuns = 250) {
  const result = fc.check(fc.property(arbitrary, predicate), { seed, numRuns });
  report(name, {
    ...result,
    errorInstance: result.errorInstance ? String(result.errorInstance) : null,
  });
  assert.equal(
    result.failed,
    false,
    name + ': ' + result.errorInstance + '; path=' + result.counterexamplePath,
  );
}
