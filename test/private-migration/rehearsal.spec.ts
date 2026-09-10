import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import type { SourceInput } from '../legacy-export/source';

const source: SourceInput = {
  master: '# Goals\n\nKeep the visible writing.\n',
  suffix: '!journal-only ✔\n',
  orphan: 'unfiled body\n\nwith detail',
  days: [
    {
      date: '2026-01-02',
      next: ['one', 'two', 'three', 'four'],
      scheduled: ['later\n\n## Done'],
      done: ['finished', ''],
      obsoleteJournal: 'Removed day-journal prose: omit from the imported workspace.',
    },
  ],
};
const phase = (page: Page, value: string) =>
  expect(page.locator('[data-migration-phase]')).toHaveAttribute('data-migration-phase', value);
const acknowledge = async (page: Page) => {
  await phase(page, 'host');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Check this browser' }).click();
  await phase(page, 'files');
};
const seed = async (page: Page) => {
  await page.goto('/test/legacy-export/index.html');
  await page.waitForFunction(() => 'captureFixture' in window);
  await page.evaluate(async (input) => {
    const fixture = (
      window as unknown as { captureFixture: { prepare(input: unknown): Promise<void> } }
    ).captureFixture;
    await fixture.prepare(input);
  }, source);
  await page.goto('/private/migration.html');
  await acknowledge(page);
};
const census = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('done');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows = await new Promise<{ key: IDBValidKey; bytes: number[] }[]>((resolve, reject) => {
      const result: { key: IDBValidKey; bytes: number[] }[] = [];
      const tx = db.transaction('updates');
      const r = tx.objectStore('updates').openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          result.push({ key: c.key, bytes: [...c.value] });
          c.continue();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return {
      rows,
      local: Object.fromEntries(
        Object.entries(localStorage).filter(
          ([key]) =>
            /^done\.pending-update\.done\.fixture\./.test(key) ||
            ['done.actor', 'done.device', 'done.sync', 'done.sync.last'].includes(key),
        ),
      ),
    };
  });
