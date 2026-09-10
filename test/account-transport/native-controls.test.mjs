import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  native,
  selected,
  open,
  close,
  prepare,
  submission,
} from '../account-delivery/fixtures.mjs';
test(
  'actual request-binding mutation accepts a stale signed page for a fresh nonce',
  { timeout: 35000 },
  async (t) => {
    const built = await build({
      configFile: false,
      logLevel: 'error',
      plugins: [
        {
          name: 'read-binding-control',
          enforce: 'pre',
          transform(code, id) {
            if (id.endsWith('/account-protocol/deliveryTransport.ts')) {
              const target = 'if (p.request !== (await requestHash(request, subtle))) invalid();';
              assert.equal(code.split(target).length, 2, 'Binding mutation anchor');
              return code.replace(target, 'void request;');
            }
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        lib: {
          entry: resolve('test/account-delivery/browser.ts'),
          name: 'Harness',
          formats: ['iife'],
        },
      },
    });
    const script = (Array.isArray(built) ? built[0] : built).output.find(
      (f) => f.type === 'chunk',
    ).code;
    const f = await native(t),
      item = await selected(f, 'nonce-control');
    await open(f.page, item);
    await prepare(f.page);
    await submission(f.page);
    await f.page.evaluate((token) => opened.submitPending(token), f.testOperatorToken);
    let old;
    const path = f.server.origin + '/account/delivery/read';
    await f.context.route(path, async (route) => {
      const r = await route.fetch();
      old = await r.body();
      await route.fulfill({ response: r });
    });
    const read = () =>
      f.page.evaluate(
        async (token) => (await opened.readAcceptedPage(token)).kind,
        f.testOperatorToken,
      );
    assert.equal(await read(), 'page');
    await f.context.unroute(path);
    await f.context.route(path, (route) =>
      route.fulfill({ status: 200, contentType: 'application/octet-stream', body: old }),
    );
    assert.equal(await read(), 'unknown');
    await close(f.page);
    await f.page.evaluate(script);
    await open(f.page, item);
    assert.equal(await read(), 'page');
    await close(f.page);
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-request-binding.json'),
        JSON.stringify(
          {
            baseline: 'unknown',
            mutant: 'page',
            outcome: 'Stale signed ciphertext page accepted for a new read nonce.',
          },
          null,
          2,
        ) + '\n',
      );
  },
);
