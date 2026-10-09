import { build } from 'vite';
import { resolve } from 'node:path';
import * as Y from 'yjs';
export const controls = {
  keyLabel: [
    'src/crdt/promotionGenesis.ts',
    "fields('done/checkpoint/v1', workspace)",
    'fields(workspace)',
  ],
  keyWorkspace: [
    'src/crdt/promotionGenesis.ts',
    "fields('done/checkpoint/v1', workspace)",
    "fields('done/checkpoint/v1')",
  ],
  startupWorkspace: [
    'src/crdt/accountStartup.ts',
    "fields('done/checkpoint/v1', scope.workspaceId)",
    "fields('done/checkpoint/v1')",
  ],
  aadLabel: [
    'account-protocol/genesis.ts',
    "lp('done/cp/v1', '1', c.workspaceId, String(c.generation), String(c.proposedEpoch))",
    "lp('1', c.workspaceId, String(c.generation), String(c.proposedEpoch))",
  ],
  aadVersion: [
    'account-protocol/genesis.ts',
    "lp('done/cp/v1', '1', c.workspaceId, String(c.generation), String(c.proposedEpoch))",
    "lp('done/cp/v1', c.workspaceId, String(c.generation), String(c.proposedEpoch))",
  ],
  aadWorkspace: [
    'account-protocol/genesis.ts',
    "lp('done/cp/v1', '1', c.workspaceId, String(c.generation), String(c.proposedEpoch))",
    "lp('done/cp/v1', '1', String(c.generation), String(c.proposedEpoch))",
  ],
  aadGeneration: [
    'account-protocol/genesis.ts',
    "lp('done/cp/v1', '1', c.workspaceId, String(c.generation), String(c.proposedEpoch))",
    "lp('done/cp/v1', '1', c.workspaceId, String(c.proposedEpoch))",
  ],
  aadEpoch: [
    'account-protocol/genesis.ts',
    "lp('done/cp/v1', '1', c.workspaceId, String(c.generation), String(c.proposedEpoch))",
    "lp('done/cp/v1', '1', c.workspaceId, String(c.generation))",
  ],
  selectedCoverage: ['src/crdt/accountStartup.ts', '!sameDocState(doc, checkpoint)', 'false'],
  activeCoverage: ['src/crdt/accountStartup.ts', '!coversGenesis(doc, checkpoint)', 'false'],
};
export async function bundle(control, native = false) {
  let hits = 0,
    exported = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'checkpoint-test-access',
        enforce: 'pre',
        transform(code, id) {
          if (id.endsWith('/src/crdt/promotionGenesis.ts')) {
            const anchor = 'const checkpointKey =';
            if (code.split(anchor).length !== 2) throw Error('Private checkpoint helper moved');
            code = code.replace(anchor, 'export ' + anchor);
            exported++;
          }
          if (control) {
            const [file, from, to] = controls[control];
            if (id.endsWith('/' + file)) {
              if (code.split(from).length !== 2) throw Error('Moved control ' + control);
              hits++;
              code = code.replace(from, to);
            }
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
        : { rollupOptions: { external: ['yjs'], output: { globals: { yjs: 'CheckpointYjs' } } } }),
      lib: {
        entry: resolve(
          'test/account-checkpoint-contract/' + (native ? 'native-browser.ts' : 'browser.ts'),
        ),
        name: 'CheckpointContract',
        formats: ['iife'],
      },
    },
  });
  if (exported !== 1 || (control && hits !== 1)) throw Error('Source control did not execute');
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
export const load = async (control) =>
  Function('CheckpointYjs', (await bundle(control)) + ';return CheckpointContract;')(Y);
