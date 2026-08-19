/**
 * Serve the journal benchmark to a real device (TRD §12, §15 row 2).
 *
 * **What this exists to produce, and why nothing else can.** The Playwright
 * suite measures the journal write on a desktop and under a 4× CPU throttle.
 * The budget is a **p95 of one write**, and a CPU throttle cannot supply that
 * statistic: it stalls the thread rather than modelling a slower core, so its
 * stalls land inside individually-timed operations and become the tail. The
 * plaintext level demonstrates this by showing the same tail inflation while
 * performing no cryptography at all. So the one number still missing has to come
 * from unthrottled hardware, and this is the cheapest way to reach some.
 *
 * **Two routes to the phone, and both need a trustworthy origin.** Cross-origin
 * isolation is what buys Chrome's 5 µs clock instead of 100 µs, and a 12 µs
 * write is invisible at the latter — but COOP is ignored on an origin the
 * browser does not consider potentially trustworthy, which a plain-HTTP LAN
 * address is not. So either:
 *
 *   - `adb reverse tcp:<port> tcp:<port>`, and open `http://localhost:<port>` on
 *     the phone. localhost *is* trustworthy, so no certificate is involved.
 *   - `tailscale serve --bg <port>`, and open the MagicDNS URL. Tailscale
 *     terminates TLS with a real certificate and passes these headers through.
 *
 * The page reports whether it got the fine clock before it will claim anything,
 * so a misconfigured route is visible rather than silently producing a tail made
 * of quantization.
 *
 * Usage: node scripts/bench-journal-device.mjs [--port 4180]
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = join(root, 'test-results', 'latency.jsonl');

const argument = (name, fallback) => {
  const at = process.argv.indexOf(name);
  if (at === -1) return fallback;
  const value = process.argv[at + 1];
  if (!value) throw new Error(`${name} needs a value`);
  return value;
};

const port = Number(argument('--port', '4180'));
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('--port must be a TCP port');

/** Bundle one device entry, which imports the same modules the spec measures. */
const bundle = async (entryFile, name) => {
  const output = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: join(root, entryFile),
        formats: ['iife'],
        name,
        fileName: () => 'device.js',
      },
    },
  });
  const chunks = (Array.isArray(output) ? output : [output]).flatMap((one) => one.output);
  const entry = chunks.find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
  if (!entry?.code) throw new Error(`no entry chunk in the ${name} bundle`);
  return entry.code;
};

/**
 * The vector the cipher page checks its candidates against.
 *
 * Served from the published file rather than inlined into the page, so the check
 * is against what the generator actually publishes. A copy would be one more
 * thing that can quietly stop matching, which is the failure this whole vector
 * discipline exists to prevent.
 */
const vector = () => {
  const file = join(root, 'test/vectors/journal-aead.json');
  const found = JSON.parse(readFileSync(file, 'utf8')).vectors.find(
    (one) => one.name === 'keystroke-update',
  );
  if (!found) throw new Error('the keystroke-update vector is missing');
  // The record is "2:" || base64(u32be(gen) || nonce[24] || ct); the candidates
  // produce the ciphertext alone, so the expectation is decoded back out of it.
  const raw = Buffer.from(found.expected.record.slice(2), 'base64');
  return {
    k_journal: found.derived.k_journal,
    nonce: found.inputs.nonce,
    aad: found.derived.aad,
    plaintext: found.inputs.plaintext,
    ciphertext: raw.subarray(4 + 24).toString('hex'),
  };
};

const page = (script) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>done — journal benchmark</title>
</head><body>
<script type="module">${script}</script>
</body></html>
`;

/**
 * The headers that buy the fine clock.
 *
 * `require-corp` is safe here because the page loads nothing cross-origin: the
 * benchmark is inlined and there are no images, fonts or fetches outbound.
 */
const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cache-Control': 'no-store',
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      // A benchmark result is a few kilobytes. Anything larger is not one.
      if (body.length > 1_000_000) reject(new Error('result body too large'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

const recordRows = (payload) => {
  mkdirSync(dirname(RESULTS), { recursive: true });
  const { project, rows, userAgent, isolated, resolutionMs } = payload;
  if (typeof project !== 'string' || !Array.isArray(rows)) throw new Error('malformed results');

  for (const row of rows) {
    appendFileSync(
      RESULTS,
      `${JSON.stringify({
        project,
        metric: row.metric,
        value: row.mean,
        samples: row.perBatch,
        note: `${row.note}${row.tail ? ` ${(row.tail * 1000).toFixed(1)} µs` : ''}; ${userAgent}; ${
          isolated ? 'cross-origin isolated' : 'NOT isolated — tail unusable'
        }, clock ${Number(resolutionMs).toFixed(3)} ms`,
      })}\n`,
    );
  }
  return rows.length;
};

const journalHtml = page(
  await bundle('test/latency/journal-bench.device.ts', 'journalBenchDevice'),
);
const cipherHtml = page(await bundle('test/latency/cipher-bench.device.ts', 'cipherBenchDevice'));
const vectorJson = JSON.stringify(vector());

const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/results') {
    void readBody(request)
      .then((body) => {
        const written = recordRows(JSON.parse(body));
        console.log(`Recorded ${written} rows to test-results/latency.jsonl`);
        response.writeHead(204, { 'Cache-Control': 'no-store' }).end();
      })
      .catch((error) => {
        console.error(`Refused a result: ${error.message}`);
        response.writeHead(400, { 'Cache-Control': 'no-store' }).end();
      });
    return;
  }

  if (request.method === 'GET' && request.url === '/vector') {
    response
      .writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...ISOLATION })
      .end(vectorJson);
    return;
  }

  if (request.method === 'GET') {
    const body = request.url?.startsWith('/cipher') ? cipherHtml : journalHtml;
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...ISOLATION }).end(body);
    return;
  }

  response.writeHead(405, { 'Cache-Control': 'no-store' }).end();
});

server.listen(port, '0.0.0.0', () => {
  console.log(`\nJournal benchmark served on port ${port}.\n`);
  console.log('Reach it from the phone with a trustworthy origin — one of:\n');
  console.log(`  adb reverse tcp:${port} tcp:${port}   then open  http://localhost:${port}`);
  console.log(`  tailscale serve --bg ${port}          then open the MagicDNS URL\n`);
  console.log(`  /          the journal write, by level and payload`);
  console.log(`  /cipher    which XChaCha20-Poly1305 implementation\n`);
  console.log('Each page says whether it got the fine clock before it measures.');
  console.log('Results post back here and land in test-results/latency.jsonl.\n');
  console.log('Ctrl-C when the phone reports "Recorded".\n');
});
