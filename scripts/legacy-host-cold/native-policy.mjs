import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch, inertPage, policyTable } from './browser.mjs';
import { fixtureServer, origin, sentinel } from './fixtures.mjs';
import { readInventory } from './observer.mjs';
import { denialConfig, poll } from './checks.mjs';
import { atomicJSON } from '../legacy-cleanup/diagnostics.mjs';
if (!globalThis.WebSocket)
  globalThis.WebSocket = createRequire(import.meta.url)('undici').WebSocket;
const [output, assets, policy] = process.argv.slice(2);
assert.ok(['missing', 'malformed', 'ignored', 'exception', 'recommended'].includes(policy));
mkdirSync(output, { recursive: true });
const path = join(output, `policy-control-${policy}.json`);
assert.equal(existsSync(path), false);
const report = {
  policy,
  role: 'intentional invalid-policy canary; never opens a source profile',
  passed: false,
};
const server = fixtureServer(assets);
let browser;
try {
  try {
    denialConfig(readFileSync('/etc/chromium/policies/managed/denial.json', 'utf8'), {
      readonly: true,
      mandatory: policy !== 'recommended',
      beforeLaunch: true,
    });
  } catch (error) {
    report.launcherRefused = true;
    report.refusal = error.message;
  }
  assert.equal(report.launcherRefused, true, 'invalid-policy-must-refuse-before-source-launch');
  if (policy === 'recommended') {
    // Probe a normal user setting under recommended policy; do not assume it overrides this build.
    const profile = join(output, 'profiles', 'control-' + policy, 'Default');
    mkdirSync(profile, { recursive: true });
    atomicJSON(join(profile, 'Preferences'), {
      profile: { default_content_setting_values: { javascript: 1 } },
    });
  }
  await server.start();
  browser = await launch(output, 'control-' + policy, origin + '/probe?id=invalid-policy');
  report.browser = await browser.cdp.send('Browser.getVersion');
  if (policy === 'recommended') {
    report.effectivePolicy = await policyTable(browser);
    const row = report.effectivePolicy.rows.find((r) => r[0] === 'DefaultJavaScriptSetting');
    assert.equal(row?.[4], 'Recommended', 'recommended-control-effective-level');
    report.controlKind = 'configuration-refusal; user-override execution coverage unproven';
  } else
    await poll('invalid policy native positive write', () =>
      server.hits.some((h) => h.path === '/hit' && h.id === 'invalid-policy'),
    );
  const id = await inertPage(browser, origin);
  report.inventory = await readInventory(browser.cdp, id, origin);
  report.positiveWrite =
    report.inventory.local.find(([k]) => k === sentinel('invalid-policy'))?.[1] === 'ran';
  if (policy !== 'recommended')
    assert.equal(report.positiveWrite, true, 'false-denial-acknowledgement-caught');
  assert.deepEqual(report.inventory.databases, [], 'absent-database-not-created');
  assert.deepEqual(
    (await readInventory(browser.cdp, id, origin)).databases,
    [],
    'repeat-read-absent-database-not-created',
  );
  report.passed = true;
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  await browser?.stop();
  await server.close();
  atomicJSON(path, report);
  console.log(JSON.stringify(report));
}
