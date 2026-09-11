import { build } from 'vite';
import { resolve } from 'node:path';
export const controls = {
  principal: ['contentRecord.ts', '    scope.principalId,', ''],
  sequence: ['contentRecord.ts', '    String(r.seq),', ''],
  kind: ['contentRecord.ts', '    r.kind,', ''],
  journalWorkspace: [
    'journalCodec.ts',
    "fields('done/jrnl/v1', workspaceId, String(generation), storageKey)",
    "fields('done/jrnl/v1', String(generation), storageKey)",
  ],
  journalGeneration: [
    'journalCodec.ts',
    "fields('done/jrnl/v1', workspaceId, String(generation), storageKey)",
    "fields('done/jrnl/v1', workspaceId, storageKey)",
  ],
  journalIdentity: [
    'journalCodec.ts',
    "fields('done/jrnl/v1', workspaceId, String(generation), storageKey)",
    "fields('done/jrnl/v1', workspaceId, String(generation))",
  ],
  custodyStore: [
    'custody.ts',
    "fields('done/store/v1', scope.workspaceId, record.store_id)",
    "fields('done/store/v1', scope.workspaceId)",
  ],
  canonicalBase64: ['journalCodec.ts', 'if (btoa(binary) !== encoded)', 'if (false)'],
};
export async function bundle(control, native = false) {
  let hits = 0;
  const r = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'store-controls',
            enforce: 'pre',
            transform(code, id) {
              const [file, from, to] = controls[control];
              if (!id.endsWith('/src/crdt/' + file)) return;
              if (code.split(from).length !== 2) throw Error('Moved control anchor: ' + control);
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
          'test/account-store-contract/' + (native ? 'native-browser.ts' : 'browser.ts'),
        ),
        name: 'StoreContract',
        formats: ['iife'],
      },
    },
  });
  if (control && hits !== 1) throw Error('Control not exercised: ' + control);
  return (Array.isArray(r) ? r[0] : r).output.find((f) => f.type === 'chunk').code;
}
export const load = async (control) =>
  Function((await bundle(control)) + ';return StoreContract;')();
