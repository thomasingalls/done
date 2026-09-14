import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createStageRunner } from '../../scripts/release-validation/stage.mjs';
import { playwrightStage } from '../../scripts/release-validation/playwright-adapter.mjs';
import { installedChromium } from '../../scripts/release-validation/browser.mjs';
import { digest, filePins } from '../../scripts/release-validation/identity.mjs';
const runtime = installedChromium();
const ordinary = `import {test} from '../release-validation/browser-fixture';import {expect} from '@playwright/test';for(const name of ['one','two'])test(name,async({page},info)=>{await info.attach('inputs',{body:JSON.stringify({name}),contentType:'application/json'});await page.goto('/');await expect(page).toHaveTitle('Owned page');});`;
function fixture(t, text = ordinary) {
  const root = mkdtempSync(join(tmpdir(), 'done-playwright-control-'));
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
  const files = [
    'package.json',
    'index.html',
    'vite.config.ts',
    'playwright.local-startup.config.ts',
    'test/local-app/startup.spec.ts',
    'test/release-validation/browser-fixture.ts',
    'scripts/app-upgrades/server.mjs',
    ...[
      'process-guard',
      'nested-launcher',
      'playwright-driver',
      'playwright-adapter',
      'playwright-census',
      'playwright-reporter',
      'vitest-census',
      'registration-data',
      'registration-modules',
      'identity',
      'static-fixture',
      'server',
    ].map((n) => 'scripts/release-validation/' + n + '.mjs'),
  ];
  for (const path of files) mkdirSync(dirname(join(root, path)), { recursive: true });
  for (const path of files.filter(
    (p) => p.startsWith('scripts/') || p.endsWith('browser-fixture.ts'),
  ))
    copyFileSync(path, join(root, path));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'index.html'), '<title>Owned page</title>');
  writeFileSync(join(root, 'vite.config.ts'), 'export default {};');
  writeFileSync(
    join(root, 'playwright.local-startup.config.ts'),
    'export default {timeout:20000,use:{headless:true}};',
  );
  const write = (text) => writeFileSync(join(root, 'test/local-app/startup.spec.ts'), text);
  write(text);
  const run = createStageRunner({
    root,
    output: join(root, 'reports'),
    browserRuntime: runtime,
    fingerprint: () => ({
      revision: 'synthetic-playwright',
      sourceDigest: digest(filePins(root, files)),
      dependencyDigest: 'copied-installed-tools',
      runtime: { node: process.version },
      tools: { chromium: digest(runtime.snapshot) },
    }),
  });
  const stage = {
    ...playwrightStage(root, 'test/local-app/startup.spec.ts'),
    deadlineMs: 15000,
    graceMs: 1000,
  };
  const read = (receipt, path) =>
    JSON.parse(readFileSync(join(root, 'reports', receipt.key, path), 'utf8'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, run, stage, write, read };
}
const drained = (r) => {
  assert.equal(r.result.groupDrained, true, JSON.stringify(r.result));
  assert.equal(r.result.browser.groupDrained, true);
};

test('real Playwright cases pass while omitted, skipped, failed and hook-error runs retain exact failure evidence', async (t) => {
  const f = fixture(t),
    first = await f.run(f.stage);
  drained(first);
  assert.equal(first.status, 'passed', first.result.reason);
  assert.deepEqual(
    f
      .read(first, 'cases.json')
      .cases.map((c) => JSON.parse(Buffer.from(c.attachments[0].base64, 'base64').toString())),
    [{ name: 'one' }, { name: 'two' }],
  );
  assert.equal((await f.run(f.stage)).reused, true);
  f.write(ordinary.replace("['one','two']", "['one']"));
  const omitted = await f.run(f.stage);
  drained(omitted);
  assert.equal(omitted.status, 'failed');
  assert.match(omitted.result.reason, /census/);
  f.write(
    ordinary.replace(
      "await page.goto('/');",
      "test.skip(name==='two','planted skip');await page.goto('/');",
    ),
  );
  const skipped = await f.run(f.stage);
  drained(skipped);
  assert.equal(skipped.status, 'failed');
  assert(f.read(skipped, 'cases.json').cases.some((c) => c.status === 'skipped'));
  f.write(ordinary.replace("toHaveTitle('Owned page')", "toHaveTitle('wrong', {timeout:50})"));
  const failed = await f.run(f.stage);
  drained(failed);
  assert.equal(failed.status, 'failed');
  assert(f.read(failed, 'cases.json').cases.some((c) => c.errors.some((e) => e.includes('wrong'))));
  f.write(ordinary + "test.beforeAll(()=>{throw Error('planted hook failure')});");
  const hook = await f.run(f.stage);
  drained(hook);
  assert.equal(hook.status, 'failed');
  assert(
    f
      .read(hook, 'cases.json')
      .cases.some((c) => c.errors.some((e) => e.includes('planted hook failure'))),
  );
});

test('owned Playwright deadline and cancellation retain partial progress and drain browser, worker and server', async (t) => {
  for (const cancel of [false, true]) {
    const text = `import {test} from '../release-validation/browser-fixture';import {writeFileSync} from 'node:fs';test('ready',async({page})=>{await page.goto('/');writeFileSync('ready','yes');await new Promise(()=>{})});`;
    const f = fixture(t, text),
      controller = new AbortController();
    const pending = f.run({ ...f.stage, deadlineMs: 5000 }, { signal: controller.signal });
    const until = Date.now() + 4500;
    while (!existsSync(join(f.root, 'ready')) && Date.now() < until)
      await new Promise((r) => setTimeout(r, 20));
    assert(existsSync(join(f.root, 'ready')), 'Browser case must execute before interruption');
    if (cancel) controller.abort();
    const r = await pending;
    drained(r);
    assert.equal(r.status, 'failed');
    assert.equal(r.result.reason, cancel ? 'cancelled' : 'timeout');
    const partial = f.read(r, 'cases.json');
    assert.equal(partial.phase, 'running');
    assert.equal(partial.collected.length, 1);
    assert.equal(partial.cases.length, 0);
  }
});
