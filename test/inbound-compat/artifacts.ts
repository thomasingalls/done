import { readFileSync } from 'node:fs';
import { resolve, extname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { origin } from '../packaged-account/server';
export const csp =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export function artifact(root: string, name: string) {
  if (!isAbsolute(root)) throw Error('Expected absolute frozen artifact root');
  const manifest = JSON.parse(readFileSync(resolve(root, `426-${name}-assets.json`), 'utf8')) as {
    build: string;
    assets: { path: string; bytes: number; sha256: string }[];
  };
  const files = new Map<string, Buffer>();
  for (const entry of manifest.assets) {
    const value = readFileSync(resolve(manifest.build, entry.path));
    if (value.length !== entry.bytes || sha(value) !== entry.sha256)
      throw Error('Frozen asset changed');
    files.set('/' + entry.path, value);
  }
  return { ...manifest, name, files };
}
export type Artifact = ReturnType<typeof artifact>;
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
export async function frozenAssets(context: BrowserContext, versions: Artifact[]) {
  const files = new Map<string, Buffer>();
  for (const version of versions)
    for (const [path, value] of version.files) {
      if (!path.startsWith('/assets/') || !types[extname(path)]) continue;
      const previous = files.get(path);
      if (previous && !previous.equals(value))
        throw Error('Different bytes at the same frozen hashed asset URL');
      files.set(path, value);
    }
  await context.route(origin + '/assets/**', async (route) => {
    const path = new URL(route.request().url()).pathname,
      value = files.get(path),
      type = types[extname(path)];
    if (!value || !type || !['GET', 'HEAD'].includes(route.request().method()))
      return route.fallback();
    await route.fulfill({
      status: 200,
      ...(route.request().method() === 'HEAD' ? {} : { body: value }),
      headers: {
        'Content-Type': type,
        'Content-Length': String(value.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': csp,
      },
    });
  });
}
export async function frozenHtml(page: Page, version: Artifact) {
  await page.route(origin + '/**', async (route) => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    const response = await route.fetch(),
      value = version.files.get('/index.html')!;
    expect(response.headers()['content-security-policy']).toBe(csp);
    await route.fulfill({
      response,
      body: value,
      headers: {
        ...response.headers(),
        'Content-Length': String(value.length),
        'Content-Type': 'text/html',
      },
    });
  });
}
export async function inertObserver(context: BrowserContext) {
  const page = await context.newPage(),
    url = origin + '/__frozen-read-only-observer';
  await page.route(url, (route) =>
    route.fulfill({
      status: 200,
      body: '<!doctype html><title>Read-only observation</title>',
      headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': csp },
    }),
  );
  await page.goto(url);
  return page;
}
export async function assertEntry(page: Page, version: Artifact) {
  const urls = await page
    .locator('script[src]')
    .evaluateAll((scripts) => scripts.map((s) => new URL((s as HTMLScriptElement).src).pathname));
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((p) => version.files.has(p))).toBe(true);
}
export async function deferRegistration(page: Page) {
  await page.addInitScript(() => {
    if (!navigator.serviceWorker) return;
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    let released = false;
    const pending: (() => void)[] = [];
    Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable: true,
      value: (...args: Parameters<typeof register>) =>
        released
          ? register(...args)
          : new Promise<ServiceWorkerRegistration>((accept, reject) =>
              pending.push(() => {
                void register(...args).then(accept, reject);
              }),
            ),
    });
    Reflect.set(globalThis, 'releaseFrozenRegistration', () => {
      released = true;
      pending.splice(0).forEach((run) => run());
    });
  });
}
export async function startOpening(page: Page) {
  const field = page.getByLabel('Unlock code', { exact: true }),
    saved = page.getByRole('button', { name: /^Unlock Device owner/ });
  await expect
    .poll(async () => (await field.isVisible()) || (await saved.isVisible()), { timeout: 15000 })
    .toBe(true);
  if (!(await field.isVisible())) await saved.click();
}
export async function finishUnlock(page: Page, code: string) {
  const field = page.getByLabel('Unlock code', { exact: true });
  await field.fill(code);
  await page
    .getByRole('button', { name: 'Confirm code and unlock with passkey', exact: true })
    .click();
}
export async function targetSnapshot(page: Page, slot: string) {
  return page.evaluate(async (slot) => {
    const open = (name: string) =>
      new Promise<IDBDatabase>((accept, reject) => {
        const r = indexedDB.open(name);
        r.onupgradeneeded = () => {
          r.transaction!.abort();
          reject(Error('Expected existing carrier'));
        };
        r.onerror = () => reject(r.error);
        r.onsuccess = () => accept(r.result);
      });
    const read = async (name: string) => {
      const db = await open(name);
      try {
        return await new Promise<{ store: string; keys: IDBValidKey[]; values: unknown[] }[]>(
          (accept, reject) => {
            const stores = Array.from(db.objectStoreNames).sort(),
              tx = db.transaction(stores, 'readonly'),
              queries = stores.map((store) => ({
                store,
                keys: tx.objectStore(store).getAllKeys(),
                values: tx.objectStore(store).getAll(),
              }));
            tx.oncomplete = () =>
              accept(
                queries.map((q) => ({
                  store: q.store,
                  keys: q.keys.result,
                  values: q.values.result,
                })),
              );
            tx.onabort = () => reject(tx.error);
          },
        );
      } finally {
        db.close();
      }
    };
    const slots = await read('done.slots'),
      row = slots.flatMap((x) => x.values).find((x) => (x as { id?: string }).id === slot) as {
        id: string;
        stores: { dbName: string }[];
      };
    if (!row) throw Error('Expected target slot');
    const contains = (key: IDBValidKey): boolean =>
        key === slot || (Array.isArray(key) && key.some(contains)),
      custody = (await read('done.custody')).map((s) => ({
        store: s.store,
        rows: s.keys.map((k, i) => [k, s.values[i]]).filter(([k]) => contains(k as IDBValidKey)),
      })),
      name = row.stores[0]!.dbName,
      native = await read(name),
      prefix = `done.pending-update.${encodeURIComponent(name)}.`,
      journal = Object.keys(localStorage)
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
      bytes = new TextEncoder().encode(JSON.stringify({ row, custody, native, journal }));
    try {
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join('');
    } finally {
      bytes.fill(0);
    }
  }, slot);
}
export async function metadataBundle(entry: string, name: string, virtualSource?: string) {
  const output = await build({
    configFile: false,
    logLevel: 'error',
    ...(virtualSource
      ? {
          plugins: [
            {
              name: 'frozen-native-reader-wrapper',
              resolveId(id: string) {
                if (id === entry) return '\0' + entry;
                return null;
              },
              load(id: string) {
                if (id === '\0' + entry) return virtualSource;
                return null;
              },
            },
          ],
        }
      : {}),
    build: {
      write: false,
      minify: false,
      rollupOptions: { output: { codeSplitting: false } },
      lib: { entry, name, formats: ['iife'] },
    },
  });
  const result = Array.isArray(output) ? output[0]! : output;
  if (!('output' in result)) throw Error('Unexpected bundle watch output');
  const chunks = result.output.filter((x) => x.type === 'chunk');
  if (chunks.length !== 1) throw Error('Expected complete one-chunk probe');
  return chunks[0]!.code + `\nglobalThis.${name}=${name};`;
}
export const frozenReaderBundle = (source: string) =>
  metadataBundle(
    resolve('test/inbound-compat/frozen-old-native-reader.ts'),
    'FrozenOldReader',
    `
import { withPromotionSlot } from ${JSON.stringify(resolve(source, 'src/crdt/writeSession.ts'))};
import { readPromotion } from ${JSON.stringify(resolve(source, 'src/crdt/promotionRecord.ts'))};
export async function probe(slot, code) {
  try { await withPromotionSlot(slot, code, task => readPromotion(task, slot, code)); return { accepted: true }; }
  catch (error) { return { accepted: false, errorClass: error.name, code: error.code ?? null }; }
}
`,
  );
