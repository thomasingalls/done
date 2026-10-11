import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
const root = '/tmp/done-account-cold-open';
const config = 'docs/performance-experiments/2026-10-11-account-cold-open/probe/cold.config.ts';
const fixture = process.argv[2];
const name = process.argv[3];
const count = Number(process.argv[4] ?? 5);
for (let i = 0; i < count; i++)
  for (const arm of i % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
    const out = `${root}/${name}-${i}-${arm}`;
    console.log('START', out);
    const fd = openSync(out + '.log', 'w');
    const r = spawnSync('./node_modules/.bin/playwright', ['test', '--config', config], {
      env: {
        ...process.env,
        DONE_PERF_ROOT: root,
        DONE_PERF_SOURCE: `${root}/${arm}`,
        DONE_PERF_RESULTS: out,
        DONE_REOPEN_FIXTURE: fixture,
      },
      stdio: ['ignore', fd, fd],
      timeout: 180000,
    });
    closeSync(fd);
    if (r.status !== 0) {
      console.log('FAILED', out, r.status, r.error?.message);
      process.exit(1);
    }
    console.log('PASS', out);
  }
