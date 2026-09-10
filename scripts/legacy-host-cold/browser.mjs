import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CDP, eventually } from '../legacy-host/cdp.mjs';
import { within } from '../legacy-cleanup/diagnostics.mjs';
import { poll } from './checks.mjs';

export async function launch(
  output,
  name,
  startup = 'about:blank',
  connect = true,
  { restore = false } = {},
) {
  if (!/^[a-z0-9-]+$/u.test(name)) throw Error('profile-name');
  const profile = join(output, 'profiles', name);
  mkdirSync(profile, { recursive: true });
  const portFile = join(profile, 'DevToolsActivePort');
  if (existsSync(portFile)) rmSync(portFile);
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
    '--enable-automation',
    `--user-data-dir=${profile}`,
    ...(restore ? ['--restore-last-session'] : []),
    startup,
  ];
  const child = spawn('/usr/bin/chromium', args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  process.send?.({ type: 'browser-start', pid: child.pid });
  let exited = false,
    stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      exited = true;
      process.send?.({ type: 'browser-exit', pid: child.pid });
      resolve({ code, signal });
    });
  });
  let cdp;
  const kill = () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
  };
  const browser = {
    child,
    profile,
    args,
    exit,
    get cdp() {
      return cdp;
    },
    get exited() {
      return exited;
    },
    async connect() {
      const [port, path] = await eventually(
        'browser endpoint',
        () => {
          if (exited) throw Error('browser-start-failed: ' + stderr);
          return existsSync(portFile) ? readFileSync(portFile, 'utf8').trim().split('\n') : null;
        },
        (x) => x?.length === 2,
      );
      cdp = await CDP.connect(`ws://127.0.0.1:${port}${path}`);
      return cdp;
    },
    async disconnect() {
      await cdp?.close();
      cdp = null;
    },
    async stop(force = false) {
      try {
        if (!exited) {
          if (force || !cdp) kill();
          else await cdp.send('Browser.close').catch(kill);
        }
        await within('browser exit', 10000, () => exit);
      } finally {
        if (!exited) kill();
        await cdp?.close().catch(() => {});
        cdp = null;
      }
    },
  };
  try {
    if (connect) await browser.connect();
    return browser;
  } catch (e) {
    await browser.stop(true);
    throw e;
  }
}
export async function page(browser, url) {
  const { targetId } = await browser.cdp.send('Target.createTarget', { url });
  await eventually('page navigation', async () => {
    const { targetInfos } = await browser.cdp.send('Target.getTargets');
    return targetInfos.some((t) => t.targetId === targetId && t.url === url);
  });
  const { sessionId } = await browser.cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  try {
    await frameReady(browser, sessionId, url);
  } finally {
    await browser.cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }
  return targetId;
}
export async function frameReady(browser, sessionId, url) {
  return poll(
    'committed frame',
    async () => {
      try {
        return (await browser.cdp.send('Page.getFrameTree', {}, sessionId)).frameTree.frame;
      } catch (e) {
        if (e.message.includes('Not attached to an active page')) return null;
        throw e;
      }
    },
    (f) => f?.url === url && Boolean(f.loaderId),
  );
}
export async function inertPage(browser, origin) {
  // Fixture navigation only: bypass old SW fallback in allowed setup/controls. Never change script policy.
  const id = await page(browser, 'about:blank');
  const { sessionId } = await browser.cdp.send('Target.attachToTarget', {
    targetId: id,
    flatten: true,
  });
  try {
    await browser.cdp.send('Network.enable', {}, sessionId);
    await browser.cdp.send('Network.setBypassServiceWorker', { bypass: true }, sessionId);
    await browser.cdp.send('Page.navigate', { url: origin + '/inert' }, sessionId);
    await frameReady(browser, sessionId, origin + '/inert');
  } catch (e) {
    await browser.cdp.send('Target.closeTarget', { targetId: id }).catch(() => {});
    throw e;
  }
  // Keep the fixture network setting until the caller closes this inert target. Detaching here can
  // reset bypass while the navigation response is still arriving and execute an allowed cached app.
  return id;
}
export async function fixtureEval(browser, targetId, expression) {
  // Setup/positive-control channel only. The source observer never receives this capability.
  const { sessionId } = await browser.cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  try {
    return await browser.cdp.evaluate(sessionId, expression);
  } finally {
    await browser.cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }
}
export async function policyTable(browser) {
  const id = await page(browser, 'chrome://policy/');
  const { sessionId } = await browser.cdp.send('Target.attachToTarget', {
    targetId: id,
    flatten: true,
  });
  const flatten = (node) => [
    node.nodeType === 3 ? node.nodeValue : '',
    ...(node.children ?? []).flatMap(flatten),
    ...(node.shadowRoots ?? []).flatMap(flatten),
    ...(node.contentDocument ? flatten(node.contentDocument) : []),
  ];
  try {
    return await eventually(
      'effective policy DOM',
      async () => {
        const { root } = await browser.cdp.send(
          'DOM.getDocument',
          { depth: -1, pierce: true },
          sessionId,
        );
        const rows = [];
        const walk = (node) => {
          if (node.localName === 'policy-row') rows.push(flatten(node).filter(Boolean));
          for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) walk(child);
        };
        walk(root);
        return {
          rows: rows.filter((r) => !r.includes('Not set.')),
          text: flatten(root)
            .filter(Boolean)
            .filter((t) => t === 'DefaultJavaScriptSetting'),
        };
      },
      (result) => result.text.some((t) => t.includes('DefaultJavaScriptSetting')),
    );
  } finally {
    await browser.cdp.send('Target.closeTarget', { targetId: id }).catch(() => {});
  }
}
