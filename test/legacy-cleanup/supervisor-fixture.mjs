// Node-only watchdog fault fixture. No browser or cleanup implementation is imported.
import { forkOwnedGroup as fork } from '../../scripts/release-validation/nested-groups.mjs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { atomicJSON } from '../../scripts/legacy-cleanup/diagnostics.mjs';
const [mode, output] = process.argv.slice(2);
if (mode === 'browser') {
  setInterval(() => {}, 1000);
} else {
  const report = {
    checks: [{ id: 'earlier-directed-case', passed: true }],
    passed: true,
    status: 'finished',
  };
  if (mode === 'wedged' || mode === 'orphaned-browser') {
    const fakeBrowser = fork(fileURLToPath(import.meta.url), ['browser', output], {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    });
    report.status = mode === 'wedged' ? 'running' : 'finished';
    report.browserPid = fakeBrowser.pid;
    atomicJSON(join(output, 'report.json'), report);
    process.send({ type: 'browser-start', pid: fakeBrowser.pid }, () => {
      if (mode === 'orphaned-browser') {
        fakeBrowser.unref();
        fakeBrowser.disconnect();
        process.send({ type: 'done' }, () => process.disconnect());
        return;
      }
      // Deliberately defeat every watchdog running in this worker's event loop.
      while (true) {
        /* The external supervisor must kill this process. */
      }
    });
  } else {
    if (mode === 'reported-failure') {
      report.passed = false;
      process.exitCode = 1;
    }
    atomicJSON(join(output, 'report.json'), report);
    if (mode === 'nonzero') process.exitCode = 1;
    process.send({ type: 'done' }, () => process.disconnect());
    if (mode === 'leaked-handle') setInterval(() => {}, 1000);
  }
}
