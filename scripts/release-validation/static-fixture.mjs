/** Exact build bytes on an owned loopback server; missing assets never become an HTML fallback. */
import { createServer } from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
export function staticFixtureServer(root) {
  const directory = realpathSync(root);
  return createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      const file = realpathSync(resolve(directory, '.' + (path === '/' ? '/index.html' : path)));
      if (!file.startsWith(directory + sep)) throw Error('Outside fixture build');
      const bytes = readFileSync(file);
      res.setHeader(
        'Content-Type',
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css',
          '.json': 'application/json',
          '.webmanifest': 'application/manifest+json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.wasm': 'application/wasm',
        }[extname(file)] ?? 'application/octet-stream',
      );
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
}
