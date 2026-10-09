/** Test-only switchable static host, with explicit wrong-byte/download failure controls. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function upgradeFixtureServer(root) {
  if (!root) throw Error('APP_UPGRADE_OUTPUT is required');
  let version = 'a',
    fault = '',
    requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/__release' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const next = JSON.parse(body);
      if (!['a', 'b', 'prior'].includes(next.version)) {
        res.writeHead(400).end();
        return;
      }
      version = next.version;
      fault = next.fault ?? '';
      requests = [];
      res.end('ok');
      return;
    }
    if (url.pathname === '/__requests') {
      res.end(JSON.stringify(requests));
      return;
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    requests.push({ version, path });
    if (fault === 'missing' && path === '/manifest.webmanifest') {
      res.writeHead(503).end('interrupted release');
      return;
    }
    if (fault === 'wrong-bytes' && path === '/manifest.webmanifest') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Fallback instead of manifest</title>');
      return;
    }
    try {
      const directory = resolve(root, version),
        file = resolve(directory, '.' + path);
      if (!file.startsWith(directory + sep)) throw Error('outside build');
      let bytes = await readFile(file);
      if (path === '/sw.js' && fault === 'activate-mutant')
        bytes = Buffer.from(
          bytes
            .toString()
            .replace('// Use the browser', 'await self.skipWaiting();\n    // Use the browser'),
        );
      res.setHeader(
        'Content-Type',
        {
          '.js': 'text/javascript',
          '.html': 'text/html',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.webmanifest': 'application/manifest+json',
        }[extname(file)] ?? 'application/octet-stream',
      );
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  return server;
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = upgradeFixtureServer(process.env.APP_UPGRADE_OUTPUT);
  server.listen(4197, '127.0.0.1');
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
