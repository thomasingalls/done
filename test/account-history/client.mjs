import { build } from 'vite';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    rollupOptions: { output: { codeSplitting: false } },
    lib: {
      entry: resolve('test/account-history/client-entry.ts'),
      formats: ['es'],
    },
  },
});
const dir = mkdtempSync(join(tmpdir(), 'done-history-replay-')),
  path = join(dir, 'client.mjs');
writeFileSync(
  path,
  (Array.isArray(built) ? built[0] : built).output.find((o) => o.type === 'chunk').code,
);
process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
export const client = await import(pathToFileURL(path).href);
