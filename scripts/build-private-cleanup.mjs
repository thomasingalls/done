/** Produces a pasteable private helper, outside dist/ and the service-worker cache. */
import { build } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const outDir = resolve('.dev/private-cleanup');
await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: resolve('private/cleanup.ts'),
      name: 'donePrivateCleanup',
      formats: ['iife'],
      fileName: () => 'helper.js',
    },
  },
});
const path = resolve(outDir, 'paste.js');
const helper = readFileSync(resolve(outDir, 'helper.js'), 'utf8');
writeFileSync(
  path,
  `(() => {
  if (!document.querySelector('.local-startup[data-state="unlock-required"]'))
    throw Error('Lock the Local workspace before running this helper.');
  if (document.getElementById('done-private-cleanup-frame')) throw Error('The cleanup helper is already open.');
  const frame = document.createElement('iframe');
  frame.id = 'done-private-cleanup-frame';
  frame.hidden = true;
  // A same-origin blob document gives the helper an isolated realm and the actual
  // source origin, with no server request and no application code in that realm.
  const url = URL.createObjectURL(new Blob(['<!doctype html><body></body>'], { type: 'text/html' }));
  frame.addEventListener('load', () => {
    URL.revokeObjectURL(url);
    const script = frame.contentDocument.createElement('script');
    script.textContent = ${JSON.stringify(helper)};
    frame.contentDocument.body.append(script);
  }, { once: true });
  frame.src = url;
  document.body.append(frame);
})();\n`,
);
const bytes = readFileSync(path);
console.log(
  JSON.stringify({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }),
);
console.log('Copy with: pbcopy < .dev/private-cleanup/paste.js');
