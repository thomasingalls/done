import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
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
export async function bundle(control, browser = false, baseline = false) {
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: baseline
      ? [
          {
            name: 'frozen-parser-baseline',
            enforce: 'pre',
            transform(_code, id) {
              const path = repairedFiles.find((path) => id.endsWith('/' + path));
              if (!path) return;
              hits++;
              return execFileSync('git', ['show', baselineRef + ':' + path], { encoding: 'utf8' });
            },
          },
        ]
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
  if (baseline) assert.equal(hits, repairedFiles.length);
  const code = (Array.isArray(result) ? result[0] : result).output.find(
    (f) => f.type === 'chunk',
  ).code;
  return code;
}
export const load = async (control) =>
  Function('ParserYjs', (await bundle(control)) + ';return Parsers;')(Y);
export const loadBaseline = async () =>
  Function('ParserYjs', (await bundle(undefined, false, true)) + ';return Parsers;')(Y);
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
