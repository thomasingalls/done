import { build } from 'vite';
import { resolve } from 'node:path';
export const controls = {
  stateCoercion: [
    'custodyRecord.ts',
    "(r['state'] !== 'creating' && r['state'] !== 'protected')",
    "!['creating', 'protected'].includes(String(r['state']))",
  ],
  credentialId: ['custodyCrypto.ts', '    id,\n    hex(publicKey),', '    hex(publicKey),'],
  signingPair: [
    'custodyCrypto.ts',
    "if (!(await subtle.verify('Ed25519', publicKey, sig, challenge)))",
    "if (false && !(await subtle.verify('Ed25519', publicKey, sig, challenge)))",
  ],
  wrappingPair: ['custodyCrypto.ts', 'if (!a.every((n, i) => n === b![i]))', 'if (false)'],
  metadataCount: ['custodyRecord.ts', '      r.seal_reserved,', ''],
  metadataKeySlot: [
    'custodyRecord.ts',
    "fields('done/custody-metadata/v2', r.slot_id, r.principal_id, r.workspace_id, r.root_id)",
    "fields('done/custody-metadata/v2', r.principal_id, r.workspace_id, r.root_id)",
  ],
  equalMac: ['custodyRecord.ts', ' && hex(a.mac) === hex(b.mac)', ''],
  privateFormat: [
    'custodyCrypto.ts',
    'privateBytes.length !== 48 ||\n      !privateBytes.subarray(0, 16).every((b, i) => b === prefixOf(role)[i])',
    'false',
  ],
  exportCleanup: ['custodyCrypto.ts', '    privateBytes.fill(0);', ''],
  openCleanup: ['custodyCrypto.ts', '    raw.fill(0);\n    pkcs8.fill(0);', ''],
  metadataAuth: [
    'custody.ts',
    '          record,\n          guardedSubtle(() => task.step(() => {})),\n        ),',
    '          record,\n          guardedSubtle(() => task.step(() => {})),\n        ).catch(() => {}),',
  ],
};
export async function bundle(control, native = false) {
  let hits = 0;
  const r = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'custody-controls',
            enforce: 'pre',
            transform(code, id) {
              const [file, from, to] = controls[control];
              if (!id.endsWith('/src/crdt/' + file)) return;
              if (code.split(from).length !== 2) throw Error('Moved control anchor ' + control);
              hits++;
              return code.replace(from, to);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve(
          'test/account-local-custody/' + (native ? 'native-browser.ts' : 'browser.ts'),
        ),
        name: 'LocalCustodyContract',
        formats: ['iife'],
      },
    },
  });
  if (control && hits !== 1) throw Error('Control did not execute ' + control);
  return (Array.isArray(r) ? r[0] : r).output.find((f) => f.type === 'chunk').code;
}
export const load = async (control) =>
  Function((await bundle(control)) + ';return LocalCustodyContract;')();
