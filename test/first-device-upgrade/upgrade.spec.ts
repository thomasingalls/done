import { test, expect } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const port = process.env['ACCOUNT_SETUP_UPGRADE_PORT'] ?? '53212';
const entry = `http://localhost:${port}/private/account-setup.html`;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

function retainedRows(path: string, selection?: Record<string, string[]>) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const columns =
      selection ??
      Object.fromEntries(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          .all()
          .map(({ name }) => [
            String(name),
            db
              .prepare(`PRAGMA table_info(${quote(String(name))})`)
              .all()
              .map((row) => String(row['name'])),
          ]),
      );
    return {
      columns,
      rows: Object.fromEntries(
        Object.entries(columns).map(([name, fields]) => [
          name,
          db
            .prepare(`SELECT ${fields.map(quote).join(',')} FROM ${quote(name)} ORDER BY rowid`)
            .all(),
        ]),
      ),
    };
  } finally {
    db.close();
  }
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Error('Preview did not shut down cleanly'));
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      accept();
    });
    child.kill('SIGTERM');
  });
}

test('schema-five account retains its original passkey, authority, name, code and writing after upgrade', async ({
  page,
}, testInfo) => {
  const baseline = process.env['ACCOUNT_SETUP_UPGRADE_BASE'];
  if (!baseline)
    throw Error(
      'Set ACCOUNT_SETUP_UPGRADE_BASE to a schema-five preview checkout (7dab01cc). Run this test after integrating the schema-eight backend.',
    );
  const state = testInfo.outputPath('service');
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const env = { ...process.env, ACCOUNT_SETUP_PORT: port, ACCOUNT_SETUP_STATE: state };
  const children: ChildProcess[] = [];
  async function start(root: string) {
    const child = spawn(process.execPath, ['scripts/dev-account-setup.mjs'], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    await new Promise<void>((accept, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error(`Preview startup timed out: ${output}`)), 30000);
      child.once('error', reject);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(Error(`Preview exited (${code}): ${output}`));
      });
      const chunk = (data: Buffer) => {
        output = (output + data.toString()).slice(-8000);
        if (output.includes('Account setup development:')) {
          clearTimeout(timer);
          accept();
        }
      };
      child.stdout!.on('data', chunk);
      child.stderr!.on('data', chunk);
    });
    return child;
  }
  try {
    const old = await start(resolve(baseline));
    await page.goto(entry);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const code = (await page.getByLabel('Generated device-lock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm device-lock code' }).click();
    await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
    await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
    const recovery = (await page.getByLabel('Generated recovery code').textContent())!;
    await page.getByRole('button', { name: 'I saved my recovery code' }).click();
    await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await page.getByRole('button', { name: 'Finish account setup', exact: true }).click();
    await expect(page.locator('.shell')).toBeVisible();
    const id = (await page.getByLabel('Account ID', { exact: true }).textContent())!;
    const compose = page.locator('.day-panel[data-active="true"] .compose-field');
    await compose.fill('Writing saved before the service upgrade');
    await compose.press('Enter');
    await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
      'Writing saved before the service upgrade',
    );
    const credentials = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    expect(credentials.credentials).toHaveLength(1);
    await page.getByRole('button', { name: 'Lock workspace' }).click();
    await expect(page.getByLabel('Device-lock code', { exact: true })).toBeVisible();
    await page.goto('about:blank');
    await stop(old);
    const before = retainedRows(join(state, 'account.sqlite'));
    const authority = retainedRows(join(state, 'authority.sqlite'));
    const key = readFileSync(join(state, 'operator.key'));
    const pin = readFileSync(join(state, 'pin.json'));
    // Normal startup must not migrate implicitly, and a failed startup must release its lock.
    expect(() =>
      execFileSync(process.execPath, ['scripts/dev-account-setup.mjs'], {
        env,
        timeout: 15000,
        stdio: 'pipe',
      }),
    ).toThrow(/explicit offline upgrade/);
    const output = execFileSync(process.execPath, ['scripts/upgrade-account-setup.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(output).toContain('schema 5 → 8');
    const snapshot = output.split('Backup: ')[1]!.trim();
    expect(retainedRows(join(snapshot, 'account.sqlite'))).toEqual(before);
    expect(retainedRows(join(snapshot, 'authority.sqlite'))).toEqual(authority);
    expect(readFileSync(join(snapshot, 'operator.key'))).toEqual(key);
    expect(readFileSync(join(snapshot, 'pin.json'))).toEqual(pin);
    expect(retainedRows(join(state, 'account.sqlite'), before.columns)).toEqual(before);
    expect(retainedRows(join(state, 'authority.sqlite'))).toEqual(authority);
    expect(readFileSync(join(state, 'operator.key'))).toEqual(key);
    expect(readFileSync(join(state, 'pin.json'))).toEqual(pin);
    const second = execFileSync(process.execPath, ['scripts/upgrade-account-setup.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    expect(second).toContain('already uses schema 8');
    await start(process.cwd());
    await page.goto(entry);
    await expect(page.getByLabel('Account ID', { exact: true })).toHaveText(id);
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page
      .getByRole('button', { name: 'Confirm code and unlock with passkey', exact: true })
      .click();
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.getByLabel('Actor name', { exact: true })).toHaveValue('Alex');
    await expect(page.locator('.day-panel[data-active="true"] .card')).toContainText(
      'Writing saved before the service upgrade',
    );
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await page.getByRole('button', { name: 'Use another account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Account verified' })).toBeVisible();
    expect(await page.getByLabel('Account ID', { exact: true }).allTextContents()).toEqual([
      id,
      id,
    ]);
    const after = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    expect(after.credentials.map((credential) => credential.credentialId)).toEqual(
      credentials.credentials.map((credential) => credential.credentialId),
    );
  } finally {
    await page.goto('about:blank');
    for (const child of children) await stop(child);
  }
});
