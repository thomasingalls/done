/** Build isolated releases; never overwrite the author's live dist/ during verification. */
import { build } from 'vite';
import { mkdirSync, writeFileSync, cpSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { withUpgradeFixture } from './fixture-owner.mjs';
const output = resolve('test-results/app-upgrades', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
console.log(`Upgrade evidence: ${output}`);
const predecessor = process.env.APP_UPGRADE_PREDECESSOR_DIR;
if (predecessor) {
  cpSync(resolve(predecessor), resolve(output, 'prior'), { recursive: true });
  const files = readdirSync(resolve(output, 'prior'), { recursive: true }).filter((name) =>
    statSync(resolve(output, 'prior', name)).isFile(),
  );
  writeFileSync(
    resolve(output, 'predecessor.json'),
    JSON.stringify(
      files.map((path) => ({
        path,
        sha256: createHash('sha256')
          .update(readFileSync(resolve(output, 'prior', path)))
          .digest('hex'),
      })),
      null,
      2,
    ),
  );
}
for (const version of ['a', 'b']) {
  await build({
    configFile: resolve('vite.config.ts'),
    define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(`upgrade-${version}`) },
    build: { outDir: resolve(output, version), sourcemap: false },
  });
}
writeFileSync(
  resolve(output, 'scope.json'),
  JSON.stringify(
    {
      scope:
        'Two real compatible app builds; disposable Chromium profiles; no personal installation or data migration',
      builds: ['a', 'b'],
    },
    null,
    2,
  ),
);
process.exitCode = await withUpgradeFixture(output, async (origin) => {
  const child = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      'playwright.app-upgrades.config.ts',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        APP_UPGRADE_OUTPUT: output,
        APP_UPGRADE_HAS_PRIOR: predecessor ? '1' : '0',
        APP_UPGRADE_ORIGIN: origin,
      },
    },
  );
  let timedOut = false,
    interrupted = false,
    forced;
  const stop = () => {
    child.kill('SIGTERM');
    forced ??= setTimeout(() => child.kill('SIGKILL'), 5000);
  };
  const interrupt = () => {
    interrupted = true;
    stop();
  };
  process.once('SIGTERM', interrupt);
  process.once('SIGINT', interrupt);
  const deadline = setTimeout(() => {
    timedOut = true;
    stop();
  }, 180_000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (value) => resolve(value ?? 1));
    });
    return timedOut || interrupted ? 1 : code;
  } finally {
    clearTimeout(deadline);
    clearTimeout(forced);
    process.removeListener('SIGTERM', interrupt);
    process.removeListener('SIGINT', interrupt);
  }
});
