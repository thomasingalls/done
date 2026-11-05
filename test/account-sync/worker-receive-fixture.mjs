import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'vite';

export async function workerReceiveBundle(omitSelf = false) {
  let checks = 0;
  const built = await build({
    configFile: false,
    logLevel: 'error',
    worker: {
      format: 'es',
      plugins: () => [
        {
          name: 'native-worker-self-envelope-control',
          enforce: 'pre',
          transform(code, id) {
            if (!id.endsWith('/src/crdt/accountSyncState.ts')) return;
            const anchor = 'if (!local || hex(local) !== hex(envelope))';
            assert.equal(code.split(anchor).length, 2, 'One actual Worker self guard');
            checks++;
            return omitSelf ? code.replace(anchor, 'if (false)') : code;
          },
        },
      ],
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-sync/worker-receive-browser.ts'),
        name: 'WorkerReceiveHarness',
        formats: ['es'],
      },
    },
  });
  assert.equal(checks, 1, 'The real Worker graph contains the self guard once');
  const output = (Array.isArray(built) ? built[0] : built).output;
  const entries = output.filter((o) => o.type === 'chunk' && o.isEntry);
  assert.equal(entries.length, 1);
  assert(output.some((o) => o.fileName.includes('accountOwner.worker-')));
  const assets = new Map(
    output.map((o) => ['/' + o.fileName, Buffer.from(o.type === 'chunk' ? o.code : o.source)]),
  );
  assert.equal(assets.size, output.length, 'Retain every emitted Worker asset');
  return {
    entry: '/' + entries[0].fileName,
    assets,
    evidence: {
      guardCount: checks,
      omissionCount: omitSelf ? checks : 0,
      entry: '/' + entries[0].fileName,
      assets: [...assets].map(([path, body]) => ({
        path,
        bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      })),
    },
  };
}

export async function installWorkerReceiveFixture(f, bundle) {
  await f.context.unroute(f.server.origin + '/');
  const policy =
    "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'";
  await f.context.route(f.server.origin + '/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'Content-Security-Policy': policy },
      body: '<!doctype html><title>Disposable native Worker receive control</title>',
    }),
  );
  for (const [path, body] of bundle.assets) {
    assert(/^\/[A-Za-z0-9_./-]+$/.test(path) && !path.includes('..'));
    await f.context.route(f.server.origin + path, (route) =>
      route.fulfill({
        status: 200,
        contentType: path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        headers: { 'Content-Security-Policy': policy },
        body,
      }),
    );
  }
  await f.setup(f.page);
  await f.page.addScriptTag({ url: f.server.origin + bundle.entry, type: 'module' });
}
