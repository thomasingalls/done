/**
 * What a WASM seal costs the bundle, measured through the bundler (§12, §15 row 2).
 *
 * Replicates docs/performance.md's method: bundle one entry that imports a single
 * sealing function, minified, so the tree-shaker has every chance — then gzip. An
 * `ls -l` on a package directory measures something nobody ships.
 */

import { gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Inside the repo, because the entries import from node_modules and a tmpdir
// outside the project cannot resolve them.
const scratch = mkdtempSync(join(root, '.seal-size-'));

/* Each entry seals once and publishes the result, so nothing can be shaken away. */
const ENTRIES = {
  '@noble/ciphers (ships today)': `
    import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
    globalThis.out = (k, n, a, p) => xchacha20poly1305(k, n, a).encrypt(p);`,
  '@stablelib/xchacha20poly1305': `
    import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305';
    globalThis.out = (k, n, a, p) => new XChaCha20Poly1305(k).seal(n, p, a);`,
  'libsodium-wrappers': `
    import sodium from 'libsodium-wrappers';
    globalThis.out = (k, n, a, p) =>
      sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(p, a, null, n, k);`,
  'journal-seal (Rust wasm, inlined)': `
    import { createJournalSeal } from '${join(root, 'wasm/journal-seal/seal.generated.ts')}';
    const s = createJournalSeal();
    globalThis.out = (k, n, a, p) => s.seal(k, n, a, p);`,
};

/*
 * Resolve bare specifiers through Node.
 *
 * This repo is checked out as a git worktree, whose `node_modules` lives in the
 * parent checkout. Node's resolution walks up to find it and rolldown's does not,
 * so without this the measurement simply cannot run here — which would be a
 * property of the checkout rather than of the bundle.
 */
const resolveFrom = createRequire(join(root, 'package.json'));
const nodeResolve = {
  name: 'node-resolve-fallback',
  resolveId(source) {
    if (source.startsWith('.') || source.startsWith('/') || source.startsWith('\0')) return null;
    try {
      return resolveFrom.resolve(source);
    } catch {
      return null;
    }
  },
};

const rows = [];
const skipped = [];
for (const [name, source] of Object.entries(ENTRIES)) {
  const needs = source.match(/from '([^'.][^']*)'/u)?.[1];
  if (needs && !needs.startsWith('/')) {
    try {
      resolveFrom.resolve(needs);
    } catch {
      skipped.push(`${name} — ${needs} is not installed`);
      continue;
    }
  }
  const entry = join(scratch, `${name.replace(/\W/gu, '_')}.js`);
  writeFileSync(entry, source);
  const output = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [nodeResolve],
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      lib: { entry, formats: ['es'], fileName: () => 'out.js' },
    },
  });
  const chunks = (Array.isArray(output) ? output : [output]).flatMap((o) => o.output);
  const code = chunks
    .filter((c) => c.type === 'chunk')
    .map((c) => c.code)
    .join('');
  const assets = chunks
    .filter((c) => c.type === 'asset')
    .reduce((n, a) => n + Buffer.byteLength(a.source), 0);
  rows.push({
    name,
    minified: Buffer.byteLength(code) + assets,
    gzipped: gzipSync(Buffer.from(code), { level: 9 }).length + assets,
    separateAssets: assets,
  });
}

const HEADROOM = 43_700;
console.log(
  `\n${'Implementation'.padEnd(36)}${'minified'.padStart(11)}${'gzipped'.padStart(11)}   against 43.7 kB of headroom`,
);
for (const row of rows) {
  const kb = (n) => `${(n / 1000).toFixed(1)} kB`;
  const verdict =
    row.gzipped > HEADROOM
      ? `${(row.gzipped / HEADROOM).toFixed(1)}× the entire headroom`
      : `fits, ${kb(HEADROOM - row.gzipped)} to spare`;
  console.log(
    `${row.name.padEnd(36)}${kb(row.minified).padStart(11)}${kb(row.gzipped).padStart(11)}   ${verdict}`,
  );
}
if (skipped.length > 0) {
  console.log('Not measured here:');
  for (const one of skipped) console.log(`  ${one}`);
}
console.log();
rmSync(scratch, { recursive: true, force: true });
