/** Own the server inside the guarded worker group; Playwright cannot launch/reuse a webServer. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'vite';
import { browserPolicy } from './playwright-adapter.mjs';
import { listenEphemeralVite } from './server.mjs';
const file = process.argv[2],
  policy = browserPolicy(file);
assert.equal(process.argv.length, 3);
assert(
  process.env.RELEASE_BROWSER_ENDPOINT && process.env.RELEASE_CASE_REPORT,
  'Browser driver needs an owned stage',
);
const output = join(process.env.TMPDIR, 'playwright');
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: resolve('vite.config.ts'),
  cacheDir: resolve('node_modules/.vite/release-browser', process.env.RELEASE_RUN_NONCE),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
});
let origin,
  code = 1;
try {
  origin = await listenEphemeralVite(server);
  const config = join(output, 'owned.config.ts');
  writeFileSync(
    config,
    `import original from ${JSON.stringify(resolve(policy.config))};
export default {...original, testDir:${JSON.stringify(resolve(dirname(file)))}, testMatch:[${JSON.stringify(file.split('/').at(-1))}], webServer:undefined, globalSetup:undefined, globalTeardown:undefined,
  fullyParallel:false, workers:1, retries:0, repeatEach:1, maxFailures:0, forbidOnly:true, grep:/.*/, grepInvert:undefined, shard:null,
  outputDir:${JSON.stringify(join(output, 'artifacts'))}, reporter:[[${JSON.stringify(resolve('scripts/release-validation/playwright-reporter.mjs'))}]],
  use:{...original.use,baseURL:${JSON.stringify(origin)}},
  projects:original.projects?.map(p=>({...p,fullyParallel:false,retries:0,repeatEach:1,use:{...p.use,baseURL:${JSON.stringify(origin)}}})),
};`,
  );
  const child = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--config', config],
    {
      env: { ...process.env, RELEASE_PLAYWRIGHT_ARTIFACTS: join(output, 'artifacts') },
      stdio: 'inherit',
    },
  );
  code = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('close', (status) => done(status ?? 1));
  });
} finally {
  await server.close();
  if (existsSync(process.env.RELEASE_CASE_REPORT)) {
    const report = JSON.parse(readFileSync(process.env.RELEASE_CASE_REPORT, 'utf8'));
    report.server = { origin, closed: !server.httpServer.listening };
    writeFileSync(process.env.RELEASE_CASE_REPORT, JSON.stringify(report) + '\n');
  }
}
process.exitCode = code;
