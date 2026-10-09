import { build } from 'vite';
import { resolve } from 'node:path';
import * as Y from 'yjs';
export const controls = {
  keySlot: ['src/crdt/localGenesisRecord.ts', '          claim.initial.slot_id,\n', ''],
  keyRoot: ['src/crdt/localGenesisRecord.ts', '          claim.initial.root_id,\n', ''],
  initialMac: [
    'src/crdt/localGenesisRecord.ts',
    "fields('done/local-genesis-progress/v1', hex(claim.initial.mac), claim.stage)",
    "fields('done/local-genesis-progress/v1', claim.stage)",
  ],
  stage: [
    'src/crdt/localGenesisRecord.ts',
    "fields('done/local-genesis-progress/v1', hex(claim.initial.mac), claim.stage)",
    "fields('done/local-genesis-progress/v1', hex(claim.initial.mac))",
  ],
  selectionMac: ['src/crdt/localGenesisRecord.ts', '            p.selectionMac,\n', ''],
  cleanupNext: ['src/crdt/legacyCleanupRecord.ts', '    r.next,\n', ''],
  cleanupDigest: [
    'src/crdt/legacyCleanupRecord.ts',
    'r.entries.map((e) => [e.key, e.digest])',
    'r.entries.map((e) => [e.key])',
  ],
  claimMac: [
    'src/crdt/localGenesisRecord.ts',
    "stopStartup('repair-required', 'local-progress-authentication-failed');",
    'void 0;',
  ],
};
export const barriers = {
  clear: [
    'src/crdt/localClearCrypto.ts',
    'export const clearAuthenticator = async (task: SessionTask, r: LocalClearRecord, code: string) => {',
  ],
  import: [
    'src/crdt/legacyImportRecord.ts',
    '  let root: Bytes | undefined, factor: Bytes | undefined;',
  ],
  source: ['src/crdt/legacySource.ts', '  const local = readLegacyLocal(task);'],
  fingerprint: [
    'src/crdt/legacyCleanupRecord.ts',
    '  let root: Bytes | undefined, factor: Bytes | undefined, key: CryptoKey | undefined;',
  ],
};
export async function bundle(control, native = false) {
  let hits = 0;
  const r = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'local-provenance-controls',
        enforce: 'pre',
        transform(code, id) {
          const edits =
            control === 'barriers'
              ? Object.entries(barriers).map(([name, [file, from]]) => [
                  file,
                  from,
                  name === 'clear'
                    ? from + `\nthrow Error('D8 excluded call: ${name}');`
                    : `throw Error('D8 excluded call: ${name}');\n` + from,
                ])
              : control
                ? [controls[control]]
                : [];
          for (const [file, from, to] of edits)
            if (id.endsWith('/' + file)) {
              if (code.split(from).length !== 2) throw Error('Missing control anchor ' + file);
              hits++;
              code = code.replace(from, to);
            }
          return code;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      ...(native
        ? {}
        : { rollupOptions: { external: ['yjs'], output: { globals: { yjs: 'ProvenanceYjs' } } } }),
      lib: {
        entry: resolve(
          'test/account-local-provenance/' + (native ? 'native-browser.ts' : 'browser.ts'),
        ),
        name: 'LocalProvenance',
        formats: ['iife'],
      },
    },
  });
  if (hits !== (control === 'barriers' ? 4 : control ? 1 : 0))
    throw Error('Control did not execute');
  return (Array.isArray(r) ? r[0] : r).output.find((x) => x.type === 'chunk').code;
}
export const load = async (c) =>
  Function('ProvenanceYjs', (await bundle(c)) + ';return LocalProvenance;')(Y);
export const typed = (v) =>
  v instanceof Uint8Array
    ? v.slice()
    : Array.isArray(v)
      ? v.map(typed)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v).map(([k, x]) => [
              k,
              ['mac', 'salt', 'nonce', 'ct', 'publicKey'].includes(k) && typeof x === 'string'
                ? new Uint8Array(Buffer.from(x, 'hex'))
                : typed(x),
            ]),
          )
        : v;
export const task = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
