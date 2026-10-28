// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { retentionPreparationIdentity } from './retentionPreparationIdentity';
const cleanup: string[] = [];
afterEach(() => cleanup.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));
function root() {
  const path = mkdtempSync(join(tmpdir(), 'done-preparation-closure-'));
  cleanup.push(path);
  for (const folder of [
    'src',
    'account-protocol',
    'private',
    'vendor-patches',
    'vite',
    'wasm/journal-seal',
  ])
    mkdirSync(join(path, folder), { recursive: true });
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'vite/retentionPreparationIdentity.ts',
    'wasm/journal-seal/seal.generated.ts',
    'src/check.ts',
    'account-protocol/receipt.ts',
    'private/setup.tsx',
    'vendor-patches/library.patch',
  ])
    writeFileSync(join(path, file), file);
  return path;
}
it('pins deterministic paths and content for every owned runtime source, dependency, patch and WASM input', () => {
  const p = root(),
    before = retentionPreparationIdentity(p);
  expect(before.inputs.map((i) => i.path)).toEqual(
    [
      'account-protocol/receipt.ts',
      'package.json',
      'vendor-patches/library.patch',
      'pnpm-lock.yaml',
      'private/setup.tsx',
      'src/check.ts',
      'tsconfig.json',
      'tsconfig.app.json',
      'tsconfig.node.json',
      'vite.config.ts',
      'vite/retentionPreparationIdentity.ts',
      'wasm/journal-seal/seal.generated.ts',
    ].sort(),
  );
  expect(retentionPreparationIdentity(p)).toEqual(before);
  for (const input of before.inputs) {
    writeFileSync(join(p, input.path), input.path + ' changed');
    expect(retentionPreparationIdentity(p).digest).not.toBe(before.digest);
    writeFileSync(join(p, input.path), input.path);
  }
});
it('new/deleted modules invalidate identity while test-only files do not', () => {
  const p = root(),
    before = retentionPreparationIdentity(p).digest;
  writeFileSync(join(p, 'src', 'new.ts'), 'new verifier');
  expect(retentionPreparationIdentity(p).digest).not.toBe(before);
  rmSync(join(p, 'src', 'new.ts'));
  expect(retentionPreparationIdentity(p).digest).toBe(before);
  writeFileSync(join(p, 'src', 'check.test.ts'), 'test');
  expect(retentionPreparationIdentity(p).digest).toBe(before);
  rmSync(join(p, 'src', 'check.ts'));
  expect(retentionPreparationIdentity(p).digest).not.toBe(before);
});
it('every Account switch/mode partitions reuse, with no caller-provided fallback identity', () => {
  const p = root(),
    a = retentionPreparationIdentity(p, {
      VITE_ACCOUNT_RETENTION_RESUME: '1',
      $mode: 'production',
    }).digest;
  expect(
    retentionPreparationIdentity(p, { VITE_ACCOUNT_RETENTION_RESUME: '0', $mode: 'production' })
      .digest,
  ).not.toBe(a);
  expect(
    retentionPreparationIdentity(p, { VITE_ACCOUNT_RETENTION_RESUME: '1', $mode: 'development' })
      .digest,
  ).not.toBe(a);
  expect(
    retentionPreparationIdentity(p, {
      VITE_ACCOUNT_RETENTION_RESUME: '1',
      VITE_ACCOUNT_DIRECT_COVERAGE: '0',
      $mode: 'production',
    }).digest,
  ).not.toBe(a);
  expect(
    retentionPreparationIdentity(p, {
      UNRELATED: 'ignored',
      VITE_ACCOUNT_RETENTION_RESUME: '1',
      $mode: 'production',
    }).digest,
  ).toBe(a);
});
it('missing build inputs and symlinked runtime modules fail closed rather than producing a partial identity', () => {
  const p = root();
  symlinkSync(join(p, 'package.json'), join(p, 'src', 'linked.ts'));
  expect(() => retentionPreparationIdentity(p)).toThrow('symlink');
  rmSync(join(p, 'src', 'linked.ts'));
  rmSync(join(p, 'pnpm-lock.yaml'));
  expect(() => retentionPreparationIdentity(p)).toThrow('Missing verifier build input');
});
