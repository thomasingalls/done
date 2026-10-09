import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

/** Immutable in-memory build. Nothing outside this explicit asset inventory is served. */
export function packagedApplication(directory) {
  const root = resolve(directory);
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  const files = new Map();
  for (const name of readdirSync(root, { recursive: true })) {
    const path = join(root, name);
    if (!lstatSync(path).isFile() || !types[extname(name)]) continue;
    files.set('/' + name, { bytes: readFileSync(path), type: types[extname(name)] });
  }
  for (const required of ['/index.html', '/local.html', '/sw.js'])
    if (!files.has(required)) throw Error('Incomplete application build: ' + required);
  return (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const entry =
      path === '/' ||
      path === '/private/account-setup.html' ||
      path === '/private/account-enrollment.html' ||
      /^\/(accounts|local(?:\/[a-z-]+)?|(?:setup|recover)\/[^/]+\/[a-z-]+|connect\/[a-z-]+)$/.test(
        path,
      );
    const file = files.get(entry ? '/index.html' : path);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    if (!['GET', 'HEAD'].includes(request.method) || !file)
      return void response.writeHead(404).end();
    response.setHeader('Content-Type', file.type);
    response.setHeader('Content-Length', file.bytes.length);
    response.writeHead(200).end(request.method === 'HEAD' ? undefined : file.bytes);
  };
}
