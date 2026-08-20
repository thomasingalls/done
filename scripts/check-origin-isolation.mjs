/**
 * Origin isolation of the built application (TRD §10.9, §15 row 17).
 *
 * §10.9's first named control is **no unreviewed third-party script in the
 * key-holding origin**, and it is the strongest one available: same-origin code
 * is inside the end-to-end boundary, so a resource fetched from somewhere else
 * is not a performance decision but a party added to the trust boundary.
 *
 * This runs as part of `npm run build` and exits non-zero, for
 * check-budget.mjs's reason: it is a threshold rather than an aspiration, and
 * the realistic regression is a font link or an analytics snippet added by
 * someone who did not read §10.9.
 *
 * **It scans the built output rather than the source**, because that is what
 * actually ships. A dependency that injects a CDN URL at build time is exactly
 * the case a source scan misses and this one catches.
 *
 * Absolute URLs are not all fetches — a spec link in a comment is not a
 * subresource — so what fails the build is a *fetching* construct: an `src` or
 * `href` attribute, a CSS `url()` or `@import`, or a bare import specifier,
 * naming a remote origin. Everything else is reported and does not fail, so the
 * output stays readable rather than being tuned into silence.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = 'dist';

/**
 * Remote origins the built app may reference at all. Empty, and it is meant to
 * be: every asset is first-party, the fonts are system fonts (§8.3), and the
 * wasm module is inlined (§13.10). An addition here is a change to the trust
 * boundary and belongs in §10.9 before it belongs in this list.
 */
const ALLOWED_ORIGINS = [];

const SCANNED = new Set(['.html', '.js', '.mjs', '.css', '.webmanifest', '.json', '.svg']);

/** Constructs that cause a fetch. A URL outside one of these is a mention, not a subresource. */
const FETCHING = [
  { what: 'src attribute', re: /\bsrc\s*=\s*["']?(https?:\/\/[^"'\s>)]+)/giu },
  { what: 'href attribute', re: /\bhref\s*=\s*["']?(https?:\/\/[^"'\s>)]+)/giu },
  { what: 'css url()', re: /\burl\(\s*["']?(https?:\/\/[^"')\s]+)/giu },
  { what: 'css @import', re: /@import\s+(?:url\()?\s*["'](https?:\/\/[^"']+)/giu },
  { what: 'import specifier', re: /\bfrom\s*["'](https?:\/\/[^"']+)["']/giu },
  { what: 'dynamic import', re: /\bimport\(\s*["'](https?:\/\/[^"']+)["']/giu },
  { what: 'importScripts', re: /\bimportScripts\(\s*["'](https?:\/\/[^"']+)["']/giu },
];

const ANY_URL = /https?:\/\/[^"'\s<>)]+/giu;

/**
 * Minified code splices URLs out of template literals, so a match can be a
 * fragment rather than a URL. A fragment is not a subresource and reporting it
 * as a mention is noise, so anything carrying JavaScript punctuation is
 * discarded rather than tuned around.
 */
const originOf = (url) => {
  if (/[`$+\\]/u.test(url)) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

statSync(DIST); // fail loudly if the build has not run

const files = readdirSync(DIST, { recursive: true })
  .map(String)
  .filter((name) => SCANNED.has(extname(name)))
  .filter((name) => statSync(join(DIST, name)).isFile())
  .sort();

if (files.length === 0) {
  console.error('origin isolation: found nothing to scan in dist/ — has the build run?');
  process.exit(1);
}

const violations = [];
const mentions = new Map();

for (const name of files) {
  const text = readFileSync(join(DIST, name), 'utf8');

  for (const { what, re } of FETCHING) {
    for (const match of text.matchAll(re)) {
      const origin = originOf(match[1]);
      if (origin === null || ALLOWED_ORIGINS.includes(origin)) continue;
      violations.push({ name, what, url: match[1] });
    }
  }

  for (const match of text.matchAll(ANY_URL)) {
    const origin = originOf(match[0]);
    if (origin === null || ALLOWED_ORIGINS.includes(origin)) continue;
    mentions.set(origin, (mentions.get(origin) ?? 0) + 1);
  }
}

console.log(`origin isolation: scanned ${files.length} built files`);
if (mentions.size > 0) {
  const listed = [...mentions.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  console.log(
    `  ${listed.length} remote origin${listed.length === 1 ? '' : 's'} mentioned but not fetched: ` +
      listed.map(([origin, n]) => `${origin} (${n})`).join(', '),
  );
}

if (violations.length > 0) {
  console.error(
    `\norigin isolation: ${violations.length} subresource${violations.length === 1 ? '' : 's'} fetched from outside the origin.\n` +
      'TRD §10.9: same-origin code is inside the end-to-end boundary, so this adds a party to it.\n',
  );
  for (const v of violations) console.error(`  ${v.name}: ${v.what} → ${v.url}`);
  process.exit(1);
}

console.log('  no remote subresources; the key-holding origin is first-party only (§10.9)');
