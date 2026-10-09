import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
export const origin = 'http://127.0.0.1:43101',
  other = 'http://127.0.0.1:43102';
export const sentinel = (id) => `cold.sentinel.${id}`;
export function fixtureServer(assets) {
  const hits = [];
  const write = (id) =>
    `localStorage.setItem(${JSON.stringify(sentinel(id))},'ran');fetch('/hit?id='+encodeURIComponent(${JSON.stringify(id)}));`;
  const workerWrite = (id) =>
    `new Promise((resolve,reject)=>{const r=indexedDB.open('cold-worker',1);r.onupgradeneeded=()=>r.result.createObjectStore('events');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result,t=d.transaction('events','readwrite');t.onabort=()=>reject(t.error);t.objectStore('events').put('ran',${JSON.stringify(id)});t.oncomplete=()=>{d.close();fetch(${JSON.stringify(origin + '/hit?id=')}+encodeURIComponent(${JSON.stringify(id)})).then(resolve,reject)}}})`;
  const handler = (req, res) => {
    const u = new URL(req.url, origin),
      id = u.searchParams.get('id') ?? 'default';
    hits.push({
      path: u.pathname,
      id,
      ...(u.pathname === '/error'
        ? { message: u.searchParams.get('message')?.slice(0, 1000) }
        : {}),
    });
    res.setHeader('Cache-Control', 'no-store');
    if (u.pathname === '/hit') {
      res.end('ok');
      return;
    }
    if (u.pathname === '/worker.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(workerWrite(id) + ';self.onconnect=()=>{};');
      return;
    }
    if (u.pathname === '/sentinel-sw.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.end(
        `self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/sw-trigger'){e.waitUntil(${workerWrite('sw-fetch')})}});self.addEventListener('sync',e=>{e.waitUntil(${workerWrite('sw-sync')})});`,
      );
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    if (['/inert', '/sw-trigger'].includes(u.pathname)) {
      res.end('<title>Inert storage context</title>');
      return;
    }
    if (u.pathname === '/deferred') {
      res.end(`<meta http-equiv="refresh" content="1;url=/probe?id=${encodeURIComponent(id)}">`);
      return;
    }
    if (u.pathname === '/probe') {
      res.end(
        `<title>First script probe</title><script>${write(id)}addEventListener('pageshow',e=>localStorage.setItem('cold.history.'+${JSON.stringify(id)},e.persisted?'bfcache':'load'))</script>`,
      );
      return;
    }
    if (u.pathname === '/embed') {
      const kind = u.searchParams.get('kind'),
        url = origin + '/probe?id=' + encodeURIComponent(id);
      if (kind === 'srcdoc')
        res.end(
          `<iframe srcdoc="&lt;script&gt;${write(id).replaceAll('"', '&quot;')}&lt;/script&gt;"></iframe>`,
        );
      else if (kind === 'blank')
        res.end(
          `<iframe id="f" src="about:blank"></iframe><script>f.contentDocument.write(${JSON.stringify('<script>' + write(id) + '</script>').replaceAll('</', '<\\/')})</script>`,
        );
      else res.end(`<iframe src="${url}"></iframe>`);
      return;
    }
    if (u.pathname === '/spawn') {
      const kind = u.searchParams.get('kind'),
        url = origin + '/worker.js?id=' + encodeURIComponent(id);
      const expression =
        kind === 'shared'
          ? `new SharedWorker(${JSON.stringify(url)}).port.start()`
          : kind === 'blob'
            ? `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(`importScripts(${JSON.stringify(url)})`)}],{type:'text/javascript'})))`
            : `new Worker(${JSON.stringify(url)})`;
      res.end(
        `<script>const w=${expression};if(w)w.onerror=e=>fetch('/error?id='+encodeURIComponent(${JSON.stringify(id)})+'&message='+encodeURIComponent(e.message));</script>`,
      );
      return;
    }
    if (u.pathname === '/old-asset') {
      const html = readFileSync(join(assets, 'old-dist/index.html'), 'utf8');
      const entry = html.match(/src="([^"]+\.js)"/u)?.[1];
      res.end(`<div id="root"></div><script type="module" src="${entry}"></script>`);
      return;
    }
    const path = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
    if (path.split('/').includes('..')) {
      res.writeHead(400).end();
      return;
    }
    for (const dir of ['fixture-dist', 'old-dist'])
      try {
        const bytes = readFileSync(join(assets, dir, path));
        res.setHeader(
          'Content-Type',
          {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.wasm': 'application/wasm',
            '.svg': 'image/svg+xml',
            '.webmanifest': 'application/manifest+json',
          }[extname(path)] ?? 'text/html',
        );
        res.end(bytes);
        return;
      } catch {
        /* next fixture root */
      }
    res.writeHead(404).end();
  };
  const servers = [createServer(handler), createServer(handler)];
  for (const server of servers)
    server.on('upgrade', (req, socket) => {
      hits.push({ path: 'websocket-upgrade', url: req.url });
      socket.end(
        'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
    });
  return {
    hits,
    async start() {
      await Promise.all(
        servers.map((s, i) => new Promise((r) => s.listen(43101 + i, '127.0.0.1', r))),
      );
    },
    async close() {
      await Promise.all(
        servers.map(
          (s) =>
            new Promise((r) => {
              s.closeAllConnections();
              s.close(r);
            }),
        ),
      );
    },
  };
}
