import { fork } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicJSON, describeError } from './diagnostics.mjs';
/** Kill only the worker and browser processes launched for this disposable run. */
export const supervise = ({ worker, args, output, limits, stdio = 'inherit' }) =>
  new Promise((resolve) => {
    let finished = false,
      terminal = false,
      exitTimer,
      terminalFailure;
    const browsers = new Set();
    const child = fork(worker, args, {
      execArgv: [],
      detached: process.platform !== 'win32',
      stdio,
    });
    const signalProcess = (pid) => {
      try {
        process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const saveFailure = (reason, error) => {
      terminalFailure = { reason, error };
      const file = join(output, 'report.json');
      let report = {};
      try {
        if (existsSync(file)) report = JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        /* Preserve supervisor failure even if worker report is absent. */
      }
      atomicJSON(file, {
        ...report,
        passed: false,
        status: 'supervisor-failed',
        supervisor: { reason, ...(error ? { error: describeError(error) } : {}) },
        finished: new Date().toISOString(),
      });
    };
    const stop = (reason) => {
      if (finished || terminal) return;
      terminal = true;
      saveFailure(reason);
      process.stderr.write(`HARNESS STOP ${reason}; partial report preserved in ${output}\n`);
      for (const pid of browsers) {
        try {
          signalProcess(pid);
        } catch {
          /* Still terminate the worker. */
        }
      }
      try {
        signalProcess(child.pid);
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => stop(`run exceeded ${limits['run-ms']} ms`), limits['run-ms']);
    const onInt = () => stop('interrupted (SIGINT)'),
      onTerm = () => stop('interrupted (SIGTERM)');
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);
    child.on('message', (message) => {
      if (message?.type === 'browser-start' && Number.isSafeInteger(message.pid) && message.pid > 1)
        browsers.add(message.pid);
      if (message?.type === 'browser-exit') browsers.delete(message.pid);
      if (message?.type === 'done' && !exitTimer)
        exitTimer = setTimeout(
          () => stop('worker did not exit after final report'),
          limits['teardown-ms'],
        );
    });
    child.on('error', (error) => {
      saveFailure('worker failed', error);
      terminal = true;
      if (child.pid) {
        try {
          signalProcess(child.pid);
        } catch {
          child.kill('SIGKILL');
        }
      } else finish(1, null);
    });
    const finish = (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(exitTimer);
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
      for (const pid of browsers) {
        try {
          signalProcess(pid);
        } catch {
          /* Child report already captures failed teardown. */
        }
      }
      let report;
      try {
        report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'));
      } catch {
        /* Missing report is failure. */
      }
      // Reassert failure after the worker has exited: it cannot overwrite the verdict now.
      if (terminal) saveFailure(terminalFailure.reason, terminalFailure.error);
      else if (browsers.size) {
        terminal = true;
        saveFailure('worker left registered browser processes');
      } else if (
        signal ||
        !report ||
        report.status !== 'finished' ||
        (code !== 0 && report.passed === true)
      )
        saveFailure(`worker exited unsuccessfully or without completed report (${signal ?? code})`);
      resolve(
        terminal || signal || code !== 0 || report?.passed !== true || report?.status !== 'finished'
          ? 1
          : 0,
      );
    };
    child.on('exit', finish);
  });
