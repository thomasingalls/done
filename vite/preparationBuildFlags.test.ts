// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
const docker = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
it('forwards explicit default-off resume and service switches through the build stage only', () => {
  const stage = docker.split('FROM dependencies AS build\n')[1]!.split('\nFROM ')[0]!;
  for (const flag of ['VITE_ACCOUNT_RETENTION_RESUME', 'VITE_ACCOUNT_HISTORY_AUTO']) {
    expect(stage).toContain('ARG ' + flag + '=0');
    expect(stage).toContain('ENV ' + flag + '=${' + flag + '}');
    expect(docker.split(' AS runtime\n')[1]).not.toContain('ENV ' + flag);
  }
});
import { build } from 'vite';
import { runInNewContext } from 'node:vm';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const cleanup: string[] = [];
afterEach(() => {
  for (const p of cleanup.splice(0)) rmSync(p, { recursive: true, force: true });
});
import { accountRetentionFlags, accountPreparationFlags } from './accountRetentionFlags';
const decode = (input: Record<string, string>) =>
  Object.fromEntries(Object.entries(input).map(([k, v]) => [k, JSON.parse(v)]));
it('default local automation and resume never imply service automation', () => {
  expect(decode(accountPreparationFlags({}))).toEqual({
    'import.meta.env.VITE_ACCOUNT_RETENTION_RESUME': '0',
    'import.meta.env.VITE_ACCOUNT_HISTORY_AUTO': '0',
  });
  for (const env of [
    { VITE_ACCOUNT_RETENTION_AUTO: '1' },
    { VITE_ACCOUNT_RETENTION_AUTO: '1', VITE_ACCOUNT_RETENTION_RESUME: '1' },
  ])
    expect(decode(accountPreparationFlags(env))['import.meta.env.VITE_ACCOUNT_HISTORY_AUTO']).toBe(
      '0',
    );
});
it('refuses contradictory resume gates at build time, retaining independent manual preparation', () => {
  const keys = [
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_BASELINE_INSTALL',
    'VITE_ACCOUNT_RETENTION',
  ];
  for (let mask = 0; mask < 8; mask++) {
    const env = {
      ...Object.fromEntries(keys.map((key, bit) => [key, mask & (1 << bit) ? '1' : '0'])),
      VITE_ACCOUNT_RETENTION_RESUME: '1',
    };
    if (mask === 7)
      expect(
        decode(accountPreparationFlags(env))['import.meta.env.VITE_ACCOUNT_RETENTION_RESUME'],
      ).toBe('1');
    else expect(() => accountPreparationFlags(env)).toThrow('requires compatible');
  }
});
it('rejects nonbinary new switches and captures the supplied settings by value', () => {
  for (const key of ['VITE_ACCOUNT_RETENTION_RESUME', 'VITE_ACCOUNT_HISTORY_AUTO'])
    for (const value of ['true', ' 1', '2', '-1'])
      expect(() => accountPreparationFlags({ [key]: value })).toThrow('must be 0 or 1');
  const env = {
      VITE_ACCOUNT_RETENTION_AUTO: '1',
      VITE_ACCOUNT_RETENTION_RESUME: '1',
      VITE_ACCOUNT_HISTORY_AUTO: '0',
    },
    flags = accountPreparationFlags(env);
  env.VITE_ACCOUNT_HISTORY_AUTO = '1';
  expect(decode(flags)['import.meta.env.VITE_ACCOUNT_HISTORY_AUTO']).toBe('0');
});
it('the compiled production probe actually enables resume and keeps service automation disabled', async () => {
  const env = {
      VITE_ACCOUNT_RETENTION_AUTO: '1',
      VITE_ACCOUNT_RETENTION_RESUME: '1',
      VITE_ACCOUNT_HISTORY_AUTO: '0',
    },
    id = 'b1'.repeat(32);
  const root = resolve('.');
  const folder = mkdtempSync(join(tmpdir(), 'done-build-flags-'));
  cleanup.push(folder);
  const entry = join(folder, 'probe.ts');
  writeFileSync(
    entry,
    `export { preparationVerifierIdentity, hasAutomaticLocalRetention } from ${JSON.stringify(root + '/src/crdt/localBaselineMode.ts')}; export { hasAutomaticServiceHistory } from ${JSON.stringify(root + '/src/account/automaticHistoryMaintenance.ts')};`,
  );
  const output = await build({
    configFile: false,
    logLevel: 'error',
    define: {
      ...accountRetentionFlags(env),
      ...accountPreparationFlags(env),
      __ACCOUNT_PREPARATION_VERIFIER__: JSON.stringify(id),
      'import.meta.env.PROD': 'true',
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, name: 'Probe', formats: ['iife'] },
    },
  });
  const result = Array.isArray(output) ? output[0]! : output;
  if (!('output' in result)) throw Error('Unexpected watch build');
  const chunk = result.output.find((v) => v.type === 'chunk')!;
  const sandbox: {
    Probe?: {
      preparationVerifierIdentity(): unknown;
      hasAutomaticLocalRetention(): unknown;
      hasAutomaticServiceHistory(): unknown;
    };
  } = {};
  runInNewContext(chunk.code, sandbox);
  expect(sandbox.Probe!.preparationVerifierIdentity()).toBe(id);
  expect(sandbox.Probe!.hasAutomaticLocalRetention()).toBe(true);
  expect(sandbox.Probe!.hasAutomaticServiceHistory()).toBe(false);
});
