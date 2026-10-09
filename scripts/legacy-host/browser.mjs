import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { CDP, eventually } from './cdp.mjs';
import { within } from '../legacy-cleanup/diagnostics.mjs';

/** Only accepts profiles inside this newly created run directory. No user-profile attach/copy API. */
export async function launchProfile(
  output,
  name,
  { startup = 'about:blank', timeout = 15000 } = {},
) {
  if (!/^[a-z0-9-]+$/u.test(name)) throw Error('Invalid disposable profile name');
  const profile = resolve(output, 'profiles', name);
  mkdirSync(profile, { recursive: true });
  const activePort = join(profile, 'DevToolsActivePort');
  // Only the disposable launcher's stale endpoint, never browser source storage.
  if (existsSync(activePort)) rmSync(activePort);
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-extensions',
    '--disable-default-apps',
    '--password-store=basic',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    startup,
  ];
  const child = spawn(chromium.executablePath(), args, {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  process.send?.({ type: 'browser-start', pid: child.pid });
  // Do not retain raw browser diagnostics (which can contain URLs/source). Keep bounded startup status.
  child.stderr.resume();
  let exited = false;
  const exit = new Promise((resolveExit) =>
    child.once('exit', (code, signal) => {
      exited = true;
      process.send?.({ type: 'browser-exit', pid: child.pid });
      resolveExit({ code, signal });
    }),
  );
  const killGroup = () => {
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const stop = async (force = false) => {
    if (!exited) {
      if (!force && connection) await connection.send('Browser.close').catch(() => {});
      else killGroup();
    }
    try {
      return await within('browser process exit', timeout, () => exit);
    } finally {
      if (!exited) killGroup();
      await connection?.close().catch(() => {});
    }
  };
  let connection;
  try {
    const lines = await eventually(
      'persistent browser endpoint',
      () => {
        if (exited) throw Error('Disposable browser exited before endpoint');
        return existsSync(activePort) ? readFileSync(activePort, 'utf8').trim().split('\n') : null;
      },
      (value) => value?.length === 2,
      timeout,
    );
    connection = await CDP.connect(`ws://127.0.0.1:${lines[0]}${lines[1]}`, timeout);
    return {
      cdp: connection,
      child,
      profile,
      args,
      stop,
      exit,
      executable: chromium.executablePath(),
    };
  } catch (error) {
    await stop(true);
    throw error;
  }
}

/** Probe profile-singleton behavior using only an already owned disposable profile. */
export async function secondProcess(browser, url) {
  const args = browser.args.filter((a) => !a.startsWith('--remote-debugging-port='));
  args[args.length - 1] = url;
  const child = spawn(chromium.executablePath(), args, {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  });
  process.send?.({ type: 'browser-start', pid: child.pid });
  let exited = false;
  const exit = new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      exited = true;
      process.send?.({ type: 'browser-exit', pid: child.pid });
      resolveExit({ code, signal });
    });
  });
  try {
    return await within('second profile process', 10000, () => exit);
  } finally {
    if (!exited) {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL');
      await exit;
    }
  }
}
