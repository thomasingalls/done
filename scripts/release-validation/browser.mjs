import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { chromium } from '@playwright/test';
import { digest, filePins } from './identity.mjs';
import { groupState, signalGroup } from './process-group.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function installedChromium() {
  const executable = chromium.executablePath();
  let bundle = dirname(executable);
  while (!/^chromium-\d+$/.test(bundle.split('/').at(-1))) {
    const parent = dirname(bundle);
    assert(parent !== bundle, 'Only the installed Playwright Chromium bundle is supported');
    bundle = parent;
  }
  const paths = [];
  const walk = (dir) => {
    for (const item of readdirSync(join(bundle, dir), { withFileTypes: true })) {
      const path = dir ? dir + '/' + item.name : item.name;
      if (item.isDirectory()) walk(path);
      else paths.push(path);
    }
  };
  walk('');
  return {
    executable,
    bundle,
    snapshot: { executable: relative(bundle, executable), files: filePins(bundle, paths.sort()) },
  };
}

/** The stage owner launches Chromium itself. No test child can detach a browser before
 * registering it: the Node worker receives only this owned CDP endpoint. */
export function startOwnedChromium({ runtime, directory, env, startupMs, graceMs, maxLogBytes }) {
  const profile = join(directory, 'browser-profile'),
    log = join(directory, 'browser.log');
  mkdirSync(profile);
  writeFileSync(log, '');
  const argv = [
    '--headless',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    // Match Playwright's isolated launch: component extensions can otherwise add
    // unrelated workers to a context and invalidate its acquisition census.
    '--disable-component-extensions-with-background-pages',
    '--disable-extensions',
    '--disable-sync',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--disable-crashpad-for-testing',
    '--metrics-recording-only',
    '--password-store=basic',
    '--use-mock-keychain',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ];
  const started = Date.now();
  const child = spawn(runtime.executable, argv, {
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exited = false,
    closed = false,
    failure,
    bytes = 0,
    endpoint,
    shutdown;
  const result = {
    executable: runtime.executable,
    binaryIdentity: digest(runtime.snapshot),
    argv,
    pid: child.pid ?? null,
    profile,
    groupDrained: false,
  };
  child.once('error', (e) => {
    failure = String(e);
    exited = true;
  });
  child.once('exit', (code, signal) => {
    exited = true;
    result.exit = code;
    result.signal = signal;
  });
  child.once('close', () => {
    closed = true;
  });
  const collect = (chunk) => {
    try {
      if (bytes < maxLogBytes) appendFileSync(log, chunk.subarray(0, maxLogBytes - bytes));
      bytes += chunk.length;
      if (bytes > maxLogBytes) failure ??= 'Browser output limit exceeded';
    } catch (e) {
      failure ??= 'Browser log failure: ' + e.code;
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const owner = {
    result,
    get failed() {
      return failure ?? (exited ? 'Owned browser exited before worker completion' : null);
    },
    async ready(signal) {
      const activePort = join(profile, 'DevToolsActivePort');
      while (Date.now() - started < startupMs) {
        assert(!signal?.aborted, 'Browser startup cancelled');
        assert(!owner.failed, owner.failed);
        if (existsSync(activePort)) {
          // Chromium creates this file before publication is necessarily complete. A
          // partial read is not readiness; retry within the existing startup deadline.
          const parts = readFileSync(activePort, 'utf8').trim().split('\n');
          const [port, path] = parts;
          if (
            parts.length === 2 &&
            /^\d+$/.test(port) &&
            Number(port) > 0 &&
            Number(port) < 65536 &&
            /^\/devtools\/browser\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              path,
            )
          ) {
            endpoint = `ws://127.0.0.1:${port}${path}`;
            result.endpoint = endpoint;
            result.readyMs = Date.now() - started;
            return endpoint;
          }
          result.portFileRetries = (result.portFileRetries ?? 0) + 1;
        }
        await delay(20);
      }
      throw Error('Browser startup deadline exceeded');
    },
    close() {
      return (shutdown ??= (async () => {
        try {
          if (child.pid) {
            // A dying group can briefly return EPERM on macOS. Retry the signal
            // within this same grace interval; only ESRCH establishes drain.
            const signalWithin = async (signal, until) => {
              while (groupState(child.pid) !== 'gone') {
                try {
                  signalGroup(child.pid, signal);
                  return;
                } catch (e) {
                  if (e.code !== 'EPERM' || Date.now() >= until) throw e;
                  await delay(10);
                }
              }
            };
            const until = Date.now() + graceMs;
            await signalWithin('SIGTERM', until);
            while (groupState(child.pid) !== 'gone' && Date.now() < until) await delay(10);
            const final = Date.now() + graceMs;
            await signalWithin('SIGKILL', final);
            while (groupState(child.pid) !== 'gone' && Date.now() < final) await delay(10);
            result.groupDrained = groupState(child.pid) === 'gone';
          } else result.groupDrained = true;
          const pipes = Date.now() + graceMs;
          while (!closed && Date.now() < pipes) await delay(10);
          if (!closed) result.groupDrained = false;
        } catch (e) {
          result.cleanupError = String(e);
          result.groupDrained = false;
        } finally {
          child.stdout.destroy();
          child.stderr.destroy();
          result.elapsedMs = Date.now() - started;
          if (failure) result.failure = failure;
          writeFileSync(join(directory, 'browser.json'), JSON.stringify(result, null, 2) + '\n');
        }
        return result;
      })());
    },
  };
  return owner;
}
