import { build } from 'vite';
import { resolve } from 'node:path';
import { native as base, args } from '../account-delivery/fixtures.mjs';
export * from '../account-delivery/fixtures.mjs';
export async function driverBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'driver-dispatch-control',
            enforce: 'pre',
            transform(code, id) {
              if (
                (control === 'dispatch' || control === 'dispatch-baseline') &&
                id.endsWith('/src/crdt/accountDelivery.ts')
              ) {
                const target = 'context.canSubmit?.() === false';
                if (code.split(target).length !== 2) throw Error('Dispatch control anchor');
                return code.replace(
                  target,
                  `(globalThis.driverDispatchBoundary?.(), ${control === 'dispatch' ? 'false' : target})`,
                );
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('test/account-driver/browser.ts'), name: 'Harness', formats: ['iife'] },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await driverBundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await page.evaluate((token) => {
      window.openSender = async (item) => {
        window.opened = await Harness.openOwnedAccountSendingWorkspace(optionsFor(item), token);
        window.editor = opened.workspace;
        window.surface = editor.text({ kind: 'master' });
        return editor.read();
      };
    }, f.testOperatorToken);
  };
  await f.setup(f.page);
  return f;
}
export const sending = (page, item) => page.evaluate((item) => openSender(item), args(item));
export const driverStatus = (page) => page.evaluate(() => opened.driver.status);
/** Await the predicate result explicitly: this installed Playwright polls Promise truthiness. */
export async function waitUntil(page, predicate, arg, timeout = 20000) {
  const until = performance.now() + timeout;
  for (;;) {
    if ((await page.evaluate(predicate, arg)) === true) return;
    if (performance.now() >= until) throw Error('Awaited browser predicate timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
export const settled = async (page) => {
  await waitUntil(
    page,
    async () => {
      if (opened.driver.status.phase !== 'idle') return false;
      const captures = await opened.listCaptures();
      try {
        const count = captures.reduce((n, c) => n + c.sources.length, 0),
          spool = await opened.spoolStatus();
        return (
          opened.driver.status.phase === 'idle' &&
          count === spool.positions.length &&
          count === opened.driver.status.acceptedThrough
        );
      } finally {
        for (const c of captures) Harness.eraseCapsule(c);
      }
    },
    undefined,
    20000,
  );
  return driverStatus(page);
};
export const retry = (page) => page.evaluate(() => opened.driver.retry());
export const online = (page, value) =>
  page.evaluate((value) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
    dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, value);
export function intercept(f, handler) {
  return f.context.route(f.server.origin + '/account/delivery/submit', handler);
}
