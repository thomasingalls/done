import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { build } from 'vite';

export const predecessor = '7d238eecec4fe760f026ce1b68f3ca5603a9086a';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
export async function assets(root, output) {
  const snapshot = join(output, 'predecessor'),
    oldDist = join(output, 'old-dist'),
    fixtureDist = join(output, 'fixture-dist');
  mkdirSync(snapshot, { recursive: true });
  const archive = execFileSync(
    'git',
    [
      'archive',
      predecessor,
      'src',
      'public',
      'index.html',
      'vite',
      'vite.config.ts',
      'package.json',
      'pnpm-lock.yaml',
      'wasm/journal-seal/seal.generated.ts',
    ],
    { cwd: root, maxBuffer: 64 * 1024 * 1024 },
  );
  execFileSync('tar', ['-xf', '-', '-C', snapshot], { input: archive });
  await build({
    root: snapshot,
    configFile: join(snapshot, 'vite.config.ts'),
    logLevel: 'error',
    define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(predecessor.slice(0, 7)) },
    build: { outDir: oldDist, emptyOutDir: true },
  });
  await build({
    root,
    configFile: false,
    logLevel: 'error',
    resolve: { alias: { '@predecessor': join(snapshot, 'src/crdt') } },
    build: {
      outDir: fixtureDist,
      emptyOutDir: true,
      rolldownOptions: {
        input: ['index', 'seed', 'writer', 'broadcast'].map((name) =>
          join(root, `test/legacy-host/${name}.html`),
        ),
      },
    },
  });
  const files = Object.fromEntries(
    [...walk(oldDist), ...walk(fixtureDist)].map((p) => [
      p.slice(output.length + 1),
      sha(readFileSync(p)),
    ]),
  );
  const hits = [];
  const upgrades = [];
  const entry = readFileSync(join(oldDist, 'index.html'), 'utf8').match(/src="([^"]+\.js)"/u)?.[1];
  if (!entry) throw Error('Missing pinned production entry');
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost'),
      path = url.pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (path === '/probe-hit') {
      hits.push(url.searchParams.get('id'));
      response.end('ok');
      return;
    }
    if (path.startsWith('/probe/')) {
      const id = JSON.stringify(url.searchParams.get('id') ?? 'probe');
      const hit = `fetch(location.origin+'/probe-hit?id='+encodeURIComponent(${id}))`;
      if (path === '/probe/old-asset.html') {
        response.setHeader('Content-Type', 'text/html');
        response.end(`<div id="root"></div><script type="module" src="${entry}"></script>`);
      } else if (path === '/probe/worker.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(
          `const request=indexedDB.open('preflight-worker-probe',1);request.onupgradeneeded=()=>request.result.createObjectStore('events');request.onsuccess=()=>{const db=request.result,tx=db.transaction('events','readwrite');tx.objectStore('events').put('first-line',${id});tx.oncomplete=()=>{db.close();${hit}}};onconnect=e=>e.ports[0].postMessage('connected');`,
        );
      } else {
        response.setHeader('Content-Type', 'text/html');
        response.end(
          `<script>localStorage.setItem('preflight.sentinel.'+${id},'first-line');${hit};addEventListener('pageshow',e=>localStorage.setItem('preflight.history.'+${id},e.persisted?'bfcache':'load'))</script>`,
        );
      }
      return;
    }
    const relative = path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
    if (relative.split('/').includes('..')) {
      response.writeHead(400).end();
      return;
    }
    let bytes;
    for (const dir of [fixtureDist, oldDist]) {
      try {
        bytes = readFileSync(resolve(dir, relative));
        break;
      } catch {
        /* next pinned root */
      }
    }
    if (!bytes) {
      response.writeHead(404).end();
      return;
    }
    const type =
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.webmanifest': 'application/manifest+json',
        '.wasm': 'application/wasm',
      }[extname(relative)] ?? 'application/octet-stream';
    response.setHeader('Content-Type', type);
    response.end(bytes);
  });
  server.on('upgrade', (_request, socket) => {
    upgrades.push(Date.now());
    socket.end(
      'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
    );
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    hits,
    upgrades,
    files,
    oldDist,
    close: () =>
      new Promise((resolveClose) => {
        server.closeAllConnections();
        server.close(resolveClose);
      }),
  };
}
