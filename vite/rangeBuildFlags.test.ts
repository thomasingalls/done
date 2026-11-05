// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { build, resolveConfig } from 'vite';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
const key = 'import.meta.env.VITE_ACCOUNT_RANGE_RECEIVE';
const root = resolve('.'),
  folders: string[] = [];
const env = (value?: string) => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VITE_ACCOUNT_RANGE_RECEIVE', value);
  vi.stubEnv('VITE_ACCOUNT_RETENTION_AUTO', '0');
  vi.stubEnv('VITE_ACCOUNT_RETENTION_RESUME', '0');
  vi.stubEnv('VITE_ACCOUNT_HISTORY_AUTO', '0');
};
const config = () =>
  resolveConfig(
    { configFile: resolve('vite.config.ts'), mode: 'test', logLevel: 'silent' },
    'build',
  );
afterEach(() => {
  vi.unstubAllEnvs();
  for (const p of folders.splice(0)) rmSync(p, { recursive: true, force: true });
});
it('the actual Vite configuration makes ordinary builds explicitly writer-off with compatible readers', async () => {
  env();
  const c = await config();
  expect(c.define?.[key]).toBe('"0"');
  expect(c.define?.['import.meta.env.VITE_ACCOUNT_BASELINE_READ']).toBe('"1"');
  expect(c.define?.['import.meta.env.VITE_ACCOUNT_HISTORY_AUTO']).toBe('"0"');
});
it('the actual Vite configuration captures the exact writer-on build selection', async () => {
  env('1');
  const c = await config();
  expect(c.define?.[key]).toBe('"1"');
  env('0');
  expect(c.define?.[key]).toBe('"1"');
  expect((await config()).define?.[key]).toBe('"0"');
});
it('invalid dense writer build values refuse rather than silently changing the profile', async () => {
  for (const value of ['true', '01', ' 1', '2']) {
    env(value);
    const result = await config().then(
      () => ({ kind: 'resolved' }),
      (e: Error) => ({ kind: 'refused', message: e.message }),
    );
    expect(result).toEqual({
      kind: 'refused',
      message: 'VITE_ACCOUNT_RANGE_RECEIVE must be 0 or 1',
    });
  }
});
it.each(['0', '1'])(
  'production compilation through the actual Vite config preserves writer=%s',
  async (value) => {
    env(value);
    const folder = mkdtempSync(join(tmpdir(), 'done-range-build-'));
    folders.push(folder);
    const entry = join(folder, 'probe.ts');
    writeFileSync(
      entry,
      "export const writer=import.meta.env?.['VITE_ACCOUNT_RANGE_RECEIVE']; export const reader=import.meta.env?.['VITE_ACCOUNT_BASELINE_READ']; export const production=import.meta.env.PROD;",
    );
    const output = await build({
      configFile: join(root, 'vite.config.ts'),
      mode: 'test',
      logLevel: 'error',
      build: {
        write: false,
        minify: false,
        sourcemap: false,
        rollupOptions: { input: entry },
        lib: { entry, name: 'RangeProbe', formats: ['iife'] },
      },
    });
    const result = Array.isArray(output) ? output[0]! : output;
    if (!('output' in result)) throw Error('Unexpected watch build');
    const chunk = result.output.find((x) => x.type === 'chunk')!;
    const sandbox: { RangeProbe?: { writer: string; reader: string; production: boolean } } = {};
    runInNewContext(chunk.code, sandbox);
    expect({
      writer: sandbox.RangeProbe?.writer,
      reader: sandbox.RangeProbe?.reader,
      production: sandbox.RangeProbe?.production,
    }).toEqual({
      writer: value,
      reader: '1',
      production: true,
    });
  },
);
it('Docker explicitly forwards the default-off selector in the build stage only', () => {
  const docker = readFileSync(join(root, 'Dockerfile'), 'utf8'),
    stage = docker
      .split('FROM dependencies AS build\n')[1]!
      .split('\nFROM dependencies AS production-dependencies')[0]!;
  expect(stage).toMatch(/^ARG VITE_ACCOUNT_RANGE_RECEIVE=0$/m);
  expect(stage).toMatch(/^ENV VITE_ACCOUNT_RANGE_RECEIVE=\$\{VITE_ACCOUNT_RANGE_RECEIVE\}$/m);
  expect(stage.indexOf('ENV VITE_ACCOUNT_RANGE_RECEIVE')).toBeLessThan(
    stage.indexOf('RUN pnpm build'),
  );
  expect(docker.split('FROM gcr.io/distroless/')[1]).not.toContain(
    'ENV VITE_ACCOUNT_RANGE_RECEIVE',
  );
});
