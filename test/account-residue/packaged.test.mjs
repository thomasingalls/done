import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { packagedFixture, report, extendedLimits } from './packaged-fixture.mjs';
import { matchBytes, assess } from './matcher.mjs';
import { collectValues } from './node-collector.mjs';
const marker = (role) => ({
  id: role,
  values: ['residue_' + role + '_雪_' + randomBytes(16).toString('hex')],
});
const factor = (code) => ({
  id: 'factor',
  values: [code, code.replaceAll('-', '').replaceAll(' ', '')],
});
const lock = async (page) => {
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
};
const unlock = async (page, code) => {
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.goals .cm-content')).toBeVisible();
};
const write = async (page, value) => {
  const master = page.locator('.goals .cm-content');
  await master.click();
  await master.press('ControlOrMeta+End');
  await page.keyboard.insertText(value);
  await expect(master).toContainText(value);
};
const archive = (path, needles, required) => {
  const bytes = readFileSync(path),
    result = matchBytes(bytes, needles, extendedLimits);
  assert.deepEqual(result.issues, []);
  assert(!result.matches.some((m) => m.needle === 'factor'));
  for (const id of required) assert(result.matches.some((m) => m.needle === id));
  return { bytes: bytes.length, sha256: result.sha256, intentionalWriting: required };
};
test(
  'packaged Local UI, explicit ZIP, worker cache, offline restart and raw closed profile',
  { timeout: 180000 },
  async (t) => {
    const f = await packagedFixture(t, 'fresh'),
      ns = [marker('fresh-writing')];
    let page = await f.context.newPage();
    await page.goto(f.origin);
    await page.getByRole('button', { name: 'Create Local workspace' }).click();
    const code = await page.getByLabel('Generated device-lock code').textContent();
    ns.push(factor(code));
    await page.getByRole('button', { name: 'I saved my code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm and create' }).click();
    await write(page, ns[0].values[0]);
    await f.scan(page, ns, 'written');
    const zip = await f.download(page, 'Export markdown', 'explicit.zip');
    report('fresh-export', archive(zip, ns, ['fresh-writing']));
    await f.scan(page, ns, 'exported');
    await lock(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await f.scan(page, ns, 'locked');
    const physical = await f.files(ns, 'closed-profile');
    assert.equal(
      physical.matches.length,
      0,
      'No writing/factor match in acquired fresh profile bytes',
    );
    page = await f.reopen();
    await f.context.setOffline(true);
    await page.goto(f.origin + '/local.html');
    await unlock(page, code);
    await expect(page.locator('.goals .cm-content')).toContainText(ns[0].values[0]);
    await lock(page);
    await f.scan(page, ns, 'offline-reopen');
    const plant = marker('worker-console'),
      worker = f.context.serviceWorkers()[0];
    assert(worker, 'Actual packaged service worker');
    await worker.evaluate((text) => console.log({ unexpected: text }), plant.values[0]);
    await expect
      .poll(
        async () =>
          assess([collectValues('diagnostics', await f.diagnostics())], [plant], ['diagnostics'])
            .verdict,
      )
      .toBe('prohibited-match');
    report('fresh-worker-control', { detected: true, worker: worker.url() });
    report('fresh-outcome', {
      logical: 'passed',
      coldReplay: true,
      explicitZip: true,
      physicalVerdict: physical.verdict,
      physicalIssues: physical.issues,
    });
  },
);

test(
  'synthetic migration restart, selected Local, authenticated source cleanup and interrupted Local clear',
  { timeout: 240000 },
  async (t) => {
    const f = await packagedFixture(t, 'migration'),
      ns = [marker('source'), marker('journal'), marker('later')];
    let page = await f.blank();
    await page.evaluate(async (input) => Control.seedSource(input), {
      master: ns[0].values[0],
      suffix: '!' + ns[1].values[0],
      orphan: ns[0].values[0] + ' unfiled',
      days: [
        {
          date: '2026-01-02',
          next: Array.from({ length: 24 }, (_, i) => ns[1].values[0] + ' card ' + i),
          scheduled: [],
          done: [],
        },
      ],
    });
    const allowLegacy = (row) =>
      row.needle !== 'factor' &&
      ((row.surface === 'indexedDB' && row.location[0] === 'done') ||
        (row.surface === 'localStorage' &&
          String(row.location[1]).startsWith('done.pending-update.done.fixture.')));
    await f.scan(page, ns, 'source', allowLegacy);
    await page.goto(f.origin + '/private.html');
    report('migration-initial-page', { url: page.url(), html: await page.content() });
    const acknowledge = async () => {
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Check this browser' }).click();
    };
    const load = async (packet, binding) => {
      await page.getByLabel('Recovery packet', { exact: true }).setInputFiles(packet);
      await page.getByLabel('Saved binding', { exact: true }).setInputFiles(binding);
      await page.getByRole('button', { name: 'Verify saved files' }).click();
      await expect(page.getByRole('heading', { name: 'Saved files verified' })).toBeVisible();
    };
    await acknowledge();
    await page.getByRole('button', { name: 'Capture recovery files' }).click();
    const packet = await f.download(page, 'Save recovery packet', 'packet.json'),
      binding = await f.download(page, 'Save binding file', 'binding.json'),
      preview = await f.download(page, 'Save Markdown preview', 'preview.zip');
    report('migration-preview', archive(preview, ns, ['source', 'journal']));
    await f.scan(page, ns, 'captured', allowLegacy);
    await page.getByRole('button', { name: 'Restart to verify saved files' }).click();
    await acknowledge();
    await load(packet, binding);
    await page.getByRole('button', { name: 'Generate device-lock code' }).click();
    const code = await page.getByLabel('Generated device-lock code').textContent();
    ns.push(factor(code));
    await page.getByRole('button', { name: 'I saved my code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm and begin import' }).click();
    await expect(page.getByRole('button', { name: 'Continue import', exact: true })).toBeVisible();
    await f.scan(page, ns, 'importing', allowLegacy);
    await page.close();
    page = await f.context.newPage();
    await page.goto(f.origin + '/private.html');
    await acknowledge();
    await load(packet, binding);
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock migration' }).click();
    await expect(page.locator('[data-migration-phase]')).toHaveAttribute(
      'data-migration-phase',
      'authenticated',
    );
    for (let i = 0; i < 20; i++) {
      const button = page.getByRole('button', { name: 'Continue import', exact: true });
      if (!(await button.count())) break;
      await expect(button).toBeEnabled();
      await button.click();
      await expect(page.getByText('Waiting for the current storage operation…')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Select imported workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Destination selected' })).toBeVisible();
    await f.scan(page, ns, 'selected', allowLegacy);
    await page.getByRole('button', { name: 'Open Local editor' }).click();
    await unlock(page, code);
    for (const n of ns.slice(0, 2))
      await expect(page.locator('.goals .cm-content')).toContainText(n.values[0]);
    await write(page, ns[2].values[0]);
    await lock(page);
    // Cleanup helper runs in its own realm, exactly as the author's private utility does.
    const dialog = await f.cleanupUi(page);
    await dialog.getByLabel('Recovery packet').setInputFiles(packet);
    await dialog.getByLabel('Saved binding').setInputFiles(binding);
    await dialog.getByLabel('Device-lock code').fill(code);
    await dialog.getByRole('button', { name: 'Clean up source' }).click();
    await expect(dialog.getByRole('status')).toContainText('Source cleanup complete');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await f.scan(page, ns, 'source-cleaned');
    await page.close();
    page = await f.context.newPage();
    await page.goto(f.origin);
    await unlock(page, code);
    for (const n of ns.slice(0, 3))
      await expect(page.locator('.goals .cm-content')).toContainText(n.values[0]);
    await lock(page);
    await page.close();
    page = await f.blank();
    const interrupted = await page.evaluate(async (code) => {
      const target = await Control.prepareLocalClear('local', code),
        abort = new AbortController();
      try {
        await Control.clearLocalWorkspace(target, code, {
          signal: abort.signal,
          onProgress(p) {
            if (p.stage === 'journal') abort.abort();
          },
        });
        return false;
      } catch {
        return abort.signal.aborted;
      }
    }, code);
    assert(interrupted);
    await f.scan(page, ns, 'clear-interrupted');
    await page.close();
    page = await f.blank();
    assert.equal(
      await page.evaluate(
        async (code) => (await Control.resumeLocalClear('local', code)).kind,
        code,
      ),
      'cleared',
    );
    await f.scan(page, ns, 'cleared');
    const physical = await f.files(ns, 'closed-profile');
    report('migration-outcome', {
      logical: 'passed',
      importRestart: true,
      postCleanupColdReplay: true,
      interruptedClear: true,
      physicalVerdict: physical.verdict,
      physicalMatches: physical.matches,
      physicalIssues: physical.issues,
      meaning:
        'Legacy plaintext may remain in physical browser files after logical deletion; no forensic-erasure claim.',
    });
  },
);