const save = async (page: Page, button: string, target: string) => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await pending).saveAs(target);
};
const capture = async (page: Page, info: TestInfo) => {
  await page.getByRole('button', { name: 'Capture recovery files' }).click();
  await phase(page, 'captured');
  const packet = info.outputPath('recovery.json'),
    binding = info.outputPath('binding.json'),
    preview = info.outputPath('preview.zip');
  await save(page, 'Save recovery packet', packet);
  await save(page, 'Save binding file', binding);
  await save(page, 'Save Markdown preview', preview);
  await expect(page.getByRole('button', { name: 'Generate device-lock code' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restart to verify saved files' }).click();
  await acknowledge(page);
  return { packet, binding, preview };
};
const load = async (page: Page, files: { packet: string; binding: string }) => {
  await page.getByLabel('Recovery packet', { exact: true }).setInputFiles(files.packet);
  await page.getByLabel('Saved binding', { exact: true }).setInputFiles(files.binding);
  await page.getByRole('button', { name: 'Verify saved files' }).click();
};
const confirm = async (page: Page) => {
  await phase(page, 'verified');
  await page.getByRole('button', { name: 'Generate device-lock code' }).click();
  await phase(page, 'save-code');
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my code' }).click();
  await expect(page.getByLabel('Generated device-lock code')).toHaveCount(0);
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and begin import' }).click();
  return code;
};
const resume = async (page: Page, files: { packet: string; binding: string }, code: string) => {
  await page.goto('/private/migration.html');
  await acknowledge(page);
  await expect(page.getByRole('button', { name: 'Capture recovery files' })).toHaveCount(0);
  await load(page, files);
  await phase(page, 'verified');
  await expect(page.getByRole('button', { name: 'Generate device-lock code' })).toHaveCount(0);
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock migration' }).click();
  await phase(page, 'authenticated');
};
const finishImport = async (page: Page) => {
  for (let i = 0; i < 20; i++) {
    const button = page.getByRole('button', { name: 'Continue import', exact: true });
    if (!(await button.count())) break;
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByText('Waiting for the current storage operation…')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Select imported workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Destination selected' })).toBeVisible();
};
const unzip = (path: string): { path: string; content: string }[] =>
  JSON.parse(
    execFileSync('python3', ['scripts/legacy-export/unzip.py', path], { encoding: 'utf8' }),
  );

test('saved files, renderer death, resumed selection and ordinary editor cold recovery preserve the ledger', async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  const before = await census(page);
  const files = await capture(page, info);
  const preview = unzip(files.preview);
  // The external input-string oracle never reads the Y.Doc or either produced archive.
  const ledger: { path: string; content: string }[] = JSON.parse(
    execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        "import {expected} from './scripts/legacy-export/oracle.mjs'; process.stdout.write(JSON.stringify(expected(JSON.parse(process.argv[1]))));",
        JSON.stringify(source),
      ],
      { encoding: 'utf8' },
    ),
  );
  expect(preview).toEqual(ledger);
  await load(page, files);
  const code = await confirm(page);
  await phase(page, 'authenticated');
  await expect(page.getByRole('button', { name: 'Continue import' })).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const crashed = page.waitForEvent('crash', { timeout: 10_000 });
  // A crashed renderer cannot reply to this command. Observe the independent crash event.
  void cdp.send('Page.crash').catch(() => {});
  await crashed;
  await page.close();
  const reopened = await context.newPage();
  reopened.on('pageerror', (error) => errors.push(error.message));
  await resume(reopened, files, code);
  await finishImport(reopened);
  expect(await census(reopened)).toEqual(before);
  await reopened.getByRole('button', { name: 'Open Local editor' }).click();
  await expect(reopened.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
  await reopened.getByLabel('Device-lock code', { exact: true }).fill(code);
  await reopened.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(reopened.locator('.goals .cm-content')).toContainText('journal-only ✔');
  await reopened.getByLabel('Go to date', { exact: true }).fill('2026-01-02');
  await expect(
    reopened.locator('.day-panel[data-active="true"] .collection[data-section="next"] .card'),
  ).toHaveCount(4);
  await expect(reopened.locator('.day-panel[data-active="true"]')).toHaveAttribute(
    'data-frozen',
    'true',
  );
  const output = info.outputPath('destination.zip');
  await save(reopened, 'Export markdown', output);
  const exported = unzip(output);
  expect(exported.filter((e) => e.path !== 'unfiled.md')).toEqual(
    ledger.filter((e) => e.path !== 'unfiled.md'),
  );
  expect(exported.find((e) => e.path === 'unfiled.md')?.content.split('\n\n## Provenance')[0]).toBe(
    ledger.find((e) => e.path === 'unfiled.md')?.content.split('\n\n## Provenance')[0],
  );
  const master = reopened.locator('.goals .cm-content');
  await master.click();
  await master.press('ControlOrMeta+End');
  await reopened.keyboard.insertText('Later accepted edit');
  await expect(master).toContainText('Later accepted edit');
  await reopened.getByRole('button', { name: 'Lock workspace' }).click();
  await expect(reopened.locator('.cm-editor')).toHaveCount(0);
  await reopened.reload();
  await reopened.getByLabel('Device-lock code', { exact: true }).fill(code);
  await reopened.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(reopened.locator('.goals .cm-content')).toContainText('Later accepted edit');
  expect(await census(reopened)).toEqual(before);
  expect(errors).toEqual([]);
  await info.attach('source-input', {
    body: JSON.stringify(source),
    contentType: 'application/json',
  });
  await info.attach('source-preservation', {
    body: JSON.stringify(before),
    contentType: 'application/json',
  });
  await reopened.close();
});

test('wrong saved digest and origin refuse before enrollment; source drift refuses first intent', async ({
  page,
}, info) => {
  await seed(page);
  const files = await capture(page, info);
  const original = JSON.parse(await readFile(files.binding, 'utf8'));
  const before = await census(page);
  for (const patch of [
    { recoveryDigest: '0'.repeat(64) },
    { sourceOrigin: 'https://different.invalid' },
  ]) {
    const altered = info.outputPath('altered-binding.json');
    await writeFile(altered, JSON.stringify({ ...original, ...patch }));
    await load(page, { ...files, binding: altered });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate device-lock code' })).toHaveCount(0);
    expect(await census(page)).toEqual(before);
  }
  await load(page, files);
  await phase(page, 'verified');
  await page.evaluate(() => localStorage.setItem('done.actor', 'source changed after capture'));
  await confirm(page);
  await expect(page.getByRole('alert')).toContainText('migration-source-changed');
  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((db) => db.name),
  );
  expect(databases).toEqual(['done']);
});

test('an aborted first content write offers resume with the original factor and retains source', async ({
  page,
}, info) => {
  await seed(page);
  const before = await census(page);
  const files = await capture(page, info);
  await load(page, files);
  await phase(page, 'verified');
  await page.evaluate(() => {
    let once = true;
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const r = add.call(this, value, key);
      if (once && this.name === 'content') {
        once = false;
        r.addEventListener('success', () => {
          this.transaction.abort();
          Object.assign(window, { migrationAbortObserved: true });
        });
      }
      return r;
    };
  });
  const code = await confirm(page);
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => 'migrationAbortObserved' in window)).toBe(true);
  await expect(page.getByRole('button', { name: 'Generate device-lock code' })).toHaveCount(0);
  await resume(page, files, code);
  await finishImport(page);
  expect(await census(page)).toEqual(before);
});

test('a retained service-worker registration blocks observation without removing site data', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/private/migration.html`);
    await page.evaluate(async () => {
      localStorage.setItem('retained-source-marker', 'preserve');
      await navigator.serviceWorker.register('/test/private-migration/worker.js');
    });
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Check this browser' }).click();
    await expect(page.getByRole('alert')).toContainText('service worker is still present');
    expect(await page.evaluate(() => localStorage.getItem('retained-source-marker'))).toBe(
      'preserve',
    );
    expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
  } finally {
    await context.close();
  }
});
