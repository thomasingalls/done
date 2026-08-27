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
 * **Every remote origin is a violation unless it is allowlisted, and it did not
 * used to be** (`S0-1`, `f-5bd9552-origin-scan-static-forms`). This failed on
 * seven literal fetch syntaxes — `src`, `href`, `url()`, `@import`, static and
 * dynamic imports, `importScripts` — and classified every other remote URL as a
 * non-failing *mention*, while printing *the key-holding origin is first-party
 * only*. So `fetch("https://third.example/code")`, a `WebSocket`, an
 * `EventSource`, a URL handed to `setAttribute`, a worker constructor, and
 * fetched-then-evaluated code all passed. A font link was the case it was
 * written for and the case it caught; the ones with worse consequences were
 * outside the list.
 *
 * **The allowlist was already empty, so the distinction never had a policy
 * behind it.** If no remote origin may be referenced at all, there is nothing
 * for *fetching* versus *mentioned* to decide — and this file already computed
 * the set of every remote origin it saw. Inverting the default deletes the
 * entire class of miss rather than extending the list by the syntaxes someone
 * happened to think of.
 *
 * **What it costs is one entry.** The current build references exactly one
 * remote origin, `http://www.w3.org`, and every occurrence is an XML namespace
 * identifier the DOM requires by name. That is a category rather than a party,
 * and the allowlist says which.
 *
 * **And the claim narrowed to the evidence.** What this proves is that no
 * literal remote URL appears in built output. A URL assembled from parts, or
 * code fetched and then evaluated, is invisible to any static scan — `originOf`
 * below already discards anything carrying JavaScript punctuation, which is
 * correct and is also the boundary of what can be proved here. **That residual
 * belongs to CSP** (`default-src 'self'`, `connect-src 'self'`), read back at
 * deployment, and §10.9 now says so rather than implying this check covered it.
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
const ALLOWED_ORIGINS = [
  {
    origin: 'http://www.w3.org',
    category: 'namespace-identifier',
    reason:
      'The SVG, MathML, xlink and xml namespace URIs, which the DOM requires by name and never fetches. ' +
      'React passes them to setAttributeNS and createElementNS. A name, not a party.',
  },
];

const allowed = new Set(ALLOWED_ORIGINS.map((a) => a.origin));

const SCANNED = new Set(['.html', '.js', '.mjs', '.css', '.webmanifest', '.json', '.svg']);

/**
 * Constructs that cause a fetch, kept only to say **how** a violation loads.
 *
 * These no longer decide *whether* something fails — every remote origin does.
 * They survive because "a `src` attribute in index.html" is a more useful line
 * to read than "a URL somewhere in this file", and a remote origin that matches
 * none of them is still reported, as `reference`.
 */
