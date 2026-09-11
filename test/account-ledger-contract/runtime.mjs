import { build } from 'vite';
import { resolve } from 'node:path';
import * as Y from 'yjs';
export const controls = {
  source: ['sourceCapture.ts', "captureError('Conflicting source capsule identity');", 'void 0;'],
  sourceHash: [
    'spoolRecord.ts',
    "if (digest !== p.source.hash) captureError('Referenced source changed');",
    'void digest;',
  ],
  envelopeSource: [
    'spoolRecord.ts',
    "captureError('Persisted envelope source differs');",
    'void 0;',
  ],
  witnessCount: [
    'spoolRecord.ts',
    "if (counter.spool.events !== state.events.length) captureError('Spool ledger is incomplete');",
    'void 0;',
  ],
  witnessCountBoth: [
    'spoolRecord.ts',
    "if (counter.spool.events !== state.events.length) captureError('Spool ledger is incomplete');",
    'void 0;',
  ],
  witnessHash: [
    'spoolRecord.ts',
    "if (!sameSpoolWitness(witness, counter.spool)) captureError('Spool ledger commitment changed');",
    'void witness;',
  ],
  delivery: ['deliveryRecord.ts', "captureError('Delivery precedes its envelope');", 'void 0;'],
  coverage: [
    'inboundLedger.ts',
    'verifyInboundCoverage(records, result.updates);',
    'void records;',
  ],
};
export async function load(control) {
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'ledger-control',
            enforce: 'pre',
            transform(code, id) {
              const [file, from, to] = controls[control];
              if (!id.endsWith('/src/crdt/' + file)) return;
              if (code.split(from).length !== 2) throw Error('Missing control ' + control);
              hits++;
              code = code.replace(from, to);
              if (control === 'witnessCountBoth') {
                const check = 'if (!sameSpoolWitness(witness, counter.spool))';
                if (code.split(check).length !== 2) throw Error('Missing final count check');
                code = code.replace(check, 'if (witness.hash !== counter.spool.hash)');
              }
              return code;
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      rollupOptions: { external: ['yjs'], output: { globals: { yjs: 'LedgerYjs' } } },
      lib: {
        entry: resolve('test/account-ledger-contract/browser.ts'),
        name: 'LedgerContract',
        formats: ['iife'],
      },
    },
  });
  if (control && hits !== 1) throw Error('Control missed');
  const code = (Array.isArray(result) ? result[0] : result).output.find(
    (f) => f.type === 'chunk',
  ).code;
  return Function('LedgerYjs', code + ';return LedgerContract;')(Y);
}
export function typed(e) {
  const out = { ...e },
    b = (h) => new Uint8Array(Buffer.from(h, 'hex'));
  if (e.wire) out.wire = b(e.wire);
  if (e.request) {
    out.request = b(e.request);
    out.page = b(e.page);
  }
  if (e.sources) out.sources = e.sources.map((s) => ({ ...s, bytes: b(s.bytes) }));
  return out;
}
export const encoder = (h, f, d, input = typed(d.input)) =>
  d.family === 'source'
    ? h.encodeSourceCapsule(input)
    : d.family === 'spool'
      ? h.encodeSpoolEntry(input, f.route)
      : d.family === 'delivery'
        ? h.encodeDeliveryEntry(input, f.route, f.authority)
        : h.encodeInboundRecord(input);
export const decoder = (h, f, d, b) =>
  d.family === 'source'
    ? h.decodeSourceCapsule(b, f.route)
    : d.family === 'spool'
      ? h.decodeSpoolEntry(b, f.route)
      : d.family === 'delivery'
        ? h.decodeDeliveryEntry(b, f.route, f.authority)
        : h.decodeInboundRecord(b);
