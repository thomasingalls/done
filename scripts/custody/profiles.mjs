/** Persistent synthetic profiles remain in the release worker's inherited process group.
 * The outer owner drains the whole group even if this worker dies. No detached launch is allowed. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
} from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { chromium } from '@playwright/test';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const names = ['source-false', 'copy-false', 'source-true', 'copy-true'];
const treeDigest = (root) => {
  const rows = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = dir ? dir + '/' + e.name : e.name;
      if (e.isDirectory()) {
        rows.push([path, 'directory']);
        walk(path);
      } else if (e.isSymbolicLink()) rows.push([path, 'link', readlinkSync(join(root, path))]);
      else {
        assert(e.isFile(), 'Unsupported profile entry');
        rows.push([path, 'file', hash(readFileSync(join(root, path)))]);
      }
    }
  };
  walk('');
  return hash(JSON.stringify(rows));
};
export function ownedProfiles({ directory, origin, records, save }) {
  assert(
    process.env.RELEASE_PROCESS_GUARD &&
      process.env.RELEASE_CUSTODY_OUTPUT &&
      process.env.RELEASE_BROWSER_EXECUTABLE,
    'Persistent profiles require a release worker owner',
  );
  const within = relative(resolve(process.env.RELEASE_CUSTODY_OUTPUT), resolve(directory));
  assert(
    within && !within.startsWith('..') && !within.startsWith('/'),
    'Profile directory escaped owned output',
  );
  const owners = new Map();
  const launch = async (name, copy = null, previous = null) => {
    assert(names.includes(name), 'Unknown profile');
    if (previous) {
      assert(
        owners.get(name)?.row === previous && previous.closed === true && !previous.failure,
        'Cannot reopen a live or failed profile',
      );
      assert((previous.reopen?.ordinal ?? 0) < 2, 'Profile reopen limit');
    } else assert(!owners.has(name), 'Repeated profile');
    const profile = join(directory, name);
    if (!copy && !previous) {
      assert(!existsSync(profile), 'Existing source profile');
      mkdirSync(profile, { recursive: true });
    }
    // A copied or reopened port file names the closed prior browser, not this process.
    rmSync(join(profile, 'DevToolsActivePort'), { force: true });
    const executable = process.env.RELEASE_BROWSER_EXECUTABLE;
    const argv = [
      '--headless',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
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
    const child = spawn(executable, argv, { detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const row = {
      name,
      profile,
      pid: child.pid ?? null,
      workerPid: process.pid,
      ownership: 'inherited-worker-group',
      executable,
      argv,
      closed: false,
      ...(copy ? { copy } : {}),
      ...(previous
        ? { reopen: { priorPid: previous.pid, ordinal: (previous.reopen?.ordinal ?? 0) + 1 } }
        : {}),
    };
    records.push(row);
    save();
    let closed = false,
      failure,
      browser,
      shutdown,
      bytes = 0;
    child.once('error', (e) => {
      failure = String(e);
    });
    child.once('exit', (code, signal) => {
      row.exit = code;
      row.signal = signal;
    });
    child.once('close', () => {
      closed = true;
    });
    const collect = (chunk) => {
      bytes += chunk.length;
      if (bytes <= 4 * 1024 * 1024) process.stderr.write(chunk);
      else {
        failure ??= 'Persistent browser log limit';
        child.kill('SIGTERM');
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const stop = async () => {
      if (!closed) child.kill('SIGTERM');
      let until = Date.now() + 5000;
      while (!closed && Date.now() < until) await delay(20);
      if (!closed) child.kill('SIGKILL');
      until = Date.now() + 5000;
      while (!closed && Date.now() < until) await delay(20);
    };
    const close = () =>
      (shutdown ??= (async () => {
        try {
          assert(
            browser && !closed && !failure,
            failure ?? 'Persistent browser exited before close',
          );
          const session = await browser.newBrowserCDPSession();
          void session.send('Browser.close').catch(() => {});
          const until = Date.now() + 5000;
          while (!closed && Date.now() < until) await delay(20);
          assert(
            closed && row.exit === 0 && !failure,
            failure ?? 'Persistent profile did not close cleanly',
          );
          for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket'])
            assert(!readdirSync(profile).includes(lock), 'Profile still holds a singleton lock');
          row.closed = true;
        } catch (e) {
          row.failure = String(e);
          await stop();
          throw e;
        } finally {
          await browser?.close();
          save();
        }
      })());
    owners.set(name, { row, close });
    try {
      const until = Date.now() + 15000;
      let endpoint;
      while (Date.now() < until) {
        assert(!closed && !failure, failure ?? 'Persistent browser exited during startup');
        const p = join(profile, 'DevToolsActivePort');
        if (existsSync(p)) {
          const [port, path, extra] = readFileSync(p, 'utf8').trim().split('\n');
          if (
            !extra &&
            /^\d+$/.test(port) &&
            Number(port) > 0 &&
            Number(port) < 65536 &&
            /^\/devtools\/browser\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              path,
            )
          ) {
            endpoint = `ws://127.0.0.1:${port}${path}`;
            break;
          }
        }
        await delay(20);
      }
      assert(endpoint, 'Persistent browser startup deadline');
      row.endpoint = endpoint;
      browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
      const context = browser.contexts()[0];
      assert(context, 'Missing persistent default context');
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort('blockedbyclient'),
      );
      // Preserve the scenario's context interface, but close the actual browser and await exit.
      context.close = close;
      save();
      return context;
    } catch (e) {
      row.failure = String(e);
      await stop();
      save();
      throw e;
    }
  };
  return {
    profile: (name) => {
      assert(name.startsWith('source-'), 'Source profile required');
      return launch(name);
    },
    reopenProfile: (name) => {
      const previous = owners.get(name)?.row;
      assert(previous, 'Cannot reopen an unknown profile');
      return launch(name, null, previous);
    },
    copyProfile: async (source, destination) => {
      assert(
        (source === 'source-false' && destination === 'copy-false') ||
          (source === 'source-true' && destination === 'copy-true'),
        'Unreviewed profile copy',
      );
      assert(
        owners.get(source)?.row.closed === true,
        'Cannot copy a live or failed source profile',
      );
      const from = join(directory, source),
        to = join(directory, destination);
      assert(!existsSync(to), 'Copy destination already exists');
      const digest = treeDigest(from);
      cpSync(from, to, { recursive: true });
      assert.equal(treeDigest(from), digest, 'Closed source changed during copy');
      assert.equal(treeDigest(to), digest, 'Whole profile copy differs');
      return launch(destination, {
        source,
        sourceClosed: true,
        sourceDigest: digest,
        destinationDigest: digest,
      });
    },
    async close() {
      const outcomes = await Promise.allSettled(
        [...owners.values()].filter((o) => !o.row.closed).map((o) => o.close()),
      );
      const failed = outcomes.find((o) => o.status === 'rejected');
      if (failed) throw failed.reason;
    },
  };
}