const FETCHING = [
  { what: 'src attribute', re: /\bsrc\s*=\s*["']?(https?:\/\/[^"'\s>)]+)/giu },
  { what: 'href attribute', re: /\bhref\s*=\s*["']?(https?:\/\/[^"'\s>)]+)/giu },
  { what: 'css url()', re: /\burl\(\s*["']?(https?:\/\/[^"')\s]+)/giu },
  { what: 'css @import', re: /@import\s+(?:url\()?\s*["'](https?:\/\/[^"']+)/giu },
  { what: 'import specifier', re: /\bfrom\s*["'](https?:\/\/[^"']+)["']/giu },
  { what: 'dynamic import', re: /\bimport\(\s*["'](https?:\/\/[^"']+)["']/giu },
  { what: 'importScripts', re: /\bimportScripts\(\s*["'](https?:\/\/[^"']+)["']/giu },
];

/**
 * Any absolute remote URL. **`ws`/`wss` are here because a mutation found them
 * missing**: inverting the default still left a `new WebSocket("wss://…")`
 * invisible, since the pattern only knew `http`. The scheme list is now the
 * thing to extend, and it is one place rather than seven.
 *
 * **What is still invisible, stated rather than discovered:** a protocol-relative
 * `//host/path`, a URL assembled from parts, and code fetched then evaluated.
 * The first is not matched because `//` in minified JavaScript is overwhelmingly
 * a comment; the other two cannot be matched by anything. That residual is CSP's.
 */
const ANY_URL = /(?:https?|wss?):\/\/[^"'\s<>)]+/giu;

/** A dotted name, or localhost. See `originOf`. */
const HOSTLIKE = /^(?:localhost|\[[0-9a-f:]+\]|[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/iu;

/**
 * Minified code splices URLs out of template literals, so a match can be a
 * fragment rather than a URL. A fragment is not a subresource and reporting it
 * as a mention is noise, so anything carrying JavaScript punctuation is
 * discarded rather than tuned around.
 */
const originOf = (url) => {
  if (/[`$+\\]/u.test(url)) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // A scheme named in a sentence is not an origin. The app's own code carries
  // "must be ws:// or wss://" in an error message, which parses as a URL whose
  // hostname is a comma -- so the host has to look like a host.
  //
  // **The heuristic is stated because it is one:** a dotless remote host, such
  // as an intranet name, is not matched. Nothing in a built web artifact
  // realistically has one, and a false positive here is how a check gets
  // switched off rather than fixed.
  if (!HOSTLIKE.test(parsed.hostname)) return null;
  return parsed.origin;
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
/** Which URLs a fetching construct explained, so the rest are not reported twice. */
const explained = new Set();

for (const name of files) {
  const text = readFileSync(join(DIST, name), 'utf8');

  for (const { what, re } of FETCHING) {
    for (const match of text.matchAll(re)) {
      const origin = originOf(match[1]);
      if (origin === null || allowed.has(origin)) continue;
      explained.add(`${name}\u0000${match[1]}`);
      violations.push({ name, what, url: match[1] });
    }
  }

  // Everything else. A remote origin here fails too -- the how is unknown, and
  // an unknown loading construct is the case this check was missing.
  for (const match of text.matchAll(ANY_URL)) {
    const origin = originOf(match[0]);
    if (origin === null || allowed.has(origin)) continue;
    if (explained.has(`${name}\u0000${match[0]}`)) continue;
    violations.push({ name, what: 'reference', url: match[0] });
  }

  // The allowlist's own traffic, counted so the exemption is visible rather than
  // silent. An entry nobody hits any more should be removed, and this is how
  // anyone would notice.
  for (const match of text.matchAll(ANY_URL)) {
    const origin = originOf(match[0]);
    if (origin === null || !allowed.has(origin)) continue;
    mentions.set(origin, (mentions.get(origin) ?? 0) + 1);
  }
}

console.log(`origin isolation: scanned ${files.length} built files`);
if (mentions.size > 0) {
  const listed = [...mentions.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  console.log(
    `  ${listed.length} allowlisted origin${listed.length === 1 ? '' : 's'}: ` +
      listed
        .map(([origin, n]) => {
          const entry = ALLOWED_ORIGINS.find((a) => a.origin === origin);
          return `${origin} (${n}, ${entry?.category ?? 'no category'})`;
        })
        .join(', '),
  );
}

// An allowlist entry that matches nothing is a permission nobody needs, and the
// next reader would take it as evidence the app talks to that origin.
const unused = ALLOWED_ORIGINS.filter((a) => !mentions.has(a.origin));
if (unused.length > 0) {
  console.error(
    `\norigin isolation: ${unused.length} allowlist entr${unused.length === 1 ? 'y matches' : 'ies match'} nothing in the build.\n` +
      'An exemption for an origin the build does not reference is a permission with no reason left.\n',
  );
  for (const a of unused) console.error(`  ${a.origin} — ${a.reason}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error(
    `\norigin isolation: ${violations.length} remote origin reference${violations.length === 1 ? '' : 's'} in built output.\n` +
      'TRD §10.9: same-origin code is inside the end-to-end boundary, so this adds a party to it.\n' +
      'If one of these is a name rather than a fetch, it belongs in ALLOWED_ORIGINS with its reason.\n',
  );
  for (const v of violations) console.error(`  ${v.name}: ${v.what} → ${v.url}`);
  process.exit(1);
}

// The claim is the size of its evidence (`S0-1`). A constructed URL or
// fetched-then-evaluated code is invisible to any static scan; that residual is
// CSP's -- `default-src 'self'`, `connect-src 'self'` -- read back at deployment.
console.log(
  '  no literal remote URL in built output, allowlisted namespace identifiers aside (§10.9, row 17 A1)',
);
