import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const root = process.cwd();
const { createServer } = await import(pathToFileURL(resolve('node_modules/vite/dist/node/index.js')));
const { chromium, firefox } = await import(pathToFileURL(resolve('node_modules/@playwright/test/index.mjs')));
const server = await createServer({
  configFile: false,
  root,
  cacheDir: '/private/tmp/done-onboarding-probe-vite',
  server: { host: 'localhost', port: 53239, strictPort: true, hmr: false, ws: false },
  plugins: [{ name: 'probe-page', configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (request.url !== '/__onboarding_probe') return next();
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><body>Disposable onboarding diagnosis</body></html>');
    });
  } }],
});
const results = [];
let browser;
try {
  await server.listen();
  for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
    browser = await engine.launch({ headless: true });
    for (const scenario of ['legacy-only', 'valid-code-later-network-error', 'credential-without-toJSON']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('http://localhost:53239/__onboarding_probe');
      const result = await page.evaluate(async (scenario) => {
        const { beginNewAccount, setupProgress } = await import('/src/account/setupProgress.ts');
        const { createFirstDeviceSetup } = await import('/src/account/firstDeviceSetup.ts');
        const { inspectLocalStartup, beginLocalGenesis, listLocalWorkspaces } = await import('/src/crdt/localGenesis.ts');
        const { removeDeviceData, readDeviceRemoval } = await import('/src/crdt/deviceDataRemoval.ts');
        const { withDeviceRemovalSlot } = await import('/src/crdt/writeSession.ts');
        const pin = { v: 1, origin: location.origin, rpId: 'localhost', serviceId: '01'.repeat(16), authRoot: '02'.repeat(32) };
        const config = { pin, networkSessions: true };
        if (scenario === 'legacy-only') {
          await new Promise((resolve, reject) => {
            const r = indexedDB.open('done', 1);
            r.onsuccess = () => { r.result.close(); resolve(); };
            r.onerror = () => reject(r.error);
          });
          const local = await inspectLocalStartup('local');
          const slot = await beginNewAccount(config);
          const owner = createFirstDeviceSetup(config, slot);
          await owner.inspect();
          const setup = owner.getSnapshot();
          await owner.close();
          let removalError;
          try { await removeDeviceData('local'); } catch (cause) { removalError = cause.message; }
          const removal = await withDeviceRemovalSlot('local', task => readDeviceRemoval(task, 'local'));
          const repeatedSlot = await beginNewAccount(config);
          return { local, setup: { kind: setup.kind, error: setup.error }, removalError, durableRemovalExists: !!removal, createAgainReusesAttempt: repeatedSlot === slot };
        }
        const creation = beginLocalGenesis('local');
        const code = creation.displayCode;
        await creation.confirm(code);
        const saved = { v: 1, pin, slotId: 'local', retryKey: 'A'.repeat(43), view: null, proof: null };
        if (scenario === 'credential-without-toJSON') saved.view = {
          ok: true, stage: 'ceremony', operation: 'register', ceremonyId: 'A'.repeat(43),
          options: { challenge: 'A'.repeat(43), rp: { id: 'localhost', name: 'Diagnosis' }, user: { id: 'A'.repeat(43), name: 'Diagnosis', displayName: 'Diagnosis' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }] },
        };
        await setupProgress(saved);
        const owner = createFirstDeviceSetup(config);
        await owner.inspect();
        let requestCount = 0, created = false, conversionError;
        const realFetch = window.fetch;
        const realCreate = navigator.credentials.create;
        window.fetch = async () => { requestCount++; throw new TypeError('Synthetic network failure after local verification'); };
        if (scenario === 'valid-code-later-network-error') await owner.unlock(code);
        else {
          navigator.credentials.create = async () => {
            created = true;
            return { id: 'synthetic', rawId: new ArrayBuffer(32), type: 'public-key', response: { clientDataJSON: new ArrayBuffer(1), attestationObject: new ArrayBuffer(1) },
              get toJSON() { conversionError = 'credential.toJSON is absent'; return undefined; } };
          };
          await owner.passkey();
        }
        const state = owner.getSnapshot();
        window.fetch = realFetch;
        navigator.credentials.create = realCreate;
        await owner.close();
        const codeStillOpens = (await listLocalWorkspaces('local', code)).length === 1;
        return { state: { kind: state.kind, error: state.error }, codeStillOpens, requestCount, created, conversionError };
      }, scenario);
      results.push({ browser: name, scenario, result });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
    await browser.close(); browser = undefined;
  }
} finally {
  await browser?.close();
  await server.close();
  writeFileSync('/private/tmp/done-onboarding-probe-results.json', JSON.stringify(results, null, 2) + '\n');
}
