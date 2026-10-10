// Builds the repo's plain-textarea + bare-CodeMirror control page into a scratch directory.
// Run with cwd = the scratch source copy.
import { build } from 'vite';
import { join } from 'node:path';
const out = process.argv[2];
await build({
  configFile: false,
  root: process.cwd(),
  base: '/control/',
  logLevel: 'error',
  build: {
    target: 'es2022',
    outDir: join(out, 'control'),
    emptyOutDir: true,
    rollupOptions: { input: 'test/latency/control.html' },
  },
});
console.log('control built');
