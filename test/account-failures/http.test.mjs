import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { fixture, report } from '../account-residue/fixtures.mjs';
test(
  'actual service HTTP uncertainty reaches the client diagnostic and returns no decision bytes',
  { timeout: 60000 },
  async (t) => {
    const b = await build({
      configFile: false,
      logLevel: 'error',
      build: {
        write: false,
        minify: false,
        lib: { entry: 'test/account-failures/browser.ts', name: 'Failures', formats: ['iife'] },
      },
    });
    const script = (Array.isArray(b) ? b[0] : b).output.find((f) => f.type === 'chunk').code;
    const f = await fixture(t);
    await f.page.evaluate(script);
    const result = await f.page.evaluate(
      async ({ pin, token }) => {
        const answer = await Failures.privateDeliveryPost(
          pin,
          token,
          'read-v2',
          new Uint8Array([1]),
          1024,
          new AbortController().signal,
        );
        return { answer, diagnostics: Failures.readPrivateTransportDiagnostics() };
      },
      { pin: f.pin, token: f.token },
    );
    assert.equal(result.answer, null);
    assert.deepEqual(result.diagnostics.at(-1), {
      operation: 'read-v2',
      phase: 'response',
      code: 'invalid-request',
    });
    report('http-hint', result);
  },
);
