import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packagedApplication } from '../../scripts/lib/packaged-application.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'done-removal-route-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of ['index.html', 'local.html', 'sw.js'])
    writeFileSync(join(directory, file), file === 'index.html' ? 'exact app shell' : file);
  const serve = packagedApplication(directory);
  return (url, method = 'GET') => {
    const reply = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      writeHead(status) {
        this.status = status;
        return this;
      },
      end(bytes) {
        this.bytes = bytes;
      },
    };
    serve({ url, method }, reply);
    return reply;
  };
}

test('cold removal routes serve the exact immutable shell for each supported slot family', (t) => {
  const serve = fixture(t);
  for (const slot of ['local', 'account-' + '12'.repeat(16), 'enrollment-' + 'ab'.repeat(16)]) {
    for (const suffix of ['', '/', '?return=local']) {
      const reply = serve('/remove/' + slot + suffix);
      assert.equal(reply.status, 200);
      assert.equal(reply.bytes.toString(), 'exact app shell');
      assert.equal(reply.headers['Content-Type'], 'text/html');
      assert.match(
        reply.headers['Content-Security-Policy'],
        /script-src 'self' 'wasm-unsafe-eval'/,
      );
    }
    const head = serve('/remove/' + slot, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.bytes, undefined);
  }
});

test('removal routing does not expose unknown paths, private files, or mutation endpoints', (t) => {
  const serve = fixture(t);
  for (const path of [
    '/remove/',
    '/remove/other',
    '/remove/account-abc',
    '/remove/local/extra',
    '/remove/local.json',
    '/.dev/key',
    '/src/main.tsx',
  ])
    assert.equal(serve(path).status, 404);
  assert.equal(serve('/remove/local', 'POST').status, 404);
});
